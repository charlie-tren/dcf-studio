import { majorCurrency } from './fx';
import type { DataQualityFlag, FiscalYear, Fundamentals, Sourced } from './types';
import type { RawStatementRow, RawTicker } from './yahoo';

function sourced(value: number, sourceField: string): Sourced<number> {
  return { value, provenance: { sourceField, derived: false } };
}

function derivedValue(value: number, derivation: string): Sourced<number> {
  return { value, provenance: { sourceField: 'derived', derivation, derived: true } };
}

function num(row: RawStatementRow, field: string): number | null {
  const v = row[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** First field in the chain with a usable number. */
function firstOf(row: RawStatementRow, fields: string[]): Sourced<number> | null {
  for (const field of fields) {
    const v = num(row, field);
    if (v !== null) return sourced(v, field);
  }
  return null;
}

const EBIT_CHAIN = ['ebit', 'operatingIncome'];
const DA_CHAIN = [
  'depreciationAndAmortization',
  'reconciledDepreciation',
  'depreciationAndAmortizationInIncomeStatement',
];
/** The depreciation half on its own, where the accounts report it directly. */
const DEPRECIATION_CHAIN = ['depreciation'];
/** The amortisation half, so the depreciation half can be derived by difference. */
const INTANGIBLE_AMORTISATION_CHAIN = ['amortizationOfIntangibles', 'amortizationCashFlow'];
/**
 * Broadest measure FIRST. Net debt should net off everything the company could
 * realistically use to repay debt, which includes marketable securities.
 *
 * Taking cashAndCashEquivalents first understated Alphabet's cash by USD 96.1bn
 * - it holds 30.7bn of cash against 96.1bn of short-term investments - and
 * therefore overstated net debt by the same, costing roughly USD 8 a share.
 * The same applies to any cash-rich balance sheet.
 */
const CASH_CHAIN = [
  'cashCashEquivalentsAndShortTermInvestments',
  'cashAndCashEquivalents',
];
const SHARES_CHAIN = ['dilutedAverageShares', 'ordinarySharesNumber', 'shareIssued'];

const FINANCIAL_SECTORS = ['Financial Services', 'Financial'];

function nested(obj: Record<string, unknown> | undefined, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v !== null && typeof v === 'object' && 'raw' in (v as Record<string, unknown>)) {
    return asNumber((v as { raw: unknown }).raw);
  }
  return null;
}

/**
 * Working capital sign convention, applied here and nowhere else:
 * positive = an increase in net working capital = a cash outflow.
 *
 * Yahoo's changeInWorkingCapital is a cashflow *contribution* with the opposite
 * sign, so it is negated. The balance-sheet fallback already computes the
 * accounting change and needs no flip. Getting this wrong is a 2x error that
 * still looks entirely plausible.
 */
function changeInNwc(
  row: RawStatementRow,
  previous: RawStatementRow | undefined
): Sourced<number> | null {
  const cashflowField = num(row, 'changeInWorkingCapital');
  if (cashflowField !== null) {
    return {
      value: -cashflowField,
      provenance: { sourceField: 'changeInWorkingCapital', derived: false },
    };
  }
  if (!previous) return null;

  const parts = [
    { field: 'accountsReceivable', sign: 1 },
    { field: 'inventory', sign: 1 },
    { field: 'accountsPayable', sign: -1 },
  ];
  let total = 0;
  let found = 0;
  for (const { field, sign } of parts) {
    const now = num(row, field);
    const before = num(previous, field);
    if (now !== null && before !== null) {
      total += sign * (now - before);
      found++;
    }
  }
  if (found === 0) return null;
  return derivedValue(
    total,
    'Balance-sheet movement: change in receivables + inventory - payables'
  );
}

/**
 * Capital the business actually has at work, for ROIC. Prefers the reported
 * line; otherwise equity + debt - cash, which is the standard construction.
 */
function investedCapital(row: RawStatementRow): Sourced<number> | null {
  const reported = firstOf(row, ['investedCapital']);
  if (reported && reported.value > 0) return reported;

  const equity = num(row, 'stockholdersEquity') ?? num(row, 'totalEquityGrossMinorityInterest');
  const debt = num(row, 'totalDebt');
  const cash =
    num(row, 'cashCashEquivalentsAndShortTermInvestments') ?? num(row, 'cashAndCashEquivalents');
  if (equity === null) return null;
  const value = equity + (debt ?? 0) - (cash ?? 0);
  return value > 0
    ? derivedValue(value, 'Shareholders equity + total debt - cash')
    : null;
}

/**
 * The depreciation half of D&A, separated from amortisation of acquired
 * intangibles.
 *
 * These two are added together on the cashflow statement and behave nothing
 * alike. Depreciation is a charge against assets that wear out and have to be
 * replaced, so it is a fair first proxy for maintenance capital. Amortisation of
 * an acquired intangible is purchase accounting unwinding a cheque already
 * written; the company does not have to buy the customer list again.
 *
 * Conflating them is what put AMD at $8 a share. Three quarters of its D&A is
 * Xilinx intangible amortisation, and the capex floor in lib/scenarios.ts read
 * the combined figure, decided AMD was underinvesting, and substituted 5,298m of
 * capex a year against the 974m it actually spends.
 *
 * Two sources, in order of how much they are trusted, and NEITHER is a guess:
 *   1. A reported `depreciation` line. Present for most large issuers, and for a
 *      company with no acquired intangibles it simply equals D&A - so the split
 *      is a no-op exactly where it should be (Microsoft, Shell, Tesla).
 *   2. D&A less a reported intangible-amortisation line, where only that half is
 *      given.
 * Where neither exists this returns null rather than inventing a number, and the
 * caller falls back to the old behaviour and says that it did. Mesoblast and
 * Seagate report the combined figure and nothing else.
 */
function depreciationOnly(
  row: RawStatementRow,
  dAndA: Sourced<number>
): Sourced<number> | null {
  const reported = firstOf(row, DEPRECIATION_CHAIN);
  if (reported) return reported;
  const amortisation = firstOf(row, INTANGIBLE_AMORTISATION_CHAIN);
  if (!amortisation) return null;
  const difference = dAndA.value - amortisation.value;
  // A negative difference means the two lines are not the pair they look like -
  // different scopes, or one is a duplicate of the other. Better no figure than
  // a negative depreciation charge feeding a capex floor.
  if (difference < 0) return null;
  return derivedValue(
    difference,
    `${dAndA.provenance.sourceField} less ${amortisation.provenance.sourceField}`
  );
}

function buildYear(
  row: RawStatementRow,
  previous: RawStatementRow | undefined,
  isFinancial: boolean
): FiscalYear | null {
  const revenue = firstOf(row, ['totalRevenue']);
  if (!revenue || revenue.value <= 0) return null;

  const pretaxIncome = firstOf(row, ['pretaxIncome']) ?? sourced(0, 'pretaxIncome');
  const interestExpense = firstOf(row, ['interestExpense']);

  let ebit = firstOf(row, EBIT_CHAIN);
  if (!ebit && isFinancial) {
    // For a bank, interest expense is a core operating cost and Yahoo's
    // "revenue" is already net of it, so adding it back double-counts: CBA
    // came out at 194% of revenue and RBC at 145%. Pretax income is the only
    // defensible proxy here - still the wrong model for a financial, which is
    // what the FINANCIAL_SECTOR flag says.
    ebit = derivedValue(
      pretaxIncome.value,
      'Pretax income used as a proxy. Financials report no operating income, and interest expense is not added back because reported revenue is already net of it.'
    );
  }
  if (!ebit && interestExpense) {
    ebit = derivedValue(
      pretaxIncome.value + interestExpense.value,
      'Pretax income + interest expense (no operating income reported)'
    );
  }
  if (!ebit) {
    ebit = derivedValue(
      pretaxIncome.value,
      'Pretax income used as a proxy (no operating income or interest expense reported)'
    );
  }

  const dAndA = firstOf(row, DA_CHAIN) ?? derivedValue(0, 'No depreciation or amortisation reported');
  const depreciation = depreciationOnly(row, dAndA);
  const rawCapex = firstOf(row, ['capitalExpenditure']);
  const capex = rawCapex
    ? { value: -rawCapex.value, provenance: rawCapex.provenance }
    : derivedValue(0, 'No capital expenditure reported');

  const nwc =
    changeInNwc(row, previous) ??
    derivedValue(0, 'Insufficient data to compute the working-capital movement');

  return {
    periodEnd: String(row.date).slice(0, 10),
    revenue,
    ebit,
    taxProvision: firstOf(row, ['taxProvision']) ?? sourced(0, 'taxProvision'),
    pretaxIncome,
    dAndA,
    depreciation,
    capex,
    changeInNwc: nwc,
    totalDebt: firstOf(row, ['totalDebt']) ?? derivedValue(0, 'No total debt reported'),
    cash: firstOf(row, CASH_CHAIN) ?? derivedValue(0, 'No cash balance reported'),
    shares: firstOf(row, SHARES_CHAIN) ?? derivedValue(0, 'No share count reported'),
    interestExpense,
    investedCapital: investedCapital(row),
  };
}

/** The major currency behind a possibly-sub-unit quote code. One table, one answer. */
function majorOf(quoteCurrency: string): string {
  return majorCurrency(quoteCurrency);
}

export function normalise(ticker: string, raw: RawTicker): Fundamentals {
  const flags: DataQualityFlag[] = [];

  const sector = (nested(raw.quote.summaryProfile, ['sector']) as string) ?? null;
  const isFinancial = sector !== null && FINANCIAL_SECTORS.includes(sector);

  // lib/yahoo.ts already normalises period ends to ISO and sorts newest first,
  // but sort again so a hand-built or re-ordered fixture cannot mislead us.
  const rows = [...raw.statements].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  const years: FiscalYear[] = [];
  for (let i = 0; i < rows.length; i++) {
    const year = buildYear(rows[i], rows[i + 1], isFinancial);
    if (year) years.push(year);
  }

  if (years.some((y) => y.changeInNwc.provenance.derived || y.dAndA.provenance.derived)) {
    flags.push({
      code: 'MISSING_FIELD_DERIVED',
      severity: 'warn',
      message:
        'Some line items were not reported and have been derived. Each one is labelled in the workings below.',
    });
  }
  if (years.length < 4) {
    flags.push({
      code: 'SHORT_HISTORY',
      severity: 'warn',
      message: `Only ${years.length} year(s) of history available to anchor assumptions on.`,
    });
  }

  const reportingCurrency =
    (nested(raw.quote.financialData, ['financialCurrency']) as string) ??
    (nested(raw.quote.price, ['currency']) as string) ??
    'USD';
  const quoteCurrency = (nested(raw.quote.price, ['currency']) as string) ?? reportingCurrency;

  if (isFinancial) {
    flags.push({
      code: 'FINANCIAL_SECTOR',
      severity: 'error',
      message:
        'This is a financial. Banks and insurers report no meaningful operating income, and capex and working capital do not mean what a free-cashflow model assumes, so a DCF will misprice it. The model below runs on best-effort numbers - treat it as an illustration, not a valuation.',
    });
  }
  if (majorOf(quoteCurrency) !== reportingCurrency) {
    flags.push({
      code: 'CURRENCY_MISMATCH',
      severity: 'warn',
      message: `Reports in ${reportingCurrency}, trades in ${quoteCurrency}. Modelled in ${reportingCurrency}, converted at the end.`,
    });
  }

  // A hybrid, preference line or note carries NO market capitalisation, while a
  // listed ordinary share always does. Yahoo types both as EQUITY, so quoteType
  // cannot separate them - CBAPJ.AX (a CBA hybrid note) was being handed CBA's
  // entire A$28.7bn of group revenue and divided by the hybrid's own share
  // count, producing A$79.12 for a A$100 face-value fixed-income instrument.
  // A DCF on a hybrid is category error: its value is the coupon and call
  // schedule, not a claim on group free cashflow.
  const marketCap = asNumber(nested(raw.quote.price, ['marketCap'])) ?? 0;
  if (marketCap <= 0) {
    flags.push({
      code: 'NOT_ORDINARY_EQUITY',
      severity: 'error',
      message:
        'This line has no market capitalisation, which means it is not ordinary shares - typically a hybrid, preference line, note or unlisted stub. A discounted cashflow values a claim on the whole business, so applying it here attributes all of the group’s revenue to a security that has no such claim. Its value is its coupon and call schedule. Look up the ordinary line instead.',
    });
  }

  const trend = (nested(raw.quote.earningsTrend, ['trend']) as Record<string, unknown>[]) ?? [];
  const analystRevenue = trend
    .filter((t) => ['0y', '+1y'].includes(String(t.period)))
    .map((t) => ({
      period: String(t.period),
      revenue: asNumber(nested(t, ['revenueEstimate', 'avg'])) ?? 0,
      analysts: asNumber(nested(t, ['revenueEstimate', 'numberOfAnalysts'])) ?? 0,
    }))
    .filter((t) => t.revenue > 0);

  if (analystRevenue.length === 0) {
    flags.push({
      code: 'NO_ANALYST_COVERAGE',
      severity: 'info',
      message: 'No analyst revenue estimates available, so the consensus scenario is unavailable.',
    });
  } else {
    const thinnest = Math.min(...analystRevenue.map((a) => a.analysts));
    if (thinnest < 3) {
      flags.push({
        code: 'THIN_ANALYST_COVERAGE',
        severity: 'warn',
        message: `Consensus rests on as few as ${thinnest} analyst estimate(s).`,
      });
    }
  }

  return {
    ticker,
    name:
      (nested(raw.quote.price, ['longName']) as string) ??
      (nested(raw.quote.price, ['shortName']) as string) ??
      ticker,
    exchange: (nested(raw.quote.price, ['exchange']) as string) ?? '',
    sector,
    industry: (nested(raw.quote.summaryProfile, ['industry']) as string) ?? null,
    reportingCurrency,
    quoteCurrency,
    years,
    price: asNumber(nested(raw.quote.price, ['regularMarketPrice'])) ?? 0,
    marketCap,
    rawBeta: asNumber(nested(raw.quote.defaultKeyStatistics, ['beta'])),
    analystRevenue,
    flags,
  };
}
