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
}: {
  grid: SensitivityGrid;
  currency: string;
  centrePrice: number;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Sensitivity</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Value per share in {currency}. Shaded where the implied value exceeds the market price. A
        dash means the perpetuity cannot converge at that pair.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="text-sm tabular-nums">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium text-neutral-500">
                WACC \ terminal g
              </th>
              {grid.growthValues.map((g) => (
                <th key={g} className="px-3 py-2 text-right font-medium">
                  {pct(g, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.waccValues.map((w, i) => (
              <tr key={w} className="border-t border-neutral-100">
                <th className="px-3 py-2 text-left font-medium">{pct(w, 2)}</th>
                {grid.cells[i].map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 text-right ${cell !== null && cell > centrePrice ? 'bg-emerald-50' : ''}`}
                  >
                    {cell === null ? '-' : cell.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
