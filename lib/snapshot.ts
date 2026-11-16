import type { RiskFree } from './riskfree';
import type { ValuationDeps } from './valuation';
import type { RawTicker } from './yahoo';

/** Every input one company's valuation reads, so it can be rerun with any assumptions. */
export type Snapshot = {
  raw: RawTicker;
  fx: Record<string, number | null>;
  riskFree: RiskFree;
};

/** Deps that pass through to `live` and keep what they return. */
export function recordingDeps(live: ValuationDeps) {
  const fx: Record<string, number | null> = {};
  let raw: RawTicker | null = null;
  let riskFree: RiskFree | null = null;
  const deps: ValuationDeps = {
    fetchTicker: async (t) => (raw = await live.fetchTicker(t)),
    fetchFxRate: async (from, to) => (fx[`${from}${to}`] = await live.fetchFxRate(from, to)),
    resolveRiskFree: async (t) => (riskFree = await live.resolveRiskFree(t)),
  };
  const snapshot = (): Snapshot | null => (raw && riskFree ? { raw, fx, riskFree } : null);
  return { deps, snapshot };
}

/** Deps that answer from a snapshot, falling back to `live` for an FX pair it lacks. */
export function replayDeps(s: Snapshot, live?: ValuationDeps): ValuationDeps {
  return {
    fetchTicker: async () => s.raw,
    fetchFxRate: async (from, to) => {
      const key = `${from}${to}`;
      if (key in s.fx) return s.fx[key];
      return live ? live.fetchFxRate(from, to) : null;
    },
    resolveRiskFree: async () => s.riskFree,
  };
}
