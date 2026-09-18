import type { Assumptions, DcfInputs, DcfResult, ForecastYear, TerminalValue, ValuationByMethod } from './types';

function assertLength(name: string, arr: number[], expected: number): void {
  if (arr.length !== expected) {
    throw new Error(`${name} must have ${expected} entries to match horizonYears, got ${arr.length}`);
  }
}

/**
 * Builds the explicit forecast. Sign convention, applied consistently:
 * capex and changeInNwc are positive when they consume cash, so both are
 * subtracted. A revenue fall makes changeInNwc negative, which correctly
 * releases cash. There is deliberately no Math.abs anywhere in this file.
 */
function buildForecast(inputs: DcfInputs, a: Assumptions): ForecastYear[] {
  const years: ForecastYear[] = [];
  let previousRevenue = inputs.baseRevenue;

  for (let i = 0; i < a.horizonYears; i++) {
    const revenue = previousRevenue * (1 + a.revenueGrowth[i]);
    const ebit = revenue * a.ebitMargin[i];
    const nopat = ebit * (1 - a.taxRate);
    const dAndA = revenue * a.daPctRevenue;
    const capex = revenue * a.capexPctRevenue;
    const changeInNwc = (revenue - previousRevenue) * a.nwcPctRevenueChange;
    const fcff = nopat + dAndA - capex - changeInNwc;

    years.push({
      year: i + 1,
      revenue,
      ebit,
      nopat,
      dAndA,
      capex,
      changeInNwc,
      fcff,
      discountFactor: 0,
      presentValue: 0,
    });
    previousRevenue = revenue;
  }
  return years;
}

/** Year-end discounts at t, mid-year at t - 0.5. */
function discountExponent(year: number, midYear: boolean): number {
  return midYear ? year - 0.5 : year;
}

function discount(forecast: ForecastYear[], a: Assumptions): number {
  let pvExplicit = 0;
  for (const y of forecast) {
    y.discountFactor = 1 / (1 + a.wacc) ** discountExponent(y.year, a.midYearConvention);
    y.presentValue = y.fcff * y.discountFactor;
    pvExplicit += y.presentValue;
  }
  return pvExplicit;
}

function terminalDiscountFactor(a: Assumptions): number {
  // The terminal value is struck at the end of the final explicit year, but it
  // capitalises a perpetuity of flows that arrive THROUGH each subsequent year.
  // Under the mid-year convention those flows are half a year closer than a
  // year-end perpetuity assumes, so the terminal value discounts at n - 0.5 for
  // the same reason the explicit flows do. Discounting it at full n while
  // discounting the explicit years at t - 0.5 is internally inconsistent and
  // understated terminal value by sqrt(1 + WACC) - about 4.9% of it at a 10%
  // WACC, on the line that is usually 70%+ of the answer.
  const exponent = a.midYearConvention ? a.horizonYears - 0.5 : a.horizonYears;
  return 1 / (1 + a.wacc) ** exponent;
}

/**
 * The cashflow the perpetuity should capitalise, which is NOT the final explicit
 * year's FCFF for a company still in an investment phase.
 *
 * Two errors to avoid, and they pull in opposite directions.
 *
 * 1. Carrying today's capex into perpetuity. Alphabet spends 22.7% of revenue on
 *    capex against 5.25% depreciation (3.25x), mid-datacentre-buildout. Assuming
 *    it outspends its own depreciation by 10.3% of revenue forever understated
 *    value per share by ~44%.
 *
 * 2. Setting capex = D&A and then growing the result forever. That is zero NET
 *    reinvestment, so the perpetuity grows at g with no capital behind it -
 *    growth for free, implying infinite return on new capital. This overstates
 *    terminal value by 9-33% depending on ROIC.
 *
 * The consistent treatment is the reinvestment identity: g = ROIC x reinvestment
 * rate, so to grow at g a business must reinvest g / ROIC of its NOPAT.
 * Maintenance capex is covered by depreciation; the reinvestment rate funds
 * growth on top.
 *
 *   FCFF_terminal = NOPAT x (1 - g / ROIC)
 *
 * ROIC comes from the company's own accounts where invested capital is
 * reported, and falls back to the WACC when it is not - at ROIC = WACC the
 * business earns exactly its cost of capital and growth adds no value, which is
 * the neutral assumption rather than a flattering one.
 */
