import { describe, it, expect } from 'vitest';
import { buildWacc, BETA_FLOOR, BETA_CEILING } from '@/lib/wacc';

const BASE = {
  riskFree: { rate: 0.042, source: 'US 10-year Treasury (^TNX)', assumed: false },
  equityRiskPremium: 0.055,
  rawBeta: 1.2,
  marketCap: 8000,
  totalDebt: 2000,
  interestExpense: 100,
  priorTotalDebt: 2000,
  taxRate: 0.30,
};

describe('buildWacc', () => {
  it('computes cost of equity as rf + beta x ERP', () => {
    const w = buildWacc(BASE);
    expect(w.costOfEquity).toBeCloseTo(0.042 + 1.2 * 0.055, 10);
  });

  it('weights equity and debt by market cap and total debt', () => {
    const w = buildWacc(BASE);
    expect(w.equityWeight).toBeCloseTo(0.8, 10);
    expect(w.debtWeight).toBeCloseTo(0.2, 10);
  });

  it('applies the tax shield to the debt leg only', () => {
    const w = buildWacc(BASE);
    const expected = 0.8 * (0.042 + 1.2 * 0.055) + 0.2 * 0.05 * (1 - 0.30);
    expect(w.costOfDebt).toBeCloseTo(0.05, 10);
    expect(w.wacc).toBeCloseTo(expected, 10);
  });

  it('clamps a negative beta and records that it did', () => {
    // Shell returns -0.235. Left alone, the cost of equity falls below the
    // risk-free rate, which is not a defensible discount rate.
    const w = buildWacc({ ...BASE, rawBeta: -0.235 });
    expect(w.beta).toBeCloseTo(BETA_FLOOR, 10);
    expect(w.betaClamped).toBe(true);
    expect(w.rawBeta).toBeCloseTo(-0.235, 10);
    expect(w.costOfEquity).toBeGreaterThan(w.riskFreeRate);
  });

  it('clamps an implausibly high beta', () => {
    const w = buildWacc({ ...BASE, rawBeta: 4.5 });
    expect(w.beta).toBeCloseTo(BETA_CEILING, 10);
    expect(w.betaClamped).toBe(true);
  });

  it('defaults beta to 1.0 when it is missing', () => {
    const w = buildWacc({ ...BASE, rawBeta: null });
    expect(w.beta).toBeCloseTo(1.0, 10);
    expect(w.betaClamped).toBe(false);
  });

  it('floors the cost of debt at the risk-free rate', () => {
    const w = buildWacc({ ...BASE, interestExpense: 5 });
    expect(w.costOfDebt).toBeCloseTo(0.042, 10);
    expect(w.costOfDebtSource).toMatch(/floor/i);
  });

  it('falls back to a default spread when interest expense is unavailable', () => {
    const w = buildWacc({ ...BASE, interestExpense: null });
    expect(w.costOfDebt).toBeCloseTo(0.042 + 0.02, 10);
    expect(w.costOfDebtSource).toMatch(/assum/i);
  });

  it('rejects an implausibly wide implied cost of debt', () => {
    // CBA implied 20.4% and RBC 14.0%, because a bank's interest expense covers
    // deposits while totalDebt excludes them - the two lines measure different
    // things. 25% here (500/2000) is far past any real credit spread.
    const w = buildWacc({ ...BASE, interestExpense: 500 });
    expect(w.costOfDebt).toBeCloseTo(0.042 + 0.02, 10);
    expect(w.costOfDebtSource).toMatch(/not a credible funding cost/i);
  });

  it('rejects a bank-style implied cost of debt just inside a naive ceiling', () => {
    // RBC's real 14.04% slipped through a 1500bp band. 940bp over the risk-free
    // is not a AA- bank's funding cost.
    const w = buildWacc({
      ...BASE,
      riskFree: { rate: 0.0462, source: 'test', assumed: false },
      interestExpense: 280.8,
    });
    expect(w.costOfDebt).toBeCloseTo(0.0462 + 0.02, 10);
    expect(w.costOfDebtSource).toMatch(/not a credible funding cost/i);
  });

  it('accepts a genuinely wide but credible high-yield spread', () => {
    // 10% on 2000 of debt is 580bp over a 4.2% risk-free - single-B, but real.
    const w = buildWacc({ ...BASE, interestExpense: 200 });
    expect(w.costOfDebt).toBeCloseTo(0.10, 10);
    expect(w.costOfDebtSource).toMatch(/interest expense/i);
  });

  it('gives a debt-free company a WACC equal to its cost of equity', () => {
    const w = buildWacc({ ...BASE, totalDebt: 0, priorTotalDebt: 0, interestExpense: 0 });
    expect(w.wacc).toBeCloseTo(w.costOfEquity, 10);
  });

  it('never returns a WACC at or below zero for sane inputs', () => {
    // A zero or negative WACC makes the perpetuity diverge, so guard the floor.
    const w = buildWacc({ ...BASE, rawBeta: -5, riskFree: { rate: 0.0001, source: 'test', assumed: true } });
    expect(w.wacc).toBeGreaterThan(0);
  });

  it('produces a plausible WACC for a real leveraged company', () => {
    // Sanity band: an equity-heavy industrial should land in single digits.
    const w = buildWacc(BASE);
    expect(w.wacc).toBeGreaterThan(0.05);
    expect(w.wacc).toBeLessThan(0.15);
  });
});
