import { describe, it, expect } from 'vitest';
import { runDcf } from '@/lib/dcf';
import type { Assumptions, DcfInputs } from '@/lib/types';

/** Hand-computed reference model. See the plan for the derivation. */
export const REF_ASSUMPTIONS: Assumptions = {
  horizonYears: 5,
  revenueGrowth: [0.10, 0.10, 0.10, 0.10, 0.10],
  ebitMargin: [0.20, 0.20, 0.20, 0.20, 0.20],
  taxRate: 0.30,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.07,
  nwcPctRevenueChange: 0.10,
  terminalGrowth: 0.025,
  exitMultiple: 8,
  wacc: 0.10,
  midYearConvention: false,
  // Off in the reference model so the hand-computed terminal value stays a
  // plain Gordon growth off year-5 FCFF. Its own tests turn it on.
  terminalCapexEqualsDA: false,
  terminalRoic: null,
};

export const REF_INPUTS: DcfInputs = {
  baseRevenue: 1000,
  netDebt: 500,
  dilutedShares: 100,
};

describe('runDcf - FCFF build', () => {
  it('compounds revenue off the base year', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(r.forecast.map((f) => Number(f.revenue.toFixed(4)))).toEqual([1100, 1210, 1331, 1464.1, 1610.51]);
  });

  it('builds FCFF as NOPAT + D&A - capex - change in NWC', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const fcff = r.forecast.map((f) => Number(f.fcff.toFixed(4)));
    expect(fcff).toEqual([122, 134.2, 147.62, 162.382, 178.6202]);
  });

  it('treats capex and change in NWC as outflows, never as absolute values', () => {
    // Negative growth shrinks revenue, so working capital releases cash:
    // change in NWC is negative and therefore ADDS to FCFF.
    const shrinking: Assumptions = { ...REF_ASSUMPTIONS, revenueGrowth: [-0.10, -0.10, -0.10, -0.10, -0.10] };
    const r = runDcf(REF_INPUTS, shrinking);
    expect(r.forecast[0].changeInNwc).toBeCloseTo(-10, 6);
    // NOPAT 900*0.2*0.7 = 126, D&A 45, capex 63, dNWC -10 => 126+45-63+10 = 118
    expect(r.forecast[0].fcff).toBeCloseTo(118, 6);
  });

  it('produces one forecast year per horizon year', () => {
    const ten: Assumptions = {
      ...REF_ASSUMPTIONS,
      horizonYears: 10,
      revenueGrowth: Array(10).fill(0.10),
      ebitMargin: Array(10).fill(0.20),
    };
    expect(runDcf(REF_INPUTS, ten).forecast).toHaveLength(10);
  });

  it('rejects an assumption array whose length does not match the horizon', () => {
    const bad: Assumptions = { ...REF_ASSUMPTIONS, revenueGrowth: [0.1, 0.1] };
    expect(() => runDcf(REF_INPUTS, bad)).toThrow(/revenueGrowth/);
  });
});

describe('runDcf - discounting', () => {
  it('discounts year-end at full t', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(r.forecast[0].discountFactor).toBeCloseTo(1 / 1.1, 10);
    expect(r.forecast[4].discountFactor).toBeCloseTo(1 / 1.1 ** 5, 10);
  });

  it('sums the present values of the explicit forecast', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    // Independent recompute: FCFF growing at exactly the discount rate means
    // every year has the same PV of 122/1.1, so the sum is 5 x that.
    expect(r.pvExplicit).toBeCloseTo(5 * (122 / 1.1), 8);
  });

  it('discounts mid-year at t - 0.5, worth sqrt(1 + WACC) more', () => {
    const end = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const mid = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, midYearConvention: true });
    expect(mid.forecast[0].discountFactor).toBeCloseTo(1 / 1.1 ** 0.5, 10);
    expect(mid.pvExplicit).toBeCloseTo(end.pvExplicit * Math.sqrt(1.1), 8);
  });
});

