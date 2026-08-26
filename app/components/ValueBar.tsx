import { perShare, signedPct } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

/**
 * Where the two methods land against the market price. The spread between them
 * is the point: a wide spread means the answer is mostly assumption, and a
 * single headline number hides that.
 *
 * Laid out as labelled rows with proportional bars rather than points on a
 * shared axis. On the axis version the two model values sat almost on top of
 * each other in the left third of the chart while the price sat far right, so
 * the labels collided and the bar read as empty space.
 */
export function ValueBar({ v }: { v: Valuation }) {
  const ccy = v.fundamentals.quoteCurrency;
  const scaleToQuote =
    v.dcf.gordon.valuePerShare === 0 ? 1 : v.valuePerShareQuoted / v.dcf.gordon.valuePerShare;

  const rows = [
    {
      label: 'Perpetuity growth',
      value: v.valuePerShareQuoted,
      kind: 'model' as const,
    },
    {
      label: 'Exit multiple',
      value: v.dcf.exitMultiple.valuePerShare * scaleToQuote,
      kind: 'model' as const,
    },
    { label: 'Market price', value: v.fundamentals.price, kind: 'market' as const },
  ].filter((r) => Number.isFinite(r.value));

  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <h2 className="text-sm font-medium tracking-wide text-[var(--text-dim)] uppercase">
        Value Per Share
      </h2>

      <div className="mt-5 space-y-3.5">
        {rows.map((r) => {
          const isMarket = r.kind === 'market';
          const width = Math.max((Math.abs(r.value) / max) * 100, 1.5);
          const negative = r.value < 0;
          return (
            <div key={r.label} className="flex items-center gap-2 sm:gap-4">
              <span className="w-24 shrink-0 text-xs text-[var(--text-dim)] sm:w-36 sm:text-sm">
                {r.label}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-[var(--bg)]">
                <div
                  className={`h-full rounded-sm ${
                    isMarket
                      ? 'bg-[var(--border-strong)]'
                      : negative
                        ? 'bg-[var(--negative)] opacity-70'
                        : 'bg-[var(--accent)] opacity-80'
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span
                className={`nums w-20 shrink-0 text-right text-xs font-medium sm:w-28 sm:text-sm ${
                  isMarket
                    ? 'text-[var(--text)]'
                    : negative
                      ? 'text-[var(--negative)]'
                      : 'text-[var(--accent)]'
                }`}
              >
                {perShare(r.value, ccy)}
              </span>
              <span className="nums w-14 shrink-0 text-right text-[11px] text-[var(--text-faint)] sm:w-20 sm:text-xs">
                {isMarket
                  ? ''
                  : signedPct(v.fundamentals.price > 0 ? r.value / v.fundamentals.price - 1 : 0)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-faint)]">
Same forecast, different terminal treatment. Percentages vs price.
      </p>
    </section>
  );
}
