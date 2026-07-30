import { FcffChart } from './FcffChart';
import { cagr, money, signedPct } from '@/lib/format';
import type { DcfResult, ForecastYear } from '@/lib/types';

export function ForecastTable({
  dcf,
  currency,
  yearLabels,
}: {
  dcf: DcfResult;
  currency: string;
  yearLabels: string[];
}) {
  const rows: {
    label: string;
    pick: (y: ForecastYear) => number;
    emphasis?: boolean;
    rule?: boolean;
    /** A growth rate is meaningless for a ratio like the discount factor. */
    noGrowth?: boolean;
    /** Series to compute growth on, when it differs from what is displayed. */
    growthOn?: (y: ForecastYear) => number;
  }[] = [
    { label: 'Revenue', pick: (y) => y.revenue },
    { label: 'EBIT', pick: (y) => y.ebit },
    { label: 'NOPAT', pick: (y) => y.nopat, rule: true },
    { label: 'Add depreciation & amortisation', pick: (y) => y.dAndA },
    // Displayed negative because it is an outflow, but the growth rate must be
    // computed on the magnitude: capex rising from 67bn to 108bn is +12.5%
    // growth in spending, not -12.5%.
    { label: 'Less capital expenditure', pick: (y) => -y.capex, growthOn: (y) => y.capex },
    {
      label: 'Less increase in working capital',
      pick: (y) => -y.changeInNwc,
      growthOn: (y) => y.changeInNwc,
    },
    { label: 'Free cashflow to firm', pick: (y) => y.fcff, emphasis: true },
    { label: 'Discount factor', pick: (y) => y.discountFactor, noGrowth: true },
    { label: 'Present value', pick: (y) => y.presentValue, emphasis: true },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Forecast Cashflows</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
        Reporting currency ({currency}). Outflows negative.
      </p>

      <FcffChart forecast={dcf.forecast} currency={currency} yearLabels={yearLabels} />

      <div className="mt-5 overflow-x-auto scroll-subtle rounded-lg border border-[var(--border)]">
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
                  {yearLabels[y.year - 1] ?? `Year ${y.year}`}
                </th>
              ))}
              <th
                title={`Compound annual growth from ${yearLabels[0]} to ${yearLabels[yearLabels.length - 1]}`}
                className="border-l border-[var(--border-strong)] px-3 py-2.5 text-right text-xs font-medium tracking-wide text-[var(--text-faint)] uppercase"
              >
                CAGR
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, pick, emphasis, rule, noGrowth, growthOn }) => {
              const growth = noGrowth ? null : cagr(dcf.forecast.map(growthOn ?? pick));
              return (
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
                  <td
                    className={`nums border-l border-[var(--border-strong)] px-3 py-2.5 text-right whitespace-nowrap ${
                      growth === null
                        ? 'text-[var(--text-faint)]'
                        : growth < 0
                          ? 'text-[var(--negative)]'
                          : 'text-[var(--accent)]'
                    }`}
                  >
                    {growth === null ? '-' : signedPct(growth)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-raised)]">
              <td className="px-4 py-3 font-medium text-[var(--text)]">
                Present Value Of The Forecast
              </td>
              <td
                colSpan={dcf.forecast.length + 1}
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