describe('runDcf - terminal value', () => {
  it('computes Gordon growth off the final year FCFF', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const expected = (178.6202 * 1.025) / (0.10 - 0.025);
    expect(r.gordon.terminal.undiscounted).toBeCloseTo(expected, 4);
    expect(r.gordon.terminal.presentValue).toBeCloseTo(expected / 1.1 ** 5, 4);
  });

  it('computes the exit multiple off terminal EBITDA', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    // Terminal EBITDA = EBIT + D&A = 1610.51*0.20 + 1610.51*0.05 = 402.6275
    const expected = 1610.51 * 0.25 * 8;
    expect(r.exitMultiple.terminal.undiscounted).toBeCloseTo(expected, 4);
    expect(r.exitMultiple.terminal.presentValue).toBeCloseTo(expected / 1.1 ** 5, 4);
  });

  it('discounts the terminal value on the same convention as the flows', () => {
    // The TV capitalises a perpetuity of flows arriving THROUGH each later year,
    // so under mid-year they are half a year closer, exactly as the explicit
    // flows are. Discounting the TV at full n while the flows use t - 0.5 is
    // internally inconsistent and understates the largest line by sqrt(1+WACC).
    const undiscounted = (178.6202 * 1.025) / 0.075;
    const end = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(end.gordon.terminal.presentValue).toBeCloseTo(undiscounted / 1.1 ** 5, 4);

    const mid = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, midYearConvention: true });
    expect(mid.gordon.terminal.presentValue).toBeCloseTo(undiscounted / 1.1 ** 4.5, 4);
    expect(mid.gordon.terminal.presentValue).toBeCloseTo(
      end.gordon.terminal.presentValue * Math.sqrt(1.1),
      4
    );
  });

  it('scales the WHOLE valuation by sqrt(1 + WACC) between conventions', () => {
    // With both the flows and the TV on the same convention, switching should
    // be a clean uniform shift - a good check that nothing is half-converted.
    const end = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const mid = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, midYearConvention: true });
    expect(mid.gordon.enterpriseValue).toBeCloseTo(
      end.gordon.enterpriseValue * Math.sqrt(1.1),
      6
    );
  });

  it('blocks Gordon growth when terminal growth meets or exceeds WACC', () => {
    const r = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, terminalGrowth: 0.10 });
    expect(r.gordon.terminal.blocked).toMatch(/terminal growth/i);
    expect(r.gordon.terminal.presentValue).toBe(0);
    expect(r.warnings.some((w) => /terminal growth/i.test(w))).toBe(true);
    // The exit multiple is unaffected and still produces a value.
    expect(r.exitMultiple.terminal.presentValue).toBeGreaterThan(0);
  });

  it('reports each method terminal share of enterprise value', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const g = r.gordon;
    expect(g.terminal.shareOfEv).toBeCloseTo(g.terminal.presentValue / g.enterpriseValue, 10);
    expect(g.terminal.shareOfEv).toBeGreaterThan(0.6);
  });
});

