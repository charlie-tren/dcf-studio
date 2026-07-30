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
      <h2 className="text-lg font-semibold text-white">How much the answer moves</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
        Value per share in {currency} at different discount rates and long-run growth rates - the two
        assumptions that swing a DCF hardest. Green beats today&apos;s price, red falls short. Growth
        cannot exceed the discount rate, so those cells are blank.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--surface-raised)]">
              <th className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3 text-left text-[11px] font-medium tracking-wider text-[var(--text-faint)] uppercase">
                Discount rate
              </th>
              {grid.growthValues.map((g, j) => (
                <th
                  key={g}
                  className={`nums px-4 py-3 text-right text-xs font-medium whitespace-nowrap ${
                    j === grid.centre.growthIndex
                      ? 'text-[var(--text)]'
                      : 'text-[var(--text-faint)]'
                  }`}
                >
                  {pct(g, 2)}
                  <span className="ml-1 text-[10px] text-[var(--text-faint)]">growth</span>
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
                    className={`nums sticky left-0 z-10 px-4 py-3 text-left text-xs font-medium whitespace-nowrap ${
                      isCentreRow
                        ? 'bg-[var(--surface-raised)] text-[var(--text)]'
                        : 'bg-[var(--surface)] text-[var(--text-faint)]'
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
                        className={`nums px-4 py-3 text-right whitespace-nowrap ${
                          isCentre
                            ? 'font-semibold text-white outline-1 -outline-offset-1 outline-[var(--accent)]'
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
      <p className="mt-2 text-xs text-[var(--text-faint)]">
        Outlined: the model as it stands, at {pct(grid.waccValues[grid.centre.waccIndex], 2)} and{' '}
        {pct(grid.growthValues[grid.centre.growthIndex], 2)} growth.
      </p>
    </section>
  );
}
