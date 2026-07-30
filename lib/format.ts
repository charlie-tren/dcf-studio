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
