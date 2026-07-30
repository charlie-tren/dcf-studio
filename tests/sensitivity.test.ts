import { describe, it, expect } from 'vitest';
import { sensitivityGrid } from '@/lib/sensitivity';
import type { Assumptions, DcfInputs } from '@/lib/types';

const A: Assumptions = {
  horizonYears: 5,
  revenueGrowth: Array(5).fill(0.10),
  ebitMargin: Array(5).fill(0.20),
  taxRate: 0.30,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.07,
  nwcPctRevenueChange: 0.10,
  terminalGrowth: 0.025,
  exitMultiple: 8,
  wacc: 0.10,
  midYearConvention: false,
  terminalCapexEqualsDA: false,
};
const I: DcfInputs = { baseRevenue: 1000, netDebt: 500, dilutedShares: 100 };

describe('sensitivityGrid', () => {
  it('returns a value per share for every WACC and terminal growth pair', () => {
    const g = sensitivityGrid(I, A, { waccSteps: 2, waccStep: 0.01, growthSteps: 1, growthStep: 0.005 });
    expect(g.waccValues).toEqual([0.08, 0.09, 0.10, 0.11, 0.12]);
    expect(g.growthValues).toEqual([0.02, 0.025, 0.03]);
    expect(g.cells).toHaveLength(5);
    expect(g.cells[0]).toHaveLength(3);
  });

  it('values fall as WACC rises and rise as terminal growth rises', () => {
    const g = sensitivityGrid(I, A, { waccSteps: 1, waccStep: 0.02, growthSteps: 1, growthStep: 0.01 });
    const lowWacc = g.cells[0][1];
    const highWacc = g.cells[2][1];
    expect(lowWacc).toBeGreaterThan(highWacc as number);
    expect(g.cells[1][2]).toBeGreaterThan(g.cells[1][0] as number);
  });

  it('returns null for a cell where the perpetuity cannot converge', () => {
    const g = sensitivityGrid(I, { ...A, wacc: 0.03 }, { waccSteps: 1, waccStep: 0.01, growthSteps: 1, growthStep: 0.01 });
    // WACC 0.02 with terminal growth 0.035 cannot converge.
    expect(g.cells[0][2]).toBeNull();
  });
});
