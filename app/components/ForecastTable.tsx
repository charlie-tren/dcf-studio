import { FcffChart } from './FcffChart';
import { money } from '@/lib/format';
import type { DcfResult, ForecastYear } from '@/lib/types';

export function ForecastTable({ dcf, currency }: { dcf: DcfResult; currency: string }) {
  const rows: { label: string; pick: (y: ForecastYear) => number; emphasis?: boolean; rule?: boolean }[] = [
    { label: 'Revenue', pick: (y) => y.revenue },
    { label: 'EBIT', pick: (y) => y.ebit },
    { label: 'NOPAT', pick: (y) => y.nopat, rule: true },
    { label: 'Add depreciation & amortisation', pick: (y) => y.dAndA },
    { label: 'Less capital expenditure', pick: (y) => -y.capex },
    { label: 'Less increase in working capital', pick: (y) => -y.changeInNwc },
    { label: 'Free cashflow to firm', pick: (y) => y.fcff, emphasis: true },
    { label: 'Discount factor', pick: (y) => y.discountFactor },
    { label: 'Present value', pick: (y) => y.presentValue, emphasis: true },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Forecast cashflows</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
        In {currency}, the currency the accounts are reported in. Outflows carry a minus sign, so the
        column adds up the way it would on paper.
      </p>

      <FcffChart forecast={dcf.forecast} currency={currency} />

      <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface)] text-left">
              <th className="px-4 py-2.5 text-xs font-medium tracking-wide text-[var(--text-faint)] uppercase">
                Line
              </th>
              {dcf.forecast.map((y) => (
                <th
                  key={y.year}
                  className="px-3 py-2.5 text-right text-xs font-medium tracking-wide text-[var(--text-faint)] uppercase"
                >
                  Year {y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, pick, emphasis, rule }) => (
              <tr
                key={label}
                className={`border-t ${rule ? 'border-[var(--border-strong)]' : 'border-[var(--border)]'} ${
                  emphasis ? 'bg-[var(--surface)]' : ''
                }`}
              >
                <td
                  className={`px-4 py-2.5 whitespace-nowrap ${
                    emphasis ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)]'
                  }`}
                >
                  {label}
                </td>
                {dcf.forecast.map((y) => {
                  const value = pick(y);
                  return (
                    <td
                      key={y.year}
                      className={`nums px-3 py-2.5 text-right whitespace-nowrap ${
                        emphasis ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)]'
                      } ${value < 0 ? 'text-[var(--negative)]' : ''}`}
                    >
                      {label === 'Discount factor' ? value.toFixed(4) : money(value, currency)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-raised)]">
              <td className="px-4 py-3 font-medium text-[var(--text)]">
                Present value of the forecast
              </td>
              <td
                colSpan={dcf.forecast.length}
                className="nums px-3 py-3 text-right font-semibold text-[var(--accent)]"
              >
                {money(dcf.pvExplicit, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
