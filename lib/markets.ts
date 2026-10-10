export type RiskFreeSource = 'yahoo-tnx' | 'rba' | 'default';

export type Market = {
  suffix: string;
  name: string;
  currency: string;
  /** 1 = risk-free rate is sourced live. 2 = risk-free rate is an assumption. */
  tier: 1 | 2;
  riskFreeSource: RiskFreeSource;
  /** Used only when riskFreeSource is 'default'. Documented assumption, editable in the UI. */
  defaultRiskFreeRate: number;
  equityRiskPremium: number;
  statutoryTaxRate: number;
};

/**
 * Currencies quoted in a sub-unit: the divisor that takes a quoted price to the
 * major unit, and the major currency code itself. Shell quotes GBp (pence)
 * while reporting USD - the 100x trap.
 *
 * The major code has to be written down rather than derived. It used to be
 * computed as `code.toUpperCase()`, which is right for GBp -> GBP and wrong for
 * both of the others: ZAc's major unit is the rand, not "ZAC", and ILA's is the
 * shekel. Yahoo happens to serve a USDZAC=X pair quoting the rate in cents, so
 * the FX rate came back already sub-unit-adjusted and was then multiplied by
 * 100 again - Naspers valued at 2,407,080c against a price of 76,546c, a 3,045%
 * upside. USDILA=X does not resolve at all, so Teva silently fell back to a rate
 * of 1. Two of the three sub-unit markets were wrong.
 */
export const QUOTE_SUBUNIT: Record<string, { divisor: number; major: string }> = {
  GBp: { divisor: 100, major: 'GBP' },
  ZAc: { divisor: 100, major: 'ZAR' },
  ILA: { divisor: 100, major: 'ILS' },
};

/** Divide a quoted price by this to reach the major unit. */
export const QUOTE_SUBUNIT_DIVISOR: Record<string, number> = Object.fromEntries(
  Object.entries(QUOTE_SUBUNIT).map(([code, { divisor }]) => [code, divisor])
);

/**
 * Equity risk premiums are Damodaran's "Country Default Spreads and Risk Premiums",
 * January 2026: the mature-market premium implied by the S&P 500 at 1 January
 * (4.23%) plus each country's risk premium. The same release as the cost-of-debt
 * spreads in lib/wacc.ts.
 *
 * They were hand-set at 5.5-8% with no source, which with a 4%+ risk-free rate
 * put Apple's cost of capital at 10.9% where the price implies 4.6%. -120bp across
 * the board took the 44-name median value/price from 0.59x to 0.69x. Using the
 * premium the index itself implies means a low reading says a company is dear
 * against what the market requires of equities generally, not that equities are
 * dear: that second view is a market call, and this is a single-stock tool.
 */
const US: Market = {
  suffix: '',
  name: 'United States',
  currency: 'USD',
  tier: 1,
  riskFreeSource: 'yahoo-tnx',
  defaultRiskFreeRate: 0.042,
  equityRiskPremium: 0.0423,
  statutoryTaxRate: 0.21,
};

const MARKETS: Market[] = [
  US,
  { suffix: 'AX', name: 'ASX', currency: 'AUD', tier: 1, riskFreeSource: 'rba', defaultRiskFreeRate: 0.042, equityRiskPremium: 0.0423, statutoryTaxRate: 0.30 },
  { suffix: 'NZ', name: 'NZX', currency: 'NZD', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.045, equityRiskPremium: 0.0423, statutoryTaxRate: 0.28 },
  { suffix: 'L', name: 'London', currency: 'GBP', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.045, equityRiskPremium: 0.0501, statutoryTaxRate: 0.25 },
  { suffix: 'DE', name: 'Xetra', currency: 'EUR', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.026, equityRiskPremium: 0.0423, statutoryTaxRate: 0.30 },
  { suffix: 'PA', name: 'Euronext Paris', currency: 'EUR', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.032, equityRiskPremium: 0.0501, statutoryTaxRate: 0.258 },
  { suffix: 'SW', name: 'SIX Swiss', currency: 'CHF', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.005, equityRiskPremium: 0.0423, statutoryTaxRate: 0.15 },
  { suffix: 'HK', name: 'HKEX', currency: 'HKD', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.032, equityRiskPremium: 0.0501, statutoryTaxRate: 0.165 },
  { suffix: 'T', name: 'Tokyo', currency: 'JPY', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.017, equityRiskPremium: 0.0514, statutoryTaxRate: 0.305 },
  { suffix: 'TO', name: 'Toronto', currency: 'CAD', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.033, equityRiskPremium: 0.0423, statutoryTaxRate: 0.265 },
  { suffix: 'NS', name: 'India NSE', currency: 'INR', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.068, equityRiskPremium: 0.0708, statutoryTaxRate: 0.252 },
  { suffix: 'KS', name: 'Korea', currency: 'KRW', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.030, equityRiskPremium: 0.0487, statutoryTaxRate: 0.242 },
];

const UNKNOWN: Market = {
  suffix: '?',
  name: 'Unknown market',
  currency: 'USD',
  tier: 2,
  riskFreeSource: 'default',
  defaultRiskFreeRate: 0.042,
  equityRiskPremium: 0.065,
  statutoryTaxRate: 0.25,
};

/** Exchange preference for ranking name-search results. Earlier is better. */
export const EXCHANGE_RANK = ['ASX', 'NMS', 'NYQ', 'NGM', 'NCM', 'PCX', 'LSE', 'GER', 'PAR', 'EBS', 'HKG', 'JPX', 'TOR', 'NSI', 'KSC', 'NZE'];

export function marketFor(ticker: string): Market {
  const dot = ticker.lastIndexOf('.');
  if (dot === -1) return US;
  const suffix = ticker.slice(dot + 1).toUpperCase();
  return MARKETS.find((m) => m.suffix === suffix) ?? UNKNOWN;
}

export function allMarkets(): Market[] {
  return MARKETS;
}
