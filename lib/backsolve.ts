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
  /**
   * Average annual revenue growth (the path's CAGR) that would justify the market
   * price, on a path the same shape as the model's: see `shiftedGrowthPath`.
   */
  revenueGrowth: number | null;
  /** The solved path itself, one rate per forecast year. */
  revenueGrowthPath: number[] | null;
  /** Flat EBIT margin that would justify it, holding growth at the model's. */
  ebitMargin: number | null;
  /** Discount rate that would justify it. */
  wacc: number | null;
};

/**
 * The model's own growth path, lifted or lowered by `shift` in year 1 and by
 * nothing in the final year, so it still fades to where the model's path ends.
 *
 * The solve used to replace the path with one flat rate. Once the base case faded
 * to terminal growth (10/10/2026) that compared a ten-year flat rate, which then
 * fell off a cliff into the perpetuity, against the model's first-year rate: two
 * different shapes in adjacent columns. A shift keeps the shape, and both columns
 * then report the same statistic, the path's average annual growth.
 */
export function shiftedGrowthPath(path: number[], shift: number): number[] {
  const n = path.length;
  return path.map((g, i) => g + shift * (1 - (i + 1) / n));
}

/** Compound average of a path of annual rates. */
export function averageGrowth(path: number[]): number {
  return path.reduce((acc, g) => acc * (1 + g), 1) ** (1 / path.length) - 1;
}

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

  // A one-year horizon has no fade to keep, so its shift weight would be zero.
  const path =
    a.horizonYears > 1
      ? (s: number) => shiftedGrowthPath(a.revenueGrowth, s)
      : (s: number) => a.revenueGrowth.map((g) => g + s);
  const shift = bisect((s) => perShare({ revenueGrowth: path(s) }), targetPrice, -0.9, 3.0);
  const revenueGrowthPath = shift === null ? null : path(shift);

  return {
    revenueGrowth: revenueGrowthPath === null ? null : averageGrowth(revenueGrowthPath),
    revenueGrowthPath,
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
