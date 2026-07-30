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
    const withArrays = {
      ...STATE,
      overrides: { ...STATE.overrides, revenueGrowth: [0.1, 0.09], ebitMargin: [0.2, 0.21] },
    };
    expect(decodeState(encodeState(withArrays))).toEqual(withArrays);
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
