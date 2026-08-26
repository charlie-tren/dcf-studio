import { QUOTE_SUBUNIT, QUOTE_SUBUNIT_DIVISOR } from './markets';

export type FxContext = {
  reportingCurrency: string;
  /** May be a sub-unit code such as GBp. */
  quoteCurrency: string;
  /** Units of the quote's major currency per unit of reporting currency. */
  fxRate: number;
};

/**
 * The major currency behind a possibly-sub-unit quote code: GBp -> GBP,
 * ZAc -> ZAR, ILA -> ILS. Read from the table rather than upper-cased, which
 * only ever worked for sterling.
 */
export function majorCurrency(quoteCurrency: string): string {
  return QUOTE_SUBUNIT[quoteCurrency]?.major ?? quoteCurrency;
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
  const sameCurrency = majorCurrency(ctx.quoteCurrency) === ctx.reportingCurrency;
  return {
    value: valueInReportingCurrency * quoteConversionFactor(ctx),
    converted: !sameCurrency,
  };
}

/**
 * The single multiplier that takes a reporting-currency figure into quoted
 * units: the FX rate where the currencies differ, times the sub-unit factor
 * where the market quotes in pence or cents.
 *
 * Exported because the Excel export has to put this on the sheet as one cell,
 * and it used to write the bare FX rate. Shell reports USD and quotes pence, so
 * the workbook valued it at 38.16 against a price of 3,345.75p - a 99% downside
 * on a name the site had at +14%. One definition, two readers.
 */
export function quoteConversionFactor(ctx: FxContext): number {
  const divisor = QUOTE_SUBUNIT_DIVISOR[ctx.quoteCurrency];
  const sameCurrency = majorCurrency(ctx.quoteCurrency) === ctx.reportingCurrency;
  const rate = sameCurrency ? 1 : ctx.fxRate;
  return divisor ? rate * divisor : rate;
}

/** A quoted price expressed in major units, for like-for-like comparison. */
export function priceInMajorUnits(price: number, quoteCurrency: string): number {
  const divisor = QUOTE_SUBUNIT_DIVISOR[quoteCurrency];
  return divisor ? price / divisor : price;
}

/**
 * The exact inverse of toQuoteDisplayUnits: takes a quoted market price back
 * into reporting currency. Needed wherever a quoted price is compared against
 * figures the model produced in reporting currency - the sensitivity grid, for
 * instance, whose cells are per-share values in reporting terms.
 */
export function priceInReportingCurrency(quotedPrice: number, ctx: FxContext): number {
  const inMajorUnits = priceInMajorUnits(quotedPrice, ctx.quoteCurrency);
  const sameCurrency = majorCurrency(ctx.quoteCurrency) === ctx.reportingCurrency;
  if (sameCurrency || ctx.fxRate === 0) return inMajorUnits;
  return inMajorUnits / ctx.fxRate;
}
