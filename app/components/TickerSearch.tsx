'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Hit = { symbol: string; name: string; exchange: string };

export function TickerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      // Deferred so the effect body never calls setState synchronously, which
      // triggers a cascading render.
      const clear = setTimeout(() => {
        setHits([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(clear);
    }

    const request = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        // Ignore a slow response that a newer keystroke has already superseded.
        if (request === latest.current) setHits(data.hits ?? []);
      } catch {
        if (request === latest.current) setHits([]);
      } finally {
        if (request === latest.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-full max-w-xl">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Company name or ticker - BHP, Microsoft, Wesfarmers"
        className="w-full rounded border border-neutral-300 px-4 py-3 text-lg outline-none focus:border-neutral-900"
        aria-label="Company name or ticker"
      />
      {loading && <p className="mt-2 text-sm text-neutral-500">Searching...</p>}
      {!loading && query.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-sm text-neutral-500">No matches. Try a ticker, or a fuller name.</p>
      )}
      <ul className="mt-2 divide-y divide-neutral-200">
        {hits.map((hit) => (
          <li key={hit.symbol}>
            <button
              onClick={() => router.push(`/${encodeURIComponent(hit.symbol)}`)}
              className="flex w-full items-baseline justify-between gap-4 px-1 py-3 text-left hover:bg-neutral-50"
            >
              <span className="font-medium">{hit.name}</span>
              <span className="text-sm text-neutral-500">
                {hit.symbol} · {hit.exchange}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
