import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildValuation } from '@/lib/valuation';
import type { RawTicker } from '@/lib/yahoo';

// The export is built in the reader's browser, which resolves exceljs to its browser
// bundle. It must write the same bytes as the Node build the server used to run.

async function valuationFor(ticker: string) {
  const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
  return buildValuation(
    ticker,
    { scenario: 'base', horizonYears: 5 },
    {
      fetchTicker: async () => raw,
      fetchFxRate: async () => 1,
      resolveRiskFree: async () => ({ rate: 0.0462, source: 'test', assumed: false }),
    }
  );
}

const sha = (b: unknown) => createHash('sha256').update(Buffer.from(b as ArrayBuffer)).digest('hex');

describe('workbook built with the browser bundle of exceljs', () => {
  it.each(['MSFT', 'BHP.AX', 'SHEL.L', 'CBA.AX', 'RY.TO'])('%s matches the Node build byte for byte', async (ticker) => {
    const v = await valuationFor(ticker);
    const pick = (m: typeof import('@/lib/workbook')) => (v.excessReturns ? m.buildBankWorkbook(v) : m.buildWorkbook(v));

    vi.resetModules();
    const node = await pick(await import('@/lib/workbook'));

    vi.resetModules();
    vi.doMock('exceljs', async () => {
      // @ts-expect-error the browser bundle ships no types
      const mod = (await import('exceljs/dist/exceljs.min.js')) as { default?: unknown };
      return { default: mod.default ?? mod };
    });
    const browser = await pick(await import('@/lib/workbook'));
    vi.doUnmock('exceljs');

    expect(sha(browser)).toBe(sha(node));
  }, 30_000);
});
