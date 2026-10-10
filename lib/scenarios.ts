import { marketFor } from './markets';
import type { Assumptions, DataQualityFlag, Fundamentals, ScenarioName } from './types';

export type HistoricalDrivers = {
  /** NOPAT / invested capital, median across available years. Null if unusable. */
  roic: number | null;
  revenueCagr: number;
  ebitMargin: number;
  daPctRevenue: number;
  /**
   * The depreciation half of D&A as a share of revenue - what it costs to hold
   * the productive asset base flat, with acquisition amortisation stripped out.
   * Equal to daPctRevenue where the accounts give no way to separate them.
   */
  depreciationPctRevenue: number;
  /** True when the split was unavailable and the figure above IS the full D&A. */
  depreciationIsFullDandA: boolean;
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
/**
 * Fallback only. A fixed multiple applied to every company is not a second
 * opinion, it is an arbitrary anchor shown with equal weight to the DCF - 8x was
 * being used for Microsoft, Shell and a property trust alike. Where the company
 * has a current EV/EBITDA it is used instead, clamped to a defensible band.
 */
const DEFAULT_EXIT_MULTIPLE = 8;
const EXIT_MULTIPLE_BAND = { min: 3, max: 20 };

/**
 * The company's own current EV/EBITDA, as the starting point for the exit
 * multiple. Clamped because a depressed or blown-out trailing multiple should
 * not be projected five years out unchallenged, and a negative EBITDA gives no
 * usable figure at all.
 */
function currentEvEbitda(f: Fundamentals): { multiple: number; raw: number; clamped: boolean } | null {
  const latest = f.years[0];
  const ebitda = latest.ebit.value + latest.dAndA.value;
  if (ebitda <= 0 || f.marketCap <= 0) return null;
  const enterpriseValue = f.marketCap + latest.totalDebt.value - latest.cash.value;
  if (enterpriseValue <= 0) return null;
  const raw = enterpriseValue / ebitda;
  if (!Number.isFinite(raw)) return null;
  const multiple = clamp(raw, EXIT_MULTIPLE_BAND.min, EXIT_MULTIPLE_BAND.max);
  return { multiple, raw, clamped: multiple !== raw };
}
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
/** Trade working capital is rarely outside this as a share of revenue (Thermo 24%). */
const NWC_LEVEL_BAND = 0.3;
const NWC_LEVEL_CEILING = 0.5;
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

/**
 * Depreciation as a share of revenue, averaged over the years that report it.
 *
 * Availability is per YEAR, not per company: BHP reports a depreciation line in
 * three of its four recorded years and CBA in two of four, so this averages over
 * the years that have one rather than demanding a complete series or none. Where
 * no year has one - Mesoblast, Seagate - it returns the full D&A ratio and says
 * so, which is exactly the behaviour that was there before this split existed.
 */
function depreciationShare(
  f: Fundamentals,
  years: Fundamentals['years'],
  ratios: (pick: (y: Fundamentals['years'][number]) => number) => number[]
): { depreciationPctRevenue: number; depreciationIsFullDandA: boolean } {
  const withLine = years.filter((y) => y.depreciation !== null && y.revenue.value > 0);
  if (withLine.length === 0) {
    return {
      depreciationPctRevenue: mean(ratios((y) => y.dAndA.value)),
      depreciationIsFullDandA: true,
    };
  }
  const share = mean(
    withLine.map((y) => (y.depreciation as { value: number }).value / y.revenue.value)
  );
  return { depreciationPctRevenue: share, depreciationIsFullDandA: false };
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

  // Trade working capital as a share of revenue, held constant: each dollar of new
  // revenue then carries that share in receivables and stock, net of payables.
  // Preferred over the cashflow line's year-on-year movement, which was the only
  // measure until 10/10/2026: the median of three or four ratios of a noisy flow to
  // a small revenue change. Visa, Coca-Cola, Thermo Fisher and Starbucks all sat on
  // the +1.0 clamp - a dollar of working capital per dollar of growth - because
  // Yahoo's line carries settlement flows and, for Coca-Cola, a 6bn tax deposit.
  // Apple drew a 29bn-a-year release from one year in which revenue fell. The level
  // is stable year to year (Visa 5.7-6.4%, Apple -5.9 to -7.9%). Population effect
  // on the 44-name sample was neutral (median 0.783x -> 0.770x), because the
  // perpetuity carries no working capital; the fix is to the forecast rows.
  const levels = years
    .filter((y) => y.tradeWorkingCapital !== null && y.revenue.value > 0)
    .map((y) => (y.tradeWorkingCapital as { value: number }).value / y.revenue.value);

  const taxRates = years
    .filter((y) => y.pretaxIncome.value > 0 && y.taxProvision.value >= 0)
    .map((y) => y.taxProvision.value / y.pretaxIncome.value);
  const statutory = marketFor(f.ticker).statutoryTaxRate;
  const effectiveTax = taxRates.length > 0 ? median(taxRates) : statutory;

  // ROIC on the company's own accounts. Median across years so one odd balance
  // sheet cannot set the terminal reinvestment rate.
  const roicSeries = years
    .filter((y) => y.investedCapital !== null && y.investedCapital.value > 0)
    .map((y) => (y.ebit.value * (1 - clamp(effectiveTax, 0, statutory))) / (y.investedCapital as { value: number }).value)
    .filter((r) => Number.isFinite(r) && r > 0);
  // Cap at 60%: above that the reinvestment rate is negligible anyway and the
  // figure usually says invested capital is understated, not that returns are
  // extraordinary in perpetuity.
  const roic = roicSeries.length > 0 ? Math.min(median(roicSeries), 0.6) : null;

  return {
    roic,
    revenueCagr,
    ebitMargin: mean(ratios((y) => y.ebit.value)),
    daPctRevenue: mean(ratios((y) => y.dAndA.value)),
    ...depreciationShare(f, years, ratios),
    capexPctRevenue: mean(ratios((y) => y.capex.value)),
    // A ratio against a near-zero revenue change explodes; keep it in a sane band.
    nwcPctRevenueChange:
      levels.length > 0
        ? clamp(median(levels), -NWC_LEVEL_BAND, NWC_LEVEL_CEILING)
        : nwcRatios.length > 0
          ? clamp(median(nwcRatios), -1, 1)
          : 0,
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
  // Sort by the NUMBER of years out, not the label. '+1y'.localeCompare('0y')
  // puts +1y first because '+' sorts before '0', which fed next year's revenue
  // in as year one - a 50% jump followed by a fall, and a consensus case that
  // came out LOWER than base for a company analysts are bullish on.
  const yearsOut = (period: string) => Number(period.replace(/[^0-9.-]/g, '')) || 0;
  const estimates = [...f.analystRevenue].sort((a, b) => yearsOut(a.period) - yearsOut(b.period));

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

/**
 * The base growth path: analyst revenue for the years it covers (two, from Yahoo),
 * then a straight line from the last rate to terminal growth by the final year.
 * With no coverage it starts from the historical rate instead.
 *
 * It replaced the trailing CAGR held flat for every year, which carried whatever
 * happened in the last four years forward as the forecast: Danaher's post-COVID
 * run-off at -2.7% a year, Shell's 2022 price spike unwinding at -11.2%, Nvidia at
 * +50% (the clamp) - and over ten years that compounds, which put Nvidia at 2.8x
 * its price. Fading to terminal growth also removes the cliff between the last
 * explicit year and the perpetuity.
 *
 * Measured over calibrate.ts's 44 names, 10/10/2026, against flat-CAGR at five
 * years: median value/price 0.59x -> 0.67x, usable (0.5-2.0x) 22 -> 28,
 * implausible 3 -> 1. The SAME fade over five years was worse than flat (0.52x,
 * 5 implausible): five years is too short to fade a compounder honestly, which is
 * why the default horizon is ten.
 */
function baseGrowthPath(
  f: Fundamentals,
  d: HistoricalDrivers,
  horizon: number,
  terminalGrowth: number
): number[] {
  const consensus = f.analystRevenue.length > 0 ? consensusGrowthPath(f, d, horizon).path : [];
  const covered = Math.min(f.analystRevenue.length, horizon - 1);
  const first = consensus.slice(0, covered);
  const from = covered > 0 ? first[covered - 1] : d.revenueCagr;
  const rest = horizon - covered;
  const fade = Array.from({ length: rest }, (_, i) => from + (terminalGrowth - from) * ((i + 1) / rest));
  return [...first, ...fade];
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

  // The clamp binds on exactly the cases it exists for - a bank whose EBITDA is
  // meaningless (CBA 28.8x, RBC 30.0x) or a REIT whose negligible depreciation
  // makes EBITDA nearly EBIT (Stockland 20.0x). Say so rather than presenting a
  // clamped figure as the company's own rating.
  const evEbitda = currentEvEbitda(f);
  if (evEbitda?.clamped) {
    notes.push(
      `Current EV/EBITDA of ${evEbitda.raw.toFixed(1)}x sits outside a defensible ${EXIT_MULTIPLE_BAND.min}-${EXIT_MULTIPLE_BAND.max}x band, so the exit multiple is capped at ${evEbitda.multiple.toFixed(1)}x. A multiple that far out usually means EBITDA is the wrong denominator for this business.`
    );
  } else if (!evEbitda) {
    notes.push(
      `No usable EV/EBITDA (EBITDA is not positive), so the exit multiple falls back to ${DEFAULT_EXIT_MULTIPLE}x.`
    );
  }

  let capexPctRevenue = drivers.capexPctRevenue;
  // DEPRECIATION, not D&A. The rule's own premise - a business cannot depreciate
  // more than it invests indefinitely - is a statement about assets that wear
  // out. Amortisation of an acquired intangible is purchase accounting unwinding
  // a cheque already written, and nothing has to be re-spent to replace it.
  //
  // Read against the combined figure, this fired on any acquisitive company.
  // AMD spends 2.40% of revenue on capex against 2.17% depreciation - it is not
  // underinvesting in anything - but its D&A runs at 13.46% because three
  // quarters of it is Xilinx intangible amortisation. The floor duly replaced
  // AMD's capex with 13.46% of revenue, 5,298m a year against the 974m it
  // actually spends, in every forecast year. That is most of why this model
  // valued AMD at $8 against a $506 share price.
  //
  // The terminal treats the intangible as GONE, which is the other half of this and
  // was got wrong here first. This comment used to say the terminal "forces capex up
  // to full D&A, which is right and is what stops the amortisation add-back running
  // as free cashflow in perpetuity". The first clause was true and the second was the
  // wrong cure: forcing capex to full D&A does stop the add-back, but it also keeps
  // DEDUCTING the amortisation inside EBIT forever, so the charge outlived the asset.
  //
  // A perpetuity starts after the intangible has amortised away. At that point the
  // P&L carries no charge and there is no add-back either, so the terminal holds
  // neither: EBITA, taxed, against maintenance capex at depreciation. See
  // terminalFcff in lib/dcf.ts. The two treatments are still consistent - real capex
  // and the real charge while the intangible runs off, neither of them afterwards.
  const depreciation = drivers.depreciationPctRevenue;
  const belowDepreciation =
    depreciation > 0 && capexPctRevenue < depreciation * CAPEX_TO_DA_FLOOR;
  const negligible = capexPctRevenue < CAPEX_TO_REVENUE_FLOOR;

  if (belowDepreciation || negligible) {
    // Substitute depreciation, or a floor where depreciation is itself negligible
    // (a REIT reports both against PPE it barely holds). Substituting the figure
    // the test was made against - anything else reintroduces the bug on the
    // write side.
    const substitute = Math.max(depreciation, CAPEX_TO_REVENUE_FLOOR);
    const measure = drivers.depreciationIsFullDandA
      ? 'depreciation and amortisation'
      : 'depreciation';
    const caveat = drivers.depreciationIsFullDandA
      ? ' The accounts do not separate depreciation from amortisation, so the combined charge is used - if a large part of it is amortisation of an acquisition, the reported capex is probably right and this substitution is not.'
      : '';
    const reason = negligible
      ? `Reported capital expenditure averages just ${(drivers.capexPctRevenue * 100).toFixed(2)}% of revenue, which is too low to be the company's real investment - property trusts and similar structures invest through lines that are not reported as capex.`
      : `Reported capital expenditure averages ${(drivers.capexPctRevenue * 100).toFixed(2)}% of revenue against ${measure} of ${(depreciation * 100).toFixed(2)}%. A business cannot depreciate more than it invests indefinitely.`;
    flags.push({
      code: 'CAPEX_BELOW_DA',
      severity: 'warn',
      message: `${reason} Capex has been set to ${(substitute * 100).toFixed(2)}% of revenue so the forecast is not handed free growth.${caveat} Override it if the reported figure is right.`,
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
    growthPath = baseGrowthPath(f, drivers, horizonYears, DEFAULT_TERMINAL_GROWTH).map((g) => g + tilt);
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
      depreciationPctRevenue: drivers.depreciationPctRevenue,
      capexPctRevenue,
      nwcPctRevenueChange: drivers.nwcPctRevenueChange,
      terminalGrowth: DEFAULT_TERMINAL_GROWTH + terminalTilt,
      exitMultiple: evEbitda?.multiple ?? DEFAULT_EXIT_MULTIPLE,
      wacc,
      midYearConvention: true,
      terminalCapexEqualsDA: true,
      terminalRoic: drivers.roic,
    },
    drivers,
    flags,
    notes,
  };
}
