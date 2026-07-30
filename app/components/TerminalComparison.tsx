import { money, pct, perShare } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function TerminalComparison({ v }: { v: Valuation }) {
  const currency = v.fundamentals.reportingCurrency;
  const methods = [
    { label: `Gordon growth at ${pct(v.assumptions.terminalGrowth, 2)}`, m: v.dcf.gordon },
    { label: `Exit multiple at ${v.assumptions.exitMultiple.toFixed(1)}x EBITDA`, m: v.dcf.exitMultiple },
  ];

  const [a, b] = methods.map((x) => x.m.valuePerShare);
  const gap = a > 0 && b > 0 ? Math.abs(a - b) / ((a + b) / 2) : null;

  return (
    <section>
      <h2 className="text-lg font-semibold">Terminal value, both ways</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Terminal value is usually most of the answer. The gap between the two methods is the honest
        measure of how much of this valuation is assumption.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {methods.map(({ label, m }) => (
          <div key={label} className="rounded border border-neutral-200 p-4">
            <p className="text-sm font-medium">{label}</p>
            {m.terminal.blocked ? (
              <p className="mt-2 text-sm text-red-700">{m.terminal.blocked}</p>
            ) : (
              <dl className="mt-2 space-y-1 text-sm tabular-nums">
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Undiscounted</dt>
                  <dd>{money(m.terminal.undiscounted, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Present value</dt>
                  <dd>{money(m.terminal.presentValue, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Share of enterprise value</dt>
                  <dd>{pct(m.terminal.shareOfEv, 1)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Enterprise value</dt>
                  <dd>{money(m.enterpriseValue, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-neutral-500">Less net debt</dt>
                  <dd>{money(m.enterpriseValue - m.equityValue, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-neutral-200 pt-1 font-medium">
                  <dt>Value per share</dt>
                  <dd>{perShare(m.valuePerShare, currency)}</dd>
                </div>
              </dl>
            )}
          </div>
        ))}
      </div>
      {gap !== null && (
        <p className="mt-3 text-sm text-neutral-600">The two methods differ by {pct(gap, 0)}.</p>
      )}
    </section>
  );
}
