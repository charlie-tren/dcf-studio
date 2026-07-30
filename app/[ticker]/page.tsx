import Link from 'next/link';
import { Suspense } from 'react';
import { AssumptionPanel } from '../components/AssumptionPanel';
import { FlagList } from '../components/FlagList';
import { ForecastTable } from '../components/ForecastTable';
import { Headline } from '../components/Headline';
import { SensitivityTable } from '../components/SensitivityTable';
import { TerminalComparison } from '../components/TerminalComparison';
import { WaccTable } from '../components/WaccTable';
import { priceInReportingCurrency } from '@/lib/fx';
import { decodeState } from '@/lib/urlstate';
import { buildValuation, type Valuation } from '@/lib/valuation';

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  return {
    title: `${symbol} - DCF Studio`,
    description: `Discounted cashflow valuation of ${symbol}, with every assumption and intermediate line visible.`,
  };
}

export default async function ModelPage({ params, searchParams }: Props) {
  const { ticker } = await params;
  const raw = await searchParams;

  const query = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : []))
  ).toString();
  const state = decodeState(query);

  let valuation: Valuation;
  try {
    valuation = await buildValuation(decodeURIComponent(ticker), {
      scenario: state.scenario,
      horizonYears: state.horizonYears,
      overrides: state.overrides,
    });
  } catch (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Cannot model {decodeURIComponent(ticker)}</h1>
        <p className="mt-3 text-neutral-600">
          {error instanceof Error ? error.message : 'Something went wrong.'}
        </p>
        <Link href="/" className="mt-6 inline-block underline">
          Try another company
        </Link>
      </main>
    );
  }

  const reportingCurrency = valuation.fundamentals.reportingCurrency;

  // The sensitivity grid holds reporting-currency values, so bring the quoted
  // price back into reporting terms before comparing them.
  const priceInReporting = priceInReportingCurrency(valuation.fundamentals.price, {
    reportingCurrency,
    quoteCurrency: valuation.fundamentals.quoteCurrency,
    fxRate: valuation.fxRate,
  });

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <Link href="/" className="text-sm underline">
        New search
      </Link>

      <Headline v={valuation} />
      <FlagList flags={valuation.flags} />
      {valuation.notes.map((note) => (
        <p key={note} className="text-sm text-neutral-600">
          {note}
        </p>
      ))}

      <Suspense fallback={null}>
        <AssumptionPanel
          assumptions={valuation.assumptions}
          scenario={valuation.scenario}
          modified={valuation.modified}
        />
      </Suspense>

      <ForecastTable dcf={valuation.dcf} currency={reportingCurrency} />
      <WaccTable w={valuation.wacc} currency={reportingCurrency} />
      <TerminalComparison v={valuation} />
      <SensitivityTable
        grid={valuation.sensitivity}
        currency={reportingCurrency}
        centrePrice={priceInReporting}
      />

      <p className="border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        General information only, not financial advice. This is what these assumptions imply, not
        what the share is worth. Data from Yahoo Finance and the Reserve Bank of Australia, and may
        be stale or wrong.{' '}
        <Link href="/methodology" className="underline">
          Methodology
        </Link>
        .
      </p>
    </main>
  );
}
