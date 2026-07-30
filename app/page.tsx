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
      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        What is a company
        <br />
        actually worth?
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-dim)]">
        Type a name. You get a discounted cashflow model built from that company&apos;s own reported
        numbers, with every assumption exposed and every line traceable back to the figure it came
        from.
      </p>

      <div className="mt-10">
        <Suspense fallback={null}>
          <TickerSearch />
        </Suspense>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--text-faint)]">Try</span>
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

      <div className="mt-16 grid gap-6 border-t border-[var(--border)] pt-8 sm:grid-cols-3">
        {[
          {
            h: 'Nothing hidden',
            p: 'The cashflow build, the discount rate and the bridge to equity value are all on the page. Change any input and watch it move.',
          },
          {
            h: 'It says when it is wrong',
            p: 'A DCF misprices banks, and reported capex misleads for property trusts. The model flags those cases instead of quietly producing a number.',
          },
          {
            h: 'Free data',
            p: 'Statements and prices from Yahoo Finance, Australian rates from the RBA. Four to five years of history, which is the real limit here.',
          },
        ].map((c) => (
          <div key={c.h}>
            <h2 className="text-sm font-medium text-[var(--text)]">{c.h}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-faint)]">{c.p}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-[var(--text-faint)]">
        <Link href="/methodology" className="text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline">
          How the numbers are put together
        </Link>
      </p>
    </main>
  );
}
