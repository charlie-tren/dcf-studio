import { describe, it, expect } from 'vitest';
import {
  quoteConversionFactor,
  toQuoteDisplayUnits,
  priceInMajorUnits,
  majorCurrency,
  priceInReportingCurrency,
} from '@/lib/fx';

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
  /**
   * This used to assert ZAc -> "ZAC", which is not a currency. The function
   * upper-cased the code, which is right for sterling and wrong for the other
   * two, and the test locked that in: the rand is ZAR and the shekel is ILS.
   *
   * What it cost. Yahoo does serve a USDZAC=X pair, quoting the rate in cents,
   * so the FX rate arrived already sub-unit-adjusted and the x100 was then
   * applied on top - Naspers came out at 2,407,080c against a price of 76,546c,
   * a 3,045% upside. USDILA=X does not resolve, so Teva fell through to a rate
   * of 1 and read -88%. Sterling was the only one of the three that worked.
   */
  it('maps a sub-unit code to its real major currency', () => {
    expect(majorCurrency('GBp')).toBe('GBP');
    expect(majorCurrency('ZAc')).toBe('ZAR');
    expect(majorCurrency('ILA')).toBe('ILS');
  });

  it('leaves a major currency untouched', () => {
    expect(majorCurrency('USD')).toBe('USD');
  });

  it('treats a sub-unit quote of its own major currency as no conversion', () => {
    // A rand reporter quoting cents needs the x100 and no FX at all. Before the
    // fix majorCurrency said "ZAC", which does not equal "ZAR", so the model
    // went looking for a ZAR-to-ZAC rate, got 100 from Yahoo, and multiplied by
    // 100 again: Sasol at 7,826,029c against a price of 18,175c.
    const ctx = { reportingCurrency: 'ZAR', quoteCurrency: 'ZAc', fxRate: 100 };
    expect(quoteConversionFactor(ctx)).toBe(100);
    expect(toQuoteDisplayUnits(50, ctx).value).toBeCloseTo(5000, 8);
  });

  it('applies FX then the sub-unit for every sub-unit market, not just sterling', () => {
    // USD 20 at 18 ZAR/USD = R360 = 36,000c.
    expect(
      quoteConversionFactor({ reportingCurrency: 'USD', quoteCurrency: 'ZAc', fxRate: 18 })
    ).toBeCloseTo(1800, 8);
    // USD 20 at 3.7 ILS/USD = 74 shekels = 7,400 agorot.
    expect(
      quoteConversionFactor({ reportingCurrency: 'USD', quoteCurrency: 'ILA', fxRate: 3.7 })
    ).toBeCloseTo(370, 8);
  });
});

describe('round trip', () => {
  it('recovers the reporting-currency value from the displayed value', () => {
    const ctx = { reportingCurrency: 'USD', quoteCurrency: 'GBp', fxRate: 0.79 };
    const displayed = toQuoteDisplayUnits(30, ctx).value;
    const backInMajor = priceInMajorUnits(displayed, ctx.quoteCurrency);
    expect(backInMajor / ctx.fxRate).toBeCloseTo(30, 8);
  });

  it('priceInReportingCurrency exactly inverts toQuoteDisplayUnits', () => {
    const contexts = [
      { reportingCurrency: 'AUD', quoteCurrency: 'AUD', fxRate: 1 },
      { reportingCurrency: 'USD', quoteCurrency: 'AUD', fxRate: 1.4364 },
      { reportingCurrency: 'USD', quoteCurrency: 'GBp', fxRate: 0.79 },
      { reportingCurrency: 'GBP', quoteCurrency: 'GBp', fxRate: 1 },
    ];
    for (const ctx of contexts) {
      const quoted = toQuoteDisplayUnits(42.5, ctx).value;
      expect(priceInReportingCurrency(quoted, ctx), JSON.stringify(ctx)).toBeCloseTo(42.5, 8);
    }
  });

  it('brings a pence price back to dollars for comparison against model output', () => {
    // Shell: 3323.5p at USDGBP 0.79 is about USD 42 a share.
    const back = priceInReportingCurrency(3323.5, {
      reportingCurrency: 'USD',
      quoteCurrency: 'GBp',
      fxRate: 0.79,
    });
    expect(back).toBeCloseTo(33.235 / 0.79, 6);
    expect(back).toBeGreaterThan(30);
    expect(back).toBeLessThan(50);
  });
});
