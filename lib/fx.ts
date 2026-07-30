import { QUOTE_SUBUNIT_DIVISOR } from './markets';

export type FxContext = {
  reportingCurrency: string;
  /** May be a sub-unit code such as GBp. */
  quoteCurrency: string;
  /** Units of the quote's major currency per unit of reporting currency. */
  fxRate: number;
};

/** The major currency behind a possibly-sub-unit quote code. GBp -> GBP. */
export function majorCurrency(quoteCurrency: string): string {
  return quoteCurrency in QUOTE_SUBUNIT_DIVISOR ? quoteCurrency.toUpperCase() : quoteCurrency;
}

/**
 * Converts a per-share value from reporting currency into the units the market
 * actually quotes in, so it is directly comparable to the live price.
 * This is the only place currency arithmetic happens.
 *
 * Two independent adjustments, and both are needed: the FX conversion (skipped
 * when the currencies already match) and the sub-unit multiply (applied
 * whenever the quote code is a sub-unit, conversion or not). Shell reports USD
 * and quotes pence, which needs both.
 */
export function toQuoteDisplayUnits(
  valueInReportingCurrency: number,
  ctx: FxContext
): { value: number; converted: boolean } {
  const divisor = QUOTE_SUBUNIT_DIVISOR[ctx.quoteCurrency];
  const sameCurrency = majorCurrency(ctx.quoteCurrency) === ctx.reportingCurrency;
  const rate = sameCurrency ? 1 : ctx.fxRate;
  const inMajorUnits = valueInReportingCurrency * rate;
  return {
    value: divisor ? inMajorUnits * divisor : inMajorUnits,
    converted: !sameCurrency,
  };
}

/** A quoted price expressed in major units, for like-for-like comparison. */
export function priceInMajorUnits(price: number, quoteCurrency: string): number {
  const divisor = QUOTE_SUBUNIT_DIVISOR[quoteCurrency];
  return divisor ? price / divisor : price;
}
