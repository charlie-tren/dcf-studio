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
        className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3.5 text-lg text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        aria-label="Company name or ticker"
      />
      {loading && <p className="mt-2 text-sm text-[var(--text-faint)]">Searching…</p>}
      {!loading && query.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-sm text-[var(--text-faint)]">Nothing found. Try a ticker, or a fuller name.</p>
      )}
      <ul className="mt-2 overflow-hidden rounded-lg border border-[var(--border)] empty:border-0">
        {hits.map((hit) => (
          <li key={hit.symbol}>
            <button
              onClick={() => router.push(`/${encodeURIComponent(hit.symbol)}`)}
              className="flex w-full items-baseline justify-between gap-4 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--surface)]"
            >
              <span className="font-medium text-[var(--text)]">{hit.name}</span>
              <span className="nums text-sm text-[var(--text-faint)]">
                {hit.symbol} · {hit.exchange}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
