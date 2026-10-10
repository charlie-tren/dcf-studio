import { unstable_cache } from 'next/cache';
import { decodeState } from '@/lib/urlstate';
import { buildValuation } from '@/lib/valuation';
import { buildBankWorkbook, buildWorkbook } from '@/lib/workbook';
import { fetchFxRate, fetchTicker } from '@/lib/yahoo';
import { resolveRiskFree } from '@/lib/riskfree';

const cachedFetchTicker = unstable_cache(
  async (ticker: string) => fetchTicker(ticker),
  ['yahoo-ticker'],
  { revalidate: 86400 }
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.trim().toUpperCase();
  if (!ticker) {
    return new Response('A ticker is required.', { status: 400 });
  }

  const state = decodeState(url.searchParams.toString());

  try {
    const valuation = await buildValuation(
      ticker,
      { scenario: state.scenario, horizonYears: state.horizonYears, overrides: state.overrides },
      { fetchTicker: cachedFetchTicker, fetchFxRate, resolveRiskFree: (t) => resolveRiskFree(t) }
    );
    const buffer = valuation.excessReturns
      ? await buildBankWorkbook(valuation)
      : await buildWorkbook(valuation);
    const filename = `${ticker.replace(/[^A-Z0-9.]/gi, '')}-dcf.xlsx`;

    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed.';
    return new Response(message, { status: 422 });
  }
}
