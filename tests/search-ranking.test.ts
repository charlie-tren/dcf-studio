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

  it('drops exchanges it does not know how to model', () => {
    const hits = [
      { symbol: 'XYZ.QQ', name: 'Somewhere Ltd', exchange: 'QQQ' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NMS' },
    ];
    expect(rankHits(hits).map((h) => h.symbol)).toEqual(['MSFT']);
  });

  it('keeps the input order stable within one exchange', () => {
    const hits = [
      { symbol: 'CBAPJ.AX', name: 'CWLTH BANK NYR3QUT', exchange: 'ASX' },
      { symbol: 'CBA.AX', name: 'CWLTH BANK FPO', exchange: 'ASX' },
    ];
    expect(rankHits(hits).map((h) => h.symbol)).toEqual(['CBAPJ.AX', 'CBA.AX']);
  });
});
