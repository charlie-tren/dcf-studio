import { marketFor } from './markets';
import { fetchUsTenYear as yahooUsTenYear } from './yahoo';

/** Verified live on 30/07/2026: HTTP 200, ~199KB, 3,316 daily observations. */
const RBA_F2_URL = 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv';

/**
 * The Australian Government 10-year series. The F2 CSV carries 2y, 3y, 5y, 10y
 * and indexed columns in that order, so the 10-year is the FIFTH column - a
 * parser reading cells[1] returns the 2-YEAR yield instead (4.561% vs 4.989% on
 * 22-Jul-2026, a ~43bp error in every ASX discount rate). Always select by ID.
 */
export const RBA_TEN_YEAR_SERIES_ID = 'FCMYGBAG10D';

/** A sane band for a 10-year government yield. Outside it, something parsed wrong. */
const PLAUSIBLE_RATE = { min: -0.01, max: 0.25 };

export type RiskFree = {
  rate: number;
  source: string;
  /** True when the rate is a documented assumption rather than a live observation. */
  assumed: boolean;
};

/**
 * A live reading, with the date it was struck where the source gives one. A bare
 * number is accepted too, for a source that does not say when.
 *
 * The date is printed with the rate. On 03/10/2026 an external review read the
 * page's 5.28% "US 10-year" as the 30-year, off an undated quote of its own; the
 * figure was the 10-year exactly (the 30-year was 5.63%), but the page gave no
 * way to check, because nothing said what day it was from.
 */
export type Observation = number | { rate: number; asOf: string | null } | null;

function unpack(o: Observation | undefined): { rate: number | null; asOf: string | null } {
  if (o === null || o === undefined) return { rate: null, asOf: null };
  if (typeof o === 'number') return { rate: o, asOf: null };
  return { rate: o.rate, asOf: o.asOf };
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** RBA writes 22-Jul-2026; the page uses ISO, like every other date on it. */
function rbaDateToIso(cell: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(cell);
  const mm = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

function splitCsvLine(line: string): string[] {
  // F2 quotes some descriptive cells but never embeds a comma in a numeric one,
  // so a simple split plus quote-strip is sufficient and avoids a CSV dependency.
  return line.split(',').map((c) => c.replace(/^﻿/, '').replace(/"/g, '').trim());
}

/**
 * Extracts the latest Australian Government 10-year yield as a decimal.
 * Returns null when the series or any usable observation is missing.
 */
export function parseRbaF2(csv: string): number | null {
  return parseRbaF2Dated(csv)?.rate ?? null;
}

/** The same reading, with the date of the row it came from. */
export function parseRbaF2Dated(csv: string): { rate: number; asOf: string | null } | null {
  const lines = csv.split(/\r?\n/);

  const seriesRow = lines.find((l) => l.includes(RBA_TEN_YEAR_SERIES_ID));
  if (!seriesRow) return null;
  const column = splitCsvLine(seriesRow).indexOf(RBA_TEN_YEAR_SERIES_ID);
  if (column < 1) return null;

  // Walk backwards to the most recent dated row carrying a value in that column.
  for (let i = lines.length - 1; i >= 0; i--) {
    const cells = splitCsvLine(lines[i]);
    if (!/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(cells[0])) continue;
    const raw = cells[column];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return { rate: value / 100, asOf: rbaDateToIso(cells[0]) };
  }
  return null;
}

export async function fetchRbaTenYear(): Promise<Observation> {
  try {
    const res = await fetch(RBA_F2_URL, { next: { revalidate: 86400 } } as RequestInit);
    if (!res.ok) return null;
    return parseRbaF2Dated(await res.text());
  } catch {
    return null;
  }
}

export type RiskFreeDeps = {
  fetchUsTenYear: () => Promise<Observation>;
  fetchRbaTenYear: () => Promise<Observation>;
};

const LIVE_DEPS: RiskFreeDeps = { fetchUsTenYear: yahooUsTenYear, fetchRbaTenYear };

function plausible(rate: number | null): boolean {
  return rate !== null && Number.isFinite(rate) && rate >= PLAUSIBLE_RATE.min && rate <= PLAUSIBLE_RATE.max;
}

export async function resolveRiskFree(ticker: string, deps: RiskFreeDeps = LIVE_DEPS): Promise<RiskFree> {
  const market = marketFor(ticker);

  if (market.riskFreeSource === 'yahoo-tnx') {
    const { rate, asOf } = unpack(await deps.fetchUsTenYear());
    if (plausible(rate)) {
      return {
        rate: rate as number,
        source: `US 10-year Treasury (^TNX)${asOf ? `, ${asOf}` : ''}`,
        assumed: false,
      };
    }
  }
  if (market.riskFreeSource === 'rba') {
    const { rate, asOf } = unpack(await deps.fetchRbaTenYear());
    if (plausible(rate)) {
      return {
        rate: rate as number,
        source: `Australian Government 10-year (RBA F2)${asOf ? `, ${asOf}` : ''}`,
        assumed: false,
      };
    }
  }

  return {
    rate: market.defaultRiskFreeRate,
    source: `${market.currency} assumption - no free live source available for this market`,
    assumed: true,
  };
}
