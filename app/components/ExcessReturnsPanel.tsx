import { money, pct, perShare } from '@/lib/format';
import { ROE_CEILING, type ExcessReturns } from '@/lib/excessReturns';

const TH =
  'px-3 py-2.5 text-right text-xs font-medium tracking-wide text-[var(--text-faint)] uppercase';
const TD = 'nums px-3 py-2.5 text-right whitespace-nowrap text-[var(--text-dim)]';

export function ExcessReturnsPanel({
  er,
  currency,
  yearLabels,
}: {
  er: ExcessReturns;
  currency: string;
  yearLabels: string[];
}) {
  const lines: { label: string; pick: (y: ExcessReturns['years'][number]) => string; emphasis?: boolean }[] = [
    { label: 'Opening book equity', pick: (y) => money(y.openingBook, currency) },
    { label: 'Return on equity', pick: (y) => pct(y.roe, 1) },
    { label: 'Excess return', pick: (y) => money(y.excessReturn, currency) },
    { label: 'Present value', pick: (y) => money(y.presentValue, currency), emphasis: true },
  ];
  const bridge: { label: string; value: string; total?: boolean }[] = [
    { label: 'Book equity', value: money(er.bookValue, currency) },
    { label: 'Present value of excess returns', value: money(er.pvExcess, currency) },
    { label: `Terminal, growing at ${pct(er.terminalGrowth, 2)}`, value: money(er.terminalPresentValue, currency) },
    { label: 'Equity value', value: money(er.equityValue, currency), total: true },
    { label: 'Per share', value: perShare(er.valuePerShare, currency), total: true },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Excess Returns</h2>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {[
          ['Return on equity', pct(er.roe, 1)],
          ['Payout', pct(er.payout, 0)],
          ['Cost of equity', pct(er.costOfEquity, 2)],
          // Only where the ceiling binds; otherwise it repeats the first figure.
          ...(er.roe > ROE_CEILING ? [['Return on equity by the final year', pct(ROE_CEILING, 1)]] : []),
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs tracking-wide text-[var(--text-faint)] uppercase">{k}</dt>
            <dd className="nums mt-0.5 text-[var(--text)]">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 overflow-x-auto scroll-subtle rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface)]">
              <th className={`${TH} px-4 text-left`}>Line</th>
              {er.years.map((y) => (
                <th key={y.year} className={TH}>
                  {yearLabels[y.year - 1] ?? `Year ${y.year}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(({ label, pick, emphasis }) => (
              <tr key={label} className={`border-t border-[var(--border)] ${emphasis ? 'bg-[var(--surface)]' : ''}`}>
                <td className={`px-4 py-2.5 whitespace-nowrap ${emphasis ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
                  {label}
                </td>
                {er.years.map((y) => (
                  <td key={y.year} className={`${TD} ${emphasis ? 'font-medium text-[var(--text)]' : ''}`}>
                    {pick(y)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 max-w-md rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <tbody>
            {bridge.map(({ label, value, total }) => (
              <tr key={label} className={`border-t border-[var(--border)] first:border-t-0 ${total ? 'bg-[var(--surface)]' : ''}`}>
                <td className={`px-4 py-2.5 ${total ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{label}</td>
                <td className={`nums px-4 py-2.5 text-right ${total ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
