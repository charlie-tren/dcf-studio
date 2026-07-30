import { money, pct, perShare } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function TerminalComparison({ v }: { v: Valuation }) {
  const currency = v.fundamentals.reportingCurrency;
  const methods = [
    { label: `Perpetuity growth at ${pct(v.assumptions.terminalGrowth, 2)}`, m: v.dcf.gordon },
    {
      label: `Exit multiple at ${v.assumptions.exitMultiple.toFixed(1)}x EBITDA`,
      m: v.dcf.exitMultiple,
    },
  ];

  const [a, b] = methods.map((x) => x.m.valuePerShare);
  const gap = a > 0 && b > 0 ? Math.abs(a - b) / ((a + b) / 2) : null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Terminal Value</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
Perpetuity growth and exit multiple, side by side.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {methods.map(({ label, m }) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <p className="text-sm font-medium text-[var(--text)]">{label}</p>
            {m.terminal.blocked ? (
              <p className="mt-3 text-sm leading-relaxed text-[var(--negative)]">
                {m.terminal.blocked}
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <span className="text-xs tracking-wide text-[var(--text-faint)] uppercase">
                    Value per share
                  </span>
                  <span className="nums text-2xl font-semibold text-[var(--accent)]">
                    {perShare(m.valuePerShare, currency)}
                  </span>
                </div>

                <div className="mt-4 h-1 w-full overflow-hidden rounded bg-[var(--border)]">
                  <div
                    className="h-full bg-[var(--accent)] opacity-70"
                    style={{ width: `${Math.min(m.terminal.shareOfEv * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-[var(--text-faint)]">
                  {pct(m.terminal.shareOfEv, 0)} of EV
                </p>

                <dl className="nums mt-4 space-y-1.5 border-t border-[var(--border)] pt-3 text-sm">
                  {[
                    ['Terminal value, undiscounted', money(m.terminal.undiscounted, currency)],
                    ['Terminal value, discounted', money(m.terminal.presentValue, currency)],
                    ['Enterprise value', money(m.enterpriseValue, currency)],
                    ['Less net debt', money(m.enterpriseValue - m.equityValue, currency)],
                    ['Equity value', money(m.equityValue, currency)],
                  ].map(([k, val]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-[var(--text-faint)]">{k}</dt>
                      <dd className="text-[var(--text-dim)]">{val}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>
        ))}
      </div>

      {gap !== null && (
        <p className="mt-3 text-sm text-[var(--text-dim)]">
Spread between methods: {pct(gap, 0)}.
        </p>
      )}
    </section>
  );
}
