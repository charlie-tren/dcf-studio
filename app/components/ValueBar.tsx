import { perShare } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

/**
 * Where the two methods land against the market price, on one axis. The point
 * is the spread between them: a wide spread means the answer is mostly
 * assumption, and a single headline number hides that.
 */
export function ValueBar({ v }: { v: Valuation }) {
  const ccy = v.fundamentals.quoteCurrency;
  const scaleToQuote = v.dcf.gordon.valuePerShare === 0
    ? 1
    : v.valuePerShareQuoted / v.dcf.gordon.valuePerShare;

  const marks = [
    { label: 'Gordon growth', value: v.valuePerShareQuoted, kind: 'model' as const },
    {
      label: 'Exit multiple',
      value: v.dcf.exitMultiple.valuePerShare * scaleToQuote,
      kind: 'model' as const,
    },
    { label: 'Market price', value: v.fundamentals.price, kind: 'market' as const },
  ].filter((m) => Number.isFinite(m.value));

  const values = marks.map((m) => m.value);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = span * 0.12;
  const axisLo = lo - pad;
  const axisHi = hi + pad;
  const pos = (val: number) => ((val - axisLo) / (axisHi - axisLo)) * 100;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-medium text-[var(--text-dim)]">Value per share, by method</h2>

      <div className="relative mt-8 mb-14 h-px w-full bg-[var(--border-strong)]">
        {marks.map((m, i) => {
          const isMarket = m.kind === 'market';
          const above = i === 0;
          return (
            <div
              key={m.label}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos(m.value)}%` }}
            >
              <div
                className={
                  isMarket
                    ? 'h-6 w-0.5 bg-[var(--text-dim)]'
                    : 'h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-[var(--accent)]'
                }
              />
              <div
                className={`absolute left-1/2 w-max -translate-x-1/2 text-center ${
                  above ? 'bottom-5' : 'top-5'
                }`}
              >
                <div
                  className={`nums text-sm font-medium ${
                    isMarket ? 'text-[var(--text-dim)]' : 'text-[var(--accent)]'
                  }`}
                >
                  {perShare(m.value, ccy)}
                </div>
                <div className="text-[10px] text-[var(--text-faint)]">{m.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
