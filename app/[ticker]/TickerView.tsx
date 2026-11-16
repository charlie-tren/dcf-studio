'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { parseRbaF2Dated, resolveRiskFree } from '@/lib/riskfree';
import { recordingDeps, replayDeps, type Snapshot } from '@/lib/snapshot';
import { decodeState, defaults } from '@/lib/urlstate';
import { buildValuation, type Valuation, type ValuationDeps } from '@/lib/valuation';
import { browserYahoo } from '@/lib/yahooBrowser';
import { ModelBody, ModelError } from './ModelBody';

async function rbaTenYear() {
  try {
    const res = await fetch('/api/rba-f2');
    return res.ok ? parseRbaF2Dated(await res.text()) : null;
  } catch {
    return null;
  }
}

function liveDeps(): ValuationDeps {
  const yahoo = browserYahoo();
  return {
    fetchTicker: yahoo.fetchTicker,
    fetchFxRate: yahoo.fetchFxRate,
    resolveRiskFree: (t) => resolveRiskFree(t, { fetchUsTenYear: yahoo.fetchUsTenYear, fetchRbaTenYear: rbaTenYear }),
  };
}

/** Ticker from the address bar, for the shell that serves companies not built ahead. */
function tickerFromPath(): string {
  return decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, '')).toUpperCase();
}

const neverChanges = () => () => {};

/**
 * The build's snapshot renders first; the browser then pulls current data through
 * /api/yf and reprices. Assumptions live in the query string and rerun locally.
 */
export function TickerView({
  ticker: builtTicker,
  snapshot,
  initial,
  builtOn,
}: {
  ticker: string | null;
  snapshot: Snapshot | null;
  initial: Valuation | null;
  builtOn: string | null;
}) {
  const query = useSearchParams().toString();
  const pathTicker = useSyncExternalStore(neverChanges, tickerFromPath, () => null);
  const ticker = builtTicker ?? pathTicker;
  const [live, setLive] = useState<Snapshot | null>(null);
  const [valuation, setValuation] = useState<Valuation | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);

  // After the model lands, so the shell's own metadata title has already been applied.
  useEffect(() => {
    if (!builtTicker && ticker && (valuation || error)) document.title = `${ticker} - DCF Studio`;
  }, [builtTicker, ticker, valuation, error]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    const rec = recordingDeps(liveDeps());
    buildValuation(ticker, defaults(), rec.deps).then(
      () => !cancelled && setLive(rec.snapshot()),
      (e) => {
        if (cancelled) return;
        if (snapshot) setLiveFailed(true);
        else setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [ticker, snapshot]);

  useEffect(() => {
    const source = live ?? snapshot;
    if (!source || !ticker) return;
    const state = decodeState(query);
    let cancelled = false;
    buildValuation(
      ticker,
      { scenario: state.scenario, horizonYears: state.horizonYears, overrides: state.overrides },
      replayDeps(source, live ? undefined : liveDeps())
    ).then(
      (v) => !cancelled && setValuation(v),
      (e) => !cancelled && setError(e instanceof Error ? e.message : 'Something went wrong.')
    );
    return () => {
      cancelled = true;
    };
  }, [live, snapshot, ticker, query]);

  if (error && !valuation) return <ModelError ticker={ticker ?? ''} message={error} />;
  if (!valuation) return <ModelLoading ticker={ticker} />;
  return <ModelBody valuation={valuation} asOf={liveFailed ? builtOn : null} />;
}

export function ModelLoading({ ticker }: { ticker: string | null }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-sm text-[var(--text-faint)]">{ticker ? `Modelling ${ticker}…` : 'Modelling…'}</p>
    </main>
  );
}
