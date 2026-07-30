import type { WaccBreakdown } from './types';
import type { RiskFree } from './riskfree';

/** Below the floor a levered equity holder would demand less than a bondholder. */
export const BETA_FLOOR = 0.3;
export const BETA_CEILING = 2.5;
const DEFAULT_BETA = 1.0;
/** Spread over the risk-free rate used when interest expense is unavailable. */
const DEFAULT_DEBT_SPREAD = 0.02;
/**
 * Widest credit spread treated as a real corporate funding cost. Single-B paper
 * prices around 400-600bp over the risk-free and even CCC rarely holds above
 * 800bp outside distress, so 800bp is the outer edge of credible.
 *
 * Beyond it, the interest expense line and the debt line are measuring different
 * things rather than the company being distressed: CBA implied 20.4% and RBC
 * 9.4% over, because a bank's interest expense covers deposits while totalDebt
 * excludes them. A wider band (1500bp) let RBC's 14.0% through unchallenged.
 */
const MAX_DEBT_SPREAD = 0.08;

export type WaccArgs = {
  riskFree: RiskFree;
  equityRiskPremium: number;
  rawBeta: number | null;
  marketCap: number;
  totalDebt: number;
  interestExpense: number | null;
  /** Prior-year total debt, for the average denominator. */
  priorTotalDebt: number;
  taxRate: number;
};

function resolveBeta(rawBeta: number | null): { beta: number; clamped: boolean } {
  if (rawBeta === null || !Number.isFinite(rawBeta)) return { beta: DEFAULT_BETA, clamped: false };
  if (rawBeta < BETA_FLOOR) return { beta: BETA_FLOOR, clamped: true };
  if (rawBeta > BETA_CEILING) return { beta: BETA_CEILING, clamped: true };
  return { beta: rawBeta, clamped: false };
}

function resolveCostOfDebt(args: WaccArgs): { rate: number; source: string } {
  const averageDebt = (args.totalDebt + args.priorTotalDebt) / 2;
  if (args.interestExpense === null || averageDebt <= 0) {
    return {
      rate: args.riskFree.rate + DEFAULT_DEBT_SPREAD,
      source: `Assumed: risk-free + ${(DEFAULT_DEBT_SPREAD * 100).toFixed(0)}bp (interest expense not reported)`,
    };
  }
  const implied = args.interestExpense / averageDebt;
  if (implied < args.riskFree.rate) {
    return { rate: args.riskFree.rate, source: 'Floored at the risk-free rate (implied cost of debt was lower)' };
  }
  const ceiling = args.riskFree.rate + MAX_DEBT_SPREAD;
  if (implied > ceiling) {
    return {
      rate: args.riskFree.rate + DEFAULT_DEBT_SPREAD,
      source: `Implied cost of debt of ${(implied * 100).toFixed(1)}% is not a credible funding cost, so risk-free + ${(DEFAULT_DEBT_SPREAD * 100).toFixed(0)}bp is assumed instead. Interest expense and reported debt are measuring different things - common for banks, whose interest expense includes deposits that total debt excludes.`,
    };
  }
  return { rate: implied, source: 'Interest expense / average total debt' };
}

export function buildWacc(args: WaccArgs): WaccBreakdown {
  const { beta, clamped } = resolveBeta(args.rawBeta);
  const costOfEquity = args.riskFree.rate + beta * args.equityRiskPremium;
  const debt = resolveCostOfDebt(args);

  const totalCapital = args.marketCap + args.totalDebt;
  const equityWeight = totalCapital > 0 ? args.marketCap / totalCapital : 1;
  const debtWeight = 1 - equityWeight;

  return {
    riskFreeRate: args.riskFree.rate,
    riskFreeSource: args.riskFree.source,
    riskFreeAssumed: args.riskFree.assumed,
    equityRiskPremium: args.equityRiskPremium,
    rawBeta: args.rawBeta,
    beta,
    betaClamped: clamped,
    costOfEquity,
    costOfDebt: debt.rate,
    costOfDebtSource: debt.source,
    marketCap: args.marketCap,
    totalDebt: args.totalDebt,
    equityWeight,
    debtWeight,
    taxRate: args.taxRate,
    wacc: equityWeight * costOfEquity + debtWeight * debt.rate * (1 - args.taxRate),
  };
}
