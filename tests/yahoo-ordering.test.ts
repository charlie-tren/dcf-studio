import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { RawTicker } from '@/lib/yahoo';

/**
 * Yahoo returns `date` as a live Date object. String(date) on a Date yields
 * "Mon Jun 30 2025 ..." which sorts by DAY NAME, so a naive sort silently
 * reorders the years - and the "latest" year drives base revenue, net debt and
 * the share count. The recorded fixtures caught this: MSFT came back
 * 2022, 2024, 2025, 2023. lib/yahoo.ts now normalises to ISO at the boundary.
 */
describe('recorded fixtures', () => {
  const files = readdirSync('tests/fixtures').filter((f) => f.endsWith('.json'));

  // Reads the recorder's OWN list rather than a hardcoded count. The count broke
  // the moment a ticker was added (AMD, 09/09/2026) and told you only that a
  // number had changed - never which fixture was missing. This checks the thing
  // that actually matters, in both directions: every ticker the recorder claims
  // to record has a file, and every file on disk is one the recorder maintains.
  it('has a fixture for every ticker the recorder records, and no orphans', () => {
    const source = readFileSync('scripts/record-fixtures.ts', 'utf8');
    const list = source.match(/const TICKERS = \[([^\]]+)\]/);
    expect(list).not.toBeNull();
    const expected = [...(list as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)]
      .map((m) => `${m[1].replace('.', '_')}.json`)
      .sort();
    expect([...files].sort()).toEqual(expected);
  });

  it.each(files)('%s stores period ends as ISO dates, newest first', (file) => {
    const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8'));
    const dates = raw.statements.map((s) => String(s.date));

    expect(dates.length).toBeGreaterThanOrEqual(4);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it.each(files)('%s has usable revenue in its newest period', (file) => {
    const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8'));
    expect(raw.statements[0].totalRevenue as number).toBeGreaterThan(0);
  });

  it('orders MSFT revenue as a descending series, the case that exposed the bug', () => {
    const raw: RawTicker = JSON.parse(readFileSync('tests/fixtures/MSFT.json', 'utf8'));
    const revenue = raw.statements.map((s) => s.totalRevenue as number);
    for (let i = 1; i < revenue.length; i++) {
      expect(revenue[i - 1]).toBeGreaterThan(revenue[i]);
    }
  });
});
