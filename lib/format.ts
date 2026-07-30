export function pct(v: number, dp = 1): string {
  return `${(v * 100).toFixed(dp)}%`;
}

/** Scales to k/m/bn. Statements come through in units, so the scaling matters. */
export function money(v: number, currency: string): string {
  const abs = Math.abs(v);
  const [scaled, suffix] =
    abs >= 1e9 ? [v / 1e9, 'bn'] : abs >= 1e6 ? [v / 1e6, 'm'] : abs >= 1e3 ? [v / 1e3, 'k'] : [v, ''];
  return `${currency} ${scaled.toFixed(suffix === '' ? 2 : 1)}${suffix}`;
}

export function perShare(v: number, currency: string): string {
  return `${currency} ${v.toFixed(2)}`;
}

export function signedPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

/**
 * Compound annual growth from first to last, over (n - 1) periods.
 *
 * Returns null where a CAGR would be meaningless rather than a misleading
 * number: a sign change (a line that goes from negative to positive has no
 * compound rate), a zero start, or fewer than two periods. Reporting "+340%"
 * for a swing through zero is worse than reporting nothing.
 */
export function cagr(series: number[]): number | null {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === 0 || first < 0 !== last < 0) return null;
  const years = series.length - 1;
  const ratio = last / first;
  if (ratio <= 0) return null;
  // Negative series compound in magnitude, so sign-correct the result: a loss
  // growing from -10 to -20 is deteriorating, not growing.
  const magnitude = ratio ** (1 / years) - 1;
  return first < 0 ? -magnitude : magnitude;
}