type SteadyState = NonNullable<TerminalValue['steadyState']>;

function terminalFcff(finalYear: ForecastYear, a: Assumptions): SteadyState {
  const base: SteadyState = {
    forecastFcff: finalYear.fcff,
    maintenanceFcff: finalYear.fcff,
    reinvestment: 0,
    capitalisedFcff: finalYear.fcff,
    roic: a.terminalRoic ?? a.wacc,
    roicFromAccounts: a.terminalRoic !== null,
    reinvestmentRate: 0,
  };
  if (!a.terminalCapexEqualsDA) return base;

  // Maintenance capex only: hold the asset base flat. Adding back the working
  // capital movement too, so this is NOPAT.
  //
  // The line above used to stop at `+ capex - dAndA`, which is NOPAT LESS the
  // final year's working-capital build, and the reinvestment charge below was
  // then taken on top of that. Working capital was therefore deducted twice, and
  // the first deduction was sized to the final EXPLICIT year's growth rate -
  // Microsoft carried a build struck at 16% growth into a 2.5% growth
  // perpetuity, Starbucks and Salesforce one struck at a clamped 100% of
  // incremental revenue.
  //
  // The formula in this function's own docstring has always said what it should
  // be: FCFF_terminal = NOPAT x (1 - g / ROIC), with the reinvestment rate
  // funding growth "on top". Reinvestment means all of it - working capital as
  // well as fixed assets - so charging the working-capital half separately was
  // never part of the intended model.
  //
  // Measured over 43 large caps before changing it: median implied value over
  // price 0.51x -> 0.57x, names landing in a usable 0.5-2.0x band 22 -> 24, and
  // results so far out the page has to disown them 5 -> 2. 29 names improved and
  // 13 fell. The 13 are companies whose history RELEASED working capital (IBM,
  // Johnson & Johnson, Apple) and were being credited that release in
  // perpetuity, which is no more real than the charge.
  //
  // THE ACQUIRED INTANGIBLE HAS RUN OFF BY HERE, so it leaves both sides of the
  // terminal. The line below used to be `fcff + capex - dAndA + changeInNwc`, which
  // by the identity at the top of this file reduces exactly to NOPAT - the add-back
  // cancelling in full. Right for depreciation, because worn-out plant has to be
  // replaced. Wrong for the amortisation of an acquisition: you do not re-buy Xilinx
  // every year, so the charge was being deducted inside EBIT in perpetuity against a
  // capital commitment that does not exist. For AMD that is ~2.25bn a year of
  // phantom cost capitalised forever.
  //
  // The opposite error is just as easy and is what the note in scenarios.ts was
  // guarding against: adding the amortisation back as free cash forever claims cash
  // from an intangible that has gone. Neither belongs in a steady state, so both come
  // out - EBITA, taxed, against maintenance capex at depreciation.
  //
  // depreciation equals D&A where the accounts do not separate them, making this a
  // no-op for those tickers, and it is floored at D&A so a reported depreciation line
  // larger than D&A cannot turn the correction into a penalty.
  const depreciation = Math.min(finalYear.revenue * a.depreciationPctRevenue, finalYear.dAndA);
  const amortisation = Math.max(finalYear.dAndA - depreciation, 0);
  const terminalNopat = (finalYear.ebit + amortisation) * (1 - a.taxRate);
  const maintenanceFcff = terminalNopat;
  if (a.terminalGrowth <= 0) {
    return { ...base, maintenanceFcff, capitalisedFcff: maintenanceFcff };
  }

  // A ROIC below the cost of capital would mean growth destroys value, and a
  // ROIC below terminal growth implies reinvesting more than the business earns.
  // Both show up on financials, where invested capital is not a meaningful
  // denominator, so floor at the WACC: growth is then value-neutral rather than
  // value-destroying on what is usually a data artefact.
  const roic = Math.max(a.terminalRoic ?? a.wacc, a.wacc);
  const reinvestmentRate = Math.min(a.terminalGrowth / roic, 0.9);
  // Floored at zero, because a loss-maker cannot fund growth out of negative
  // NOPAT. Unfloored the charge came out negative and was then SUBTRACTED, so a
  // business losing money was credited cash for growing: Mesoblast's sheet read
  // "Less reinvestment to fund terminal growth 56.6" as a positive. It never
  // reached a published valuation, because capitalised cashflow is floored at
  // zero too and Mesoblast's maintenance line was negative anyway - but it moves
  // the number wherever maintenance cashflow is positive on negative NOPAT,
  // which large depreciation can produce, and it moves it the conservative way.
  const reinvestment = Math.max(terminalNopat, 0) * reinvestmentRate;
  return {
    forecastFcff: finalYear.fcff,
    maintenanceFcff,
    reinvestment,
    // Never let the reinvestment charge flip the perpetuity negative - a
    // negative terminal value is an artefact of the charge, not a valuation.
    capitalisedFcff: Math.max(maintenanceFcff - reinvestment, 0),
    roic,
    roicFromAccounts: a.terminalRoic !== null && a.terminalRoic >= a.wacc,
    reinvestmentRate,
  };
}

