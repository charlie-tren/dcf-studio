import { money, pct } from '@/lib/format';
import type { WaccBreakdown } from '@/lib/types';

export function WaccTable({ w, currency }: { w: WaccBreakdown; currency: string }) {
  const rows: [string, string, string][] = [
    [
      'Risk-free rate',
      pct(w.riskFreeRate, 2),
      w.riskFreeAssumed ? `${w.riskFreeSource} (assumption)` : w.riskFreeSource,
    ],
    ['Equity risk premium', pct(w.equityRiskPremium, 2), 'Market assumption, editable'],
    [
      'Beta',
      w.beta.toFixed(3),
      w.betaClamped ? `Clamped from a reported ${w.rawBeta?.toFixed(3)}` : 'As reported',
    ],
    ['Cost of equity', pct(w.costOfEquity, 2), 'Risk-free + beta x equity risk premium'],
    ['Cost of debt', pct(w.costOfDebt, 2), w.costOfDebtSource],
    ['Market capitalisation', money(w.marketCap, currency), `${pct(w.equityWeight, 1)} of capital`],
    [
      'Total debt',
      money(w.totalDebt, currency),
      `${pct(w.debtWeight, 1)} of capital, book value as a proxy`,
    ],
    ['Tax rate', pct(w.taxRate, 1), 'Effective, capped at statutory'],
    ['WACC', pct(w.wacc, 2), 'E/V x Re + D/V x Rd x (1 - t)'],
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold">Discount rate</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value, note], i) => (
              <tr
                key={label}
                className={`border-b border-neutral-100 ${i === rows.length - 1 ? 'font-semibold' : ''}`}
              >
                <td className="py-2 pr-4 text-neutral-600">{label}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{value}</td>
                <td className="py-2 text-sm text-neutral-500">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
