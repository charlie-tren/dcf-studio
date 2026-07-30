'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Assumptions, ScenarioName } from '@/lib/types';

const SCENARIOS: { key: ScenarioName; label: string; hint: string }[] = [
  { key: 'base', label: 'Base', hint: "The company's own history" },
  { key: 'bull', label: 'Bull', hint: '+3pp growth, +2pp margin, +0.5pp terminal growth' },
  { key: 'bear', label: 'Bear', hint: '-3pp growth, -2pp margin, -0.5pp terminal growth' },
  { key: 'consensus', label: 'Consensus', hint: 'Analyst revenue for years 1-2, then fades' },
];

const SLIDERS: {
  key: keyof Assumptions;
  short: string;
  label: string;
  min: number;
  max: number;
  step: number;
  asPercent: boolean;
}[] = [
  { key: 'wacc', short: 'wacc', label: 'WACC', min: 0.03, max: 0.2, step: 0.0025, asPercent: true },
  { key: 'terminalGrowth', short: 'tg', label: 'Terminal growth', min: -0.01, max: 0.05, step: 0.0025, asPercent: true },
  { key: 'exitMultiple', short: 'em', label: 'Exit EV/EBITDA', min: 2, max: 25, step: 0.5, asPercent: false },
  { key: 'taxRate', short: 'tax', label: 'Tax rate', min: 0, max: 0.5, step: 0.005, asPercent: true },
  { key: 'capexPctRevenue', short: 'cx', label: 'Capex % revenue', min: 0, max: 0.3, step: 0.0025, asPercent: true },
  { key: 'daPctRevenue', short: 'da', label: 'D&A % revenue', min: 0, max: 0.6, step: 0.0025, asPercent: true },
  { key: 'nwcPctRevenueChange', short: 'nwc', label: 'Change in NWC % change in revenue', min: -1, max: 1, step: 0.01, asPercent: true },
];

export function AssumptionPanel({
  assumptions,
  scenario,
  modified,
}: {
  assumptions: Assumptions;
  scenario: ScenarioName;
  modified: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    router.push(`?${next.toString()}`, { scroll: false });
  }

  function reset() {
    const next = new URLSearchParams();
    next.set('scenario', scenario);
    next.set('horizon', String(assumptions.horizonYears));
    router.push(`?${next.toString()}`, { scroll: false });
  }

  return (
    <section className="rounded border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Assumptions</h2>
        {modified && (
          <button onClick={reset} className="text-sm underline">
            Reset to {scenario}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => update({ scenario: s.key })}
            title={s.hint}
            className={`rounded border px-3 py-1.5 text-sm ${
              scenario === s.key && !modified
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300'
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => update({ horizon: assumptions.horizonYears === 5 ? '10' : '5' })}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
        >
          {assumptions.horizonYears}-year horizon
        </button>
        <button
          onClick={() => update({ mid: assumptions.midYearConvention ? '0' : '1' })}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
        >
          {assumptions.midYearConvention ? 'Mid-year' : 'Year-end'} discounting
        </button>
      </div>

      {modified && (
        <p className="mt-3 text-sm text-amber-800">
          Modified from the {scenario} preset. The URL carries your changes - copy it to share this
          model.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {SLIDERS.map((s) => {
          const value = assumptions[s.key] as number;
          return (
            <label key={s.short} className="block text-sm">
              <span className="flex justify-between gap-3">
                <span className="text-neutral-600">{s.label}</span>
                <span className="font-medium tabular-nums">
                  {s.asPercent ? `${(value * 100).toFixed(2)}%` : `${value.toFixed(1)}x`}
                </span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                onChange={(e) => update({ [s.short]: e.target.value })}
                className="mt-1 w-full"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
