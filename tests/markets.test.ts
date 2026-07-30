import { describe, it, expect } from 'vitest';
import { marketFor, QUOTE_SUBUNIT_DIVISOR } from '@/lib/markets';

describe('marketFor', () => {
  it('resolves an ASX ticker to a tier-1 AUD market', () => {
    const m = marketFor('BHP.AX');
    expect(m.currency).toBe('AUD');
    expect(m.tier).toBe(1);
    expect(m.riskFreeSource).toBe('rba');
    expect(m.statutoryTaxRate).toBeCloseTo(0.30, 5);
  });

  it('resolves a bare ticker to the US market', () => {
    const m = marketFor('MSFT');
    expect(m.currency).toBe('USD');
    expect(m.tier).toBe(1);
    expect(m.riskFreeSource).toBe('yahoo-tnx');
  });

  it('resolves an unknown suffix to a tier-2 market with an assumed risk-free rate', () => {
    const m = marketFor('XYZ.ZZ');
    expect(m.tier).toBe(2);
    expect(m.riskFreeSource).toBe('default');
  });

  it('knows GBp is quoted in pence, not pounds', () => {
    expect(QUOTE_SUBUNIT_DIVISOR.GBp).toBe(100);
    expect(QUOTE_SUBUNIT_DIVISOR.ZAc).toBe(100);
    expect(QUOTE_SUBUNIT_DIVISOR.USD).toBeUndefined();
  });
});
