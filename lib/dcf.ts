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
  // Terminal value sits at the end of the final explicit year, so it always
  // discounts at full t, regardless of the convention used for the flows.
  return 1 / (1 + a.wacc) ** a.horizonYears;
}

function gordonTerminal(finalFcff: number, a: Assumptions): TerminalValue {
  if (a.terminalGrowth >= a.wacc) {
    return {
      method: 'gordon',
      undiscounted: 0,
      presentValue: 0,
      shareOfEv: 0,
      blocked: `Terminal growth of ${(a.terminalGrowth * 100).toFixed(2)}% must be below the WACC of ${(a.wacc * 100).toFixed(2)}% for a perpetuity to converge.`,
    };
  }
  const undiscounted = (finalFcff * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
  return {
    method: 'gordon',
    undiscounted,
    presentValue: undiscounted * terminalDiscountFactor(a),
    shareOfEv: 0,
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
  const gordonTv = gordonTerminal(finalYear.fcff, a);
  const exitTv = exitMultipleTerminal(finalYear, a);

  const warnings: string[] = [];
  if (gordonTv.blocked) warnings.push(gordonTv.blocked);
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
