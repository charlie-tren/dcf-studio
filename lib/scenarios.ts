import { marketFor } from './markets';
import type { Assumptions, DataQualityFlag, Fundamentals, ScenarioName } from './types';

export type HistoricalDrivers = {
  revenueCagr: number;
  ebitMargin: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenueChange: number;
  taxRate: number;
  latestRevenue: number;
};

/** Stated numerically so the presets are reproducible rather than a matter of taste. */
export const TILTS = {
  bull: { revenueGrowth: 0.03, ebitMargin: 0.02, terminalGrowth: 0.005 },
  bear: { revenueGrowth: -0.03, ebitMargin: -0.02, terminalGrowth: -0.005 },
} as const;

const DEFAULT_TERMINAL_GROWTH = 0.025;
const DEFAULT_EXIT_MULTIPLE = 8;
/**
 * Two independent ways reported capex fails to represent real investment.
 *
 * 1. Capex well below depreciation: unsustainable, a business cannot depreciate
 *    more than it invests indefinitely. Mesoblast sits at a ratio of 0.08.
 * 2. Capex near zero in absolute terms: the company invests through a line
 *    Yahoo does not map to capex at all. Stockland reports A$3m of capex on
 *    A$3.1bn of revenue (0.10%) because a REIT invests through investment
 *    properties - A$9.5bn of them, against A$129m of gross PPE. Its
 *    depreciation is equally tiny, so the RATIO looks fine at 0.73 and only the
 *    absolute test catches it.
 *
 * Both matter: projecting capex as a share of revenue off either one hands the
 * model free growth in perpetuity and inflates the valuation.
 */
const CAPEX_TO_DA_FLOOR = 0.5;
const CAPEX_TO_REVENUE_FLOOR = 0.01;
/** A five-year CAGR beyond this is a data artefact or a one-off, not a forecast. */
const GROWTH_CLAMP = 0.5;

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export function historicalDrivers(f: Fundamentals): HistoricalDrivers {
  const years = f.years;
  const latest = years[0];
  const oldest = years[years.length - 1];
  const spans = Math.max(years.length - 1, 1);

  const rawCagr =
    oldest.revenue.value > 0 ? (latest.revenue.value / oldest.revenue.value) ** (1 / spans) - 1 : 0;
  // Mesoblast-style revenue ramps produce triple-digit CAGRs off a tiny base.
  const revenueCagr = clamp(rawCagr, -GROWTH_CLAMP, GROWTH_CLAMP);

  const ratios = (pick: (y: typeof latest) => number) =>
    years.filter((y) => y.revenue.value > 0).map((y) => pick(y) / y.revenue.value);

  // Working capital moves with revenue, so express it against the revenue change.
  const nwcRatios: number[] = [];
  for (let i = 0; i < years.length - 1; i++) {
    const deltaRevenue = years[i].revenue.value - years[i + 1].revenue.value;
    if (Math.abs(deltaRevenue) > 0) nwcRatios.push(years[i].changeInNwc.value / deltaRevenue);
  }

  const taxRates = years
    .filter((y) => y.pretaxIncome.value > 0 && y.taxProvision.value >= 0)
    .map((y) => y.taxProvision.value / y.pretaxIncome.value);
  const statutory = marketFor(f.ticker).statutoryTaxRate;
  const effectiveTax = taxRates.length > 0 ? median(taxRates) : statutory;

  return {
    revenueCagr,
    ebitMargin: mean(ratios((y) => y.ebit.value)),
    daPctRevenue: mean(ratios((y) => y.dAndA.value)),
    capexPctRevenue: mean(ratios((y) => y.capex.value)),
    // A ratio against a near-zero revenue change explodes; keep it in a sane band.
    nwcPctRevenueChange: nwcRatios.length > 0 ? clamp(median(nwcRatios), -1, 1) : 0,
    taxRate: clamp(effectiveTax, 0, statutory),
    latestRevenue: latest.revenue.value,
  };
}

