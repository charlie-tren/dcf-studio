import { pct } from '@/lib/format';
import type { SensitivityGrid } from '@/lib/sensitivity';

/**
 * Grid cells are per-share values in REPORTING currency, straight from the
 * engine. centrePrice must therefore also be in reporting currency, or the
 * shading compares pence against dollars.
 *
 * The centre cell comes from grid.centre, not a float comparison: the axis
 * labels are rounded to 6dp for display while the live WACC is not, so matching
 * on value never found the row and the cell went unmarked.
 */
export function SensitivityTable({
  grid,
  currency,
  centrePrice,
}: {
  grid: SensitivityGrid;
  currency: string;
  centrePrice: number;
}) {
  const values = grid.cells.flat().filter((c): c is number => c !== null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;

  // Intensity scales with value across the grid; hue says which side of today's
  // price it lands on. Two channels, so the reading survives without colour.
  function cellStyle(value: number | null) {
    if (value === null) return {};
    const t = (value - lo) / span;
    return {
      backgroundColor:
        value > centrePrice
          ? `rgba(74, 157, 127, ${(0.06 + t * 0.26).toFixed(3)})`
          : `rgba(194, 104, 95, ${(0.05 + (1 - t) * 0.18).toFixed(3)})`,
    };
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Sensitivity</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
        Value per share in {currency} across the two assumptions that swing a DCF hardest. Green
        beats today&apos;s price, red falls short.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                colSpan={grid.growthValues.length + 1}
                className="border-b border-[var(--border)] bg-[var(--surface-raised)] px-5 py-2.5 text-center text-[10px] font-medium tracking-[0.14em] text-[var(--text-faint)] uppercase"
              >
                Long-run growth
              </th>
            </tr>
            <tr className="bg-[var(--surface)]">
              <th className="border-r border-[var(--border)] px-5 py-3 text-left text-[10px] font-medium tracking-[0.14em] text-[var(--text-faint)] uppercase">
                Discount rate
              </th>
              {grid.growthValues.map((g, j) => (
                <th
                  key={g}
                  className={`nums px-5 py-3 text-right text-xs whitespace-nowrap ${
                    j === grid.centre.growthIndex
                      ? 'font-semibold text-[var(--text)]'
                      : 'font-medium text-[var(--text-faint)]'
                  }`}
                >
                  {pct(g, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.waccValues.map((w, i) => {
              const isCentreRow = i === grid.centre.waccIndex;
              return (
                <tr key={w} className="border-t border-[var(--border)]">
                  <th
                    className={`nums border-r border-[var(--border)] px-5 py-3.5 text-left text-xs whitespace-nowrap ${
                      isCentreRow
                        ? 'bg-[var(--surface-raised)] font-semibold text-[var(--text)]'
                        : 'bg-[var(--surface)] font-medium text-[var(--text-faint)]'
                    }`}
                  >
                    {pct(w, 2)}
                  </th>
                  {grid.cells[i].map((cell, j) => {
                    const isCentre = isCentreRow && j === grid.centre.growthIndex;
                    return (
                      <td
                        key={j}
                        style={cellStyle(cell)}
                        className={`nums px-5 py-3.5 text-right whitespace-nowrap ${
                          isCentre
                            ? 'font-semibold text-white outline-2 -outline-offset-2 outline-[var(--accent)]'
                            : 'text-[var(--text-dim)]'
                        }`}
                      >
                        {cell === null ? '—' : cell.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-xs text-[var(--text-faint)]">
        Outlined cell: this model, at {pct(grid.waccValues[grid.centre.waccIndex], 2)} and{' '}
        {pct(grid.growthValues[grid.centre.growthIndex], 2)} growth. A dash means growth met the
        discount rate, where a perpetuity stops converging.
      </p>
    </section>
  );
}
