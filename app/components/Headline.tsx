import { perShare, signedPct } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function Headline({ v }: { v: Valuation }) {
  const currency = v.fundamentals.quoteCurrency;
  const positive = v.upside >= 0;

  return (
    <header>
      <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">
        {v.fundamentals.ticker} · {v.fundamentals.exchange}
        {v.fundamentals.sector ? ` · ${v.fundamentals.sector}` : ''}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
        {v.fundamentals.name}
      </h1>

      <div className="mt-7 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">
            Implied value per share
          </p>
          <p className="nums mt-1 text-5xl font-semibold text-[var(--accent)]">
            {perShare(v.valuePerShareQuoted, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs tracking-wide text-[var(--text-faint)] uppercase">Market price</p>
          <p className="nums mt-1 text-2xl text-[var(--text)]">
            {perShare(v.fundamentals.price, currency)}
          </p>
        </div>
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
      </div>

      <p className="mt-5 text-sm text-[var(--text-dim)]">
        {v.assumptions.horizonYears}-year forecast, Gordon growth terminal value,{' '}
        {v.assumptions.midYearConvention ? 'mid-year' : 'year-end'} discounting.{' '}
        <span className="text-[var(--text-faint)]">
          {v.scenario.charAt(0).toUpperCase() + v.scenario.slice(1)} case
          {v.modified ? ', edited' : ''}.
          {v.fxRate !== 1
            ? ` Built in ${v.fundamentals.reportingCurrency}, converted at ${v.fxRate.toFixed(4)}.`
            : ''}
        </span>
      </p>
    </header>
  );
}
