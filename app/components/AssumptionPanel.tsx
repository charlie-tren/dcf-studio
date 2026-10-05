'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Assumptions, ScenarioName } from '@/lib/types';

const SCENARIOS: { key: ScenarioName; label: string; hint: string }[] = [
  { key: 'base', label: 'Base', hint: "The company's own reported history" },
  { key: 'bull', label: 'Bull', hint: '+3pp growth, +2pp margin, +0.5pp terminal growth' },
  { key: 'bear', label: 'Bear', hint: '-3pp growth, -2pp margin, -0.5pp terminal growth' },
  { key: 'consensus', label: 'Consensus', hint: 'Analyst revenue for years 1-2, then fades to history' },
];

type Slider = {
  key: keyof Assumptions;
  short: string;
  label: string;
  min: number;
  max: number;
  step: number;
  asPercent: boolean;
};

const SLIDERS: Slider[] = [
  { key: 'wacc', short: 'wacc', label: 'Discount rate (WACC)', min: 0.03, max: 0.2, step: 0.0025, asPercent: true },
  { key: 'terminalGrowth', short: 'tg', label: 'Growth after the forecast', min: -0.01, max: 0.05, step: 0.0025, asPercent: true },
  { key: 'exitMultiple', short: 'em', label: 'Exit EV/EBITDA', min: 2, max: 25, step: 0.5, asPercent: false },
  { key: 'taxRate', short: 'tax', label: 'Tax rate', min: 0, max: 0.5, step: 0.005, asPercent: true },
  // Year 1 only: the forecast fades it to the steady state by the final year.
  { key: 'capexPctRevenue', short: 'cx', label: 'Capex in year 1, % of revenue', min: 0, max: 0.4, step: 0.0025, asPercent: true },
  { key: 'daPctRevenue', short: 'da', label: 'Depreciation, % of revenue', min: 0, max: 0.6, step: 0.0025, asPercent: true },
  { key: 'nwcPctRevenueChange', short: 'nwc', label: 'Working capital, % of revenue growth', min: -1, max: 1, step: 0.01, asPercent: true },
];

function fmt(s: Slider, value: number): string {
  return s.asPercent ? `${(value * 100).toFixed(2)}%` : `${value.toFixed(1)}x`;
}

