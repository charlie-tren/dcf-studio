import { Suspense } from 'react';
import type { Metadata } from 'next';
import { resolveRiskFree } from '@/lib/riskfree';
import { recordingDeps, type Snapshot } from '@/lib/snapshot';
import { defaults } from '@/lib/urlstate';
import { buildValuation, type Valuation } from '@/lib/valuation';
import { fetchFxRate, fetchTicker } from '@/lib/yahoo';
import { ModelBody } from './ModelBody';
import { ModelLoading, TickerView } from './TickerView';

/* Built ahead: Crosscheck's universe plus the landing page's examples. Any other
   ticker is served by the Worker's shell and modelled in the browser. */
const UNIVERSE = 'https://charlietrenorden.com/crosscheck/tickers.json';
const EXAMPLES = ['GOOGL', 'BHP.AX', 'SHEL.L', 'ARB.AX'];

export const dynamicParams = false;

export async function generateStaticParams() {
  const res = await fetch(UNIVERSE, { headers: { 'User-Agent': 'dcf-studio-build' } });
  if (!res.ok) throw new Error(`${UNIVERSE} answered ${res.status}`);
  const manifest = (await res.json()) as { tickers: (string | { symbol?: string; ticker?: string })[] };
  const tickers = new Set(EXAMPLES);
  for (const t of manifest.tickers) {
    const symbol = typeof t === 'string' ? t : (t.symbol ?? t.ticker);
    if (symbol) tickers.add(symbol.toUpperCase());
  }
  return [...tickers].map((ticker) => ({ ticker }));
}

type Props = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  const description = `Discounted cashflow valuation of ${symbol}, with every assumption and intermediate line visible.`;
  return {
    title: `${symbol} - DCF Studio`,
    description,
    /* Every assumption this page takes lives in the query string, so one company
       has an unbounded number of URLs and each shared permutation would index as
       its own page. They all canonicalise to the bare ticker. */
    alternates: { canonical: `/${symbol}` },
    /* Stated in full rather than inherited: Next replaces the parent openGraph
       object wholesale, so naming title and description without the image would
       drop the card and leave twitter:card reserving an empty slot. */
    openGraph: {
      type: "website",
      siteName: "DCF Studio",
      title: `${symbol} - DCF Studio`,
      description,
      url: `/${symbol}`,
      images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "DCF Studio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${symbol} - DCF Studio`,
      description,
      images: ["/og-card.png"],
    },
  };
}

export default async function ModelPage({ params }: Props) {
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();

  let snapshot: Snapshot | null = null;
  let initial: Valuation | null = null;
  try {
    const rec = recordingDeps({ fetchTicker, fetchFxRate, resolveRiskFree: (t) => resolveRiskFree(t) });
    initial = await buildValuation(ticker, defaults(), rec.deps);
    snapshot = rec.snapshot();
  } catch {
    // Left to the browser, which shows the same error the server used to if it still fails.
  }

  return (
    <Suspense fallback={initial ? <ModelBody valuation={initial} /> : <ModelLoading ticker={ticker} />}>
      <TickerView
        ticker={ticker}
        snapshot={snapshot}
        initial={initial}
        builtOn={new Date().toISOString().slice(0, 10)}
      />
    </Suspense>
  );
}
