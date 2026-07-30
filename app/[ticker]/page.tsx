import Link from 'next/link';
import { Suspense } from 'react';
import { AssumptionPanel } from '../components/AssumptionPanel';
import { FlagList } from '../components/FlagList';
import { ForecastTable } from '../components/ForecastTable';
import { Headline } from '../components/Headline';
import { ImpliedPanel } from '../components/ImpliedPanel';
import { SensitivityTable } from '../components/SensitivityTable';
import { TerminalComparison } from '../components/TerminalComparison';
import { ValueBar } from '../components/ValueBar';
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
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-2xl font-semibold text-white">
          Cannot model {decodeURIComponent(ticker)}
        </h1>
        <p className="mt-3 text-[var(--text-dim)]">
          {error instanceof Error ? error.message : 'Something went wrong.'}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline"
        >
          Search for another company
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
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-10">
      <Headline v={valuation} />

      {valuation.flags.length > 0 && <FlagList flags={valuation.flags} />}
      {valuation.notes.length > 0 && (
        <div className="space-y-1">
          {valuation.notes.map((note) => (
            <p key={note} className="text-sm text-[var(--text-faint)]">
              {note}
            </p>
          ))}
        </div>
      )}

      <ValueBar v={valuation} />

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
      <ImpliedPanel implied={valuation.implied} assumptions={valuation.assumptions} />

      <p className="border-t border-[var(--border)] pt-6 text-sm leading-relaxed text-[var(--text-faint)]">
        A DCF tells you what a set of assumptions is worth, not what a share is worth. Change the
        assumptions and the answer changes - that is the point of showing them. Figures come from
        Yahoo Finance and the RBA and can be wrong or out of date.{' '}
        <Link
          href="/methodology"
          className="text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline"
        >
          How this is built
        </Link>
        .
      </p>
    </main>
  );
}
