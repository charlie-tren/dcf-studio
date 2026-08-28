'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Hit = { symbol: string; name: string; exchange: string };

/**
 * `compact` is the header variant, used on a company page so a reader can look up
 * another company without going back to the landing page first. Same behaviour, a
 * smaller field, and the results float over the page rather than pushing it down -
 * in the header there is nothing below to push.
 */
export function TickerSearch({ compact = false }: { compact?: boolean } = {}) {
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
    <div className={compact ? 'relative w-full sm:w-72' : 'w-full max-w-xl'}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={compact ? 'Another company' : 'Company name or ticker - BHP, Microsoft, Wesfarmers'}
        className={
          compact
            ? 'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]'
            : 'w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3.5 text-lg text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]'
        }
        aria-label="Company name or ticker"
      />
      {loading && !compact && <p className="mt-2 text-sm text-[var(--text-faint)]">Searching…</p>}
      {!loading && !compact && query.trim().length >= 2 && hits.length === 0 && (
        <p className="mt-2 text-sm text-[var(--text-faint)]">Nothing found. Try a ticker, or a fuller name.</p>
      )}
      <ul
        className={
          compact
            ? 'absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg,#0b0d10)] shadow-xl empty:border-0 empty:shadow-none'
            : 'mt-2 overflow-hidden rounded-lg border border-[var(--border)] empty:border-0'
        }
      >
        {hits.map((hit) => (
          <li key={hit.symbol}>
            <button
              onClick={() => {
                setQuery('');
                setHits([]);
                router.push(`/${encodeURIComponent(hit.symbol)}`);
              }}
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
