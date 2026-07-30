import { describe, it, expect } from 'vitest';
import { parseRbaF2, resolveRiskFree, RBA_TEN_YEAR_SERIES_ID } from '@/lib/riskfree';

/**
 * Shaped exactly like the real F2 CSV, verified against a live download on
 * 30/07/2026. The 10-year is the FIFTH column, not the second - reading
 * cells[1] would silently return the 2-YEAR yield, a ~43bp error in every
 * ASX discount rate. The parser must select by series ID.
 */
const F2_SAMPLE = `F2 CAPITAL MARKET YIELDS - GOVERNMENT BONDS
Title,Australian Government 2 year bond,Australian Government 3 year bond,Australian Government 5 year bond,Australian Government 10 year bond,Australian Government Indexed Bond
Frequency,Daily,Daily,Daily,Daily,Daily
Units,Per cent per annum,Per cent per annum,Per cent per annum,Per cent per annum,Per cent per annum
Source,RBA,RBA,RBA,RBA,RBA
Series ID,FCMYGBAG2D,FCMYGBAG3D,FCMYGBAG5D,FCMYGBAG10D,FCMYGBAGID
20-Jul-2026,4.566,4.558,4.616,4.974,2.624
21-Jul-2026,4.539,4.530,4.588,4.955,2.616
22-Jul-2026,4.561,4.554,4.615,4.989,2.637
`;

describe('parseRbaF2', () => {
  it('reads the 10-year column by series ID, not by position', () => {
    // 4.989 is the 10-year. 4.561 is the 2-year on the same row.
    expect(parseRbaF2(F2_SAMPLE)).toBeCloseTo(0.04989, 10);
  });

  it('exposes the series ID it looks for', () => {
    expect(RBA_TEN_YEAR_SERIES_ID).toBe('FCMYGBAG10D');
  });

  it('skips trailing blank observations and takes the latest real one', () => {
    const withBlanks = F2_SAMPLE + '23-Jul-2026,,,,\n24-Jul-2026,,,,\n';
    expect(parseRbaF2(withBlanks)).toBeCloseTo(0.04989, 10);
  });

  it('returns null when the series ID is absent', () => {
    const renamed = F2_SAMPLE.replace('FCMYGBAG10D', 'SOMETHINGELSE');
    expect(parseRbaF2(renamed)).toBeNull();
  });

  it('returns null when there are no numeric observations', () => {
    const headerOnly = F2_SAMPLE.split('\n').slice(0, 6).join('\n');
    expect(parseRbaF2(headerOnly)).toBeNull();
  });

  it('tolerates a BOM and quoted cells', () => {
    const messy = '﻿' + F2_SAMPLE.replace('20-Jul-2026,4.566', '"20-Jul-2026","4.566"');
    expect(parseRbaF2(messy)).toBeCloseTo(0.04989, 10);
  });
});

describe('resolveRiskFree', () => {
  const deps = (us: number | null, au: number | null) => ({
    fetchUsTenYear: async () => us,
    fetchRbaTenYear: async () => au,
  });

  it('marks a tier-2 market rate as assumed and uses the market default', async () => {
    const r = await resolveRiskFree('SAP.DE', deps(0.045, 0.042));
    expect(r.assumed).toBe(true);
    expect(r.source).toMatch(/assumption/i);
    expect(r.rate).toBeCloseTo(0.026, 10);
  });

  it('sources USD from the US 10-year', async () => {
    const r = await resolveRiskFree('MSFT', deps(0.0462, 0.042));
    expect(r.assumed).toBe(false);
    expect(r.rate).toBeCloseTo(0.0462, 10);
    expect(r.source).toMatch(/TNX/);
  });

  it('sources AUD from the RBA', async () => {
    const r = await resolveRiskFree('BHP.AX', deps(0.0462, 0.0415));
    expect(r.assumed).toBe(false);
    expect(r.rate).toBeCloseTo(0.0415, 10);
    expect(r.source).toMatch(/RBA/);
  });

  it('falls back to the market default and says so when the live fetch fails', async () => {
    const r = await resolveRiskFree('BHP.AX', deps(null, null));
    expect(r.assumed).toBe(true);
    expect(r.rate).toBeCloseTo(0.042, 10);
  });

  it('rejects an implausible live rate rather than trusting it', async () => {
    // A parser reading the wrong column or a units slip (4.9 vs 0.049) must not
    // silently become a 490% discount rate.
    const r = await resolveRiskFree('BHP.AX', deps(null, 4.989));
    expect(r.assumed).toBe(true);
    expect(r.rate).toBeCloseTo(0.042, 10);
  });
});
