import type { Assumptions, DcfInputs, DcfResult, ForecastYear } from './types';

function assertLength(name: string, arr: number[], expected: number): void {
  if (arr.length !== expected) {
    throw new Error(`${name} must have ${expected} entries to match horizonYears, got ${arr.length}`);
  }
}

/**
 * Builds the explicit forecast. Sign convention, applied consistently:
 * capex and changeInNwc are positive when they consume cash, so both are
 * subtracted. A revenue fall makes changeInNwc negative, which correctly
 * releases cash. There is deliberately no Math.abs anywhere in this file.
 */
function buildForecast(inputs: DcfInputs, a: Assumptions): ForecastYear[] {
  const years: ForecastYear[] = [];
  let previousRevenue = inputs.baseRevenue;

  for (let i = 0; i < a.horizonYears; i++) {
    const revenue = previousRevenue * (1 + a.revenueGrowth[i]);
    const ebit = revenue * a.ebitMargin[i];
    const nopat = ebit * (1 - a.taxRate);
    const dAndA = revenue * a.daPctRevenue;
    const capex = revenue * a.capexPctRevenue;
    const changeInNwc = (revenue - previousRevenue) * a.nwcPctRevenueChange;
    const fcff = nopat + dAndA - capex - changeInNwc;

    years.push({
      year: i + 1,
      revenue,
      ebit,
      nopat,
      dAndA,
      capex,
      changeInNwc,
      fcff,
      discountFactor: 0,
      presentValue: 0,
    });
    previousRevenue = revenue;
  }
  return years;
}

/** Year-end discounts at t, mid-year at t - 0.5. */
function discountExponent(year: number, midYear: boolean): number {
  return midYear ? year - 0.5 : year;
}

function discount(forecast: ForecastYear[], a: Assumptions): number {
  let pvExplicit = 0;
  for (const y of forecast) {
    y.discountFactor = 1 / (1 + a.wacc) ** discountExponent(y.year, a.midYearConvention);
    y.presentValue = y.fcff * y.discountFactor;
    pvExplicit += y.presentValue;
  }
  return pvExplicit;
}

export function runDcf(inputs: DcfInputs, a: Assumptions): DcfResult {
  assertLength('revenueGrowth', a.revenueGrowth, a.horizonYears);
  assertLength('ebitMargin', a.ebitMargin, a.horizonYears);

  const forecast = buildForecast(inputs, a);
  const pvExplicit = discount(forecast, a);

  // Terminal value and the bridge arrive in the next task.
  return {
    forecast,
    pvExplicit,
    gordon: {
      terminal: { method: 'gordon', undiscounted: 0, presentValue: 0, shareOfEv: 0 },
      enterpriseValue: 0,
      equityValue: 0,
      valuePerShare: 0,
    },
    exitMultiple: {
      terminal: { method: 'exitMultiple', undiscounted: 0, presentValue: 0, shareOfEv: 0 },
      enterpriseValue: 0,
      equityValue: 0,
      valuePerShare: 0,
    },
    warnings: [],
  };
}
