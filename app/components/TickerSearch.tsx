'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Hit = { symbol: string; name: string; exchange: string };

export function TickerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setHits(data.hits ?? []);
      } finally {
        setLoading(false);
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
