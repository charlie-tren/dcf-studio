import { impliedExpectations, type ImpliedExpectations } from './backsolve';
import { runDcf } from './dcf';
import { majorCurrency, priceInReportingCurrency, toQuoteDisplayUnits } from './fx';
import { marketFor } from './markets';
import { normalise } from './normalise';
import { resolveRiskFree as liveResolveRiskFree, type RiskFree } from './riskfree';
import { buildScenario } from './scenarios';
import { sensitivityGrid, type SensitivityGrid } from './sensitivity';
import { buildWacc } from './wacc';
import {
  fetchFxRate as liveFetchFxRate,
  fetchTicker as liveFetchTicker,
  type RawTicker,
} from './yahoo';
import type {
  Assumptions,
  DataQualityFlag,
  DcfResult,
  Fundamentals,
  ScenarioName,
  WaccBreakdown,
} from './types';

export type ValuationRequest = {
  scenario: ScenarioName;
  horizonYears: 5 | 10;
  /** Any subset of the assumption set, applied over the scenario defaults. */
  overrides?: Partial<Assumptions>;
};

export type ValuationDeps = {
  fetchTicker: (ticker: string) => Promise<RawTicker>;
  fetchFxRate: (from: string, to: string) => Promise<number | null>;
  resolveRiskFree: (ticker: string) => Promise<RiskFree>;
};

const LIVE_DEPS: ValuationDeps = {
  fetchTicker: liveFetchTicker,
  fetchFxRate: liveFetchFxRate,
  resolveRiskFree: (ticker) => liveResolveRiskFree(ticker),
};

export type Valuation = {
  /**
   * Calendar labels for each forecast year, e.g. ['FY26', ..., 'FY30'].
   * Derived from the latest reported period end rather than the clock, so a
   * shared link always shows the same years the model was built on.
   */
  forecastYearLabels: string[];
  fundamentals: Fundamentals;
  assumptions: Assumptions;
  wacc: WaccBreakdown;
  dcf: DcfResult;
  sensitivity: SensitivityGrid;
  /** What each input would have to be for today's price to be right. */
  implied: ImpliedExpectations;
  /** Value per share in the units the market quotes in, comparable to price. */
  valuePerShareQuoted: number;
  fxRate: number;
  upside: number;
  scenario: ScenarioName;
  /** True when user overrides were applied over the preset. */
  modified: boolean;
  flags: DataQualityFlag[];
  notes: string[];
};

/** Order of magnitude between the model and the market, or null if the gap is
 *  merely a disagreement.
 *
 *  scripts/inspect-valuations.ts has carried the rule for months: a result more
 *  than ~10x off the price is a units or currency bug, not a valuation opinion.
 *  It only ever said so to me, in a terminal. This puts it on the page.
 *
 *  It changes NO number. A flagged valuation still renders in full - the point is
 *  that the page stops presenting "98% overvalued" with the same face it uses for
 *  "15% overvalued", when only one of those is a view the model can support.
 *
 *  Deliberately symmetric and deliberately wide. 10x either way is far outside
 *  any defensible discount-rate or growth disagreement, so anything it catches is
 *  a modelling failure by construction.
 */
export function implausibleResult(
  valuePerShare: number,
  price: number
): DataQualityFlag | null {
  // A missing or non-positive price is already its own flag; dividing by it would
  // manufacture a second, louder one out of a gap already reported.
  if (!Number.isFinite(price) || price <= 0) return null;
  // Negative equity value has its own causes and its own flags. A ratio test would
  // report it as a units bug, which it is not.
  if (!Number.isFinite(valuePerShare) || valuePerShare < 0) return null;
  const ratio = valuePerShare / price;
  if (ratio < 10 && ratio > 0.1) return null;
  const how = ratio >= 10
    ? `${ratio.toFixed(1)}x the market price`
    : `${(ratio * 100).toFixed(1)}% of the market price`;
  return {
    code: 'IMPLAUSIBLE_RESULT',
    severity: 'error',
    message:
      `This model values the shares at ${how}. A gap that size is a modelling `
      + `failure rather than a view - most often an unusable beta, a currency or `
      + `units mismatch, or a cashflow base that does not represent the business. `
      + `Read the figures below as diagnostics, not as a call.`,
  };
}

