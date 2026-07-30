import { money } from '@/lib/format';
import type { DcfResult, ForecastYear } from '@/lib/types';

export function ForecastTable({ dcf, currency }: { dcf: DcfResult; currency: string }) {
  const rows: [string, (y: ForecastYear) => number][] = [
    ['Revenue', (y) => y.revenue],
    ['EBIT', (y) => y.ebit],
    ['NOPAT', (y) => y.nopat],
    ['Depreciation & amortisation', (y) => y.dAndA],
    ['Capital expenditure', (y) => -y.capex],
    ['Change in working capital', (y) => -y.changeInNwc],
    ['Free cashflow to firm', (y) => y.fcff],
    ['Discount factor', (y) => y.discountFactor],
    ['Present value', (y) => y.presentValue],
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold">Forecast cashflows</h2>
      <p className="mt-1 text-sm text-neutral-500">
        In {currency}, the currency the accounts are reported in. Capital expenditure and working
        capital are shown as they hit cash - negative is an outflow.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className="py-2 pr-4 font-medium">Line</th>
              {dcf.forecast.map((y) => (
                <th key={y.year} className="px-3 py-2 text-right font-medium">
                  Year {y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, pick]) => (
              <tr key={label} className="border-b border-neutral-100">
                <td className="py-2 pr-4 text-neutral-600">{label}</td>
                {dcf.forecast.map((y) => (
                  <td key={y.year} className="px-3 py-2 text-right">
                    {label === 'Discount factor' ? pick(y).toFixed(4) : money(pick(y), currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">
        Present value of the explicit forecast: <strong>{money(dcf.pvExplicit, currency)}</strong>
      </p>
    </section>
  );
}
