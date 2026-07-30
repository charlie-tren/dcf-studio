import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildValuation } from '@/lib/valuation';
import type { RawTicker } from '@/lib/yahoo';

function deps(ticker: string, fxRate = 1.45) {
  const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
  return {
    fetchTicker: async () => raw,
    fetchFxRate: async () => fxRate,
    resolveRiskFree: async () => ({ rate: 0.042, source: 'test', assumed: false }),
  };
}

describe('buildValuation', () => {
  it('produces a valuation with all workings for a straightforward company', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, deps('MSFT'));
    expect(v.fundamentals.name).toMatch(/Microsoft/);
    expect(v.wacc.wacc).toBeGreaterThan(0.04);
    expect(v.dcf.forecast).toHaveLength(5);
    expect(v.valuePerShareQuoted).toBeGreaterThan(0);
    expect(v.sensitivity.cells).toHaveLength(5);
  });

  it('reports upside against the live price in the same units', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, deps('MSFT'));
    const expectedUpside = v.valuePerShareQuoted / v.fundamentals.price - 1;
    expect(v.upside).toBeCloseTo(expectedUpside, 10);
  });

  it('converts to quote currency once, at the end, for a cross-currency reporter', async () => {
    const v = await buildValuation('BHP.AX', { scenario: 'base', horizonYears: 5 }, deps('BHP.AX'));
    expect(v.fundamentals.reportingCurrency).toBe('USD');
    expect(v.fundamentals.quoteCurrency).toBe('AUD');
    expect(v.valuePerShareQuoted).toBeCloseTo(v.dcf.gordon.valuePerShare * 1.45, 6);
  });

  it('does not convert when reporting and quote currency already match', async () => {
    const v = await buildValuation('ARB.AX', { scenario: 'base', horizonYears: 5 }, deps('ARB.AX'));
    expect(v.fxRate).toBe(1);
    expect(v.valuePerShareQuoted).toBeCloseTo(v.dcf.gordon.valuePerShare, 8);
  });

  it('handles a pence-quoted, dollar-reporting company without a 100x error', async () => {
    // Shell reports USD and quotes GBp. USDGBP is roughly 0.79.
    const v = await buildValuation('SHEL.L', { scenario: 'base', horizonYears: 5 }, deps('SHEL.L', 0.79));
    // Value per share in pence should be the same order of magnitude as the
    // quoted pence price, not 100x out either way.
    const ratio = v.valuePerShareQuoted / v.fundamentals.price;
    expect(ratio).toBeGreaterThan(0.05);
    expect(ratio).toBeLessThan(20);
    // And explicitly: pence, so a multiple of the dollar figure, not a fraction.
    expect(v.valuePerShareQuoted).toBeCloseTo(v.dcf.gordon.valuePerShare * 0.79 * 100, 4);
  });

  it('still returns a model for a bank, carrying the sector warning', async () => {
    const v = await buildValuation('CBA.AX', { scenario: 'base', horizonYears: 5 }, deps('CBA.AX'));
    expect(v.flags.some((x) => x.code === 'FINANCIAL_SECTOR')).toBe(true);
    expect(v.dcf.forecast).toHaveLength(5);
  });

  it('merges flags from the normaliser, the scenario builder and the WACC guard', async () => {
    const v = await buildValuation('SHEL.L', { scenario: 'base', horizonYears: 5 }, deps('SHEL.L', 0.79));
    expect(v.flags.some((x) => x.code === 'BETA_CLAMPED')).toBe(true);
    expect(v.flags.some((x) => x.code === 'CURRENCY_MISMATCH')).toBe(true);
  });

  it('surfaces engine warnings as flags rather than dropping them', async () => {
    // runDcf raises a warning when it normalises a large capex gap. That warning
    // was being computed and then never rendered, because nothing read
    // dcf.warnings. MSFT spends ~17% of revenue on capex against ~9% D&A.
    const v = await buildValuation(
      'MSFT',
      { scenario: 'base', horizonYears: 5, overrides: { capexPctRevenue: 0.25, daPctRevenue: 0.05 } },
      deps('MSFT')
    );
    expect(v.dcf.warnings.some((w) => /steady state/i.test(w))).toBe(true);
    expect(v.flags.some((f) => /steady state/i.test(f.message))).toBe(true);
  });

  it('honours the requested horizon', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 10 }, deps('MSFT'));
    expect(v.dcf.forecast).toHaveLength(10);
  });

  it('applies user overrides on top of the scenario and marks it modified', async () => {
    const v = await buildValuation(
      'MSFT',
      { scenario: 'base', horizonYears: 5, overrides: { terminalGrowth: 0.01, wacc: 0.12 } },
      deps('MSFT')
    );
    expect(v.assumptions.terminalGrowth).toBeCloseTo(0.01, 10);
    expect(v.assumptions.wacc).toBeCloseTo(0.12, 10);
    expect(v.modified).toBe(true);
  });

  it('is not marked modified when no overrides are supplied', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, deps('MSFT'));
    expect(v.modified).toBe(false);
  });

  it('discounts at the WACC it derived, not the placeholder risk-free rate', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, deps('MSFT'));
    expect(v.assumptions.wacc).toBeCloseTo(v.wacc.wacc, 10);
    expect(v.assumptions.wacc).not.toBeCloseTo(0.042, 4);
  });

  it('flags an assumed risk-free rate', async () => {
    const d = {
      ...deps('MSFT'),
      resolveRiskFree: async () => ({ rate: 0.042, source: 'USD assumption', assumed: true }),
    };
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, d);
    expect(v.flags.some((x) => x.code === 'RISK_FREE_ASSUMED')).toBe(true);
  });

  it('throws a clear error when no statements are available', async () => {
    const d = {
      ...deps('MSFT'),
      fetchTicker: async () => ({ statements: [], quote: {} }) as RawTicker,
    };
    await expect(buildValuation('NOPE', { scenario: 'base', horizonYears: 5 }, d)).rejects.toThrow(
      /no annual financial statements/i
    );
  });

  it('falls back to an unconverted value when the FX lookup fails', async () => {
    const d = { ...deps('BHP.AX'), fetchFxRate: async () => null };
    const v = await buildValuation('BHP.AX', { scenario: 'base', horizonYears: 5 }, d);
    expect(v.fxRate).toBe(1);
    expect(Number.isFinite(v.valuePerShareQuoted)).toBe(true);
  });
});