function gordonTerminal(steadyState: SteadyState, a: Assumptions): TerminalValue {
  if (a.terminalGrowth >= a.wacc) {
    return {
      method: 'gordon',
      undiscounted: 0,
      presentValue: 0,
      shareOfEv: 0,
      blocked: `Terminal growth of ${(a.terminalGrowth * 100).toFixed(2)}% must be below the WACC of ${(a.wacc * 100).toFixed(2)}% for a perpetuity to converge.`,
      steadyState,
    };
  }
  const undiscounted =
    (steadyState.capitalisedFcff * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
  return {
    method: 'gordon',
    undiscounted,
    presentValue: undiscounted * terminalDiscountFactor(a),
    shareOfEv: 0,
    steadyState,
  };
}

function exitMultipleTerminal(finalYear: ForecastYear, a: Assumptions): TerminalValue {
  const terminalEbitda = finalYear.ebit + finalYear.dAndA;
  const undiscounted = terminalEbitda * a.exitMultiple;
  return {
    method: 'exitMultiple',
    undiscounted,
    presentValue: undiscounted * terminalDiscountFactor(a),
    shareOfEv: 0,
  };
}

function bridge(pvExplicit: number, terminal: TerminalValue, inputs: DcfInputs): ValuationByMethod {
  const enterpriseValue = pvExplicit + terminal.presentValue;
  const equityValue = enterpriseValue - inputs.netDebt;
  return {
    terminal: {
      ...terminal,
      shareOfEv: enterpriseValue === 0 ? 0 : terminal.presentValue / enterpriseValue,
    },
    enterpriseValue,
    equityValue,
    valuePerShare: inputs.dilutedShares === 0 ? 0 : equityValue / inputs.dilutedShares,
  };
}

export function runDcf(inputs: DcfInputs, a: Assumptions): DcfResult {
  assertLength('revenueGrowth', a.revenueGrowth, a.horizonYears);
  assertLength('ebitMargin', a.ebitMargin, a.horizonYears);

  const forecast = buildForecast(inputs, a);
  const pvExplicit = discount(forecast, a);

  const finalYear = forecast[forecast.length - 1];
  const steadyState = terminalFcff(finalYear, a);
  const gordonTv = gordonTerminal(steadyState, a);
  const exitTv = exitMultipleTerminal(finalYear, a);

  const warnings: string[] = [];
  if (gordonTv.blocked) warnings.push(gordonTv.blocked);
  if (a.terminalCapexEqualsDA && finalYear.capex > finalYear.dAndA * 1.25) {
    warnings.push(
      `Capital expenditure runs at ${((finalYear.capex / finalYear.revenue) * 100).toFixed(1)}% of revenue against depreciation of ${((finalYear.dAndA / finalYear.revenue) * 100).toFixed(1)}%. A perpetuity has to be a steady state, so the terminal year uses maintenance capex at depreciation and then charges the reinvestment terminal growth requires (g/ROIC of NOPAT). The bridge is shown under Terminal Value.`
    );
  }
  if (forecast.some((y) => y.fcff < 0)) {
    warnings.push('Free cashflow to firm is negative in at least one forecast year, so terminal value carries most of the valuation.');
  }

  return {
    forecast,
    pvExplicit,
    gordon: bridge(pvExplicit, gordonTv, inputs),
    exitMultiple: bridge(pvExplicit, exitTv, inputs),
    warnings,
  };
}
