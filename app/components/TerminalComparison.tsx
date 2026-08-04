import { money, pct, perShare } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function TerminalComparison({ v }: { v: Valuation }) {
  const currency = v.fundamentals.reportingCurrency;
  const methods = [
    { label: `Perpetuity growth at ${pct(v.assumptions.terminalGrowth, 2)}`, m: v.dcf.gordon },
    {
      label: `Exit at ${v.assumptions.exitMultiple.toFixed(1)}x EBITDA`,
      m: v.dcf.exitMultiple,
    },
  ];

  const [a, b] = methods.map((x) => x.m.valuePerShare);
  const gap = a > 0 && b > 0 ? Math.abs(a - b) / ((a + b) / 2) : null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Terminal Value</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">
Perpetuity growth is intrinsic. The exit multiple defaults to the company&apos;s current
        EV/EBITDA, so it answers a different question - what the shares are worth if today&apos;s
        rating holds and EBITDA grows as forecast.
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

                {m.terminal.steadyState && m.terminal.steadyState.reinvestment > 0 && (
                  <dl className="nums mt-4 space-y-1.5 border-t border-[var(--border)] pt-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--text-faint)]">Forecast FCFF, final year</dt>
                      <dd className="text-[var(--text-dim)]">
                        {money(m.terminal.steadyState.forecastFcff, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--text-faint)]">Capex reset to depreciation</dt>
                      <dd className="text-[var(--text-dim)]">
                        {money(m.terminal.steadyState.maintenanceFcff, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--text-faint)]">
                        Less reinvestment at g/ROIC ({pct(m.terminal.steadyState.reinvestmentRate, 1)}{' '}
                        of NOPAT)
                      </dt>
                      <dd className="text-[var(--negative)]">
                        {money(-m.terminal.steadyState.reinvestment, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-1.5 font-medium">
                      <dt className="text-[var(--text-dim)]">Capitalised</dt>
                      <dd className="text-[var(--text)]">
                        {money(m.terminal.steadyState.capitalisedFcff, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 pt-0.5">
                      <dt className="text-[var(--text-faint)]">
                        ROIC {m.terminal.steadyState.roicFromAccounts ? '(reported)' : '(WACC floor)'}
                      </dt>
                      <dd className="text-[var(--text-faint)]">
                        {pct(m.terminal.steadyState.roic, 1)}
                      </dd>
                    </div>
                  </dl>
                )}

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
