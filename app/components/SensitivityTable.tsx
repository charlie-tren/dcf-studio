import { pct } from '@/lib/format';
import type { SensitivityGrid } from '@/lib/sensitivity';

/**
 * Grid cells are per-share values in REPORTING currency, straight from the
 * engine. centrePrice must therefore also be in reporting currency, or the
 * shading compares pence against dollars.
 */
export function SensitivityTable({
  grid,
  currency,
  centrePrice,
  centreWacc,
  centreGrowth,
}: {
  grid: SensitivityGrid;
  currency: string;
  centrePrice: number;
  centreWacc: number;
  centreGrowth: number;
}) {
  const values = grid.cells.flat().filter((c): c is number => c !== null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;

  // Intensity scales with value across the grid; hue says which side of the
  // market price it lands on. Two channels, so the shading survives being
  // read without colour as well - the numbers are still in reading order.
  function cellStyle(value: number | null) {
    if (value === null) return {};
    const t = (value - lo) / span;
    const above = value > centrePrice;
    const alpha = 0.06 + t * 0.26;
    return {
      backgroundColor: above
        ? `rgba(74, 157, 127, ${alpha.toFixed(3)})`
        : `rgba(194, 104, 95, ${(0.05 + (1 - t) * 0.18).toFixed(3)})`,
    };
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">If the discount rate is wrong</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
        Value per share in {currency} across the two assumptions that move it most. Green is above
        today&apos;s price, red below. A dash means growth met or passed the discount rate, where the
        maths stops working.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="bg-[var(--surface)] px-3 py-2.5 text-left text-xs font-medium tracking-wide text-[var(--text-faint)] uppercase">
                WACC
              </th>
              {grid.growthValues.map((g) => (
                <th
                  key={g}
                  className={`nums bg-[var(--surface)] px-3 py-2.5 text-right text-xs font-medium ${
                    Math.abs(g - centreGrowth) < 1e-9
                      ? 'text-[var(--text)]'
                      : 'text-[var(--text-faint)]'
                  }`}
                >
                  g {pct(g, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.waccValues.map((w, i) => {
              const isCentreRow = Math.abs(w - centreWacc) < 1e-9;
              return (
                <tr key={w} className="border-t border-[var(--border)]">
                  <th
                    className={`nums px-3 py-2.5 text-left text-xs font-medium ${
                      isCentreRow
                        ? 'bg-[var(--surface-raised)] text-[var(--text)]'
                        : 'bg-[var(--surface)] text-[var(--text-faint)]'
                    }`}
                  >
                    {pct(w, 2)}
                  </th>
                  {grid.cells[i].map((cell, j) => {
                    const isCentre =
                      isCentreRow && Math.abs(grid.growthValues[j] - centreGrowth) < 1e-9;
                    return (
                      <td
                        key={j}
                        style={cellStyle(cell)}
                        className={`nums px-3 py-2.5 text-right ${
                          isCentre
                            ? 'font-semibold text-white ring-1 ring-inset ring-[var(--accent)]'
                            : 'text-[var(--text-dim)]'
                        }`}
                      >
                        {cell === null ? '-' : cell.toFixed(2)}
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
        The outlined cell is the model as it currently stands.
      </p>
    </section>
  );
}