export async function buildValuation(
  ticker: string,
  request: ValuationRequest,
  deps: ValuationDeps = LIVE_DEPS
): Promise<Valuation> {
  const raw = await deps.fetchTicker(ticker);
  const fundamentals = normalise(ticker, raw);

  if (fundamentals.years.length === 0) {
    throw new Error(`No annual financial statements available for ${ticker}.`);
  }

  const market = marketFor(ticker);
  const riskFree = await deps.resolveRiskFree(ticker);
  const latest = fundamentals.years[0];
  const prior = fundamentals.years[1] ?? latest;

  // The scenario needs a tax rate and the WACC needs that tax rate, so build the
  // scenario once with a placeholder discount rate purely to obtain the tax
  // rate, then rebuild with the real WACC. Cheap, and it keeps both modules
  // ignorant of each other.
  const provisional = buildScenario(fundamentals, request.scenario, request.horizonYears, riskFree.rate);

  const wacc = buildWacc({
    riskFree,
    equityRiskPremium: market.equityRiskPremium,
    rawBeta: fundamentals.rawBeta,
    marketCap: fundamentals.marketCap,
    totalDebt: latest.totalDebt.value,
    interestExpense: latest.interestExpense?.value ?? null,
    priorTotalDebt: prior.totalDebt.value,
    taxRate: provisional.assumptions.taxRate,
  });

  const scenario = buildScenario(fundamentals, request.scenario, request.horizonYears, wacc.wacc);
  const overrides = request.overrides ?? {};
  const assumptions: Assumptions = { ...scenario.assumptions, ...overrides };

  const inputs = {
    baseRevenue: latest.revenue.value,
    netDebt: latest.totalDebt.value - latest.cash.value,
    dilutedShares: latest.shares.value,
  };

  const dcf = runDcf(inputs, assumptions);
  const sensitivity = sensitivityGrid(inputs, assumptions, {
    waccSteps: 2,
    waccStep: 0.01,
    growthSteps: 2,
    growthStep: 0.005,
  });

  // One conversion, at the very end. Everything above is in reporting currency.
  const quoteMajor = majorCurrency(fundamentals.quoteCurrency);
  const fxRate =
    quoteMajor === fundamentals.reportingCurrency
      ? 1
      : (await deps.fetchFxRate(fundamentals.reportingCurrency, quoteMajor)) ?? 1;

  const fxContext = {
    reportingCurrency: fundamentals.reportingCurrency,
    quoteCurrency: fundamentals.quoteCurrency,
    fxRate,
  };
  const { value: valuePerShareQuoted } = toQuoteDisplayUnits(dcf.gordon.valuePerShare, fxContext);

  // Backsolve against the price in REPORTING currency, because that is the space
  // the engine works in. Comparing a quoted pence price to a dollar model would
  // solve for nonsense.
  const implied = impliedExpectations(
    inputs,
    assumptions,
    priceInReportingCurrency(fundamentals.price, fxContext)
  );

  const flags: DataQualityFlag[] = [...fundamentals.flags, ...scenario.flags];
  if (wacc.betaClamped) {
    flags.push({
      code: 'BETA_CLAMPED',
      severity: 'warn',
      message: `Beta of ${wacc.rawBeta?.toFixed(3)} is not usable in a cost of equity. Clamped to ${wacc.beta.toFixed(2)}.`,
    });
  }
  if (wacc.riskFreeAssumed) {
    flags.push({
      code: 'RISK_FREE_ASSUMED',
      severity: 'info',
      message: `Risk-free rate is an assumption: ${wacc.riskFreeSource}.`,
    });
  }
  if (dcf.forecast.some((y) => y.fcff < 0)) {
    flags.push({
      code: 'NEGATIVE_FCFF',
      severity: 'warn',
      message:
        'Free cashflow is negative in at least one forecast year, so terminal value carries most of the valuation.',
    });
  }
  // The engine raises its own warnings (terminal capex normalisation, negative
  // cashflow). Surface them as flags so they actually reach the page - they were
  // being computed and then silently dropped.
  for (const warning of dcf.warnings) {
    if (/steady state/i.test(warning)) {
      flags.push({ code: 'CAPEX_BELOW_DA', severity: 'warn', message: warning });
    }
  }
  const implausible = implausibleResult(
    valuePerShareQuoted,
    fundamentals.price
  );
  if (implausible) flags.push(implausible);
  if (dcf.gordon.terminal.blocked) {
    flags.push({
      code: 'TERMINAL_GROWTH_BLOCKED',
      severity: 'error',
      message: dcf.gordon.terminal.blocked,
    });
  }

  // Label forecast years off the last reported fiscal year end. A June
  // year-end (BHP, ARB) is labelled by the year it ends in, matching how the
  // company reports it.
  const baseFiscalYear = Number(latest.periodEnd.slice(0, 4));
  const forecastYearLabels = Array.from(
    { length: assumptions.horizonYears },
    (_, i) => `FY${String((baseFiscalYear + i + 1) % 100).padStart(2, '0')}`
  );

  return {
    forecastYearLabels,
    fundamentals,
    assumptions,
    wacc,
    dcf,
    sensitivity,
    implied,
    valuePerShareQuoted,
    fxRate,
    upside: fundamentals.price > 0 ? valuePerShareQuoted / fundamentals.price - 1 : 0,
    scenario: request.scenario,
    modified: Object.keys(overrides).length > 0,
    flags,
    notes: scenario.notes,
  };
}