describe('runDcf - terminal capex normalisation', () => {
  // Alphabet spends 22.7% of revenue on capex against 5.25% depreciation, a
  // ratio of 3.25x, because it is mid-datacentre-buildout. Carrying that into
  // perpetuity assumes it outspends its own depreciation forever and understated
  // its value per share by USD 60 - a 44% error with no wrong input anywhere.
  const HEAVY_INVESTOR = {
    ...REF_ASSUMPTIONS,
    capexPctRevenue: 0.2270,
    daPctRevenue: 0.0525,
    terminalCapexEqualsDA: true,
  };

  it('capitalises a steady-state cashflow net of the reinvestment growth requires', () => {
    const r = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.20 });
    const final = r.forecast[4];
    // Maintenance capex only, then subtract g/ROIC of NOPAT for growth.
    const maintenance = final.fcff + final.capex - final.dAndA;
    const reinvestment = final.nopat * (0.025 / 0.20);
    const expected = ((maintenance - reinvestment) * 1.025) / (0.10 - 0.025);
    expect(r.gordon.terminal.undiscounted).toBeCloseTo(expected, 2);
  });

  it('charges for growth: zero net reinvestment would overstate the perpetuity', () => {
    // capex = D&A alone means the business grows at g on no new capital, which
    // implies infinite return on incremental investment. Overstates TV by
    // 9-33% depending on ROIC.
    const withCharge = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.15 });
    const final = withCharge.forecast[4];
    const freeGrowth = ((final.fcff + final.capex - final.dAndA) * 1.025) / 0.075;
    expect(withCharge.gordon.terminal.undiscounted).toBeLessThan(freeGrowth);
  });

  it('charges less reinvestment the higher the return on capital', () => {
    const low = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.10 });
    const high = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.30 });
    expect(high.gordon.valuePerShare).toBeGreaterThan(low.gordon.valuePerShare);
  });

  it('falls back to the WACC when ROIC is unknown, where growth adds no value', () => {
    const r = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: null });
    const atWacc = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.10 });
    expect(r.gordon.valuePerShare).toBeCloseTo(atWacc.gordon.valuePerShare, 6);
  });

  it('applies no reinvestment charge at zero terminal growth', () => {
    const r = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalGrowth: 0, terminalRoic: 0.2 });
    const final = r.forecast[4];
    const maintenance = final.fcff + final.capex - final.dAndA;
    expect(r.gordon.terminal.undiscounted).toBeCloseTo(maintenance / 0.10, 2);
  });

  it('values a heavy investor higher than carrying peak capex forever', () => {
    const naive = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalCapexEqualsDA: false });
    const fixed = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.20 });
    expect(fixed.gordon.valuePerShare).toBeGreaterThan(naive.gordon.valuePerShare);
  });

  it('warns when it has normalised a large capex gap', () => {
    const r = runDcf(REF_INPUTS, HEAVY_INVESTOR);
    expect(r.warnings.some((w) => /steady state/i.test(w))).toBe(true);
  });

  it('still charges for growth even when capex already equals depreciation', () => {
    // No capex normalisation needed, but growth must still be paid for.
    const steady = { ...REF_ASSUMPTIONS, capexPctRevenue: 0.05, daPctRevenue: 0.05 };
    const off = runDcf(REF_INPUTS, steady);
    const on = runDcf(REF_INPUTS, { ...steady, terminalCapexEqualsDA: true, terminalRoic: 0.15 });
    expect(on.gordon.valuePerShare).toBeLessThan(off.gordon.valuePerShare);
    expect(on.warnings.some((w) => /steady state/i.test(w))).toBe(false);
  });

  it('exposes a steady-state bridge that reconciles to the terminal value', () => {
    // The adjustment swings TV by 9-33%, so it is rendered on the page. A
    // displayed bridge that does not tie to the number above it is worse than
    // no bridge, so assert every step reconciles.
    const r = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.20 });
    const ss = r.gordon.terminal.steadyState;
    expect(ss).toBeDefined();
    if (!ss) return;
    const final = r.forecast[4];

    expect(ss.forecastFcff).toBeCloseTo(final.fcff, 8);
    expect(ss.maintenanceFcff).toBeCloseTo(final.fcff + final.capex - final.dAndA, 8);
    expect(ss.reinvestmentRate).toBeCloseTo(0.025 / 0.20, 8);
    expect(ss.reinvestment).toBeCloseTo(final.nopat * ss.reinvestmentRate, 8);
    // The bridge must add up.
    expect(ss.capitalisedFcff).toBeCloseTo(ss.maintenanceFcff - ss.reinvestment, 8);
    // And the capitalised figure must be what the perpetuity actually used.
    expect(r.gordon.terminal.undiscounted).toBeCloseTo(
      (ss.capitalisedFcff * 1.025) / (0.10 - 0.025),
      6
    );
  });

  it('marks ROIC as floored rather than reported when it falls below the WACC', () => {
    // Financials produce a sub-WACC ROIC from a meaningless denominator. The UI
    // must not present that as the company's reported return.
    const r = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalRoic: 0.02 });
    const ss = r.gordon.terminal.steadyState;
    expect(ss?.roic).toBeCloseTo(0.10, 8);
    expect(ss?.roicFromAccounts).toBe(false);
  });

  it('reports the bridge as a no-op when the adjustment is off', () => {
    const r = runDcf(REF_INPUTS, { ...HEAVY_INVESTOR, terminalCapexEqualsDA: false });
    const ss = r.gordon.terminal.steadyState;
    expect(ss?.reinvestment).toBe(0);
    expect(ss?.capitalisedFcff).toBeCloseTo(r.forecast[4].fcff, 8);
  });

  it('leaves the explicit forecast years untouched', () => {
    const r = runDcf(REF_INPUTS, HEAVY_INVESTOR);
    // Only the terminal value is normalised - the visible cashflows still show
    // the real capex the company is spending.
    expect(r.forecast[4].capex / r.forecast[4].revenue).toBeCloseTo(0.227, 8);
  });

  it('does not inflate a company that under-invests', () => {
    // The adjustment cuts both ways: capex below depreciation reduces terminal
    // cashflow rather than flattering it.
    const underInvestor = {
      ...REF_ASSUMPTIONS,
      capexPctRevenue: 0.02,
      daPctRevenue: 0.08,
      terminalCapexEqualsDA: true,
    };
    const naive = runDcf(REF_INPUTS, { ...underInvestor, terminalCapexEqualsDA: false });
    const fixed = runDcf(REF_INPUTS, underInvestor);
    expect(fixed.gordon.valuePerShare).toBeLessThan(naive.gordon.valuePerShare);
  });
});

describe('runDcf - full reconciliation against an independent recompute', () => {
  it('reconciles enterprise value, equity value and value per share', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);

    // Recomputed longhand, not by reusing the engine's loop.
    const pvExplicit = 5 * (122 / 1.1);
    const pvTerminal = ((178.6202 * 1.025) / 0.075) / 1.1 ** 5;
    const ev = pvExplicit + pvTerminal;
    const equity = ev - 500;

    expect(r.pvExplicit).toBeCloseTo(pvExplicit, 6);
    expect(r.gordon.enterpriseValue).toBeCloseTo(ev, 6);
    expect(r.gordon.equityValue).toBeCloseTo(equity, 6);
    expect(r.gordon.valuePerShare).toBeCloseTo(equity / 100, 8);
  });

  it('subtracts net debt, so a net cash company is worth more than its EV implies', () => {
    const netCash = runDcf({ ...REF_INPUTS, netDebt: -200 }, REF_ASSUMPTIONS);
    const netDebt = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(netCash.gordon.equityValue - netDebt.gordon.equityValue).toBeCloseTo(700, 6);
  });

  it('flags negative free cashflow rather than hiding it', () => {
    const lossMaker = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, ebitMargin: Array(5).fill(-0.15) });
    expect(lossMaker.forecast.every((y) => y.fcff < 0)).toBe(true);
    expect(lossMaker.warnings.some((w) => /negative/i.test(w))).toBe(true);
  });

  it('returns zero per share rather than Infinity when the share count is missing', () => {
    const r = runDcf({ ...REF_INPUTS, dilutedShares: 0 }, REF_ASSUMPTIONS);
    expect(r.gordon.valuePerShare).toBe(0);
  });
});
