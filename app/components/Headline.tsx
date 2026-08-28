import { AlsoOn } from './AlsoOn';
import { perShare, signedPct } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function Headline({ v }: { v: Valuation }) {
  const currency = v.fundamentals.quoteCurrency;
  const positive = v.upside >= 0;
  /**
   * Where terminal growth is at or above the WACC the perpetuity cannot
   * converge, so the engine returns a terminal value of nil. What is left is
   * the present value of five years' cashflow less net debt, which is a real
   * quantity but not a valuation - Toyota's read "3,027.73 per share, -198.62%"
   * in bold while the model was refusing to answer. TerminalComparison already
   * shows the refusal in place of its number; these two never got the memo.
   */
  const blocked = v.dcf.gordon.terminal.blocked;

  return (
    <header>
      <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">
        {v.fundamentals.ticker} · {v.fundamentals.exchange}
        {v.fundamentals.sector ? ` · ${v.fundamentals.sector}` : ''}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
        {v.fundamentals.name}
      </h1>
      <AlsoOn ticker={v.fundamentals.ticker} />

      <div className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">
            Implied value per share
          </p>
          {blocked ? (
            <p className="mt-1 text-3xl font-semibold text-[var(--text-dim)]">
              No perpetuity value
            </p>
          ) : (
            <p className="nums mt-1 text-5xl font-semibold text-[var(--accent)]">
              {perShare(v.valuePerShareQuoted, currency)}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">Market price</p>
          <p className="nums mt-1 text-2xl text-[var(--text)]">
            {perShare(v.fundamentals.price, currency)}
          </p>
        </div>
        {/* No upside block at all when there is nothing to compare: a dash in
            the slot still reads as a measurement that came out empty. The flag
            directly below says why, so this does not repeat it. */}
        {!blocked && (
          <div>
            <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">
              Implied upside
            </p>
            <p
              className={`nums mt-1 text-2xl font-medium ${
                positive ? 'text-[var(--accent)]' : 'text-[var(--negative)]'
              }`}
            >
              {signedPct(v.upside)}
            </p>
          </div>
        )}
      </div>

      <p className="mt-5 text-sm text-[var(--text-dim)]">
        {v.assumptions.horizonYears}-year forecast · Perpetuity growth terminal value ·{' '}
        {v.assumptions.midYearConvention ? 'Mid-year' : 'Year-end'} discounting ·{' '}
        <span className="text-[var(--text-faint)]">
          {v.scenario.charAt(0).toUpperCase() + v.scenario.slice(1)} case
          {v.modified ? ', edited' : ''}
          {v.fxRate !== 1
            ? ` · ${v.fundamentals.reportingCurrency} model at ${v.fxRate.toFixed(4)}`
            : ''}
        </span>
      </p>
    </header>
  );
}
