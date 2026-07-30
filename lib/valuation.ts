import { runDcf } from './dcf';
import { majorCurrency, toQuoteDisplayUnits } from './fx';
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
  fundamentals: Fundamentals;
  assumptions: Assumptions;
  wacc: WaccBreakdown;
  dcf: DcfResult;
  sensitivity: SensitivityGrid;
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

  const { value: valuePerShareQuoted } = toQuoteDisplayUnits(dcf.gordon.valuePerShare, {
    reportingCurrency: fundamentals.reportingCurrency,
    quoteCurrency: fundamentals.quoteCurrency,
    fxRate,
  });

  const flags: DataQualityFlag[] = [...fundamentals.flags, ...scenario.flags];
  if (wacc.betaClamped) {
    flags.push({
      code: 'BETA_CLAMPED',
      severity: 'warn',
      message: `Reported beta of ${wacc.rawBeta?.toFixed(3)} is outside a defensible range and has been clamped to ${wacc.beta.toFixed(2)}.`,
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
  if (dcf.gordon.terminal.blocked) {
    flags.push({
      code: 'TERMINAL_GROWTH_BLOCKED',
      severity: 'error',
      message: dcf.gordon.terminal.blocked,
    });
  }

  return {
    fundamentals,
    assumptions,
    wacc,
    dcf,
    sensitivity,
    valuePerShareQuoted,
    fxRate,
    upside: fundamentals.price > 0 ? valuePerShareQuoted / fundamentals.price - 1 : 0,
    scenario: request.scenario,
    modified: Object.keys(overrides).length > 0,
    flags,
    notes: scenario.notes,
  };
}
