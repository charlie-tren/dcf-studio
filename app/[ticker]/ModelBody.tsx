import Link from 'next/link';
import { AssumptionPanel } from '../components/AssumptionPanel';
import { ExcessReturnsPanel } from '../components/ExcessReturnsPanel';
import { ExportButton } from '../components/ExportButton';
import { FlagList } from '../components/FlagList';
import { ForecastTable } from '../components/ForecastTable';
import { Headline } from '../components/Headline';
import { ImpliedPanel } from '../components/ImpliedPanel';
import { SensitivityTable } from '../components/SensitivityTable';
import { TerminalComparison } from '../components/TerminalComparison';
import { ValueBar } from '../components/ValueBar';
import { WaccTable } from '../components/WaccTable';
import { priceInReportingCurrency } from '@/lib/fx';
import type { Valuation } from '@/lib/valuation';

export function ModelError({ ticker, message }: { ticker: string; message: string }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-2xl font-semibold text-white">Cannot model {ticker}</h1>
      <p className="mt-3 text-[var(--text-dim)]">{message}</p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline"
      >
        Search for another company
      </Link>
    </main>
  );
}

export function ModelBody({ valuation, asOf = null }: { valuation: Valuation; asOf?: string | null }) {
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
      {asOf && <p className="text-sm text-[var(--text-faint)]">Yahoo data as at {asOf}.</p>}

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

        <AssumptionPanel
          assumptions={valuation.assumptions}
          scenario={valuation.scenario}
          modified={valuation.modified}
        />

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
        <ImpliedPanel
          implied={valuation.implied}
          assumptions={valuation.assumptions}
          delivered={valuation.delivered}
        />
        </>
      )}

      <div className="border-t border-[var(--border)] pt-6">
        <ExportButton valuation={valuation} />
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
