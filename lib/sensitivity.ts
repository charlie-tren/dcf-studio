import { runDcf } from './dcf';
import type { Assumptions, DcfInputs } from './types';

export type GridOptions = {
  /** Number of steps either side of the central WACC. */
  waccSteps: number;
  waccStep: number;
  /** Number of steps either side of the central terminal growth rate. */
  growthSteps: number;
  growthStep: number;
};

export type SensitivityGrid = {
  waccValues: number[];
  growthValues: number[];
  /** cells[waccIndex][growthIndex]. Null where the perpetuity cannot converge. */
  cells: (number | null)[][];
};

function axis(centre: number, steps: number, step: number): number[] {
  const values: number[] = [];
  for (let i = -steps; i <= steps; i++) {
    values.push(Number((centre + i * step).toFixed(6)));
  }
  return values;
}

export function sensitivityGrid(inputs: DcfInputs, a: Assumptions, o: GridOptions): SensitivityGrid {
  const waccValues = axis(a.wacc, o.waccSteps, o.waccStep);
  const growthValues = axis(a.terminalGrowth, o.growthSteps, o.growthStep);

  const cells = waccValues.map((wacc) =>
    growthValues.map((terminalGrowth) => {
      const r = runDcf(inputs, { ...a, wacc, terminalGrowth });
      return r.gordon.terminal.blocked ? null : r.gordon.valuePerShare;
    })
  );

  return { waccValues, growthValues, cells };
}
