import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '@/lib/normalise';
import { excessReturns, ROE_CEILING } from '@/lib/excessReturns';
import { buildValuation } from '@/lib/valuation';
import { declinedByModel } from '@/lib/batch';
import type { RawTicker } from '@/lib/yahoo';

function raw(t: string): RawTicker {
  return JSON.parse(readFileSync(`tests/fixtures/${t.replace('.', '_')}.json`, 'utf8'));
}
const deps = (t: string) => ({
  fetchTicker: async () => raw(t),
  fetchFxRate: async () => 1,
  resolveRiskFree: async () => ({ rate: 0.042, source: 'test', assumed: false }),
});

describe('excessReturns', () => {
  const f = normalise('CBA.AX', raw('CBA.AX'));
  const er = excessReturns(f, 0.09, 10, 0.025)!;

  it('is book equity plus the discounted excess returns, recomputed independently', () => {
    expect(er).not.toBeNull();
    let pv = 0;
    for (const y of er.years) {
      expect(y.excessReturn).toBeCloseTo((y.roe - 0.09) * y.openingBook, 4);
      pv += y.excessReturn / 1.09 ** y.year;
    }
    expect(er.pvExcess).toBeCloseTo(pv, 2);
    expect(er.equityValue).toBeCloseTo(er.bookValue + pv + er.terminalPresentValue, 2);
    expect(er.valuePerShare).toBeCloseTo(er.equityValue / f.years[0].shares.value, 6);
  });

  it('measures ROE on opening book and starts from the latest book', () => {
    expect(er.bookValue).toBe(f.years[0].bookEquity!.value);
    expect(er.years[0].openingBook).toBe(er.bookValue);
    const first = f.years[0].netIncomeCommon!.value / f.years[1].bookEquity!.value;
    expect(er.roe).toBeGreaterThan(0.05);
    expect(Math.abs(er.roe - first)).toBeLessThan(0.05);
  });

  it('fades ROE to the ceiling, never past its own starting level', () => {
    const last = er.years[er.years.length - 1].roe;
    expect(last).toBeCloseTo(Math.min(er.roe, ROE_CEILING), 10);
    const hot = { ...f, years: f.years.map((y) => ({ ...y, netIncomeCommon: y.netIncomeCommon && { ...y.netIncomeCommon, value: y.netIncomeCommon.value * 3 } })) };
    const h = excessReturns(hot, 0.09, 10, 0.025)!;
    expect(h.roe).toBeGreaterThan(ROE_CEILING);
    expect(h.years[9].roe).toBeCloseTo(ROE_CEILING, 10);
  });

  it('refuses where the model cannot hold: no book, a loss, or growth at the cost of equity', () => {
    expect(excessReturns(f, 0.025, 10, 0.025)).toBeNull();
    const noBook = { ...f, years: f.years.map((y) => ({ ...y, bookEquity: null })) };
    expect(excessReturns(noBook, 0.09, 10, 0.025)).toBeNull();
    const loss = { ...f, years: f.years.map((y) => ({ ...y, netIncomeCommon: y.netIncomeCommon && { ...y.netIncomeCommon, value: -1e9 } })) };
    expect(excessReturns(loss, 0.09, 10, 0.025)).toBeNull();
  });
});

describe('a bank through the full valuation', () => {
  it.each(['CBA.AX', 'RY.TO'])('%s is valued on excess returns and published, not declined', async (t) => {
    const v = await buildValuation(t, { scenario: 'base', horizonYears: 10 }, deps(t));
    expect(v.excessReturns).not.toBeNull();
    expect(v.valuePerShareQuoted).toBeCloseTo(v.excessReturns!.valuePerShare, 6);
    expect(v.flags.find((x) => x.code === 'FINANCIAL_SECTOR')?.severity).toBe('info');
    expect(declinedByModel(v.flags)).toBe(false);
  });

  it('leaves a non-financial on free cashflow', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 10 }, deps('MSFT'));
    expect(v.excessReturns).toBeNull();
    expect(v.valuePerShareQuoted).toBeCloseTo(v.dcf.gordon.valuePerShare, 6);
  });
});
