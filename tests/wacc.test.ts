import { describe, it, expect } from 'vitest';
import { buildWacc, syntheticSpread, BETA_FLOOR, BETA_CEILING } from '@/lib/wacc';
import { implausibleResult } from '@/lib/valuation';

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
  // The beta in the CAPM line is the BLUMED beta, not the reported one. These two
  // tests asserted rf + 1.2 x ERP directly until 09/09/2026 and so encoded the
  // absence of the adjustment as if it were the requirement.
  const BLUMED = 0.67 * 1.2 + 0.33 * 1.0;   // 1.134

  it('computes cost of equity as rf + beta x ERP, on the adjusted beta', () => {
    const w = buildWacc(BASE);
    expect(w.beta).toBeCloseTo(BLUMED, 10);
    expect(w.costOfEquity).toBeCloseTo(0.042 + BLUMED * 0.055, 10);
  });

  it('weights equity and debt by market cap and total debt', () => {
    const w = buildWacc(BASE);
    expect(w.equityWeight).toBeCloseTo(0.8, 10);
    expect(w.debtWeight).toBeCloseTo(0.2, 10);
  });

  it('applies the tax shield to the debt leg only', () => {
    const w = buildWacc(BASE);
    const expected = 0.8 * (0.042 + BLUMED * 0.055) + 0.2 * 0.05 * (1 - 0.30);
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

  // The floor is the risk-free plus the spread a coverage-implied rating carries
  // (Damodaran, January 2026). Until 06/10/2026 it was the risk-free rate alone,
  // which priced any company with cheap legacy debt as if it were the government.
  describe('synthetic-rating floor', () => {
    it('lifts cheap book debt to the spread its interest cover implies', () => {
      // 5 on 2000 is 0.25%, far under the risk-free; cover 11 / 5 = 2.2x is BB.
      const w = buildWacc({ ...BASE, interestExpense: 5, ebit: 11 });
      expect(w.costOfDebt).toBeCloseTo(0.042 + 0.0184, 10);
      expect(w.costOfDebtSource).toMatch(/BB rating at 2\.2x/);
    });

    it('gives a heavily covered company only the AAA spread', () => {
      const w = buildWacc({ ...BASE, interestExpense: 5, ebit: 1000 });
      expect(w.costOfDebt).toBeCloseTo(0.042 + 0.004, 10);
    });

    it('keeps a real borrowing cost that is already above the floor', () => {
      // 10% book cost at 10x cover: the company's own number stands.
      const w = buildWacc({ ...BASE, interestExpense: 200, ebit: 2000 });
      expect(w.costOfDebt).toBeCloseTo(0.10, 10);
      expect(w.costOfDebtSource).toMatch(/interest expense/i);
    });

    it('caps a weak year at the fallback spread, not the default-risk end of the table', () => {
      // Negative EBIT reads as D (1900bp). At an 800bp cap Intel, Boeing and Baxter
      // all went to 13% debt while rated investment grade.
      const w = buildWacc({ ...BASE, interestExpense: 5, ebit: -50 });
      expect(w.costOfDebt).toBeCloseTo(0.042 + 0.02, 10);
      expect(w.costOfDebtSource).toMatch(/capped at 200bp/);
    });

    it('still lets a company that really pays a high-yield rate keep it', () => {
      // 9% book cost on weak cover: above the capped floor, under the ceiling.
      const w = buildWacc({ ...BASE, interestExpense: 180, ebit: 150 });
      expect(w.costOfDebt).toBeCloseTo(0.09, 10);
    });

    it('leaves the bank guard alone: coverage on deposit interest is no better than the rate', () => {
      const w = buildWacc({ ...BASE, interestExpense: 500, ebit: 100 });
      expect(w.costOfDebt).toBeCloseTo(0.042 + 0.02, 10);
      expect(w.costOfDebtSource).toMatch(/not a credible funding cost/i);
    });

    it('reads the table as Damodaran writes it: AAA is strictly above 8.5x', () => {
      expect(syntheticSpread(8.5).rating).toBe('AA');
      expect(syntheticSpread(8.51).rating).toBe('AAA');
      expect(syntheticSpread(0).rating).toBe('D');
      expect(syntheticSpread(2.2).spread).toBeCloseTo(0.0184, 10);
      expect(syntheticSpread(1.6).spread).toBeCloseTo(0.02, 10);
    });
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

describe('Blume adjustment', () => {
  // Added 09/09/2026. Yahoo's raw beta went straight into the cost of equity with
  // nothing but a clamp at 2.5, so AMD's 2.476 passed through untouched and gave an
  // 18.4% WACC. Probed across 25 names: median implied value / market price was 0.63
  // for beta under 1.2 and 0.06 for beta at or above it - a tenfold split, with
  // TSLA at 0.06, Seagate 0.05, Western Digital 0.07 and AMD 0.02. A raw beta is a
  // noisy point estimate of a quantity that mean-reverts, which is the whole reason
  // Blume's adjustment exists and why Bloomberg has shipped it by default for decades.
  const BLUME_W = 0.67;
  const blume = (raw: number) => BLUME_W * raw + (1 - BLUME_W) * 1.0;

  it('pulls a high beta toward the market', () => {
    const w = buildWacc({ ...BASE, rawBeta: 2.476 });     // AMD, as reported
    expect(w.beta).toBeCloseTo(blume(2.476), 6);          // 1.989
    expect(w.beta).toBeLessThan(2.476);
    expect(w.rawBeta).toBeCloseTo(2.476, 6);              // the raw value is kept
  });

  it('pulls a low beta UP toward the market, not down', () => {
    // The adjustment is symmetric. A 0.30 beta is as much a noisy estimate as a 2.5.
    const w = buildWacc({ ...BASE, rawBeta: 0.35 });
    expect(w.beta).toBeCloseTo(blume(0.35), 6);           // 0.565
    expect(w.beta).toBeGreaterThan(0.35);
  });

  it('leaves a market beta alone', () => {
    const w = buildWacc({ ...BASE, rawBeta: 1.0 });
    expect(w.beta).toBeCloseTo(1.0, 10);
  });

  it('takes AMD from an 18.4% cost of equity to something defensible', () => {
    const amd = buildWacc({ ...BASE, riskFree: { rate: 0.0462, source: 't', assumed: false },
                            rawBeta: 2.476 });
    expect(amd.costOfEquity).toBeLessThan(0.16);
    expect(amd.costOfEquity).toBeGreaterThan(0.13);
  });

  it('still clamps a beta that is absurd AFTER adjusting', () => {
    // Blume alone would leave 5.0 at 3.68, which is still not a discount rate.
    const w = buildWacc({ ...BASE, rawBeta: 5.0 });
    expect(w.beta).toBeCloseTo(BETA_CEILING, 10);
    expect(w.betaClamped).toBe(true);
  });

  it('does not adjust a MISSING beta - the default already IS the market', () => {
    const w = buildWacc({ ...BASE, rawBeta: null });
    expect(w.beta).toBeCloseTo(1.0, 10);
    expect(w.betaAdjusted).toBe(false);
  });

  it('records that it adjusted, so the page can say so', () => {
    expect(buildWacc({ ...BASE, rawBeta: 1.8 }).betaAdjusted).toBe(true);
    expect(buildWacc({ ...BASE, rawBeta: null }).betaAdjusted).toBe(false);
  });
});

describe('implausibleResult', () => {
  // The threshold is not a taste call. inspect-valuations.ts has said for months
  // that "a result more than ~10x off the price is a units or currency bug, not a
  // valuation opinion", and this puts that sentence on the page instead of leaving
  // it in a script only I run.
  it('says nothing about an ordinary disagreement', () => {
    expect(implausibleResult(50, 100)).toBeNull();   // half price
    expect(implausibleResult(300, 100)).toBeNull();  // 3x
    expect(implausibleResult(900, 100)).toBeNull();  // 9x, still an opinion
  });

  it('flags a value 10x or more above the price', () => {
    const flag = implausibleResult(1200, 100);
    expect(flag?.code).toBe('IMPLAUSIBLE_RESULT');
    expect(flag?.severity).toBe('error');
    expect(flag?.message).toMatch(/12/);
  });

  it('flags a value 10x or more BELOW the price, which is the AMD case', () => {
    // AMD came out at 0.02x the market price. A 98% overvaluation call is not a
    // view anyone would defend; it is the model saying it could not model this.
    expect(implausibleResult(3.4, 170)?.code).toBe('IMPLAUSIBLE_RESULT');
  });

  it('is symmetric at the boundary', () => {
    expect(implausibleResult(1000, 100)).not.toBeNull();
    expect(implausibleResult(10, 100)).not.toBeNull();
    expect(implausibleResult(999, 100)).toBeNull();
  });

  it('says nothing when there is no price to compare against', () => {
    // A missing price is already its own flag. Dividing by it would turn one
    // known gap into a second, more alarming, invented one.
    expect(implausibleResult(50, 0)).toBeNull();
    expect(implausibleResult(50, NaN)).toBeNull();
  });

  it('says nothing about a negative value per share', () => {
    // Negative equity value has its own causes and its own flags; running it
    // through a ratio test would report it as a units bug.
    expect(implausibleResult(-20, 100)).toBeNull();
  });
});
