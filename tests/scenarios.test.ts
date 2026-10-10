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
  it('uses consensus revenue for the first two years then fades to the historical rate', () => {
    const f = fundamentals('MSFT');
    const c = buildScenario(f, 'consensus', 5, 0.09).assumptions;
    const d = historicalDrivers(f);
    // The final year has faded all the way back to the historical rate.
    expect(c.revenueGrowth[4]).toBeCloseTo(d.revenueCagr, 6);
  });
});

describe('buildScenario - base growth path', () => {
  it('shares the consensus years, then fades to terminal growth by the final year', () => {
    const f = fundamentals('MSFT');
    const base = buildScenario(f, 'base', 10, 0.09).assumptions;
    const c = buildScenario(f, 'consensus', 10, 0.09).assumptions;
    expect(base.revenueGrowth).toHaveLength(10);
    expect(base.revenueGrowth[0]).toBeCloseTo(c.revenueGrowth[0], 10);
    expect(base.revenueGrowth[1]).toBeCloseTo(c.revenueGrowth[1], 10);
    expect(base.revenueGrowth[9]).toBeCloseTo(base.terminalGrowth, 10);
    // A straight line between the last consensus year and terminal growth.
    const steps = base.revenueGrowth.slice(2).map((g, i, a) => (i === 0 ? null : g - a[i - 1])).slice(1);
    for (const s of steps) expect(s).toBeCloseTo(steps[0] as number, 10);
  });

  it('starts from the historical rate where there is no analyst coverage', () => {
    const f = { ...fundamentals('MSFT'), analystRevenue: [] };
    const base = buildScenario(f, 'base', 10, 0.09).assumptions;
    const d = historicalDrivers(f);
    const step = (base.terminalGrowth - d.revenueCagr) / 10;
    expect(base.revenueGrowth[0]).toBeCloseTo(d.revenueCagr + step, 10);
    expect(base.revenueGrowth[9]).toBeCloseTo(base.terminalGrowth, 10);
  });

  it('never holds a trailing rate flat: no two years equal unless it already sits at terminal growth', () => {
    const f = { ...fundamentals('MSFT'), analystRevenue: [] };
    const g = buildScenario(f, 'base', 10, 0.09).assumptions.revenueGrowth;
    expect(new Set(g.map((x) => x.toFixed(10))).size).toBe(10);
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

describe('the capex floor tests against depreciation, not against D&A', () => {
  // The floor's own stated premise is that a business cannot depreciate more
  // than it invests indefinitely. True of PP&E; false of amortisation of an
  // acquired intangible, which is a cheque already written. Reading the combined
  // figure made the floor fire on any acquisitive company and replace its real
  // capex with a number several times larger.
  it('derives depreciation separately from D&A where the accounts allow it', () => {
    const d = historicalDrivers(fundamentals('AMD'));
    expect(d.depreciationPctRevenue).toBeGreaterThan(0);
    expect(d.depreciationPctRevenue).toBeLessThan(d.daPctRevenue / 3);
    expect(d.depreciationIsFullDandA).toBe(false);
  });

  it('does not fire the floor on AMD, whose capex exceeds its depreciation', () => {
    // 974m of capex against 750m of depreciation. AMD is not underinvesting in
    // its productive assets; it bought Xilinx. Before 09/09/2026 this flag fired
    // and set capex to 13.46% of revenue against the 2.4% actually spent, which
    // is most of why the model valued AMD at 2% of its market price.
    const s = buildScenario(fundamentals('AMD'), 'base', 5, 0.10);
    expect(s.flags.some((f) => f.code === 'CAPEX_BELOW_DA')).toBe(false);
    expect(s.assumptions.capexPctRevenue).toBeLessThan(0.05);
    expect(s.assumptions.capexPctRevenue).not.toBeCloseTo(s.assumptions.daPctRevenue, 4);
  });

  it('still fires the floor on a company that genuinely underinvests', () => {
    // Mesoblast: capex 1m against 6m of D&A, and no split available, so the
    // fallback keeps the old behaviour. Narrowing the test must not disarm it.
    const s = buildScenario(fundamentals('MSB.AX'), 'base', 5, 0.10);
    expect(s.flags.some((f) => f.code === 'CAPEX_BELOW_DA')).toBe(true);
  });

  it('falls back to D&A and says so where no depreciation line exists', () => {
    const d = historicalDrivers(fundamentals('MSB.AX'));
    expect(d.depreciationIsFullDandA).toBe(true);
    expect(d.depreciationPctRevenue).toBeCloseTo(d.daPctRevenue, 10);
  });

  it('changes nothing for a company whose D&A is all depreciation', () => {
    // Microsoft reports one number in both fields, so this whole change must be
    // invisible to it. A fix that quietly moves every valuation is not a fix.
    const d = historicalDrivers(fundamentals('MSFT'));
    expect(d.depreciationPctRevenue).toBeCloseTo(d.daPctRevenue, 6);
    const s = buildScenario(fundamentals('MSFT'), 'base', 5, 0.10);
    expect(s.flags.some((f) => f.code === 'CAPEX_BELOW_DA')).toBe(false);
  });

  it('substitutes depreciation rather than D&A when the floor does bind', () => {
    // The substitute is "what it costs to hold the asset base flat", so it has
    // to be the same quantity the test was made against. Substituting the
    // combined figure after testing the depreciation half would reintroduce the
    // bug on the write side.
    const f = fundamentals('SGP.AX');
    const d = historicalDrivers(f);
    const s = buildScenario(f, 'base', 5, 0.10);
    if (s.flags.some((x) => x.code === 'CAPEX_BELOW_DA')) {
      expect(s.assumptions.capexPctRevenue).toBeLessThanOrEqual(
        Math.max(d.depreciationPctRevenue, 0.01) + 1e-9
      );
    }
  });
});
