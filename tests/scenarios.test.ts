import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '@/lib/normalise';
import { buildScenario, historicalDrivers, TILTS } from '@/lib/scenarios';
import type { RawTicker } from '@/lib/yahoo';

function fundamentals(ticker: string) {
  const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
  return normalise(ticker, raw);
}

describe('historicalDrivers', () => {
  it('derives every driver from the company own history', () => {
    const d = historicalDrivers(fundamentals('MSFT'));
    expect(d.revenueCagr).toBeGreaterThan(0);
    expect(d.ebitMargin).toBeGreaterThan(0);
    expect(d.ebitMargin).toBeLessThan(1);
    expect(d.daPctRevenue).toBeGreaterThan(0);
    expect(d.capexPctRevenue).toBeGreaterThan(0);
    expect(d.taxRate).toBeGreaterThan(0);
    expect(d.taxRate).toBeLessThanOrEqual(0.35);
  });

  it('caps the effective tax rate at the statutory rate', () => {
    const d = historicalDrivers(fundamentals('BHP.AX'));
    expect(d.taxRate).toBeLessThanOrEqual(0.30);
  });

  it('anchors base revenue on the latest reported year', () => {
    const f = fundamentals('MSFT');
    const d = historicalDrivers(f);
    expect(d.latestRevenue).toBeCloseTo(f.years[0].revenue.value, 2);
  });

  it('produces a sane growth rate rather than a wild one for a loss-maker', () => {
    const d = historicalDrivers(fundamentals('MSB.AX'));
    expect(Number.isFinite(d.revenueCagr)).toBe(true);
  });
});

describe('buildScenario - base', () => {
  it('fills every assumption for the chosen horizon', () => {
    const { assumptions } = buildScenario(fundamentals('MSFT'), 'base', 5, 0.09);
    expect(assumptions.revenueGrowth).toHaveLength(5);
    expect(assumptions.ebitMargin).toHaveLength(5);
    expect(assumptions.wacc).toBeCloseTo(0.09, 10);
    expect(assumptions.midYearConvention).toBe(true);
  });

  it('fills a ten-year horizon too', () => {
    const { assumptions } = buildScenario(fundamentals('MSFT'), 'base', 10, 0.09);
    expect(assumptions.revenueGrowth).toHaveLength(10);
    expect(assumptions.ebitMargin).toHaveLength(10);
  });
});

describe('buildScenario - tilts', () => {
  it('makes bull more optimistic than base on growth, margin and terminal growth', () => {
    const f = fundamentals('MSFT');
    const base = buildScenario(f, 'base', 5, 0.09).assumptions;
    const bull = buildScenario(f, 'bull', 5, 0.09).assumptions;
    const bear = buildScenario(f, 'bear', 5, 0.09).assumptions;
    expect(bull.revenueGrowth[0]).toBeCloseTo(base.revenueGrowth[0] + TILTS.bull.revenueGrowth, 10);
    expect(bull.ebitMargin[0]).toBeCloseTo(base.ebitMargin[0] + TILTS.bull.ebitMargin, 10);
    expect(bear.terminalGrowth).toBeLessThan(base.terminalGrowth);
    expect(bear.revenueGrowth[0]).toBeLessThan(base.revenueGrowth[0]);
  });
});

describe('buildScenario - consensus', () => {
  it('uses consensus revenue for the first two years then fades to the base rate', () => {
    const f = fundamentals('MSFT');
    const base = buildScenario(f, 'base', 5, 0.09).assumptions;
    const c = buildScenario(f, 'consensus', 5, 0.09).assumptions;
    expect(c.revenueGrowth[0]).not.toBeCloseTo(base.revenueGrowth[0], 6);
    // The final year has faded all the way back to the historical rate.
    expect(c.revenueGrowth[4]).toBeCloseTo(base.revenueGrowth[4], 6);
  });

  it('keeps margins and capex rule-based, since no consensus exists for them', () => {
    const f = fundamentals('MSFT');
    const base = buildScenario(f, 'base', 5, 0.09).assumptions;
    const c = buildScenario(f, 'consensus', 5, 0.09).assumptions;
    expect(c.ebitMargin[0]).toBeCloseTo(base.ebitMargin[0], 10);
    expect(c.capexPctRevenue).toBeCloseTo(base.capexPctRevenue, 10);
  });

  it('falls back to base and says so when there is no coverage', () => {
    const f = fundamentals('MSFT');
    const bare = { ...f, analystRevenue: [] };
    const r = buildScenario(bare, 'consensus', 5, 0.09);
    expect(r.notes.some((n) => /no analyst/i.test(n))).toBe(true);
  });

  it('produces finite growth rates for every year', () => {
    const c = buildScenario(fundamentals('MSFT'), 'consensus', 10, 0.09).assumptions;
    expect(c.revenueGrowth.every((g) => Number.isFinite(g))).toBe(true);
  });
});

