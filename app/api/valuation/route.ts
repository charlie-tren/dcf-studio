import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { decodeState } from '@/lib/urlstate';
import { buildValuation } from '@/lib/valuation';
import { fetchFxRate, fetchTicker } from '@/lib/yahoo';
import { resolveRiskFree } from '@/lib/riskfree';

/**
 * Fundamentals change quarterly, so cache them hard. The cache wraps the FETCH
 * rather than the valuation, so changing an assumption never refetches Yahoo.
 */
const cachedFetchTicker = unstable_cache(
  async (ticker: string) => fetchTicker(ticker),
  ['yahoo-ticker'],
  { revalidate: 86400 }
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: 'A ticker is required.' }, { status: 400 });

  const state = decodeState(url.searchParams.toString());

  try {
    const valuation = await buildValuation(
      ticker,
      { scenario: state.scenario, horizonYears: state.horizonYears, overrides: state.overrides },
      { fetchTicker: cachedFetchTicker, fetchFxRate, resolveRiskFree: (t) => resolveRiskFree(t) }
    );
    return NextResponse.json(valuation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Valuation failed.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
