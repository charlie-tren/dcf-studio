import Link from 'next/link';
import { Suspense } from 'react';
import { TickerSearch } from './components/TickerSearch';

const EXAMPLES = [
  { symbol: 'GOOGL', label: 'Alphabet' },
  { symbol: 'BHP.AX', label: 'BHP' },
  { symbol: 'SHEL.L', label: 'Shell' },
  { symbol: 'ARB.AX', label: 'ARB' },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight text-white">
        DCF on any listed company
      </h1>

      <div className="mt-10">
        <Suspense fallback={null}>
          <TickerSearch />
        </Suspense>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        {EXAMPLES.map((e) => (
          <Link
            key={e.symbol}
            href={`/${e.symbol}`}
            className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            {e.label}
          </Link>
        ))}
      </div>

      <dl className="mt-16 grid gap-6 border-t border-[var(--border)] pt-8 sm:grid-cols-3">
        {[
          {
            h: 'Coverage',
            p: 'ASX and US on live risk-free rates. LSE, Xetra, Euronext, HKEX, Tokyo, Toronto, SIX, NSE, Korea, NZX on documented assumptions.',
          },
          {
            h: 'Reverse DCF',
            p: 'Solves the price for implied growth, margin and discount rate, so the market’s expectations are on the page next to yours.',
          },
          {
            h: 'Known limits',
            p: 'Financials valued on excess returns over book. Four to five years of history. Terminal capex normalised to a steady state with growth charged at g/ROIC.',
          },
        ].map((c) => (
          <div key={c.h}>
            <dt className="text-sm font-medium text-[var(--text)]">{c.h}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-[var(--text-faint)]">{c.p}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-sm">
        <Link
          href="/methodology"
          className="text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline"
        >
          Methodology
        </Link>
      </p>
    </main>
  );
}
