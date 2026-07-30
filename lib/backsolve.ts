import { runDcf } from './dcf';
import type { Assumptions, DcfInputs } from './types';

/**
 * What would have to be true for today's price to be right?
 *
 * A DCF that disagrees with the market by 60% is not very informative on its
 * own - the interesting question is which assumption the market must be making
 * that this model is not. Solving for that turns "the model says it is
 * overvalued" into "the market is pricing 22% growth against 12% history",
 * which is a claim a reader can actually assess.
 *
 * Bisection rather than an analytic solve: value per share is monotonic in each
 * of these inputs over any sane range, and bisection stays correct if the engine
 * ever gains a non-linear term.
 */
function bisect(
  evaluate: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  iterations = 60
): number | null {
  let fLo = evaluate(lo) - target;
  let fHi = evaluate(hi) - target;
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null;
  // No sign change means the target is unreachable anywhere in the range.
  if (fLo > 0 === fHi > 0) return null;

  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    const fMid = evaluate(mid) - target;
    if (fMid === 0) return mid;
    if (fMid > 0 === fLo > 0) {
      a = mid;
      fLo = fMid;
    } else {
      b = mid;
      fHi = fMid;
    }
  }
  return (a + b) / 2;
}

export type ImpliedExpectations = {
  /** Flat annual revenue growth that would justify the market price. */
  revenueGrowth: number | null;
  /** Flat EBIT margin that would justify it, holding growth at the model's. */
  ebitMargin: number | null;
  /** Discount rate that would justify it. */
  wacc: number | null;
};

/**
 * Solves each input independently for the value that reproduces `targetPrice`
 * (expressed per share in reporting currency). Each answer holds every other
 * assumption at the model's own, so they are alternatives, not a combination.
 */
export function impliedExpectations(
  inputs: DcfInputs,
  a: Assumptions,
  targetPrice: number
): ImpliedExpectations {
  const perShare = (override: Partial<Assumptions>) => {
    const r = runDcf(inputs, { ...a, ...override });
    return r.gordon.terminal.blocked ? Number.NaN : r.gordon.valuePerShare;
  };

  return {
    revenueGrowth: bisect(
      (g) => perShare({ revenueGrowth: Array(a.horizonYears).fill(g) }),
      targetPrice,
      -0.5,
      1.0
    ),
    ebitMargin: bisect(
      (m) => perShare({ ebitMargin: Array(a.horizonYears).fill(m) }),
      targetPrice,
      -0.5,
      0.95
    ),
    // Value falls as the discount rate rises, so the bracket runs high to low.
    wacc: bisect((w) => perShare({ wacc: w }), targetPrice, 0.99, a.terminalGrowth + 0.0005),
  };
}
