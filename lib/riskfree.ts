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
    if (Number.isFinite(value)) return value / 100;
  }
  return null;
}

export async function fetchRbaTenYear(): Promise<number | null> {
  try {
    const res = await fetch(RBA_F2_URL, { next: { revalidate: 86400 } } as RequestInit);
    if (!res.ok) return null;
    return parseRbaF2(await res.text());
  } catch {
    return null;
  }
}

export type RiskFreeDeps = {
  fetchUsTenYear: () => Promise<number | null>;
  fetchRbaTenYear: () => Promise<number | null>;
};

const LIVE_DEPS: RiskFreeDeps = { fetchUsTenYear: yahooUsTenYear, fetchRbaTenYear };

function plausible(rate: number | null): boolean {
  return rate !== null && Number.isFinite(rate) && rate >= PLAUSIBLE_RATE.min && rate <= PLAUSIBLE_RATE.max;
}

export async function resolveRiskFree(ticker: string, deps: RiskFreeDeps = LIVE_DEPS): Promise<RiskFree> {
  const market = marketFor(ticker);

  if (market.riskFreeSource === 'yahoo-tnx') {
    const rate = await deps.fetchUsTenYear();
    if (plausible(rate)) {
      return { rate: rate as number, source: 'US 10-year Treasury (^TNX)', assumed: false };
    }
  }
  if (market.riskFreeSource === 'rba') {
    const rate = await deps.fetchRbaTenYear();
    if (plausible(rate)) {
      return { rate: rate as number, source: 'Australian Government 10-year (RBA F2)', assumed: false };
    }
  }

  return {
    rate: market.defaultRiskFreeRate,
    source: `${market.currency} assumption - no free live source available for this market`,
    assumed: true,
  };
}
