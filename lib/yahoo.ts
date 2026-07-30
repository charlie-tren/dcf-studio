import YahooFinance from 'yahoo-finance2';

// v4 requires instantiation. The v2 default-export-as-object pattern throws.
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export type RawStatementRow = Record<string, unknown> & { date?: unknown; periodType?: string };

export type RawTicker = {
  /** Merged annual rows from all three statement modules, newest first. */
  statements: RawStatementRow[];
  quote: {
    price?: Record<string, unknown>;
    defaultKeyStatistics?: Record<string, unknown>;
    summaryProfile?: Record<string, unknown>;
    financialData?: Record<string, unknown>;
    earningsTrend?: Record<string, unknown>;
  };
};

const STATEMENT_MODULES = ['financials', 'cash-flow', 'balance-sheet'] as const;

/**
 * Coerces a period end date to a sortable YYYY-MM-DD string.
 *
 * Yahoo returns a live Date object here. String(date) on a Date gives
 * "Mon Jun 30 2025 ..." which sorts by DAY NAME, not chronologically - so a
 * naive sort silently picks the wrong latest year, and that year drives base
 * revenue, net debt and the share count. Normalising to ISO at the boundary
 * also means the recorded fixtures and the live path sort identically.
 */
function periodKey(date: unknown): string {
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  const parsed = new Date(String(date));
  return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toISOString().slice(0, 10);
}

/**
 * quoteSummary's statement submodules have returned almost nothing since
 * Nov 2024 - the library itself warns about it. fundamentalsTimeSeries is the
 * only working source for statements.
 */
export async function fetchTicker(ticker: string): Promise<RawTicker> {
  const perModule = await Promise.all(
    STATEMENT_MODULES.map((module) =>
      yf
        .fundamentalsTimeSeries(ticker, { period1: '2015-01-01', module, type: 'annual' })
        .catch(() => [] as RawStatementRow[])
    )
  );

  // Merge the three modules on period end date, newest first.
  const byDate = new Map<string, RawStatementRow>();
  for (const rows of perModule) {
    for (const row of rows as RawStatementRow[]) {
      const key = periodKey(row.date);
      byDate.set(key, { ...(byDate.get(key) ?? {}), ...row, date: key });
    }
  }
  const statements = [...byDate.values()].sort((a, b) => periodKey(b.date).localeCompare(periodKey(a.date)));

  const quote = await yf.quoteSummary(ticker, {
    modules: ['price', 'defaultKeyStatistics', 'summaryProfile', 'financialData', 'earningsTrend'],
  });

  return { statements, quote: quote as RawTicker['quote'] };
}

export type SearchHit = { symbol: string; name: string; exchange: string };

export async function searchTickers(query: string): Promise<SearchHit[]> {
  // The default of 5 quotes is not enough: a search for "woolworths" spends all
  // five on Frankfurt, Hamburg, Johannesburg and Chi-X lines and never returns
  // WOW.AX at all. Ask for more so the primary listing is in the set to rank.
  const res = await yf.search(query, { quotesCount: 25, newsCount: 0 });
  return (res.quotes ?? [])
    .filter((q) => {
      const r = q as Record<string, unknown>;
      return r.quoteType === 'EQUITY' && typeof r.symbol === 'string';
    })
    .map((q) => {
      const r = q as Record<string, unknown>;
      return {
        symbol: String(r.symbol),
        name: String(r.shortname ?? r.longname ?? r.symbol),
        exchange: String(r.exchange ?? ''),
      };
    });
}

/** Spot FX. Returns null when the pair cannot be resolved. */
export async function fetchFxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const q = await yf.quote(`${from}${to}=X`);
    const price = (q as { regularMarketPrice?: number }).regularMarketPrice;
    return typeof price === 'number' ? price : null;
  } catch {
    return null;
  }
}

/** US 10-year Treasury yield as a decimal. ^TNX quotes in percent. */
export async function fetchUsTenYear(): Promise<number | null> {
  try {
    const q = await yf.quote('^TNX');
    const price = (q as { regularMarketPrice?: number }).regularMarketPrice;
    return typeof price === 'number' ? price / 100 : null;
  } catch {
    return null;
  }
}
