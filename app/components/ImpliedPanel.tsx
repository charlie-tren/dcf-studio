import { pct } from '@/lib/format';
import type { ImpliedExpectations } from '@/lib/backsolve';
import type { Assumptions } from '@/lib/types';

/**
 * Turns a disagreement with the market into a testable claim. "The model says
 * 112 against a price of 337" is not much use on its own; "the market is pricing
 * 24% growth where history gives 12%" is something a reader can judge.
 */
export function ImpliedPanel({
  implied,
  assumptions,
}: {
  implied: ImpliedExpectations;
  assumptions: Assumptions;
}) {
  const rows = [
    {
      label: 'Revenue growth, every year',
      modelled: assumptions.revenueGrowth[0],
      solved: implied.revenueGrowth,
    },
    { label: 'EBIT margin', modelled: assumptions.ebitMargin[0], solved: implied.ebitMargin },
    { label: 'Discount rate', modelled: assumptions.wacc, solved: implied.wacc, inverted: true },
  ].filter((r) => r.solved !== null);

  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Priced In</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
        What each input would need to be for today&apos;s price to hold, with everything else left
        where it is. Any one on its own closes the gap.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface)]">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-wider text-[var(--text-faint)] uppercase">
                Input
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-wider text-[var(--text-faint)] uppercase">
                This model
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-wider text-[var(--text-faint)] uppercase">
                Implied by the price
              </th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium tracking-wider text-[var(--text-faint)] uppercase">
                Gap
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const solved = r.solved as number;
              const gap = solved - r.modelled;
              // A higher implied discount rate means the market is more cautious,
              // so the sign that reads as "demanding" flips for that row.
              const demanding = r.inverted ? gap < 0 : gap > 0;
              return (
                <tr key={r.label} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5 text-[var(--text-dim)]">{r.label}</td>
                  <td className="nums px-4 py-2.5 text-right text-[var(--text-dim)]">
                    {pct(r.modelled, 1)}
                  </td>
                  <td className="nums px-4 py-2.5 text-right font-medium text-[var(--text)]">
                    {pct(solved, 1)}
                  </td>
                  <td
                    className={`nums px-4 py-2.5 text-right ${
                      demanding ? 'text-[var(--negative)]' : 'text-[var(--accent)]'
                    }`}
                  >
                    {gap >= 0 ? '+' : ''}
                    {(gap * 100).toFixed(1)}pp
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
