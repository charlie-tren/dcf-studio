import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/lib/urlstate';

const STATE = {
  scenario: 'bull' as const,
  horizonYears: 10 as const,
  overrides: { wacc: 0.0925, terminalGrowth: 0.02, midYearConvention: false },
};

describe('url state', () => {
  it('round-trips a full state through a query string', () => {
    expect(decodeState(encodeState(STATE))).toEqual(STATE);
  });

  it('round-trips per-year growth and margin arrays', () => {
    // One entry per forecast year. This used to round-trip a two-entry array
    // against a ten-year horizon, which is the mismatch the engine asserts on,
    // so the test was standing guard over the bug.
    const withArrays = {
      ...STATE,
      overrides: {
        ...STATE.overrides,
        revenueGrowth: [0.1, 0.09, 0.09, 0.08, 0.08, 0.07, 0.07, 0.06, 0.06, 0.05],
        ebitMargin: [0.2, 0.21, 0.21, 0.22, 0.22, 0.22, 0.23, 0.23, 0.23, 0.24],
      },
    };
    expect(decodeState(encodeState(withArrays))).toEqual(withArrays);
  });

  it('drops a per-year override that does not match the horizon', () => {
    /**
     * The reachable path is one click, not a hand-edited URL: a shared link
     * carrying a five-entry growth path, then the reader toggles to a ten-year
     * forecast. The toggle keeps every existing parameter, so `g` arrives at the
     * engine the wrong length and the page died on
     * "revenueGrowth must have 5 entries to match horizonYears, got 5" - an
     * internal invariant shown to a reader as an error message.
     */
    const five = '0.16|0.16|0.16|0.16|0.16';
    expect(decodeState(`horizon=10&g=${five}`).overrides.revenueGrowth).toBeUndefined();
    expect(decodeState(`horizon=5&g=${five}`).overrides.revenueGrowth).toHaveLength(5);
    expect(decodeState('horizon=5&g=0.08').overrides.revenueGrowth).toBeUndefined();
    expect(decodeState('horizon=5&m=0.4|0.4').overrides.ebitMargin).toBeUndefined();
  });

  it('returns a sane default for an empty query string', () => {
    const d = decodeState('');
    expect(d.scenario).toBe('base');
    expect(d.horizonYears).toBe(5);
    expect(d.overrides).toEqual({});
  });

  it('ignores unknown or malformed parameters rather than throwing', () => {
    const d = decodeState('scenario=nonsense&horizon=99&wacc=abc&junk=1');
    expect(d.scenario).toBe('base');
    expect(d.horizonYears).toBe(5);
    expect(d.overrides.wacc).toBeUndefined();
  });

  it('produces a query string short enough to paste', () => {
    expect(encodeState(STATE).length).toBeLessThan(200);
  });
});
