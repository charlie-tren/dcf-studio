import { describe, it, expect } from 'vitest';
import { sensitivityGrid } from '@/lib/sensitivity';
import type { Assumptions, DcfInputs } from '@/lib/types';

const A: Assumptions = {
  horizonYears: 5,
  revenueGrowth: Array(5).fill(0.10),
  ebitMargin: Array(5).fill(0.20),
  taxRate: 0.30,
  daPctRevenue: 0.05,
  depreciationPctRevenue: 0.05,   // no amortisation in this fixture
  capexPctRevenue: 0.07,
  nwcPctRevenueChange: 0.10,
  terminalGrowth: 0.025,
  exitMultiple: 8,
  wacc: 0.10,
  midYearConvention: false,
  terminalCapexEqualsDA: false,
  terminalRoic: null,
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

  it('reports the centre index rather than leaving the view to match floats', () => {
    // The axis values are rounded to 6dp for display while a live WACC is not
    // (0.10690911670800697), so a float comparison never matched and the centre
    // cell went unmarked in the UI.
    const messyWacc = { ...A, wacc: 0.10690911670800697 };
    const g = sensitivityGrid(I, messyWacc, {
      waccSteps: 2,
      waccStep: 0.01,
      growthSteps: 2,
      growthStep: 0.005,
    });
    expect(g.centre).toEqual({ waccIndex: 2, growthIndex: 2 });
    // The centre cell must equal the model's own answer.
    const own = sensitivityGrid(I, messyWacc, {
      waccSteps: 0,
      waccStep: 0.01,
      growthSteps: 0,
      growthStep: 0.005,
    });
    expect(g.cells[2][2]).toBeCloseTo(own.cells[0][0] as number, 6);
    // And the value at the exact centre must not be findable by float match,
    // which is precisely why centre is reported explicitly.
    expect(g.waccValues[2]).not.toBe(messyWacc.wacc);
  });

  it('returns null for a cell where the perpetuity cannot converge', () => {
    const g = sensitivityGrid(I, { ...A, wacc: 0.03 }, { waccSteps: 1, waccStep: 0.01, growthSteps: 1, growthStep: 0.01 });
    // WACC 0.02 with terminal growth 0.035 cannot converge.
    expect(g.cells[0][2]).toBeNull();
  });
});
