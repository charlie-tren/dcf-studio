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
