import { describe, it, expect } from 'vitest';
import { toQuoteDisplayUnits, priceInMajorUnits, majorCurrency } from '@/lib/fx';

describe('toQuoteDisplayUnits', () => {
  it('leaves a value alone when reporting and quote currency match', () => {
    const r = toQuoteDisplayUnits(12.5, { reportingCurrency: 'AUD', quoteCurrency: 'AUD', fxRate: 1 });
    expect(r.value).toBeCloseTo(12.5, 10);
    expect(r.converted).toBe(false);
  });

  it('ignores a nonsense FX rate when the currencies already match', () => {
    // Guards against a stray rate silently scaling a same-currency valuation.
    const r = toQuoteDisplayUnits(12.5, { reportingCurrency: 'AUD', quoteCurrency: 'AUD', fxRate: 1.45 });
    expect(r.value).toBeCloseTo(12.5, 10);
  });

  it('converts USD reporting to AUD quote at the given rate', () => {
    // BHP reports USD, trades AUD. USD 40.00 at USDAUD 1.45 = AUD 58.00
    const r = toQuoteDisplayUnits(40, { reportingCurrency: 'USD', quoteCurrency: 'AUD', fxRate: 1.45 });
    expect(r.value).toBeCloseTo(58, 10);
    expect(r.converted).toBe(true);
  });

  it('multiplies into pence when the quote currency is a sub-unit', () => {
    // Shell reports USD, quotes GBp. USD 30 at USDGBP 0.79 = GBP 23.70 = 2370p
    const r = toQuoteDisplayUnits(30, { reportingCurrency: 'USD', quoteCurrency: 'GBp', fxRate: 0.79 });
    expect(r.value).toBeCloseTo(2370, 6);
  });

  it('applies the sub-unit divisor even when no conversion is needed', () => {
    // A GBP reporter quoting GBp still needs the x100, with no FX involved.
    const r = toQuoteDisplayUnits(25, { reportingCurrency: 'GBP', quoteCurrency: 'GBp', fxRate: 1 });
    expect(r.value).toBeCloseTo(2500, 6);
    expect(r.converted).toBe(false);
  });
});

describe('priceInMajorUnits', () => {
  it('divides a pence quote by 100', () => {
    expect(priceInMajorUnits(2500, 'GBp')).toBeCloseTo(25, 10);
  });

  it('leaves a major-unit quote alone', () => {
    expect(priceInMajorUnits(178.66, 'AUD')).toBeCloseTo(178.66, 10);
  });
});

describe('majorCurrency', () => {
  it('maps a sub-unit code to its major currency', () => {
    expect(majorCurrency('GBp')).toBe('GBP');
    expect(majorCurrency('ZAc')).toBe('ZAC');
  });

  it('leaves a major currency untouched', () => {
    expect(majorCurrency('USD')).toBe('USD');
  });
});

describe('round trip', () => {
  it('recovers the reporting-currency value from the displayed value', () => {
    const ctx = { reportingCurrency: 'USD', quoteCurrency: 'GBp', fxRate: 0.79 };
    const displayed = toQuoteDisplayUnits(30, ctx).value;
    const backInMajor = priceInMajorUnits(displayed, ctx.quoteCurrency);
    expect(backInMajor / ctx.fxRate).toBeCloseTo(30, 8);
  });
});
