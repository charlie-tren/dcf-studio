import type { Assumptions, ScenarioName } from './types';

export type UrlState = {
  scenario: ScenarioName;
  horizonYears: 5 | 10;
  overrides: Partial<Assumptions>;
};

const SCENARIOS: ScenarioName[] = ['base', 'bull', 'bear', 'consensus'];

/** Short query keys for the scalar overrides, to keep shared links pasteable. */
const SCALAR_KEYS: Record<string, keyof Assumptions> = {
  wacc: 'wacc',
  tg: 'terminalGrowth',
  em: 'exitMultiple',
  tax: 'taxRate',
  da: 'daPctRevenue',
  cx: 'capexPctRevenue',
  nwc: 'nwcPctRevenueChange',
};

export function encodeState(state: UrlState): string {
  const p = new URLSearchParams();
  p.set('scenario', state.scenario);
  p.set('horizon', String(state.horizonYears));

  for (const [short, key] of Object.entries(SCALAR_KEYS)) {
    const v = state.overrides[key];
    if (typeof v === 'number') p.set(short, String(v));
  }
  if (state.overrides.midYearConvention !== undefined) {
    p.set('mid', state.overrides.midYearConvention ? '1' : '0');
  }
  if (state.overrides.terminalCapexEqualsDA !== undefined) {
    p.set('tcx', state.overrides.terminalCapexEqualsDA ? '1' : '0');
  }
  if (state.overrides.revenueGrowth) p.set('g', state.overrides.revenueGrowth.join('|'));
  if (state.overrides.ebitMargin) p.set('m', state.overrides.ebitMargin.join('|'));

  return p.toString();
}

function numberArray(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split('|').map(Number);
  return parts.every((n) => Number.isFinite(n)) ? parts : undefined;
}

export function decodeState(query: string): UrlState {
  const p = new URLSearchParams(query);

  const scenarioParam = p.get('scenario') as ScenarioName | null;
  const scenario = scenarioParam && SCENARIOS.includes(scenarioParam) ? scenarioParam : 'base';
  const horizonYears = p.get('horizon') === '10' ? 10 : 5;

  const overrides: Partial<Assumptions> = {};
  for (const [short, key] of Object.entries(SCALAR_KEYS)) {
    const raw = p.get(short);
    if (raw === null) continue;
    const v = Number(raw);
    if (Number.isFinite(v)) (overrides[key] as number) = v;
  }
  const mid = p.get('mid');
  if (mid === '0' || mid === '1') overrides.midYearConvention = mid === '1';
  const tcx = p.get('tcx');
  if (tcx === '0' || tcx === '1') overrides.terminalCapexEqualsDA = tcx === '1';

  const g = numberArray(p.get('g'));
  if (g) overrides.revenueGrowth = g;
  const m = numberArray(p.get('m'));
  if (m) overrides.ebitMargin = m;

  return { scenario, horizonYears, overrides };
}
