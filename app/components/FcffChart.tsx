import type { ForecastYear } from '@/lib/types';

/**
 * Forecast cashflows as bars, with the discounted value overlaid so the cost of
 * time is visible rather than implied. Hand-rolled SVG: no chart library, no
 * client JS, and it renders identically server-side.
 */
type Geometry = {
  W: number;
  H: number;
  PAD: { top: number; right: number; bottom: number; left: number };
};

/* Two geometries, not one scaled drawing.

   A single `viewBox="0 0 680 200"` is scaled into a 342px phone, so the 10px labels
   arrive at 6px: measured on the live page, not inferred. `font-size` reports the
   user-unit size and looks perfectly healthy either way, which is why it went
   unnoticed. Nothing here can measure its own container - the whole component is
   server-rendered on purpose, no client JS - so the answer is to lay the chart out
   twice at the two sizes and let CSS pick, which keeps that property.

   The wide numbers are exactly what this shipped with, so the desktop drawing is
   untouched. The narrow one is close enough to a phone's rendered width that one
   user unit is about one CSS pixel, which is the whole point. */
const WIDE: Geometry = {
  W: 680,
  H: 200,
  PAD: { top: 16, right: 12, bottom: 28, left: 56 },
};
const NARROW: Geometry = {
  W: 340,
  H: 210,
  PAD: { top: 14, right: 8, bottom: 26, left: 40 },
};

type ChartProps = {
  forecast: ForecastYear[];
  currency: string;
  yearLabels: string[];
};

export function FcffChart(props: ChartProps) {
  return (
    <figure className="mt-4">
      <div className="hidden sm:block">
        <Plot {...props} geometry={WIDE} />
      </div>
      <div className="sm:hidden">
        <Plot {...props} geometry={NARROW} />
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--text-faint)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 border border-[var(--accent)] bg-[var(--accent-soft)]" />
          Nominal FCFF
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 bg-[var(--accent)]" />
          Discounted to today
        </span>
        <span>{props.currency}</span>
      </figcaption>
    </figure>
  );
}

function Plot({
  forecast,
  yearLabels,
  geometry,
}: ChartProps & { geometry: Geometry }) {
  const { W, H, PAD } = geometry;
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
  );
}
