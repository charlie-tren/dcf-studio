import { describe, it, expect } from 'vitest';
import { rankHits } from '@/lib/rank';

const WOOLWORTHS = [
  { symbol: 'WN3.F', name: 'Woolworths Holdings Ltd.', exchange: 'FRA' },
  { symbol: 'WHL.JO', name: 'Woolworths Holdings Ltd', exchange: 'JNB' },
  { symbol: 'WOW.XA', name: 'WOOLWORTHS FPO', exchange: 'CXA' },
  { symbol: 'WOW.AX', name: 'WOOLWORTHS FPO', exchange: 'ASX' },
];

describe('rankHits', () => {
  it('puts the ASX line first for an Australian company', () => {
    expect(rankHits(WOOLWORTHS)[0].symbol).toBe('WOW.AX');
  });

  it('ranks a US primary listing above its foreign cross-listings', () => {
    const hits = [
      { symbol: 'MSF.DE', name: 'MICROSOFT CORP.', exchange: 'GER' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NMS' },
    ];
    expect(rankHits(hits)[0].symbol).toBe('MSFT');
  });

  it('demotes an unmodelled exchange below a known one, without dropping it', () => {
    const hits = [
      { symbol: 'XYZ.QQ', name: 'Somewhere Ltd', exchange: 'QQQ' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NMS' },
    ];
    expect(rankHits(hits).map((h) => h.symbol)).toEqual(['MSFT', 'XYZ.QQ']);
  });

  it('never returns an empty list when Yahoo found matches', () => {
    // The live "woolworths" response contained NO recognised exchange - an
    // allowlist filter returned nothing at all and the search looked broken.
    const noneRecognised = [
      { symbol: 'WN3.F', name: 'Woolworths Holdings Ltd.', exchange: 'FRA' },
      { symbol: 'WHL.JO', name: 'Woolworths Holdings Ltd', exchange: 'JNB' },
      { symbol: 'WWR.HM', name: 'Woolworths Group Ltd.', exchange: 'HAM' },
      { symbol: 'WOW.XA', name: 'WOOLWORTHS FPO', exchange: 'CXA' },
    ];
    expect(rankHits(noneRecognised)).toHaveLength(4);
  });

  it('keeps the input order stable within one exchange', () => {
    const hits = [
      { symbol: 'CBAPJ.AX', name: 'CWLTH BANK NYR3QUT', exchange: 'ASX' },
      { symbol: 'CBA.AX', name: 'CWLTH BANK FPO', exchange: 'ASX' },
    ];
    expect(rankHits(hits).map((h) => h.symbol)).toEqual(['CBAPJ.AX', 'CBA.AX']);
  });
});

describe('rankHits - ASX ambiguity that motivated the region merge', () => {
  it('surfaces the ASX line first once both regions are merged', () => {
    // Yahoo caps search at 5 quotes per call and which 5 depends on region, so
    // a bare "woolworths" from the default region never returned WOW.AX at all.
    // lib/yahoo.ts now merges a default-region and an AU-region call; this is the
    // shape that merge produces, and the ASX line must lead.
    const merged = [
      { symbol: 'WN3.F', name: 'Woolworths Holdings Ltd.', exchange: 'FRA' },
      { symbol: 'WN30.F', name: 'Woolworths Holdings Ltd.', exchange: 'FRA' },
      { symbol: 'WWR.HM', name: 'Woolworths Group Ltd.', exchange: 'HAM' },
      { symbol: 'WOW.AX', name: 'WOOLWORTHS FPO', exchange: 'ASX' },
      { symbol: 'WOW.XA', name: 'WOOLWORTHS FPO', exchange: 'CXA' },
      { symbol: 'WLWHY', name: 'Woolworths Group Ltd', exchange: 'PNK' },
    ];
    expect(rankHits(merged)[0].symbol).toBe('WOW.AX');
  });

  it('does not let the AU merge displace a US primary listing', () => {
    // The merge must not skew a non-AU search: MSFT still leads.
    const merged = [
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NMS' },
      { symbol: 'MSF.DE', name: 'MICROSOFT CORP.', exchange: 'GER' },
      { symbol: 'MSFT34.SA', name: 'MICROSOFT DRN', exchange: 'SAO' },
    ];
    expect(rankHits(merged)[0].symbol).toBe('MSFT');
  });
});