function AssumptionPanelInner({
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
  const [pending, startTransition] = useTransition();

  // Slider positions and the active scenario update instantly on interaction;
  // the server then recomputes. Without this the whole panel waits on a round
  // trip and every click feels broken.
  //
  // Draft state is discarded by remounting on a key derived from the server's
  // answer (see the wrapper at the bottom of this file), not by clearing it in
  // an effect - a setState inside an effect triggers a cascading render.
  const [draft, setDraft] = useState<Partial<Record<string, number>>>({});
  const [optimisticScenario, setOptimisticScenario] = useState<ScenarioName | null>(null);

  function push(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  function chooseScenario(key: ScenarioName) {
    setOptimisticScenario(key);
    // A preset replaces every driver, so drop any slider overrides with it.
    const next = new URLSearchParams();
    next.set('scenario', key);
    next.set('horizon', String(assumptions.horizonYears));
    if (assumptions.midYearConvention === false) next.set('mid', '0');
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  function reset() {
    setOptimisticScenario(null);
    setDraft({});
    const next = new URLSearchParams();
    next.set('scenario', scenario);
    next.set('horizon', String(assumptions.horizonYears));
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  }

  const shownScenario = optimisticScenario ?? scenario;
  const shownModified = optimisticScenario ? false : modified;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-wide text-[var(--text-dim)] uppercase">
          Assumptions
        </h2>
        <div className="flex items-center gap-3">
          {pending && <span className="text-xs text-[var(--text-faint)]">Recalculating…</span>}
          {shownModified && (
            <button
              onClick={reset}
              className="text-xs text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline"
            >
              Reset to {shownScenario}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {/*
          The selected case must be unmistakable. On the first cut it was a dark
          fill on a light palette and read as unselected - hence "there should be
          base selected as default" when base already was.
        */}
        <div className="flex rounded-md border border-[var(--border-strong)] bg-[var(--bg)] p-0.5">
          {SCENARIOS.map((s) => {
            const active = shownScenario === s.key;
            return (
              <button
                key={s.key}
                onClick={() => chooseScenario(s.key)}
                title={s.hint}
                aria-pressed={active}
                className={`rounded px-3.5 py-1.5 text-sm transition-all duration-100 ${
                  active
                    ? 'bg-[var(--accent)] font-semibold text-[#07110d] shadow-sm'
                    : 'text-[var(--text-dim)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]'
                }`}
              >
                {s.label}
                {active && shownModified ? ' *' : ''}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => push({ horizon: assumptions.horizonYears === 5 ? '10' : '5' })}
          className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[var(--text-dim)] transition-colors duration-100 hover:border-[var(--accent)] hover:text-[var(--text)]"
        >
          {assumptions.horizonYears}-year forecast
        </button>
        <button
          onClick={() => push({ mid: assumptions.midYearConvention ? '0' : '1' })}
          title="Mid-year: flows and terminal value discounted at t - 0.5"
          className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[var(--text-dim)] transition-colors duration-100 hover:border-[var(--accent)] hover:text-[var(--text)]"
        >
          {assumptions.midYearConvention ? 'Mid-year' : 'Year-end'} discounting
        </button>
        <button
          onClick={() => push({ tcx: assumptions.terminalCapexEqualsDA ? '0' : '1' })}
          title="On: maintenance capex at depreciation and the working-capital movement released, then g/ROIC of NOPAT reinvested to fund terminal growth - one reinvestment charge covering both. Off: capitalises the final year's FCFF as forecast."
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors duration-100 ${
            assumptions.terminalCapexEqualsDA
              ? 'border-[var(--border-strong)] text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--text)]'
              : 'border-[var(--negative)] text-[var(--negative)]'
          }`}
        >
          Terminal: {assumptions.terminalCapexEqualsDA ? 'steady state' : 'as forecast'}
        </button>
      </div>

      {shownModified && (
        <p className="mt-3 text-xs text-[var(--text-faint)]">
Edited from {shownScenario}. State is in the URL.
        </p>
      )}

      <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
        {SLIDERS.map((s) => {
          const committed = assumptions[s.key] as number;
          const value = draft[s.short] ?? committed;
          return (
            <label key={s.short} className="block">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-[var(--text-dim)]">{s.label}</span>
                <span className="nums text-sm font-medium text-[var(--text)]">{fmt(s, value)}</span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                onChange={(e) => setDraft((d) => ({ ...d, [s.short]: Number(e.target.value) }))}
                onMouseUp={(e) => push({ [s.short]: (e.target as HTMLInputElement).value })}
                onTouchEnd={(e) => push({ [s.short]: (e.target as HTMLInputElement).value })}
                onKeyUp={(e) => push({ [s.short]: (e.target as HTMLInputElement).value })}
                className="mt-2 w-full"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Remounts the panel whenever the server returns a different model, which
 * discards any in-flight slider drafts. Cheaper and safer than clearing state
 * inside an effect, which triggers a cascading render.
 */
export function AssumptionPanel(props: {
  assumptions: Assumptions;
  scenario: ScenarioName;
  modified: boolean;
}) {
  const key = [
    props.scenario,
    props.modified,
    props.assumptions.horizonYears,
    props.assumptions.midYearConvention,
    props.assumptions.terminalCapexEqualsDA,
    props.assumptions.wacc,
    props.assumptions.terminalGrowth,
    props.assumptions.exitMultiple,
    props.assumptions.taxRate,
    props.assumptions.capexPctRevenue,
    props.assumptions.daPctRevenue,
    props.assumptions.nwcPctRevenueChange,
  ].join('|');
  return <AssumptionPanelInner key={key} {...props} />;
}
