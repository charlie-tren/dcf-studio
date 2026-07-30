import { perShare, signedPct } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function Headline({ v }: { v: Valuation }) {
  const currency = v.fundamentals.quoteCurrency;
  const positive = v.upside >= 0;

  return (
    <header>
      <p className="text-sm text-neutral-500">
        {v.fundamentals.ticker} · {v.fundamentals.exchange}
        {v.fundamentals.sector ? ` · ${v.fundamentals.sector}` : ''}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{v.fundamentals.name}</h1>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div>
          <p className="text-sm text-neutral-500">Implied value per share</p>
          <p className="text-4xl font-semibold tabular-nums">{perShare(v.valuePerShareQuoted, currency)}</p>
        </div>
        <div>
          <p className="text-sm text-neutral-500">Market price</p>
          <p className="text-2xl tabular-nums">{perShare(v.fundamentals.price, currency)}</p>
        </div>
        <div>
          <p className="text-sm text-neutral-500">Implied upside</p>
          <p className={`text-2xl font-medium tabular-nums ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
            {signedPct(v.upside)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-500">
        Gordon growth terminal value, {v.assumptions.horizonYears}-year explicit forecast,{' '}
        {v.assumptions.midYearConvention ? 'mid-year' : 'year-end'} discounting. Scenario:{' '}
        {v.scenario}
        {v.modified ? ' (modified)' : ''}.
        {v.fxRate !== 1
          ? ` Converted from ${v.fundamentals.reportingCurrency} at ${v.fxRate.toFixed(4)}.`
          : ''}
      </p>
    </header>
  );
}