describe('buildScenario - capex sustainability guard', () => {
  it('catches a REIT whose capex is negligible in absolute terms', () => {
    // Stockland reports A$3m of capex on A$3.1bn of revenue (0.10%) because a
    // REIT invests through investment properties - A$9.5bn of them, against
    // A$129m of gross PPE. Its depreciation is equally tiny (0.63% of revenue),
    // so the capex/D&A RATIO looks healthy at 0.73 and only an absolute test
    // catches it. Left alone the model gets free growth forever.
    const r = buildScenario(fundamentals('SGP.AX'), 'base', 5, 0.09);
    expect(r.flags.some((x) => x.code === 'CAPEX_BELOW_DA')).toBe(true);
    // Substituted up to the 1%-of-revenue floor, since D&A is negligible too.
    expect(r.assumptions.capexPctRevenue).toBeCloseTo(0.01, 8);
    expect(r.flags.find((x) => x.code === 'CAPEX_BELOW_DA')?.message).toMatch(/too low/i);
  });

  it('catches a company whose capex runs far below its depreciation', () => {
    // Mesoblast: capex 4.1% of revenue against D&A of 53.5%, a ratio of 0.08.
    const r = buildScenario(fundamentals('MSB.AX'), 'base', 5, 0.09);
    expect(r.flags.some((x) => x.code === 'CAPEX_BELOW_DA')).toBe(true);
    expect(r.assumptions.capexPctRevenue).toBeCloseTo(r.assumptions.daPctRevenue, 8);
    expect(r.flags.find((x) => x.code === 'CAPEX_BELOW_DA')?.message).toMatch(/depreciate more than it invests/i);
  });

  it('leaves capex alone for a company that reports it properly', () => {
    // MSFT spends 22.9% of revenue on capex - high, but genuinely reported.
    const r = buildScenario(fundamentals('MSFT'), 'base', 5, 0.09);
    expect(r.flags.some((x) => x.code === 'CAPEX_BELOW_DA')).toBe(false);
  });

  it('leaves ARB alone, whose capex exceeds depreciation', () => {
    const r = buildScenario(fundamentals('ARB.AX'), 'base', 5, 0.09);
    expect(r.flags.some((x) => x.code === 'CAPEX_BELOW_DA')).toBe(false);
  });
});

describe('buildScenario - every fixture produces usable assumptions', () => {
  const ALL = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO'];

  it.each(ALL)('%s yields finite, non-absurd drivers', (ticker) => {
    const a = buildScenario(fundamentals(ticker), 'base', 5, 0.09).assumptions;
    expect(a.revenueGrowth.every(Number.isFinite), 'growth finite').toBe(true);
    expect(a.ebitMargin.every(Number.isFinite), 'margin finite').toBe(true);
    expect(Number.isFinite(a.capexPctRevenue), 'capex finite').toBe(true);
    expect(Number.isFinite(a.nwcPctRevenueChange), 'nwc finite').toBe(true);
    expect(a.taxRate, 'tax >= 0').toBeGreaterThanOrEqual(0);
    expect(a.taxRate, 'tax <= 0.5').toBeLessThanOrEqual(0.5);
    // Growth beyond +/-100% a year for five years is a data artefact, not a forecast.
    expect(Math.abs(a.revenueGrowth[0]), 'growth sane').toBeLessThan(1);
  });
});

describe('buildScenario - exit multiple', () => {
  it('derives the exit multiple from the company own EV/EBITDA, not a fixed number', () => {
    // A single multiple for every company is an arbitrary anchor shown with equal
    // weight to the DCF: 8x was being used for Microsoft, Shell and a REIT alike.
    const msft = buildScenario(fundamentals('MSFT'), 'base', 5, 0.09).assumptions.exitMultiple;
    const shel = buildScenario(fundamentals('SHEL.L'), 'base', 5, 0.09).assumptions.exitMultiple;
    expect(msft).not.toBeCloseTo(shel, 1);
    // A software business should rate well above an oil major.
    expect(msft).toBeGreaterThan(shel);
  });

  it('clamps the multiple to a defensible band', () => {
    for (const t of ['MSFT', 'BHP.AX', 'ARB.AX', 'SHEL.L', 'SGP.AX', 'CBA.AX', 'MSB.AX']) {
      const m = buildScenario(fundamentals(t), 'base', 5, 0.09).assumptions.exitMultiple;
      expect(m, `${t} multiple`).toBeGreaterThanOrEqual(3);
      expect(m, `${t} multiple`).toBeLessThanOrEqual(20);
    }
  });

  it('falls back to a default where EBITDA is negative', () => {
    // Mesoblast loses money, so EV/EBITDA gives nothing usable.
    const m = buildScenario(fundamentals('MSB.AX'), 'base', 5, 0.09).assumptions.exitMultiple;
    expect(m).toBeCloseTo(8, 6);
  });
});

describe('buildScenario - exit multiple disclosure', () => {
  it('says when the multiple has been capped rather than presenting it as reported', () => {
    // CBA's raw EV/EBITDA is 28.8x and RBC's 30.0x, because EBITDA is not a
    // meaningful denominator for a bank. Presenting a silently-capped 20x as the
    // company's own rating would be misleading.
    for (const t of ['CBA.AX', 'RY.TO']) {
      const r = buildScenario(fundamentals(t), 'base', 5, 0.09);
      expect(r.assumptions.exitMultiple).toBeCloseTo(20, 6);
      expect(r.notes.some((n) => /outside a defensible/i.test(n)), `${t} note`).toBe(true);
    }
  });

  it('says when it has fallen back for want of positive EBITDA', () => {
    const r = buildScenario(fundamentals('MSB.AX'), 'base', 5, 0.09);
    expect(r.notes.some((n) => /no usable EV\/EBITDA/i.test(n))).toBe(true);
  });

  it('stays quiet when the company own multiple is used unmodified', () => {
    for (const t of ['MSFT', 'BHP.AX', 'ARB.AX', 'SHEL.L']) {
      const r = buildScenario(fundamentals(t), 'base', 5, 0.09);
      expect(r.notes.some((n) => /EV\/EBITDA/i.test(n)), `${t} should be silent`).toBe(false);
    }
  });
});
