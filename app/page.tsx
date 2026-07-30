import Link from 'next/link';
import { Suspense } from 'react';
import { TickerSearch } from './components/TickerSearch';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">DCF Studio</h1>
      <p className="mt-3 max-w-xl text-neutral-600">
        Type a company. Get a discounted cashflow valuation built from its own reported numbers, with
        every assumption on the surface and every line traceable back to the field it came from.
      </p>
      <div className="mt-8">
        <Suspense fallback={null}>
          <TickerSearch />
        </Suspense>
      </div>
      <p className="mt-12 text-sm text-neutral-500">
        General information only, not financial advice. Data from Yahoo Finance and the Reserve Bank
        of Australia; figures may be stale or wrong. Not affiliated with Yahoo.{' '}
        <Link href="/methodology" className="underline">
          How it works
        </Link>
        .
      </p>
    </main>
  );
}