describe('buildValuation - every fixture yields a finite, sane result', () => {
  const ALL = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO'];

  it.each(ALL)('%s produces no NaN or Infinity anywhere in the output', async (ticker) => {
    const v = await buildValuation(ticker, { scenario: 'base', horizonYears: 5 }, deps(ticker));

    expect(Number.isFinite(v.valuePerShareQuoted), 'value per share').toBe(true);
    expect(Number.isFinite(v.upside), 'upside').toBe(true);
    expect(Number.isFinite(v.wacc.wacc), 'wacc').toBe(true);
    expect(v.wacc.wacc, 'wacc positive').toBeGreaterThan(0);
    expect(Number.isFinite(v.dcf.pvExplicit), 'pv explicit').toBe(true);

    for (const y of v.dcf.forecast) {
      for (const [k, n] of Object.entries(y)) {
        expect(Number.isFinite(n as number), `${ticker} forecast year ${y.year} ${k}`).toBe(true);
      }
    }
    for (const row of v.sensitivity.cells) {
      for (const cell of row) {
        expect(cell === null || Number.isFinite(cell), 'sensitivity cell').toBe(true);
      }
    }
  });

  it.each(ALL)('%s works across all four scenarios', async (ticker) => {
    for (const scenario of ['base', 'bull', 'bear', 'consensus'] as const) {
      const v = await buildValuation(ticker, { scenario, horizonYears: 5 }, deps(ticker));
      expect(Number.isFinite(v.valuePerShareQuoted), `${ticker} ${scenario}`).toBe(true);
    }
  });
});