/** Consensus revenue growth for years 1-2, fading linearly to the historical rate. */
function consensusGrowthPath(
  f: Fundamentals,
  d: HistoricalDrivers,
  horizon: number
): { path: number[]; note: string | null } {
  if (f.analystRevenue.length === 0) {
    return {
      path: Array(horizon).fill(d.revenueCagr),
      note: 'No analyst coverage available, so the consensus scenario falls back to the historical growth rate.',
    };
  }

  const path: number[] = [];
  let previous = d.latestRevenue;
  const estimates = [...f.analystRevenue].sort((a, b) => a.period.localeCompare(b.period));

  for (let i = 0; i < horizon; i++) {
    if (i < estimates.length && previous > 0) {
      path.push(clamp(estimates[i].revenue / previous - 1, -GROWTH_CLAMP, GROWTH_CLAMP));
      previous = estimates[i].revenue;
    } else {
      // Fade linearly from the last consensus rate to the historical rate.
      const yearsIntoFade = i - estimates.length + 1;
      const fadeLength = horizon - estimates.length;
      const weight = fadeLength <= 0 ? 1 : Math.min(yearsIntoFade / fadeLength, 1);
      const last = path[path.length - 1] ?? d.revenueCagr;
      path.push(last + (d.revenueCagr - last) * weight);
      previous = previous * (1 + path[path.length - 1]);
    }
  }
  return { path, note: null };
}

export type ScenarioResult = {
  assumptions: Assumptions;
  drivers: HistoricalDrivers;
  flags: DataQualityFlag[];
  notes: string[];
};

export function buildScenario(
  f: Fundamentals,
  scenario: ScenarioName,
  horizonYears: 5 | 10,
  wacc: number
): ScenarioResult {
  const drivers = historicalDrivers(f);
  const flags: DataQualityFlag[] = [];
  const notes: string[] = [];

  let capexPctRevenue = drivers.capexPctRevenue;
  const belowDepreciation =
    drivers.daPctRevenue > 0 && capexPctRevenue < drivers.daPctRevenue * CAPEX_TO_DA_FLOOR;
  const negligible = capexPctRevenue < CAPEX_TO_REVENUE_FLOOR;

  if (belowDepreciation || negligible) {
    // Substitute depreciation, or a floor where depreciation is itself negligible
    // (a REIT reports both against PPE it barely holds).
    const substitute = Math.max(drivers.daPctRevenue, CAPEX_TO_REVENUE_FLOOR);
    const reason = negligible
      ? `Reported capital expenditure averages just ${(drivers.capexPctRevenue * 100).toFixed(2)}% of revenue, which is too low to be the company's real investment - property trusts and similar structures invest through lines that are not reported as capex.`
      : `Reported capital expenditure averages ${(drivers.capexPctRevenue * 100).toFixed(2)}% of revenue against depreciation of ${(drivers.daPctRevenue * 100).toFixed(2)}%. A business cannot depreciate more than it invests indefinitely.`;
    flags.push({
      code: 'CAPEX_BELOW_DA',
      severity: 'warn',
      message: `${reason} Capex has been set to ${(substitute * 100).toFixed(2)}% of revenue so the forecast is not handed free growth. Override it if the reported figure is right.`,
    });
    capexPctRevenue = substitute;
  }

  let growthPath: number[];
  let marginTilt = 0;
  let terminalTilt = 0;

  if (scenario === 'consensus') {
    const { path, note } = consensusGrowthPath(f, drivers, horizonYears);
    growthPath = path;
    if (note) notes.push(note);
  } else {
    const tilt = scenario === 'base' ? 0 : TILTS[scenario].revenueGrowth;
    growthPath = Array(horizonYears).fill(drivers.revenueCagr + tilt);
    if (scenario !== 'base') {
      marginTilt = TILTS[scenario].ebitMargin;
      terminalTilt = TILTS[scenario].terminalGrowth;
    }
  }

  return {
    assumptions: {
      horizonYears,
      revenueGrowth: growthPath,
      ebitMargin: Array(horizonYears).fill(drivers.ebitMargin + marginTilt),
      taxRate: drivers.taxRate,
      daPctRevenue: drivers.daPctRevenue,
      capexPctRevenue,
      nwcPctRevenueChange: drivers.nwcPctRevenueChange,
      terminalGrowth: DEFAULT_TERMINAL_GROWTH + terminalTilt,
      exitMultiple: DEFAULT_EXIT_MULTIPLE,
      wacc,
      midYearConvention: true,
      terminalCapexEqualsDA: true,
    },
    drivers,
    flags,
    notes,
  };
}
