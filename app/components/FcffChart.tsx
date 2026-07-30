import type { ForecastYear } from '@/lib/types';

/**
 * Forecast cashflows as bars, with the discounted value overlaid so the cost of
 * time is visible rather than implied. Hand-rolled SVG: no chart library, no
 * client JS, and it renders identically server-side.
 */
export function FcffChart({
  forecast,
  currency,
  yearLabels,
}: {
  forecast: ForecastYear[];
  currency: string;
  yearLabels: string[];
}) {
  const W = 680;
  const H = 200;
  const PAD = { top: 16, right: 12, bottom: 28, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values = forecast.flatMap((y) => [y.fcff, y.presentValue]);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const yOf = (v: number) => PAD.top + plotH - ((v - min) / span) * plotH;
  const zeroY = yOf(0);
  const slot = plotW / forecast.length;
  const barW = Math.min(slot * 0.46, 44);

  const scale = max >= 1e9 ? 1e9 : max >= 1e6 ? 1e6 : 1;
  const unit = scale === 1e9 ? 'bn' : scale === 1e6 ? 'm' : '';
  const ticks = [min, min + span / 2, max].filter((t, i, a) => a.indexOf(t) === i);

  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Forecast free cashflow by year, nominal and discounted">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={yOf(t) + 4}
              textAnchor="end"
              className="nums"
              fill="var(--text-faint)"
              fontSize="10"
            >
              {(t / scale).toFixed(0)}
              {unit}
            </text>
          </g>
        ))}

        {forecast.map((y, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const nominalTop = Math.min(yOf(y.fcff), zeroY);
          const nominalH = Math.abs(yOf(y.fcff) - zeroY);
          const pvTop = Math.min(yOf(y.presentValue), zeroY);
          const pvH = Math.abs(yOf(y.presentValue) - zeroY);
          const negative = y.fcff < 0;
          return (
            <g key={y.year}>
              <rect
                x={cx - barW}
                y={nominalTop}
                width={barW}
                height={Math.max(nominalH, 1)}
                fill={negative ? 'var(--negative-soft)' : 'var(--accent-soft)'}
                stroke={negative ? 'var(--negative)' : 'var(--accent)'}
                strokeWidth="1"
              />
              <rect
                x={cx}
                y={pvTop}
                width={barW}
                height={Math.max(pvH, 1)}
                fill={negative ? 'var(--negative)' : 'var(--accent)'}
                opacity="0.85"
              />
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                fill="var(--text-faint)"
                fontSize="10"
              >
                {yearLabels[y.year - 1] ?? `Y${y.year}`}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--text-faint)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 border border-[var(--accent)] bg-[var(--accent-soft)]" />
          Nominal FCFF
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 bg-[var(--accent)]" />
          Discounted to today
        </span>
        <span>Figures in {currency}. The gap between the pair is the cost of time.</span>
      </figcaption>
    </figure>
  );
}
