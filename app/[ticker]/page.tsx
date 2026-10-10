import Link from 'next/link';
import { Suspense } from 'react';
import { AssumptionPanel } from '../components/AssumptionPanel';
import { FlagList } from '../components/FlagList';
import { ExcessReturnsPanel } from '../components/ExcessReturnsPanel';
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
  const description = `Discounted cashflow valuation of ${symbol}, with every assumption and intermediate line visible.`;
  return {
    title: `${symbol} - DCF Studio`,
    description,
    /* Every assumption this page takes lives in the query string, so one company
       has an unbounded number of URLs and each shared permutation would index as
       its own page. They all canonicalise to the bare ticker. */
    alternates: { canonical: `/${symbol}` },
    /* Stated in full rather than inherited: Next replaces the parent openGraph
       object wholesale, so naming title and description without the image would
       drop the card and leave twitter:card reserving an empty slot. */
    openGraph: {
      type: "website",
      siteName: "DCF Studio",
      title: `${symbol} - DCF Studio`,
      description,
      url: `/${symbol}`,
      images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "DCF Studio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${symbol} - DCF Studio`,
      description,
      images: ["/og-card.png"],
    },
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

  const exportQuery = new URLSearchParams(query);
  exportQuery.set('ticker', decodeURIComponent(ticker));

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

      {valuation.excessReturns ? (
        <>
          <ExcessReturnsPanel
            er={valuation.excessReturns}
            currency={reportingCurrency}
            yearLabels={valuation.forecastYearLabels}
          />
          <WaccTable w={valuation.wacc} currency={reportingCurrency} equityOnly />
        </>
      ) : (
        <>
        <ValueBar v={valuation} />

        <Suspense fallback={null}>
          <AssumptionPanel
            assumptions={valuation.assumptions}
            scenario={valuation.scenario}
            modified={valuation.modified}
          />
        </Suspense>

        <ForecastTable
          dcf={valuation.dcf}
          currency={reportingCurrency}
          yearLabels={valuation.forecastYearLabels}
        />
        <WaccTable w={valuation.wacc} currency={reportingCurrency} />
        <TerminalComparison v={valuation} />
        <SensitivityTable
          grid={valuation.sensitivity}
          currency={reportingCurrency}
          centrePrice={priceInReporting}
        />
        <ImpliedPanel implied={valuation.implied} assumptions={valuation.assumptions} />
        </>
      )}

      <div className="border-t border-[var(--border)] pt-6">
        <a
          href={`/api/export?${exportQuery.toString()}`}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
        >
          Download as Excel
          <span aria-hidden="true">↓</span>
        </a>
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          Live formulas, not pasted numbers - edit a driver and the workbook reprices.
        </p>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-faint)]">
        Yahoo Finance and RBA data. General information, not advice.{' '}
        <Link
          href="/methodology"
          className="text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline"
        >
          Methodology
        </Link>
        .
      </p>
    </main>
  );
}
