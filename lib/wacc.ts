import type { WaccBreakdown } from './types';
import type { RiskFree } from './riskfree';

/** Below the floor a levered equity holder would demand less than a bondholder. */
export const BETA_FLOOR = 0.3;
export const BETA_CEILING = 2.5;
const DEFAULT_BETA = 1.0;
/**
 * Blume adjustment: 0.67 x reported + 0.33 x the market's 1.0.
 *
 * A reported beta is a noisy point estimate of a quantity that mean-reverts, and
 * until 09/09/2026 this file fed the raw number straight into the cost of equity
 * with nothing but a clamp at 2.5 to stop it. AMD's 2.476 passed through
 * untouched: cost of equity 4.6% + 2.476 x 5.5% = 18.4%, and an 18.4% discount
 * rate destroys any DCF regardless of the business underneath it.
 *
 * Measured across 25 names before changing anything - median implied value over
 * market price was 0.63 where beta was under 1.2 and 0.06 where it was 1.2 or
 * more. Tesla 0.06, Seagate 0.05, Western Digital 0.07, AMD 0.02. The split is
 * the beta, not the companies.
 *
 * Blume is the standard remedy and has been Bloomberg's default for decades. It
 * is deliberately symmetric: a 0.35 beta is exactly as noisy an estimate as a
 * 2.5 and gets pulled UP, so this is not a thumb on the scale for expensive
 * shares. The clamp stays as a backstop for what survives the adjustment.
 */
export const BETA_BLUME_WEIGHT = 0.67;
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

/**
 * Interest coverage (EBIT / interest expense) to a default spread, for large
 * non-financial firms. Damodaran, "Ratings, Interest Coverage Ratios and Default
 * Spread", January 2026. Each row is [coverage above which it applies, rating,
 * spread], best first.
 *
 * Why: the floor used to be the risk-free rate itself, which prices every
 * company's debt as if it were the government's whenever its book interest runs
 * cheap - legacy fixed-rate paper issued in 2020-21, say. That is right for
 * nobody but a sovereign. A synthetic rating floors it at what a lender would
 * charge a company with that coverage today. Raised by the 03/10/2026 review.
 */
export const COVERAGE_SPREADS: readonly (readonly [number, string, number])[] = [
  [8.5, 'AAA', 0.004],
  [6.5, 'AA', 0.0055],
  [5.5, 'A+', 0.007],
  [4.25, 'A', 0.0078],
  [3, 'A-', 0.0089],
  [2.5, 'BBB', 0.0111],
  [2.25, 'BB+', 0.0138],
  [2, 'BB', 0.0184],
  [1.75, 'B+', 0.0275],
  [1.5, 'B', 0.0321],
  [1.25, 'B-', 0.0509],
  [0.8, 'CCC', 0.0885],
  [0.65, 'CC', 0.1261],
  [0.2, 'C', 0.16],
  [-Infinity, 'D', 0.19],
];

/**
 * The rating and spread an interest coverage implies, capped at DEFAULT_DEBT_SPREAD.
 *
 * Why the cap is the 200bp the model assumes when it cannot tell, and not the
 * 800bp ceiling on a real book rate: one year's cover is a noisy read of credit
 * quality. Capped at 800bp, across Crosscheck's 610 on 06/10/2026, every company
 * with a bad year hit it - Intel, Boeing and Baxter all went to 13% debt while
 * rated investment grade, and Baxter's ratio fell 68%. The floor exists to stop
 * the risk-free rate being charged to companies; charging them more than the
 * fallback on a single ratio is a different claim the data cannot carry. A
 * company actually paying more than this keeps its own rate, up to the ceiling.
 */
export function syntheticSpread(coverage: number): { rating: string; spread: number; capped: boolean } {
  const row = COVERAGE_SPREADS.find(([above]) => coverage > above) ?? COVERAGE_SPREADS[COVERAGE_SPREADS.length - 1];
  const spread = Math.min(row[2], DEFAULT_DEBT_SPREAD);
  return { rating: row[1], spread, capped: spread < row[2] };
}

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
  /** Latest operating income, for the coverage ratio. Null leaves the floor at the risk-free rate. */
  ebit?: number | null;
};

function resolveBeta(
  rawBeta: number | null
): { beta: number; clamped: boolean; adjusted: boolean } {
  // A missing beta already defaults to the market, so there is nothing to pull
  // toward it - adjusting 1.0 toward 1.0 would only report an adjustment that
  // did not happen.
  if (rawBeta === null || !Number.isFinite(rawBeta)) {
    return { beta: DEFAULT_BETA, clamped: false, adjusted: false };
  }
  const blumed = BETA_BLUME_WEIGHT * rawBeta + (1 - BETA_BLUME_WEIGHT) * DEFAULT_BETA;
  // Clamp AFTER adjusting: Blume alone leaves a reported 5.0 at 3.68, which is
  // still not a discount rate anybody would defend.
  if (blumed < BETA_FLOOR) return { beta: BETA_FLOOR, clamped: true, adjusted: true };
  if (blumed > BETA_CEILING) return { beta: BETA_CEILING, clamped: true, adjusted: true };
  return { beta: blumed, clamped: false, adjusted: true };
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
  const ceiling = args.riskFree.rate + MAX_DEBT_SPREAD;
  // The ceiling is checked first and keeps its fixed fallback: a bank's interest
  // line includes deposits, so a coverage ratio built on it would be as wrong as
  // the implied rate that tripped the ceiling.
  if (implied <= ceiling && args.ebit !== null && args.ebit !== undefined && args.interestExpense > 0) {
    const coverage = args.ebit / args.interestExpense;
    const synth = syntheticSpread(coverage);
    const floor = args.riskFree.rate + synth.spread;
    if (implied < floor) {
      const bp = Math.round(synth.spread * 10000);
      return {
        rate: floor,
        source: `Risk-free + ${bp}bp, the spread for a ${synth.rating} rating at ${coverage.toFixed(1)}x interest cover${synth.capped ? `, capped at ${Math.round(DEFAULT_DEBT_SPREAD * 10000)}bp because one year's cover is too noisy to charge more` : ''}. Book interest / average debt was lower, at ${(implied * 100).toFixed(1)}%.`,
      };
    }
  }
  if (implied < args.riskFree.rate) {
    return { rate: args.riskFree.rate, source: 'Floored at the risk-free rate (implied cost of debt was lower)' };
  }
  if (implied > ceiling) {
    return {
      rate: args.riskFree.rate + DEFAULT_DEBT_SPREAD,
      source: `Implied cost of debt of ${(implied * 100).toFixed(1)}% is not a credible funding cost, so risk-free + ${(DEFAULT_DEBT_SPREAD * 100).toFixed(0)}bp is assumed instead. Interest expense and reported debt are measuring different things - common for banks, whose interest expense includes deposits that total debt excludes.`,
    };
  }
  return { rate: implied, source: 'Interest expense / average total debt' };
}

export function buildWacc(args: WaccArgs): WaccBreakdown {
  const { beta, clamped, adjusted } = resolveBeta(args.rawBeta);
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
    betaAdjusted: adjusted,
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
