import { money, pct } from '@/lib/format';
import type { WaccBreakdown } from '@/lib/types';

export function WaccTable({ w, currency }: { w: WaccBreakdown; currency: string }) {
  const rows: { label: string; value: string; note: string; total?: boolean }[] = [
    {
      label: 'Risk-free rate',
      value: pct(w.riskFreeRate, 2),
      note: w.riskFreeAssumed ? `${w.riskFreeSource} (assumption)` : w.riskFreeSource,
    },
    { label: 'Equity risk premium', value: pct(w.equityRiskPremium, 2), note: 'Market assumption' },
    {
      label: 'Beta',
      value: w.beta.toFixed(3),
      // Three distinct states, and the reader deserves to know which one this is:
      // untouched, Blume-adjusted, or adjusted AND still clamped.
      note: w.betaClamped
        ? `Clamped from a reported ${w.rawBeta?.toFixed(3)}`
        : w.betaAdjusted
          ? `Reported ${w.rawBeta?.toFixed(3)}, pulled toward 1.0 (Blume)`
          : 'As reported',
    },
    {
      label: 'Cost of equity',
      value: pct(w.costOfEquity, 2),
      note: 'Risk-free + beta x equity risk premium',
    },
    { label: 'Cost of debt', value: pct(w.costOfDebt, 2), note: w.costOfDebtSource },
    {
      label: 'Market capitalisation',
      value: money(w.marketCap, currency),
      note: `${pct(w.equityWeight, 1)} of capital`,
    },
    {
      label: 'Total debt',
      value: money(w.totalDebt, currency),
      note: `${pct(w.debtWeight, 1)} of capital, book value as a proxy`,
    },
    { label: 'Tax rate', value: pct(w.taxRate, 1), note: 'Effective, capped at statutory' },
    { label: 'WACC', value: pct(w.wacc, 2), note: 'E/V x Re + D/V x Rd x (1 - t)', total: true },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Discount Rate</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
Source shown per component. All overridable above.
      </p>
      <div className="mt-4 overflow-x-auto scroll-subtle rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={`border-t border-[var(--border)] first:border-t-0 ${
                  r.total ? 'border-t-[var(--border-strong)] bg-[var(--surface-raised)]' : ''
                }`}
              >
                <td
                  className={`px-4 py-2.5 whitespace-nowrap ${
                    r.total ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)]'
                  }`}
                >
                  {r.label}
                </td>
                <td
                  className={`nums px-4 py-2.5 text-right whitespace-nowrap ${
                    r.total ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text)]'
                  }`}
                >
                  {r.value}
                </td>
                <td className="px-4 py-2.5 text-xs text-[var(--text-faint)]">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
