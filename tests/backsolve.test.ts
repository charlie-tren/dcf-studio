import { describe, it, expect } from 'vitest';
import { impliedExpectations } from '@/lib/backsolve';
import { runDcf } from '@/lib/dcf';
import { cagr } from '@/lib/format';
import type { Assumptions, DcfInputs } from '@/lib/types';

const A: Assumptions = {
  horizonYears: 5,
  revenueGrowth: Array(5).fill(0.1),
  ebitMargin: Array(5).fill(0.2),
  taxRate: 0.3,
  daPctRevenue: 0.05,
  depreciationPctRevenue: 0.05,   // no amortisation in this fixture
  capexPctRevenue: 0.07,
  nwcPctRevenueChange: 0.1,
  terminalGrowth: 0.025,
  exitMultiple: 8,
  wacc: 0.1,
  midYearConvention: false,
  terminalCapexEqualsDA: false,
  terminalRoic: null,
};
const I: DcfInputs = { baseRevenue: 1000, netDebt: 500, dilutedShares: 100 };

const modelled = runDcf(I, A).gordon.valuePerShare;

describe('impliedExpectations', () => {
  it('returns the model own inputs when the target is the model own answer', () => {
    const r = impliedExpectations(I, A, modelled);
    expect(r.revenueGrowth).toBeCloseTo(0.1, 3);
    expect(r.ebitMargin).toBeCloseTo(0.2, 3);
    expect(r.wacc).toBeCloseTo(0.1, 3);
  });

  it('each solved input reproduces the target when fed back through the engine', () => {
    const target = modelled * 1.5;
    const r = impliedExpectations(I, A, target);

    const viaGrowth = runDcf(I, {
      ...A,
      revenueGrowth: Array(5).fill(r.revenueGrowth as number),
    }).gordon.valuePerShare;
    expect(viaGrowth).toBeCloseTo(target, 2);

    const viaMargin = runDcf(I, {
      ...A,
      ebitMargin: Array(5).fill(r.ebitMargin as number),
    }).gordon.valuePerShare;
    expect(viaMargin).toBeCloseTo(target, 2);

    const viaWacc = runDcf(I, { ...A, wacc: r.wacc as number }).gordon.valuePerShare;
    expect(viaWacc).toBeCloseTo(target, 2);
  });

  it('a price above the model implies more growth and a lower discount rate', () => {
    const r = impliedExpectations(I, A, modelled * 2);
    expect(r.revenueGrowth as number).toBeGreaterThan(0.1);
    expect(r.ebitMargin as number).toBeGreaterThan(0.2);
    expect(r.wacc as number).toBeLessThan(0.1);
  });

  it('a price below the model implies less growth and a higher discount rate', () => {
    const r = impliedExpectations(I, A, modelled * 0.5);
    expect(r.revenueGrowth as number).toBeLessThan(0.1);
    expect(r.wacc as number).toBeGreaterThan(0.1);
  });

  it('returns null rather than a wrong answer when a target is unreachable', () => {
    // No margin inside the bracket makes a company worth 500x its own model.
    const r = impliedExpectations(I, A, modelled * 500);
    expect(r.ebitMargin).toBeNull();
  });

  it('never solves for a discount rate at or below terminal growth', () => {
    const r = impliedExpectations(I, A, modelled * 20);
    if (r.wacc !== null) expect(r.wacc).toBeGreaterThan(A.terminalGrowth);
  });
});

describe('cagr', () => {
  it('computes compound growth over n-1 periods', () => {
    expect(cagr([100, 110, 121]) as number).toBeCloseTo(0.1, 10);
  });

  it('handles a decline', () => {
    // 121 -> 100 over two periods: (100/121)^(1/2) - 1 = -9.0909%
    expect(cagr([121, 110, 100]) as number).toBeCloseTo(-0.090909, 5);
  });

  it('returns null for a sign change, where a compound rate is meaningless', () => {
    expect(cagr([-10, 5, 20])).toBeNull();
  });

  it('returns null for a zero start and for a single point', () => {
    expect(cagr([0, 10])).toBeNull();
    expect(cagr([10])).toBeNull();
  });

  it('reports a deteriorating loss as negative, not positive', () => {
    // -10 to -20 is a doubling in magnitude, but the business is getting worse.
    expect(cagr([-10, -20]) as number).toBeLessThan(0);
  });
});

describe('cagr on displayed vs underlying series', () => {
  it('reports growing capex spend as positive growth, not negative', () => {
    // The table shows capex as a negative outflow (-67bn ... -108bn). Taking
    // the CAGR of the DISPLAYED series gives -12.5%, which reads as spending
    // falling when it is rising. Growth must be computed on the magnitude.
    const displayed = [-67.2, -75.6, -85.1, -95.8, -107.7];
    const underlying = displayed.map((v) => -v);
    expect(cagr(underlying) as number).toBeCloseTo(0.125, 2);
    // Both are the same magnitude; only the sign differs, which is the trap.
    expect(cagr(displayed) as number).toBeCloseTo(-0.125, 2);
  });
});
