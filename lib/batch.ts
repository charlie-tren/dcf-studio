import { implausibleResult } from './valuation';

/**
 * Rules for the batch that publishes this model's output as data.
 *
 * Kept in lib/ rather than in the script because they decide what a sibling site
 * shows, so they are worth testing. The script itself is a driver.
 */

/** Below this share of the previous run, a smaller universe is a broken run. */
export const MIN_COVERAGE_SHARE = 0.5;

/**
 * True where the company's own page refuses to call its result a valuation.
 *
 * An `error` flag is the model declining: "Wrong tool" on a bank or insurer, or a
 * perpetuity that cannot converge. The page prints the refusal; this file used to
 * publish the number anyway, and Crosscheck ranked it. Financials were the cost:
 * their median ratio was 1.28x against 0.61x for everything else on 05/10/2026, so
 * 71 banks and insurers rode a number their own source disowns into a composite
 * whose top fifth came out 26% Financials against 14% of the universe.
 *
 * Same rule as `publishableRatio`, one level up: a row the page disowns must not
 * reappear as a rank on another site.
 */
export function declinedByModel(flags: readonly { severity: string }[]): boolean {
  return flags.some((f) => f.severity === 'error');
}

/**
 * Implied value over market price, or null where the pair cannot support a rank.
 *
 * The plausibility test is `implausibleResult` itself rather than a second threshold
 * written to the same number. That function is what the company's own page uses to
 * disown a result, and a row the page disowns must not quietly reappear as a rank on
 * another site. One definition, one place.
 *
 * A negative implied value is dropped for a different reason: it is often a perfectly
 * legitimate reading of a loss-maker, but in a ranked column it would sort as the
 * cheapest thing on the page when what it actually says is that the model puts no
 * value on the equity at all.
 */
export function publishableRatio(valuePerShare: number, price: number): number | null {
  if (!Number.isFinite(valuePerShare) || !Number.isFinite(price)) return null;
  if (price <= 0 || valuePerShare <= 0) return null;
  if (implausibleResult(valuePerShare, price) !== null) return null;
  return valuePerShare / price;
}

/**
 * Null when this run may be published, or the reason it may not.
 *
 * A batch of network calls fails in the one way that looks like success: most of them
 * throw, the survivors are written, and the file is valid JSON with too few rows in
 * it. The consumer then ranks whatever arrived and renders a column that looks
 * completely normal.
 */
export function guardCoverage(published: number, previous: number | null): string | null {
  if (previous === null || previous <= 0) return null;
  if (published >= previous * MIN_COVERAGE_SHARE) return null;
  return (
    `published ${published} valuations against ${previous} last run, below ` +
    `${(MIN_COVERAGE_SHARE * 100).toFixed(0)}%. That is a failed run rather than a ` +
    `smaller universe, so nothing was written.`
  );
}
