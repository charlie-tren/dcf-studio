# DCF Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public web app where you type a company name, pick a scenario, adjust any assumption, and get a discounted cashflow valuation with every intermediate line visible.

**Architecture:** Bottom-up. The pure DCF engine (no I/O, no clock) is built and tested first against a hand-computed reference model. The data layer sits behind it: one module owns all Yahoo calls, one owns normalisation and every fallback chain, and recorded JSON fixtures mean tests never hit the network. A thin orchestrator composes them, a server route exposes it, and the UI renders the workings rather than just the answer.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, `yahoo-finance2` v3, vitest, Tailwind, deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-07-30-dcf-studio-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/types.ts` | Every shared type. No logic. |
| `lib/markets.ts` | Market registry: suffix → currency, sub-unit divisor, statutory tax, risk-free source, tier, ERP default. |
| `lib/dcf.ts` | **Pure engine.** Assumptions in, valuation out. No network, no `Date`, no config reads. |
| `lib/sensitivity.ts` | WACC × terminal-growth grid, calling `lib/dcf.ts`. |
| `lib/yahoo.ts` | The only code that talks to Yahoo. Returns raw shapes, does no interpretation. |
| `lib/normalise.ts` | Raw Yahoo fields → canonical `Fundamentals`. Owns every fallback chain and sign convention. |
| `lib/fx.ts` | Reporting↔quote currency conversion and sub-unit handling. |
| `lib/riskfree.ts` | `^TNX` (USD), RBA F2 (AUD), documented defaults elsewhere. |
| `lib/wacc.ts` | Cost of equity and debt, weights, beta guard. Returns every component. |
| `lib/scenarios.ts` | Base/Bull/Bear from history, Consensus from `earningsTrend`, capex sustainability guard. |
| `lib/valuation.ts` | Orchestrator: ticker → fetch → normalise → scenario → WACC → engine → result. |
| `lib/urlstate.ts` | Encode/decode the assumption set to a query string. |
| `app/api/search/route.ts` | Name→ticker resolution, exchange-ranked. |
| `app/api/valuation/route.ts` | Ticker + assumptions → valuation JSON. Owns caching. |
| `app/page.tsx` | Search entry. |
| `app/[ticker]/page.tsx` | The model: headline, assumption panel, all workings. |
| `app/components/*.tsx` | Presentational only. No calculation. |
| `scripts/record-fixtures.ts` | One-off: records live Yahoo responses to `tests/fixtures/`. |

**Dependency rule:** `lib/dcf.ts` and `lib/markets.ts` import nothing from the rest of `lib/`. Everything else may depend on them, never the reverse. `lib/yahoo.ts` is the only file importing `yahoo-finance2`.

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Scaffold Next.js in the existing repo**

The repo already exists at `~/dev/dcf-studio` with `.git` and `docs/`. `create-next-app` refuses a non-empty directory in some versions, so scaffold into a temp directory and move the contents in. Run from `~/dev`:

```bash
npx --yes create-next-app@latest dcf-studio-scaffold --typescript --tailwind --app --eslint --no-src-dir --use-npm --turbopack --no-import-alias
```

- [ ] **Step 2: Move the scaffold into the repo**

Delete `node_modules` **before** copying. Copying thousands of small files into a
OneDrive-adjacent path on Windows is slow, lock-prone, and can half-succeed.
`npm install` in Step 3 recreates it in place.

```bash
cd ~/dev && rm -rf dcf-studio-scaffold/.git dcf-studio-scaffold/node_modules && cp -r dcf-studio-scaffold/. dcf-studio/ && rm -rf dcf-studio-scaffold
```

Windows note: if file locks still cause failures, close any editor holding the folder. Do not blanket-kill `node.exe`.

- [ ] **Step 3: Install runtime and test dependencies**

```bash
cd ~/dev/dcf-studio && npm install yahoo-finance2 && npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 4: Add the vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 5: Add test scripts to `package.json`**

Add to the `"scripts"` block:

```json
"test": "vitest run --passWithNoTests",
"test:watch": "vitest"
```

`--passWithNoTests` matters: without it the first run exits non-zero before any test
exists, which reads as a broken toolchain.

- [ ] **Step 6: Verify the toolchain runs**

```bash
cd ~/dev/dcf-studio && npx tsc --noEmit && npm test
```

Expected: both exit 0. `npm test` reports no test files, which is correct at this point and proves vitest resolves.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/dcf-studio && git add -A && git commit -m "chore: scaffold Next.js + vitest"
```

---

### Task 2: Shared types

**Files:**
- Create: `lib/types.ts`

No tests - this file has no behaviour. Later tasks depend on these names being exact.

- [ ] **Step 1: Write the types**

Create `lib/types.ts`:

```typescript
/** Where a normalised number came from. Rendered in the UI so any output is traceable. */
export type Provenance = {
  /** Raw Yahoo field name, or 'derived' when computed. */
  sourceField: string;
  /** Human-readable note, present only when derived. */
  derivation?: string;
  derived: boolean;
};

export type Sourced<T> = { value: T; provenance: Provenance };

export type DataQualityCode =
  | 'MISSING_FIELD_DERIVED'
  | 'FINANCIAL_SECTOR'
  | 'CURRENCY_MISMATCH'
  | 'BETA_CLAMPED'
  | 'BETA_MISSING'
  | 'RISK_FREE_ASSUMED'
  | 'THIN_ANALYST_COVERAGE'
  | 'NO_ANALYST_COVERAGE'
  | 'CAPEX_BELOW_DA'
  | 'NEGATIVE_FCFF'
  | 'SHORT_HISTORY'
  | 'TERMINAL_GROWTH_BLOCKED'
  | 'STALE_DATA';

export type DataQualityFlag = {
  code: DataQualityCode;
  severity: 'info' | 'warn' | 'error';
  message: string;
};

/** One historical fiscal year, fully normalised. Signs are canonical (see lib/normalise.ts). */
export type FiscalYear = {
  periodEnd: string;
  revenue: Sourced<number>;
  ebit: Sourced<number>;
  taxProvision: Sourced<number>;
  pretaxIncome: Sourced<number>;
  dAndA: Sourced<number>;
  /** Positive = cash outflow. */
  capex: Sourced<number>;
  /** Positive = increase in net working capital = cash outflow. */
  changeInNwc: Sourced<number>;
  totalDebt: Sourced<number>;
  cash: Sourced<number>;
  shares: Sourced<number>;
  interestExpense: Sourced<number> | null;
};

export type Fundamentals = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  reportingCurrency: string;
  quoteCurrency: string;
  /** Newest year first. */
  years: FiscalYear[];
  /** As quoted, in quote currency display units (pence for GBp). */
  price: number;
  marketCap: number;
  rawBeta: number | null;
  /** Consensus revenue estimates, nearest period first. Empty when uncovered. */
  analystRevenue: { period: string; revenue: number; analysts: number }[];
  flags: DataQualityFlag[];
};

export type Assumptions = {
  horizonYears: 5 | 10;
  /** Length must equal horizonYears. */
  revenueGrowth: number[];
  /** Length must equal horizonYears. */
  ebitMargin: number[];
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenueChange: number;
  terminalGrowth: number;
  exitMultiple: number;
  wacc: number;
  midYearConvention: boolean;
};

export type DcfInputs = {
  baseRevenue: number;
  netDebt: number;
  dilutedShares: number;
};

export type ForecastYear = {
  year: number;
  revenue: number;
  ebit: number;
  nopat: number;
  dAndA: number;
  capex: number;
  changeInNwc: number;
  fcff: number;
  discountFactor: number;
  presentValue: number;
};

export type TerminalValue = {
  method: 'gordon' | 'exitMultiple';
  undiscounted: number;
  presentValue: number;
  /** Terminal PV as a share of enterprise value, 0-1. */
  shareOfEv: number;
  /** Set when the method could not be computed; presentValue is 0 in that case. */
  blocked?: string;
};

export type ValuationByMethod = {
  terminal: TerminalValue;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
};

export type DcfResult = {
  forecast: ForecastYear[];
  pvExplicit: number;
  gordon: ValuationByMethod;
  exitMultiple: ValuationByMethod;
  warnings: string[];
};

export type WaccBreakdown = {
  riskFreeRate: number;
  riskFreeSource: string;
  riskFreeAssumed: boolean;
  equityRiskPremium: number;
  rawBeta: number | null;
  beta: number;
  betaClamped: boolean;
  costOfEquity: number;
  costOfDebt: number;
  costOfDebtSource: string;
  marketCap: number;
  totalDebt: number;
  equityWeight: number;
  debtWeight: number;
  taxRate: number;
  wacc: number;
};

export type ScenarioName = 'base' | 'bull' | 'bear' | 'consensus';
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/dev/dcf-studio && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts && git commit -m "feat: shared types"
```

---

### Task 3: Market registry

**Files:**
- Create: `lib/markets.ts`
- Test: `tests/markets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/markets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { marketFor, QUOTE_SUBUNIT_DIVISOR } from '@/lib/markets';

describe('marketFor', () => {
  it('resolves an ASX ticker to a tier-1 AUD market', () => {
    const m = marketFor('BHP.AX');
    expect(m.currency).toBe('AUD');
    expect(m.tier).toBe(1);
    expect(m.riskFreeSource).toBe('rba');
    expect(m.statutoryTaxRate).toBeCloseTo(0.30, 5);
  });

  it('resolves a bare ticker to the US market', () => {
    const m = marketFor('MSFT');
    expect(m.currency).toBe('USD');
    expect(m.tier).toBe(1);
    expect(m.riskFreeSource).toBe('yahoo-tnx');
  });

  it('resolves an unknown suffix to a tier-2 market with an assumed risk-free rate', () => {
    const m = marketFor('XYZ.ZZ');
    expect(m.tier).toBe(2);
    expect(m.riskFreeSource).toBe('default');
  });

  it('knows GBp is quoted in pence, not pounds', () => {
    expect(QUOTE_SUBUNIT_DIVISOR.GBp).toBe(100);
    expect(QUOTE_SUBUNIT_DIVISOR.ZAc).toBe(100);
    expect(QUOTE_SUBUNIT_DIVISOR.USD).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd ~/dev/dcf-studio && npx vitest run tests/markets.test.ts
```

Expected: FAIL - cannot resolve `@/lib/markets`.

- [ ] **Step 3: Implement the registry**

Create `lib/markets.ts`:

```typescript
export type RiskFreeSource = 'yahoo-tnx' | 'rba' | 'default';

export type Market = {
  suffix: string;
  name: string;
  currency: string;
  /** 1 = risk-free rate is sourced live. 2 = risk-free rate is an assumption. */
  tier: 1 | 2;
  riskFreeSource: RiskFreeSource;
  /** Used only when riskFreeSource is 'default'. Documented assumption, editable in the UI. */
  defaultRiskFreeRate: number;
  equityRiskPremium: number;
  statutoryTaxRate: number;
};

/**
 * Currencies quoted in a sub-unit. Divide the quoted price by this to get the
 * major unit. Shell quotes GBp (pence) while reporting USD - the 100x trap.
 */
export const QUOTE_SUBUNIT_DIVISOR: Record<string, number> = {
  GBp: 100,
  ZAc: 100,
  ILA: 100,
};

const US: Market = {
  suffix: '',
  name: 'United States',
  currency: 'USD',
  tier: 1,
  riskFreeSource: 'yahoo-tnx',
  defaultRiskFreeRate: 0.042,
  equityRiskPremium: 0.055,
  statutoryTaxRate: 0.21,
};

const MARKETS: Market[] = [
  US,
  { suffix: 'AX', name: 'ASX', currency: 'AUD', tier: 1, riskFreeSource: 'rba', defaultRiskFreeRate: 0.042, equityRiskPremium: 0.06, statutoryTaxRate: 0.30 },
  { suffix: 'NZ', name: 'NZX', currency: 'NZD', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.045, equityRiskPremium: 0.065, statutoryTaxRate: 0.28 },
  { suffix: 'L', name: 'London', currency: 'GBP', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.045, equityRiskPremium: 0.055, statutoryTaxRate: 0.25 },
  { suffix: 'DE', name: 'Xetra', currency: 'EUR', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.026, equityRiskPremium: 0.06, statutoryTaxRate: 0.30 },
  { suffix: 'PA', name: 'Euronext Paris', currency: 'EUR', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.032, equityRiskPremium: 0.06, statutoryTaxRate: 0.258 },
  { suffix: 'SW', name: 'SIX Swiss', currency: 'CHF', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.005, equityRiskPremium: 0.055, statutoryTaxRate: 0.15 },
  { suffix: 'HK', name: 'HKEX', currency: 'HKD', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.032, equityRiskPremium: 0.07, statutoryTaxRate: 0.165 },
  { suffix: 'T', name: 'Tokyo', currency: 'JPY', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.017, equityRiskPremium: 0.06, statutoryTaxRate: 0.305 },
  { suffix: 'TO', name: 'Toronto', currency: 'CAD', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.033, equityRiskPremium: 0.055, statutoryTaxRate: 0.265 },
  { suffix: 'NS', name: 'India NSE', currency: 'INR', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.068, equityRiskPremium: 0.08, statutoryTaxRate: 0.252 },
  { suffix: 'KS', name: 'Korea', currency: 'KRW', tier: 2, riskFreeSource: 'default', defaultRiskFreeRate: 0.030, equityRiskPremium: 0.07, statutoryTaxRate: 0.242 },
];

const UNKNOWN: Market = {
  suffix: '?',
  name: 'Unknown market',
  currency: 'USD',
  tier: 2,
  riskFreeSource: 'default',
  defaultRiskFreeRate: 0.042,
  equityRiskPremium: 0.065,
  statutoryTaxRate: 0.25,
};

/** Exchange preference for ranking name-search results. Earlier is better. */
export const EXCHANGE_RANK = ['ASX', 'NMS', 'NYQ', 'NGM', 'NCM', 'PCX', 'LSE', 'GER', 'PAR', 'EBS', 'HKG', 'JPX', 'TOR', 'NSI', 'KSC', 'NZE'];

export function marketFor(ticker: string): Market {
  const dot = ticker.lastIndexOf('.');
  if (dot === -1) return US;
  const suffix = ticker.slice(dot + 1).toUpperCase();
  return MARKETS.find((m) => m.suffix === suffix) ?? UNKNOWN;
}

export function allMarkets(): Market[] {
  return MARKETS;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run tests/markets.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/markets.ts tests/markets.test.ts && git commit -m "feat: market registry with sub-unit and risk-free tiering"
```

---

### Task 4: DCF engine - the FCFF build

**Files:**
- Create: `lib/dcf.ts`
- Test: `tests/dcf.test.ts`

The reference model below is hand-computed. Every expected number is derivable on paper, which is the point - the engine is checked against an independent recompute, not against itself.

**Reference model:** base revenue 1000, growth 10% flat for 5 years, EBIT margin 20%, tax 30%, D&A 5% of revenue, capex 7% of revenue, ΔNWC 10% of Δrevenue, WACC 10%, terminal growth 2.5%, exit multiple 8x, net debt 500, shares 100.

Because every driver is a percentage of revenue, FCFF grows at exactly the revenue growth rate. Hand-computed FCFF: **122, 134.2, 147.62, 162.382, 178.6202**.

- [ ] **Step 1: Write the failing test for the FCFF build**

Create `tests/dcf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runDcf } from '@/lib/dcf';
import type { Assumptions, DcfInputs } from '@/lib/types';

/** Hand-computed reference model. See the plan for the derivation. */
export const REF_ASSUMPTIONS: Assumptions = {
  horizonYears: 5,
  revenueGrowth: [0.10, 0.10, 0.10, 0.10, 0.10],
  ebitMargin: [0.20, 0.20, 0.20, 0.20, 0.20],
  taxRate: 0.30,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.07,
  nwcPctRevenueChange: 0.10,
  terminalGrowth: 0.025,
  exitMultiple: 8,
  wacc: 0.10,
  midYearConvention: false,
};

export const REF_INPUTS: DcfInputs = {
  baseRevenue: 1000,
  netDebt: 500,
  dilutedShares: 100,
};

describe('runDcf - FCFF build', () => {
  it('compounds revenue off the base year', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(r.forecast.map((f) => f.revenue)).toEqual([1100, 1210, 1331, 1464.1, 1610.51]);
  });

  it('builds FCFF as NOPAT + D&A - capex - change in NWC', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const fcff = r.forecast.map((f) => Number(f.fcff.toFixed(4)));
    expect(fcff).toEqual([122, 134.2, 147.62, 162.382, 178.6202]);
  });

  it('treats capex and change in NWC as outflows, never as absolute values', () => {
    // Negative growth shrinks revenue, so working capital releases cash:
    // change in NWC is negative and therefore ADDS to FCFF.
    const shrinking: Assumptions = { ...REF_ASSUMPTIONS, revenueGrowth: [-0.10, -0.10, -0.10, -0.10, -0.10] };
    const r = runDcf(REF_INPUTS, shrinking);
    expect(r.forecast[0].changeInNwc).toBeCloseTo(-10, 6);
    // NOPAT 900*0.2*0.7 = 126, D&A 45, capex 63, dNWC -10 => 126+45-63+10 = 118
    expect(r.forecast[0].fcff).toBeCloseTo(118, 6);
  });

  it('produces one forecast year per horizon year', () => {
    const ten: Assumptions = {
      ...REF_ASSUMPTIONS,
      horizonYears: 10,
      revenueGrowth: Array(10).fill(0.10),
      ebitMargin: Array(10).fill(0.20),
    };
    expect(runDcf(REF_INPUTS, ten).forecast).toHaveLength(10);
  });

  it('rejects an assumption array whose length does not match the horizon', () => {
    const bad: Assumptions = { ...REF_ASSUMPTIONS, revenueGrowth: [0.1, 0.1] };
    expect(() => runDcf(REF_INPUTS, bad)).toThrow(/revenueGrowth/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: FAIL - cannot resolve `@/lib/dcf`.

- [ ] **Step 3: Implement the FCFF build**

Create `lib/dcf.ts`:

```typescript
import type { Assumptions, DcfInputs, DcfResult, ForecastYear } from './types';

function assertLength(name: string, arr: number[], expected: number): void {
  if (arr.length !== expected) {
    throw new Error(`${name} must have ${expected} entries to match horizonYears, got ${arr.length}`);
  }
}

/**
 * Builds the explicit forecast. Sign convention, applied consistently:
 * capex and changeInNwc are positive when they consume cash, so both are
 * subtracted. A revenue fall makes changeInNwc negative, which correctly
 * releases cash. There is deliberately no Math.abs anywhere in this file.
 */
function buildForecast(inputs: DcfInputs, a: Assumptions): ForecastYear[] {
  const years: ForecastYear[] = [];
  let previousRevenue = inputs.baseRevenue;

  for (let i = 0; i < a.horizonYears; i++) {
    const revenue = previousRevenue * (1 + a.revenueGrowth[i]);
    const ebit = revenue * a.ebitMargin[i];
    const nopat = ebit * (1 - a.taxRate);
    const dAndA = revenue * a.daPctRevenue;
    const capex = revenue * a.capexPctRevenue;
    const changeInNwc = (revenue - previousRevenue) * a.nwcPctRevenueChange;
    const fcff = nopat + dAndA - capex - changeInNwc;

    years.push({
      year: i + 1,
      revenue,
      ebit,
      nopat,
      dAndA,
      capex,
      changeInNwc,
      fcff,
      discountFactor: 0,
      presentValue: 0,
    });
    previousRevenue = revenue;
  }
  return years;
}

export function runDcf(inputs: DcfInputs, a: Assumptions): DcfResult {
  assertLength('revenueGrowth', a.revenueGrowth, a.horizonYears);
  assertLength('ebitMargin', a.ebitMargin, a.horizonYears);

  const forecast = buildForecast(inputs, a);

  // Discounting, terminal value and the bridge arrive in the next tasks.
  return {
    forecast,
    pvExplicit: 0,
    gordon: {
      terminal: { method: 'gordon', undiscounted: 0, presentValue: 0, shareOfEv: 0 },
      enterpriseValue: 0,
      equityValue: 0,
      valuePerShare: 0,
    },
    exitMultiple: {
      terminal: { method: 'exitMultiple', undiscounted: 0, presentValue: 0, shareOfEv: 0 },
      enterpriseValue: 0,
      equityValue: 0,
      valuePerShare: 0,
    },
    warnings: [],
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/dcf.ts tests/dcf.test.ts && git commit -m "feat: DCF engine FCFF build with canonical sign convention"
```

---

### Task 5: DCF engine - discounting

**Files:**
- Modify: `lib/dcf.ts`
- Modify: `tests/dcf.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/dcf.test.ts`:

```typescript
describe('runDcf - discounting', () => {
  it('discounts year-end at full t', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(r.forecast[0].discountFactor).toBeCloseTo(1 / 1.1, 10);
    expect(r.forecast[4].discountFactor).toBeCloseTo(1 / 1.1 ** 5, 10);
  });

  it('sums the present values of the explicit forecast', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    // Independent recompute: FCFF growing at exactly the discount rate means
    // every year has the same PV of 122/1.1, so the sum is 5 x that.
    expect(r.pvExplicit).toBeCloseTo(5 * (122 / 1.1), 8);
  });

  it('discounts mid-year at t - 0.5, worth sqrt(1 + WACC) more', () => {
    const end = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const mid = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, midYearConvention: true });
    expect(mid.forecast[0].discountFactor).toBeCloseTo(1 / 1.1 ** 0.5, 10);
    expect(mid.pvExplicit).toBeCloseTo(end.pvExplicit * Math.sqrt(1.1), 8);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: 3 new failures - discount factors are 0.

- [ ] **Step 3: Implement discounting**

In `lib/dcf.ts`, add above `runDcf`:

```typescript
/** Year-end discounts at t, mid-year at t - 0.5. */
function discountExponent(year: number, midYear: boolean): number {
  return midYear ? year - 0.5 : year;
}

function discount(forecast: ForecastYear[], a: Assumptions): number {
  let pvExplicit = 0;
  for (const y of forecast) {
    y.discountFactor = 1 / (1 + a.wacc) ** discountExponent(y.year, a.midYearConvention);
    y.presentValue = y.fcff * y.discountFactor;
    pvExplicit += y.presentValue;
  }
  return pvExplicit;
}
```

Then in `runDcf`, replace `const forecast = buildForecast(inputs, a);` and the `pvExplicit: 0,` line with:

```typescript
  const forecast = buildForecast(inputs, a);
  const pvExplicit = discount(forecast, a);
```

and use `pvExplicit,` in the returned object.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/dcf.ts tests/dcf.test.ts && git commit -m "feat: mid-year and year-end discounting"
```

---

### Task 6: DCF engine - terminal value, both methods

**Files:**
- Modify: `lib/dcf.ts`
- Modify: `tests/dcf.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/dcf.test.ts`:

```typescript
describe('runDcf - terminal value', () => {
  it('computes Gordon growth off the final year FCFF', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const expected = (178.6202 * 1.025) / (0.10 - 0.025);
    expect(r.gordon.terminal.undiscounted).toBeCloseTo(expected, 4);
    expect(r.gordon.terminal.presentValue).toBeCloseTo(expected / 1.1 ** 5, 4);
  });

  it('computes the exit multiple off terminal EBITDA', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    // Terminal EBITDA = EBIT + D&A = 1610.51*0.20 + 1610.51*0.05 = 402.6275
    const expected = 1610.51 * 0.25 * 8;
    expect(r.exitMultiple.terminal.undiscounted).toBeCloseTo(expected, 4);
    expect(r.exitMultiple.terminal.presentValue).toBeCloseTo(expected / 1.1 ** 5, 4);
  });

  it('discounts the terminal value at full t even under the mid-year convention', () => {
    // Terminal value sits at the end of year n by construction, so it is not
    // shifted half a year. Only the explicit cashflows are.
    const mid = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, midYearConvention: true });
    const expected = (178.6202 * 1.025) / 0.075;
    expect(mid.gordon.terminal.presentValue).toBeCloseTo(expected / 1.1 ** 5, 4);
  });

  it('blocks Gordon growth when terminal growth meets or exceeds WACC', () => {
    const r = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, terminalGrowth: 0.10 });
    expect(r.gordon.terminal.blocked).toMatch(/terminal growth/i);
    expect(r.gordon.terminal.presentValue).toBe(0);
    expect(r.warnings.some((w) => /terminal growth/i.test(w))).toBe(true);
    // The exit multiple is unaffected and still produces a value.
    expect(r.exitMultiple.terminal.presentValue).toBeGreaterThan(0);
  });

  it('reports each method terminal share of enterprise value', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    const g = r.gordon;
    expect(g.terminal.shareOfEv).toBeCloseTo(g.terminal.presentValue / g.enterpriseValue, 10);
    expect(g.terminal.shareOfEv).toBeGreaterThan(0.6);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: 5 new failures.

- [ ] **Step 3: Implement both terminal methods**

In `lib/dcf.ts`, extend the existing import from `./types` to read:

```typescript
import type { Assumptions, DcfInputs, DcfResult, ForecastYear, TerminalValue, ValuationByMethod } from './types';
```

Then add:

```typescript
function terminalDiscountFactor(a: Assumptions): number {
  // Terminal value sits at the end of the final explicit year, so it always
  // discounts at full t, regardless of the convention used for the flows.
  return 1 / (1 + a.wacc) ** a.horizonYears;
}

function gordonTerminal(finalFcff: number, a: Assumptions): TerminalValue {
  if (a.terminalGrowth >= a.wacc) {
    return {
      method: 'gordon',
      undiscounted: 0,
      presentValue: 0,
      shareOfEv: 0,
      blocked: `Terminal growth of ${(a.terminalGrowth * 100).toFixed(2)}% must be below the WACC of ${(a.wacc * 100).toFixed(2)}% for a perpetuity to converge.`,
    };
  }
  const undiscounted = (finalFcff * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
  return {
    method: 'gordon',
    undiscounted,
    presentValue: undiscounted * terminalDiscountFactor(a),
    shareOfEv: 0,
  };
}

function exitMultipleTerminal(finalYear: ForecastYear, a: Assumptions): TerminalValue {
  const terminalEbitda = finalYear.ebit + finalYear.dAndA;
  const undiscounted = terminalEbitda * a.exitMultiple;
  return {
    method: 'exitMultiple',
    undiscounted,
    presentValue: undiscounted * terminalDiscountFactor(a),
    shareOfEv: 0,
  };
}

function bridge(pvExplicit: number, terminal: TerminalValue, inputs: DcfInputs): ValuationByMethod {
  const enterpriseValue = pvExplicit + terminal.presentValue;
  const equityValue = enterpriseValue - inputs.netDebt;
  return {
    terminal: {
      ...terminal,
      shareOfEv: enterpriseValue === 0 ? 0 : terminal.presentValue / enterpriseValue,
    },
    enterpriseValue,
    equityValue,
    valuePerShare: inputs.dilutedShares === 0 ? 0 : equityValue / inputs.dilutedShares,
  };
}
```

Replace the return block of `runDcf` with:

```typescript
  const finalYear = forecast[forecast.length - 1];
  const gordonTv = gordonTerminal(finalYear.fcff, a);
  const exitTv = exitMultipleTerminal(finalYear, a);

  const warnings: string[] = [];
  if (gordonTv.blocked) warnings.push(gordonTv.blocked);
  if (forecast.some((y) => y.fcff < 0)) {
    warnings.push('Free cashflow to firm is negative in at least one forecast year, so terminal value carries most of the valuation.');
  }

  return {
    forecast,
    pvExplicit,
    gordon: bridge(pvExplicit, gordonTv, inputs),
    exitMultiple: bridge(pvExplicit, exitTv, inputs),
    warnings,
  };
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: 13 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/dcf.ts tests/dcf.test.ts && git commit -m "feat: Gordon growth and exit multiple terminal values with convergence guard"
```

---

### Task 7: DCF engine - the equity bridge, end to end

**Files:**
- Modify: `tests/dcf.test.ts`

The bridge is already implemented. This task locks it down with a full reconciliation, the way a client model is checked.

- [ ] **Step 1: Write the reconciliation test**

Append to `tests/dcf.test.ts`:

```typescript
describe('runDcf - full reconciliation against an independent recompute', () => {
  it('reconciles enterprise value, equity value and value per share', () => {
    const r = runDcf(REF_INPUTS, REF_ASSUMPTIONS);

    // Recomputed longhand, not by reusing the engine's loop.
    const pvExplicit = 5 * (122 / 1.1);
    const pvTerminal = ((178.6202 * 1.025) / 0.075) / 1.1 ** 5;
    const ev = pvExplicit + pvTerminal;
    const equity = ev - 500;

    expect(r.pvExplicit).toBeCloseTo(pvExplicit, 6);
    expect(r.gordon.enterpriseValue).toBeCloseTo(ev, 6);
    expect(r.gordon.equityValue).toBeCloseTo(equity, 6);
    expect(r.gordon.valuePerShare).toBeCloseTo(equity / 100, 8);
  });

  it('subtracts net debt, so a net cash company is worth more than its EV implies', () => {
    const netCash = runDcf({ ...REF_INPUTS, netDebt: -200 }, REF_ASSUMPTIONS);
    const netDebt = runDcf(REF_INPUTS, REF_ASSUMPTIONS);
    expect(netCash.gordon.equityValue - netDebt.gordon.equityValue).toBeCloseTo(700, 6);
  });

  it('flags negative free cashflow rather than hiding it', () => {
    const lossMaker = runDcf(REF_INPUTS, { ...REF_ASSUMPTIONS, ebitMargin: Array(5).fill(-0.15) });
    expect(lossMaker.forecast.every((y) => y.fcff < 0)).toBe(true);
    expect(lossMaker.warnings.some((w) => /negative/i.test(w))).toBe(true);
  });

  it('returns zero per share rather than Infinity when the share count is missing', () => {
    const r = runDcf({ ...REF_INPUTS, dilutedShares: 0 }, REF_ASSUMPTIONS);
    expect(r.gordon.valuePerShare).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/dcf.test.ts
```

Expected: 17 passing. If the reconciliation fails, the engine is wrong - do not adjust the expected values to match it.

- [ ] **Step 3: Commit**

```bash
git add tests/dcf.test.ts && git commit -m "test: full DCF reconciliation against independent recompute"
```

---

### Task 8: Sensitivity grid

**Files:**
- Create: `lib/sensitivity.ts`
- Test: `tests/sensitivity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sensitivity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sensitivityGrid } from '@/lib/sensitivity';
import type { Assumptions, DcfInputs } from '@/lib/types';

const A: Assumptions = {
  horizonYears: 5,
  revenueGrowth: Array(5).fill(0.10),
  ebitMargin: Array(5).fill(0.20),
  taxRate: 0.30,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.07,
  nwcPctRevenueChange: 0.10,
  terminalGrowth: 0.025,
  exitMultiple: 8,
  wacc: 0.10,
  midYearConvention: false,
};
const I: DcfInputs = { baseRevenue: 1000, netDebt: 500, dilutedShares: 100 };

describe('sensitivityGrid', () => {
  it('returns a value per share for every WACC and terminal growth pair', () => {
    const g = sensitivityGrid(I, A, { waccSteps: 2, waccStep: 0.01, growthSteps: 1, growthStep: 0.005 });
    expect(g.waccValues).toEqual([0.08, 0.09, 0.10, 0.11, 0.12]);
    expect(g.growthValues).toEqual([0.02, 0.025, 0.03]);
    expect(g.cells).toHaveLength(5);
    expect(g.cells[0]).toHaveLength(3);
  });

  it('values fall as WACC rises and rise as terminal growth rises', () => {
    const g = sensitivityGrid(I, A, { waccSteps: 1, waccStep: 0.02, growthSteps: 1, growthStep: 0.01 });
    const lowWacc = g.cells[0][1];
    const highWacc = g.cells[2][1];
    expect(lowWacc).toBeGreaterThan(highWacc);
    expect(g.cells[1][2]).toBeGreaterThan(g.cells[1][0]);
  });

  it('returns null for a cell where the perpetuity cannot converge', () => {
    const g = sensitivityGrid(I, { ...A, wacc: 0.03 }, { waccSteps: 1, waccStep: 0.01, growthSteps: 1, growthStep: 0.01 });
    // WACC 0.02 with terminal growth 0.035 cannot converge.
    expect(g.cells[0][2]).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/sensitivity.test.ts
```

Expected: FAIL - cannot resolve `@/lib/sensitivity`.

- [ ] **Step 3: Implement the grid**

Create `lib/sensitivity.ts`:

```typescript
import { runDcf } from './dcf';
import type { Assumptions, DcfInputs } from './types';

export type GridOptions = {
  /** Number of steps either side of the central WACC. */
  waccSteps: number;
  waccStep: number;
  /** Number of steps either side of the central terminal growth rate. */
  growthSteps: number;
  growthStep: number;
};

export type SensitivityGrid = {
  waccValues: number[];
  growthValues: number[];
  /** cells[waccIndex][growthIndex]. Null where the perpetuity cannot converge. */
  cells: (number | null)[][];
};

function axis(centre: number, steps: number, step: number): number[] {
  const values: number[] = [];
  for (let i = -steps; i <= steps; i++) {
    values.push(Number((centre + i * step).toFixed(6)));
  }
  return values;
}

export function sensitivityGrid(inputs: DcfInputs, a: Assumptions, o: GridOptions): SensitivityGrid {
  const waccValues = axis(a.wacc, o.waccSteps, o.waccStep);
  const growthValues = axis(a.terminalGrowth, o.growthSteps, o.growthStep);

  const cells = waccValues.map((wacc) =>
    growthValues.map((terminalGrowth) => {
      const r = runDcf(inputs, { ...a, wacc, terminalGrowth });
      return r.gordon.terminal.blocked ? null : r.gordon.valuePerShare;
    })
  );

  return { waccValues, growthValues, cells };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/sensitivity.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/sensitivity.ts tests/sensitivity.test.ts && git commit -m "feat: WACC x terminal growth sensitivity grid"
```

---

### Task 9: Yahoo client

**Files:**
- Create: `lib/yahoo.ts`
- Create: `scripts/record-fixtures.ts`

This module is deliberately thin and untested in isolation - it is the network boundary. It is exercised through recorded fixtures in Task 10.

- [ ] **Step 1: Write the client**

Create `lib/yahoo.ts`:

```typescript
import YahooFinance from 'yahoo-finance2';

// v3 requires instantiation. The v2 default-export-as-object pattern throws.
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export type RawStatementRow = Record<string, unknown> & { date?: unknown; periodType?: string };

export type RawTicker = {
  /** Merged annual rows from all three statement modules, newest first. */
  statements: RawStatementRow[];
  quote: {
    price?: Record<string, unknown>;
    defaultKeyStatistics?: Record<string, unknown>;
    summaryProfile?: Record<string, unknown>;
    financialData?: Record<string, unknown>;
    earningsTrend?: Record<string, unknown>;
  };
};

const STATEMENT_MODULES = ['financials', 'cash-flow', 'balance-sheet'] as const;

/**
 * quoteSummary's statement submodules have returned almost nothing since
 * Nov 2024 - the library itself warns about it. fundamentalsTimeSeries is the
 * only working source for statements.
 */
export async function fetchTicker(ticker: string): Promise<RawTicker> {
  const perModule = await Promise.all(
    STATEMENT_MODULES.map((module) =>
      yf
        .fundamentalsTimeSeries(ticker, { period1: '2015-01-01', module, type: 'annual' })
        .catch(() => [] as RawStatementRow[])
    )
  );

  // Merge the three modules on period end date.
  const byDate = new Map<string, RawStatementRow>();
  for (const rows of perModule) {
    for (const row of rows as RawStatementRow[]) {
      const key = String(row.date);
      byDate.set(key, { ...(byDate.get(key) ?? {}), ...row });
    }
  }
  const statements = [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const quote = await yf.quoteSummary(ticker, {
    modules: ['price', 'defaultKeyStatistics', 'summaryProfile', 'financialData', 'earningsTrend'],
  });

  return { statements, quote: quote as RawTicker['quote'] };
}

export type SearchHit = { symbol: string; name: string; exchange: string };

export async function searchTickers(query: string): Promise<SearchHit[]> {
  const res = await yf.search(query);
  return (res.quotes ?? [])
    .filter((q: Record<string, unknown>) => q.quoteType === 'EQUITY' && typeof q.symbol === 'string')
    .map((q: Record<string, unknown>) => ({
      symbol: String(q.symbol),
      name: String(q.shortname ?? q.longname ?? q.symbol),
      exchange: String(q.exchange ?? ''),
    }));
}

/** Spot FX. Returns null when the pair cannot be resolved. */
export async function fetchFxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const q = await yf.quote(`${from}${to}=X`);
    const price = (q as { regularMarketPrice?: number }).regularMarketPrice;
    return typeof price === 'number' ? price : null;
  } catch {
    return null;
  }
}

/** US 10-year Treasury yield as a decimal. ^TNX quotes in percent. */
export async function fetchUsTenYear(): Promise<number | null> {
  try {
    const q = await yf.quote('^TNX');
    const price = (q as { regularMarketPrice?: number }).regularMarketPrice;
    return typeof price === 'number' ? price / 100 : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Write the fixture recorder**

Create `scripts/record-fixtures.ts`:

```typescript
/**
 * Records live Yahoo responses so tests never hit the network.
 * Run with: npx tsx scripts/record-fixtures.ts
 * Re-run only deliberately - the recorded gaps are the regression tests.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fetchTicker } from '../lib/yahoo';

// Chosen because each one broke something during the data probe:
// CBA and RY have no operating income; SHEL quotes GBp while reporting USD;
// ARB and SGP have no change-in-working-capital; MSB is loss-making.
const TICKERS = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO'];

async function main() {
  mkdirSync('tests/fixtures', { recursive: true });
  for (const ticker of TICKERS) {
    const raw = await fetchTicker(ticker);
    const file = `tests/fixtures/${ticker.replace('.', '_')}.json`;
    writeFileSync(file, JSON.stringify(raw, null, 2));
    console.log(`${file}: ${raw.statements.length} annual periods`);
  }
}

main();
```

- [ ] **Step 3: Record the fixtures**

```bash
cd ~/dev/dcf-studio && npm install -D tsx && npx tsx scripts/record-fixtures.ts
```

Expected: eight files written, each reporting 4 or 5 annual periods. If any reports 0, stop - the Yahoo endpoint or the library API has changed and the rest of the plan rests on it.

- [ ] **Step 4: Commit**

```bash
git add lib/yahoo.ts scripts/record-fixtures.ts tests/fixtures package.json package-lock.json && git commit -m "feat: Yahoo client and recorded fixtures for eight probe tickers"
```

---

### Task 10: Normaliser and fallback chains

**Files:**
- Create: `lib/normalise.ts`
- Test: `tests/normalise.test.ts`

The most defect-prone module in the app. Every test here corresponds to a real gap found in the data probe.

- [ ] **Step 1: Write the failing tests**

Create `tests/normalise.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '@/lib/normalise';
import type { RawTicker } from '@/lib/yahoo';

function fixture(ticker: string): RawTicker {
  return JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
}

describe('normalise - identity and currency', () => {
  it('reads name, sector and both currencies', () => {
    const f = normalise('BHP.AX', fixture('BHP.AX'));
    expect(f.name).toMatch(/BHP/);
    expect(f.reportingCurrency).toBe('USD');
    expect(f.quoteCurrency).toBe('AUD');
    expect(f.flags.some((x) => x.code === 'CURRENCY_MISMATCH')).toBe(true);
  });

  it('does not flag a currency mismatch when there is none', () => {
    const f = normalise('ARB.AX', fixture('ARB.AX'));
    expect(f.reportingCurrency).toBe('AUD');
    expect(f.quoteCurrency).toBe('AUD');
    expect(f.flags.some((x) => x.code === 'CURRENCY_MISMATCH')).toBe(false);
  });
});

describe('normalise - fallback chains', () => {
  it('falls back to operating income when EBIT is absent', () => {
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.years[0].ebit.value).toBeGreaterThan(0);
    expect(f.years[0].ebit.provenance.sourceField).toBe('operatingIncome');
  });

  it('falls back to reconciledDepreciation for D&A where the primary field is missing', () => {
    // ARB has no depreciationAndAmortization in the cashflow module.
    const f = normalise('ARB.AX', fixture('ARB.AX'));
    expect(f.years[0].dAndA.value).toBeGreaterThan(0);
    expect(['depreciationAndAmortization', 'reconciledDepreciation', 'depreciationAndAmortizationInIncomeStatement'])
      .toContain(f.years[0].dAndA.provenance.sourceField);
  });

  it('derives change in NWC from the balance sheet where the cashflow field is missing', () => {
    const f = normalise('ARB.AX', fixture('ARB.AX'));
    const nwc = f.years[0].changeInNwc;
    expect(nwc.provenance.derived).toBe(true);
    expect(nwc.provenance.derivation).toBeTruthy();
    expect(f.flags.some((x) => x.code === 'MISSING_FIELD_DERIVED')).toBe(true);
  });

  it('normalises capex to a positive outflow', () => {
    for (const t of ['MSFT', 'BHP.AX', 'ARB.AX']) {
      const f = normalise(t, fixture(t));
      expect(f.years[0].capex.value).toBeGreaterThan(0);
    }
  });
});

describe('normalise - working capital sign convention', () => {
  it('treats an increase in NWC as positive, matching the cashflow and balance-sheet paths', () => {
    // Yahoo's changeInWorkingCapital is a cashflow contribution: negative when
    // working capital grows. The canonical convention is the opposite, so the
    // normaliser must flip it. MSFT and BHP both have the raw field present.
    for (const t of ['MSFT', 'BHP.AX']) {
      const raw = fixture(t);
      const rawValue = raw.statements[0].changeInWorkingCapital as number;
      const f = normalise(t, raw);
      expect(f.years[0].changeInNwc.value).toBeCloseTo(-rawValue, 2);
    }
  });
});

describe('normalise - sector and quality flags', () => {
  it('flags financials, which have no meaningful EBIT', () => {
    for (const t of ['CBA.AX', 'RY.TO']) {
      const f = normalise(t, fixture(t));
      expect(f.flags.some((x) => x.code === 'FINANCIAL_SECTOR')).toBe(true);
      expect(f.flags.find((x) => x.code === 'FINANCIAL_SECTOR')?.severity).toBe('error');
    }
  });

  it('passes through the raw beta without clamping it here', () => {
    const f = normalise('SHEL.L', fixture('SHEL.L'));
    expect(f.rawBeta).toBeLessThan(0);
  });

  it('records analyst revenue estimates and flags thin coverage', () => {
    const sgp = normalise('SGP.AX', fixture('SGP.AX'));
    expect(sgp.analystRevenue.length).toBeGreaterThan(0);
    expect(sgp.flags.some((x) => x.code === 'THIN_ANALYST_COVERAGE')).toBe(true);
  });

  it('orders years newest first with usable revenue in every one', () => {
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.years.length).toBeGreaterThanOrEqual(4);
    expect(f.years[0].periodEnd > f.years[1].periodEnd).toBe(true);
    expect(f.years.every((y) => y.revenue.value > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npx vitest run tests/normalise.test.ts
```

Expected: FAIL - cannot resolve `@/lib/normalise`.

- [ ] **Step 3: Implement the normaliser**

Create `lib/normalise.ts`:

```typescript
import type { DataQualityFlag, FiscalYear, Fundamentals, Sourced } from './types';
import type { RawStatementRow, RawTicker } from './yahoo';

function sourced(value: number, sourceField: string): Sourced<number> {
  return { value, provenance: { sourceField, derived: false } };
}

function derivedValue(value: number, derivation: string): Sourced<number> {
  return { value, provenance: { sourceField: 'derived', derivation, derived: true } };
}

function num(row: RawStatementRow, field: string): number | null {
  const v = row[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** First field in the chain with a usable number. */
function firstOf(row: RawStatementRow, fields: string[]): Sourced<number> | null {
  for (const field of fields) {
    const v = num(row, field);
    if (v !== null) return sourced(v, field);
  }
  return null;
}

const EBIT_CHAIN = ['ebit', 'operatingIncome'];
const DA_CHAIN = ['depreciationAndAmortization', 'reconciledDepreciation', 'depreciationAndAmortizationInIncomeStatement'];
const CASH_CHAIN = ['cashAndCashEquivalents', 'cashCashEquivalentsAndShortTermInvestments'];
const SHARES_CHAIN = ['dilutedAverageShares', 'ordinarySharesNumber', 'shareIssued'];

const FINANCIAL_SECTORS = ['Financial Services', 'Financial'];

function nested(obj: Record<string, unknown> | undefined, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v !== null && typeof v === 'object' && 'raw' in (v as Record<string, unknown>)) {
    return asNumber((v as { raw: unknown }).raw);
  }
  return null;
}

/**
 * Working capital sign convention, applied here and nowhere else:
 * positive = an increase in net working capital = a cash outflow.
 * Yahoo's changeInWorkingCapital is a cashflow contribution with the opposite
 * sign, so it is negated. The balance-sheet fallback already computes the
 * accounting change and needs no flip. Getting this wrong is a 2x error that
 * still looks plausible.
 */
function changeInNwc(row: RawStatementRow, previous: RawStatementRow | undefined): Sourced<number> | null {
  const cashflowField = num(row, 'changeInWorkingCapital');
  if (cashflowField !== null) {
    return { value: -cashflowField, provenance: { sourceField: 'changeInWorkingCapital', derived: false } };
  }
  if (!previous) return null;

  const parts = [
    { field: 'accountsReceivable', sign: 1 },
    { field: 'inventory', sign: 1 },
    { field: 'accountsPayable', sign: -1 },
  ];
  let total = 0;
  let found = 0;
  for (const { field, sign } of parts) {
    const now = num(row, field);
    const before = num(previous, field);
    if (now !== null && before !== null) {
      total += sign * (now - before);
      found++;
    }
  }
  if (found === 0) return null;
  return derivedValue(total, 'Balance-sheet movement: change in receivables + inventory - payables');
}

function buildYear(row: RawStatementRow, previous: RawStatementRow | undefined): FiscalYear | null {
  const revenue = firstOf(row, ['totalRevenue']);
  if (!revenue || revenue.value <= 0) return null;

  const pretaxIncome = firstOf(row, ['pretaxIncome']) ?? sourced(0, 'pretaxIncome');
  const interestExpense = firstOf(row, ['interestExpense']);

  let ebit = firstOf(row, EBIT_CHAIN);
  if (!ebit && interestExpense) {
    ebit = derivedValue(pretaxIncome.value + interestExpense.value, 'Pretax income + interest expense (no operating income reported)');
  }
  if (!ebit) {
    ebit = derivedValue(pretaxIncome.value, 'Pretax income used as a proxy (no operating income or interest expense reported)');
  }

  const dAndA = firstOf(row, DA_CHAIN) ?? derivedValue(0, 'No depreciation or amortisation reported');
  const rawCapex = firstOf(row, ['capitalExpenditure']);
  const capex = rawCapex
    ? { value: -rawCapex.value, provenance: rawCapex.provenance }
    : derivedValue(0, 'No capital expenditure reported');

  const nwc = changeInNwc(row, previous) ?? derivedValue(0, 'Insufficient data to compute the working-capital movement');

  return {
    periodEnd: String(row.date).slice(0, 10),
    revenue,
    ebit,
    taxProvision: firstOf(row, ['taxProvision']) ?? sourced(0, 'taxProvision'),
    pretaxIncome,
    dAndA,
    capex,
    changeInNwc: nwc,
    totalDebt: firstOf(row, ['totalDebt']) ?? derivedValue(0, 'No total debt reported'),
    cash: firstOf(row, CASH_CHAIN) ?? derivedValue(0, 'No cash balance reported'),
    shares: firstOf(row, SHARES_CHAIN) ?? derivedValue(0, 'No share count reported'),
    interestExpense,
  };
}

export function normalise(ticker: string, raw: RawTicker): Fundamentals {
  const flags: DataQualityFlag[] = [];

  const rows = [...raw.statements].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const years: FiscalYear[] = [];
  for (let i = 0; i < rows.length; i++) {
    const year = buildYear(rows[i], rows[i + 1]);
    if (year) years.push(year);
  }

  if (years.some((y) => y.changeInNwc.provenance.derived || y.dAndA.provenance.derived)) {
    flags.push({
      code: 'MISSING_FIELD_DERIVED',
      severity: 'warn',
      message: 'Some line items were not reported and have been derived. Each one is labelled in the workings below.',
    });
  }
  if (years.length < 4) {
    flags.push({ code: 'SHORT_HISTORY', severity: 'warn', message: `Only ${years.length} year(s) of history available to anchor assumptions on.` });
  }

  const sector = (nested(raw.quote.summaryProfile, ['sector']) as string) ?? null;
  const reportingCurrency =
    (nested(raw.quote.financialData, ['financialCurrency']) as string) ??
    (nested(raw.quote.price, ['currency']) as string) ??
    'USD';
  const quoteCurrency = (nested(raw.quote.price, ['currency']) as string) ?? reportingCurrency;

  if (sector && FINANCIAL_SECTORS.includes(sector)) {
    flags.push({
      code: 'FINANCIAL_SECTOR',
      severity: 'error',
      message: 'This is a financial. Banks and insurers report no meaningful operating income, and capex and working capital do not mean what a free-cashflow model assumes, so a DCF will misprice it. The model below runs on best-effort numbers - treat it as an illustration, not a valuation.',
    });
  }
  if (reportingCurrency !== quoteCurrency) {
    flags.push({
      code: 'CURRENCY_MISMATCH',
      severity: 'warn',
      message: `Accounts are reported in ${reportingCurrency} but the shares trade in ${quoteCurrency}. The model runs in ${reportingCurrency} and converts once, at the end.`,
    });
  }

  const trend = (nested(raw.quote.earningsTrend, ['trend']) as Record<string, unknown>[]) ?? [];
  const analystRevenue = trend
    .filter((t) => ['0y', '+1y'].includes(String(t.period)))
    .map((t) => ({
      period: String(t.period),
      revenue: asNumber(nested(t as Record<string, unknown>, ['revenueEstimate', 'avg'])) ?? 0,
      analysts: asNumber(nested(t as Record<string, unknown>, ['revenueEstimate', 'numberOfAnalysts'])) ?? 0,
    }))
    .filter((t) => t.revenue > 0);

  if (analystRevenue.length === 0) {
    flags.push({ code: 'NO_ANALYST_COVERAGE', severity: 'info', message: 'No analyst revenue estimates available, so the consensus scenario is unavailable.' });
  } else if (Math.min(...analystRevenue.map((a) => a.analysts)) < 3) {
    flags.push({
      code: 'THIN_ANALYST_COVERAGE',
      severity: 'warn',
      message: `Consensus rests on as few as ${Math.min(...analystRevenue.map((a) => a.analysts))} analyst estimate(s).`,
    });
  }

  return {
    ticker,
    name: (nested(raw.quote.price, ['longName']) as string) ?? (nested(raw.quote.price, ['shortName']) as string) ?? ticker,
    exchange: (nested(raw.quote.price, ['exchange']) as string) ?? '',
    sector,
    industry: (nested(raw.quote.summaryProfile, ['industry']) as string) ?? null,
    reportingCurrency,
    quoteCurrency,
    years,
    price: asNumber(nested(raw.quote.price, ['regularMarketPrice'])) ?? 0,
    marketCap: asNumber(nested(raw.quote.price, ['marketCap'])) ?? 0,
    rawBeta: asNumber(nested(raw.quote.defaultKeyStatistics, ['beta'])),
    analystRevenue,
    flags,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/normalise.test.ts
```

Expected: all passing. Two tests are likely to need their expectations corrected against what the fixtures actually contain - the ARB currency-mismatch assertion and the MSFT `operatingIncome` provenance. **Correct the test to match the fixture only after reading the fixture and confirming the code is right.** Never loosen an assertion to make a failure disappear.

- [ ] **Step 5: Commit**

```bash
git add lib/normalise.ts tests/normalise.test.ts && git commit -m "feat: normaliser with fallback chains and canonical NWC sign"
```

---

### Task 11: Currency conversion

**Files:**
- Create: `lib/fx.ts`
- Test: `tests/fx.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/fx.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toQuoteDisplayUnits, priceInMajorUnits } from '@/lib/fx';

describe('toQuoteDisplayUnits', () => {
  it('leaves a value alone when reporting and quote currency match', () => {
    const r = toQuoteDisplayUnits(12.5, { reportingCurrency: 'AUD', quoteCurrency: 'AUD', fxRate: 1 });
    expect(r.value).toBeCloseTo(12.5, 10);
    expect(r.converted).toBe(false);
  });

  it('converts USD reporting to AUD quote at the given rate', () => {
    // BHP reports USD, trades AUD. USD 40.00 at USDAUD 1.45 = AUD 58.00
    const r = toQuoteDisplayUnits(40, { reportingCurrency: 'USD', quoteCurrency: 'AUD', fxRate: 1.45 });
    expect(r.value).toBeCloseTo(58, 10);
    expect(r.converted).toBe(true);
  });

  it('multiplies into pence when the quote currency is a sub-unit', () => {
    // Shell reports USD, quotes GBp. USD 30 at USDGBP 0.79 = GBP 23.70 = 2370p
    const r = toQuoteDisplayUnits(30, { reportingCurrency: 'USD', quoteCurrency: 'GBp', fxRate: 0.79 });
    expect(r.value).toBeCloseTo(2370, 6);
  });
});

describe('priceInMajorUnits', () => {
  it('divides a pence quote by 100', () => {
    expect(priceInMajorUnits(2500, 'GBp')).toBeCloseTo(25, 10);
  });

  it('leaves a major-unit quote alone', () => {
    expect(priceInMajorUnits(178.66, 'AUD')).toBeCloseTo(178.66, 10);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/fx.test.ts
```

Expected: FAIL - cannot resolve `@/lib/fx`.

- [ ] **Step 3: Implement it**

Create `lib/fx.ts`:

```typescript
import { QUOTE_SUBUNIT_DIVISOR } from './markets';

export type FxContext = {
  reportingCurrency: string;
  /** May be a sub-unit code such as GBp. */
  quoteCurrency: string;
  /** Units of the quote's major currency per unit of reporting currency. */
  fxRate: number;
};

/** The major currency behind a possibly-sub-unit quote code. GBp -> GBP. */
export function majorCurrency(quoteCurrency: string): string {
  return quoteCurrency in QUOTE_SUBUNIT_DIVISOR ? quoteCurrency.toUpperCase() : quoteCurrency;
}

/**
 * Converts a per-share value from reporting currency into the units the market
 * actually quotes in, so it is directly comparable to the live price.
 * This is the only place currency arithmetic happens.
 */
export function toQuoteDisplayUnits(
  valueInReportingCurrency: number,
  ctx: FxContext
): { value: number; converted: boolean } {
  const divisor = QUOTE_SUBUNIT_DIVISOR[ctx.quoteCurrency];
  const sameCurrency = majorCurrency(ctx.quoteCurrency) === ctx.reportingCurrency;
  const rate = sameCurrency ? 1 : ctx.fxRate;
  const inMajorUnits = valueInReportingCurrency * rate;
  return {
    value: divisor ? inMajorUnits * divisor : inMajorUnits,
    converted: !sameCurrency,
  };
}

/** A quoted price expressed in major units, for like-for-like comparison. */
export function priceInMajorUnits(price: number, quoteCurrency: string): number {
  const divisor = QUOTE_SUBUNIT_DIVISOR[quoteCurrency];
  return divisor ? price / divisor : price;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/fx.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/fx.ts tests/fx.test.ts && git commit -m "feat: currency conversion with quote sub-unit handling"
```

---

### Task 12: Risk-free rates

**Files:**
- Create: `lib/riskfree.ts`
- Test: `tests/riskfree.test.ts`

- [ ] **Step 1: Verify the RBA source before coding**

The RBA publishes F2 (capital market yields) as CSV. Confirm the current URL and the column header for the 10-year Australian Government bond yield:

```bash
curl -s -o /tmp/f2.csv -w "%{http_code}\n" https://www.rba.gov.au/statistics/tables/csv/f2-data.csv && head -15 /tmp/f2.csv
```

Expected: `200`, and a header row containing an Australian Government 10-year series. Note the exact series ID (of the form `FCMYGBAG10D`). If the URL 404s, find the current one on the RBA statistical tables page and use that. **Do not proceed on a guessed URL.**

- [ ] **Step 2: Write the failing test**

Create `tests/riskfree.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRbaF2, resolveRiskFree } from '@/lib/riskfree';

const F2_SAMPLE = `"Title","Capital Market Yields - Government Bonds"
"Series ID","FCMYGBAG10D"
"01-Jul-2026",4.15
"02-Jul-2026",4.21
"03-Jul-2026",
`;

describe('parseRbaF2', () => {
  it('takes the most recent non-blank yield and returns it as a decimal', () => {
    expect(parseRbaF2(F2_SAMPLE)).toBeCloseTo(0.0421, 10);
  });

  it('returns null when no numeric observation is present', () => {
    expect(parseRbaF2('"Series ID","FCMYGBAG10D"\n"03-Jul-2026",\n')).toBeNull();
  });
});

describe('resolveRiskFree', () => {
  it('marks a tier-2 market rate as assumed and uses the market default', async () => {
    const r = await resolveRiskFree('SAP.DE', { fetchUsTenYear: async () => 0.045, fetchRbaTenYear: async () => 0.042 });
    expect(r.assumed).toBe(true);
    expect(r.source).toMatch(/assumption/i);
    expect(r.rate).toBeCloseTo(0.026, 10);
  });

  it('sources USD from the US 10-year', async () => {
    const r = await resolveRiskFree('MSFT', { fetchUsTenYear: async () => 0.0462, fetchRbaTenYear: async () => 0.042 });
    expect(r.assumed).toBe(false);
    expect(r.rate).toBeCloseTo(0.0462, 10);
    expect(r.source).toMatch(/TNX/);
  });

  it('sources AUD from the RBA', async () => {
    const r = await resolveRiskFree('BHP.AX', { fetchUsTenYear: async () => 0.0462, fetchRbaTenYear: async () => 0.0415 });
    expect(r.assumed).toBe(false);
    expect(r.rate).toBeCloseTo(0.0415, 10);
    expect(r.source).toMatch(/RBA/);
  });

  it('falls back to the market default and says so when the live fetch fails', async () => {
    const r = await resolveRiskFree('BHP.AX', { fetchUsTenYear: async () => null, fetchRbaTenYear: async () => null });
    expect(r.assumed).toBe(true);
    expect(r.rate).toBeCloseTo(0.042, 10);
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

```bash
npx vitest run tests/riskfree.test.ts
```

Expected: FAIL - cannot resolve `@/lib/riskfree`.

- [ ] **Step 4: Implement it**

Create `lib/riskfree.ts`. Replace `RBA_F2_URL` with the URL confirmed in Step 1 if it differs:

```typescript
import { marketFor } from './markets';
import { fetchUsTenYear as yahooUsTenYear } from './yahoo';

const RBA_F2_URL = 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv';

export type RiskFree = {
  rate: number;
  source: string;
  /** True when the rate is a documented assumption rather than a live observation. */
  assumed: boolean;
};

/**
 * The F2 CSV carries metadata rows first, then dated observations. Takes the
 * last row with a numeric value in the second column and converts percent to
 * a decimal.
 */
export function parseRbaF2(csv: string): number | null {
  const lines = csv.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const cells = lines[i].split(',');
    if (cells.length < 2) continue;
    const value = Number(cells[1].replace(/"/g, '').trim());
    const isDateRow = /^"?\d{1,2}[-/]\w{3}/.test(cells[0]);
    if (isDateRow && Number.isFinite(value) && cells[1].trim() !== '') {
      return value / 100;
    }
  }
  return null;
}

export async function fetchRbaTenYear(): Promise<number | null> {
  try {
    const res = await fetch(RBA_F2_URL, { next: { revalidate: 86400 } } as RequestInit);
    if (!res.ok) return null;
    return parseRbaF2(await res.text());
  } catch {
    return null;
  }
}

export type RiskFreeDeps = {
  fetchUsTenYear: () => Promise<number | null>;
  fetchRbaTenYear: () => Promise<number | null>;
};

const LIVE_DEPS: RiskFreeDeps = { fetchUsTenYear: yahooUsTenYear, fetchRbaTenYear };

export async function resolveRiskFree(ticker: string, deps: RiskFreeDeps = LIVE_DEPS): Promise<RiskFree> {
  const market = marketFor(ticker);

  if (market.riskFreeSource === 'yahoo-tnx') {
    const rate = await deps.fetchUsTenYear();
    if (rate !== null) return { rate, source: 'US 10-year Treasury (^TNX)', assumed: false };
  }
  if (market.riskFreeSource === 'rba') {
    const rate = await deps.fetchRbaTenYear();
    if (rate !== null) return { rate, source: 'Australian Government 10-year (RBA F2)', assumed: false };
  }

  return {
    rate: market.defaultRiskFreeRate,
    source: `${market.currency} assumption - no free live source available for this market`,
    assumed: true,
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/riskfree.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/riskfree.ts tests/riskfree.test.ts && git commit -m "feat: tiered risk-free rates from TNX, RBA F2 and market defaults"
```

---

### Task 13: WACC

**Files:**
- Create: `lib/wacc.ts`
- Test: `tests/wacc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/wacc.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildWacc, BETA_FLOOR, BETA_CEILING } from '@/lib/wacc';

const BASE = {
  riskFree: { rate: 0.042, source: 'US 10-year Treasury (^TNX)', assumed: false },
  equityRiskPremium: 0.055,
  rawBeta: 1.2,
  marketCap: 8000,
  totalDebt: 2000,
  interestExpense: 100,
  priorTotalDebt: 2000,
  taxRate: 0.30,
};

describe('buildWacc', () => {
  it('computes cost of equity as rf + beta x ERP', () => {
    const w = buildWacc(BASE);
    expect(w.costOfEquity).toBeCloseTo(0.042 + 1.2 * 0.055, 10);
  });

  it('weights equity and debt by market cap and total debt', () => {
    const w = buildWacc(BASE);
    expect(w.equityWeight).toBeCloseTo(0.8, 10);
    expect(w.debtWeight).toBeCloseTo(0.2, 10);
  });

  it('applies the tax shield to the debt leg only', () => {
    const w = buildWacc(BASE);
    const expected = 0.8 * (0.042 + 1.2 * 0.055) + 0.2 * 0.05 * (1 - 0.30);
    expect(w.costOfDebt).toBeCloseTo(0.05, 10);
    expect(w.wacc).toBeCloseTo(expected, 10);
  });

  it('clamps a negative beta and records that it did', () => {
    // Shell returns -0.235. Left alone, the cost of equity falls below the
    // risk-free rate, which is not a defensible discount rate.
    const w = buildWacc({ ...BASE, rawBeta: -0.235 });
    expect(w.beta).toBeCloseTo(BETA_FLOOR, 10);
    expect(w.betaClamped).toBe(true);
    expect(w.rawBeta).toBeCloseTo(-0.235, 10);
    expect(w.costOfEquity).toBeGreaterThan(w.riskFreeRate);
  });

  it('clamps an implausibly high beta', () => {
    const w = buildWacc({ ...BASE, rawBeta: 4.5 });
    expect(w.beta).toBeCloseTo(BETA_CEILING, 10);
    expect(w.betaClamped).toBe(true);
  });

  it('defaults beta to 1.0 when it is missing', () => {
    const w = buildWacc({ ...BASE, rawBeta: null });
    expect(w.beta).toBeCloseTo(1.0, 10);
    expect(w.betaClamped).toBe(false);
  });

  it('floors the cost of debt at the risk-free rate', () => {
    const w = buildWacc({ ...BASE, interestExpense: 5 });
    expect(w.costOfDebt).toBeCloseTo(0.042, 10);
    expect(w.costOfDebtSource).toMatch(/floor/i);
  });

  it('falls back to a default spread when interest expense is unavailable', () => {
    const w = buildWacc({ ...BASE, interestExpense: null });
    expect(w.costOfDebt).toBeCloseTo(0.042 + 0.02, 10);
    expect(w.costOfDebtSource).toMatch(/assum/i);
  });

  it('gives a debt-free company a WACC equal to its cost of equity', () => {
    const w = buildWacc({ ...BASE, totalDebt: 0, priorTotalDebt: 0, interestExpense: 0 });
    expect(w.wacc).toBeCloseTo(w.costOfEquity, 10);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/wacc.test.ts
```

Expected: FAIL - cannot resolve `@/lib/wacc`.

- [ ] **Step 3: Implement it**

Create `lib/wacc.ts`:

```typescript
import type { WaccBreakdown } from './types';
import type { RiskFree } from './riskfree';

/** Below the floor a levered equity holder would demand less than a bondholder. */
export const BETA_FLOOR = 0.3;
export const BETA_CEILING = 2.5;
const DEFAULT_BETA = 1.0;
/** Spread over the risk-free rate used when interest expense is unavailable. */
const DEFAULT_DEBT_SPREAD = 0.02;

export type WaccArgs = {
  riskFree: RiskFree;
  equityRiskPremium: number;
  rawBeta: number | null;
  marketCap: number;
  totalDebt: number;
  interestExpense: number | null;
  /** Prior-year total debt, for the average denominator. */
  priorTotalDebt: number;
  taxRate: number;
};

function resolveBeta(rawBeta: number | null): { beta: number; clamped: boolean } {
  if (rawBeta === null || !Number.isFinite(rawBeta)) return { beta: DEFAULT_BETA, clamped: false };
  if (rawBeta < BETA_FLOOR) return { beta: BETA_FLOOR, clamped: true };
  if (rawBeta > BETA_CEILING) return { beta: BETA_CEILING, clamped: true };
  return { beta: rawBeta, clamped: false };
}

function resolveCostOfDebt(args: WaccArgs): { rate: number; source: string } {
  const averageDebt = (args.totalDebt + args.priorTotalDebt) / 2;
  if (args.interestExpense === null || averageDebt <= 0) {
    return {
      rate: args.riskFree.rate + DEFAULT_DEBT_SPREAD,
      source: `Assumed: risk-free + ${(DEFAULT_DEBT_SPREAD * 100).toFixed(0)}bp (interest expense not reported)`,
    };
  }
  const implied = args.interestExpense / averageDebt;
  if (implied < args.riskFree.rate) {
    return { rate: args.riskFree.rate, source: 'Floored at the risk-free rate (implied cost of debt was lower)' };
  }
  return { rate: implied, source: 'Interest expense / average total debt' };
}

export function buildWacc(args: WaccArgs): WaccBreakdown {
  const { beta, clamped } = resolveBeta(args.rawBeta);
  const costOfEquity = args.riskFree.rate + beta * args.equityRiskPremium;
  const debt = resolveCostOfDebt(args);

  const totalCapital = args.marketCap + args.totalDebt;
  const equityWeight = totalCapital > 0 ? args.marketCap / totalCapital : 1;
  const debtWeight = 1 - equityWeight;

  return {
    riskFreeRate: args.riskFree.rate,
    riskFreeSource: args.riskFree.source,
    riskFreeAssumed: args.riskFree.assumed,
    equityRiskPremium: args.equityRiskPremium,
    rawBeta: args.rawBeta,
    beta,
    betaClamped: clamped,
    costOfEquity,
    costOfDebt: debt.rate,
    costOfDebtSource: debt.source,
    marketCap: args.marketCap,
    totalDebt: args.totalDebt,
    equityWeight,
    debtWeight,
    taxRate: args.taxRate,
    wacc: equityWeight * costOfEquity + debtWeight * debt.rate * (1 - args.taxRate),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/wacc.test.ts
```

Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/wacc.ts tests/wacc.test.ts && git commit -m "feat: WACC with beta clamp and cost-of-debt floor"
```

---

### Task 14: Scenarios and the capex guard

**Files:**
- Create: `lib/scenarios.ts`
- Test: `tests/scenarios.test.ts`

Bull and Bear tilts, stated numerically so they are reproducible: Bull adds 3pp to revenue growth, 2pp to EBIT margin and 0.5pp to terminal growth. Bear subtracts the same.

- [ ] **Step 1: Write the failing test**

Create `tests/scenarios.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '@/lib/normalise';
import { buildScenario, historicalDrivers, TILTS } from '@/lib/scenarios';
import type { RawTicker } from '@/lib/yahoo';

function fundamentals(ticker: string) {
  const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
  return normalise(ticker, raw);
}

describe('historicalDrivers', () => {
  it('derives every driver from the company own history', () => {
    const d = historicalDrivers(fundamentals('MSFT'));
    expect(d.revenueCagr).toBeGreaterThan(0);
    expect(d.ebitMargin).toBeGreaterThan(0);
    expect(d.ebitMargin).toBeLessThan(1);
    expect(d.daPctRevenue).toBeGreaterThan(0);
    expect(d.capexPctRevenue).toBeGreaterThan(0);
    expect(d.taxRate).toBeGreaterThan(0);
    expect(d.taxRate).toBeLessThanOrEqual(0.35);
  });

  it('caps the effective tax rate at the statutory rate', () => {
    const d = historicalDrivers(fundamentals('BHP.AX'));
    expect(d.taxRate).toBeLessThanOrEqual(0.30);
  });
});

describe('buildScenario - base', () => {
  it('fills every assumption for the chosen horizon', () => {
    const { assumptions } = buildScenario(fundamentals('MSFT'), 'base', 5, 0.09);
    expect(assumptions.revenueGrowth).toHaveLength(5);
    expect(assumptions.ebitMargin).toHaveLength(5);
    expect(assumptions.wacc).toBeCloseTo(0.09, 10);
    expect(assumptions.midYearConvention).toBe(true);
  });
});

describe('buildScenario - tilts', () => {
  it('makes bull more optimistic than base on growth, margin and terminal growth', () => {
    const f = fundamentals('MSFT');
    const base = buildScenario(f, 'base', 5, 0.09).assumptions;
    const bull = buildScenario(f, 'bull', 5, 0.09).assumptions;
    const bear = buildScenario(f, 'bear', 5, 0.09).assumptions;
    expect(bull.revenueGrowth[0]).toBeCloseTo(base.revenueGrowth[0] + TILTS.bull.revenueGrowth, 10);
    expect(bull.ebitMargin[0]).toBeCloseTo(base.ebitMargin[0] + TILTS.bull.ebitMargin, 10);
    expect(bear.terminalGrowth).toBeLessThan(base.terminalGrowth);
  });
});

describe('buildScenario - consensus', () => {
  it('uses consensus revenue for the first two years then fades to the base rate', () => {
    const f = fundamentals('MSFT');
    const base = buildScenario(f, 'base', 5, 0.09).assumptions;
    const c = buildScenario(f, 'consensus', 5, 0.09).assumptions;
    expect(c.revenueGrowth[0]).not.toBeCloseTo(base.revenueGrowth[0], 6);
    // The final year has faded all the way back to the historical rate.
    expect(c.revenueGrowth[4]).toBeCloseTo(base.revenueGrowth[4], 6);
  });

  it('falls back to base and says so when there is no coverage', () => {
    const f = fundamentals('MSFT');
    const bare = { ...f, analystRevenue: [] };
    const r = buildScenario(bare, 'consensus', 5, 0.09);
    expect(r.notes.some((n) => /no analyst/i.test(n))).toBe(true);
  });
});

describe('buildScenario - capex sustainability guard', () => {
  it('substitutes D&A for capex where reported capex is implausibly low', () => {
    // Stockland reports A$3m of capex on A$3.1bn of revenue - a REIT invests
    // through a different line. Left alone the model gets free growth forever.
    const r = buildScenario(fundamentals('SGP.AX'), 'base', 5, 0.09);
    expect(r.assumptions.capexPctRevenue).toBeCloseTo(r.assumptions.daPctRevenue, 8);
    expect(r.flags.some((x) => x.code === 'CAPEX_BELOW_DA')).toBe(true);
  });

  it('leaves capex alone for a company that reports it properly', () => {
    const r = buildScenario(fundamentals('MSFT'), 'base', 5, 0.09);
    expect(r.flags.some((x) => x.code === 'CAPEX_BELOW_DA')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/scenarios.test.ts
```

Expected: FAIL - cannot resolve `@/lib/scenarios`.

- [ ] **Step 3: Implement it**

Create `lib/scenarios.ts`:

```typescript
import { marketFor } from './markets';
import type { Assumptions, DataQualityFlag, Fundamentals, ScenarioName } from './types';

export type HistoricalDrivers = {
  revenueCagr: number;
  ebitMargin: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenueChange: number;
  taxRate: number;
  latestRevenue: number;
};

/** Stated numerically so the presets are reproducible rather than a matter of taste. */
export const TILTS = {
  bull: { revenueGrowth: 0.03, ebitMargin: 0.02, terminalGrowth: 0.005 },
  bear: { revenueGrowth: -0.03, ebitMargin: -0.02, terminalGrowth: -0.005 },
} as const;

const DEFAULT_TERMINAL_GROWTH = 0.025;
const DEFAULT_EXIT_MULTIPLE = 8;
/** Below this ratio of capex to D&A, reported capex is not the real investment number. */
const CAPEX_TO_DA_FLOOR = 0.5;

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function historicalDrivers(f: Fundamentals): HistoricalDrivers {
  const years = f.years;
  const latest = years[0];
  const oldest = years[years.length - 1];
  const spans = Math.max(years.length - 1, 1);

  const revenueCagr =
    oldest.revenue.value > 0 ? (latest.revenue.value / oldest.revenue.value) ** (1 / spans) - 1 : 0;

  const ratios = (pick: (y: typeof latest) => number) =>
    years.filter((y) => y.revenue.value > 0).map((y) => pick(y) / y.revenue.value);

  // Working capital moves with revenue, so express it against the revenue change.
  const nwcRatios: number[] = [];
  for (let i = 0; i < years.length - 1; i++) {
    const deltaRevenue = years[i].revenue.value - years[i + 1].revenue.value;
    if (Math.abs(deltaRevenue) > 0) nwcRatios.push(years[i].changeInNwc.value / deltaRevenue);
  }

  const taxRates = years
    .filter((y) => y.pretaxIncome.value > 0 && y.taxProvision.value >= 0)
    .map((y) => y.taxProvision.value / y.pretaxIncome.value);
  const statutory = marketFor(f.ticker).statutoryTaxRate;
  const effectiveTax = taxRates.length > 0 ? median(taxRates) : statutory;

  return {
    revenueCagr,
    ebitMargin: mean(ratios((y) => y.ebit.value)),
    daPctRevenue: mean(ratios((y) => y.dAndA.value)),
    capexPctRevenue: mean(ratios((y) => y.capex.value)),
    nwcPctRevenueChange: nwcRatios.length > 0 ? median(nwcRatios) : 0,
    taxRate: Math.min(Math.max(effectiveTax, 0), statutory),
    latestRevenue: latest.revenue.value,
  };
}

/** Consensus revenue growth for years 1-2, fading linearly to the historical rate. */
function consensusGrowthPath(f: Fundamentals, d: HistoricalDrivers, horizon: number): { path: number[]; note: string | null } {
  if (f.analystRevenue.length === 0) {
    return { path: Array(horizon).fill(d.revenueCagr), note: 'No analyst coverage available, so the consensus scenario falls back to the historical growth rate.' };
  }

  const path: number[] = [];
  let previous = d.latestRevenue;
  const estimates = [...f.analystRevenue].sort((a, b) => a.period.localeCompare(b.period));

  for (let i = 0; i < horizon; i++) {
    if (i < estimates.length && previous > 0) {
      path.push(estimates[i].revenue / previous - 1);
      previous = estimates[i].revenue;
    } else {
      // Fade linearly from the last consensus rate to the historical rate.
      const yearsIntoFade = i - estimates.length + 1;
      const fadeLength = horizon - estimates.length;
      const weight = fadeLength <= 0 ? 1 : Math.min(yearsIntoFade / fadeLength, 1);
      const last = path[path.length - 1] ?? d.revenueCagr;
      path.push(last + (d.revenueCagr - last) * weight);
      previous = previous * (1 + path[path.length - 1]);
    }
  }
  return { path, note: null };
}

export type ScenarioResult = {
  assumptions: Assumptions;
  drivers: HistoricalDrivers;
  flags: DataQualityFlag[];
  notes: string[];
};

export function buildScenario(
  f: Fundamentals,
  scenario: ScenarioName,
  horizonYears: 5 | 10,
  wacc: number
): ScenarioResult {
  const drivers = historicalDrivers(f);
  const flags: DataQualityFlag[] = [];
  const notes: string[] = [];

  let capexPctRevenue = drivers.capexPctRevenue;
  if (drivers.daPctRevenue > 0 && capexPctRevenue < drivers.daPctRevenue * CAPEX_TO_DA_FLOOR) {
    flags.push({
      code: 'CAPEX_BELOW_DA',
      severity: 'warn',
      message: `Reported capital expenditure averages ${(drivers.capexPctRevenue * 100).toFixed(2)}% of revenue against depreciation of ${(drivers.daPctRevenue * 100).toFixed(2)}%. A business cannot depreciate more than it invests indefinitely, so capex has been set equal to depreciation. Override it if the reported figure is right.`,
    });
    capexPctRevenue = drivers.daPctRevenue;
  }

  let growthPath: number[];
  let marginTilt = 0;
  let terminalTilt = 0;

  if (scenario === 'consensus') {
    const { path, note } = consensusGrowthPath(f, drivers, horizonYears);
    growthPath = path;
    if (note) notes.push(note);
  } else {
    const tilt = scenario === 'base' ? 0 : TILTS[scenario].revenueGrowth;
    growthPath = Array(horizonYears).fill(drivers.revenueCagr + tilt);
    if (scenario !== 'base') {
      marginTilt = TILTS[scenario].ebitMargin;
      terminalTilt = TILTS[scenario].terminalGrowth;
    }
  }

  return {
    assumptions: {
      horizonYears,
      revenueGrowth: growthPath,
      ebitMargin: Array(horizonYears).fill(drivers.ebitMargin + marginTilt),
      taxRate: drivers.taxRate,
      daPctRevenue: drivers.daPctRevenue,
      capexPctRevenue,
      nwcPctRevenueChange: drivers.nwcPctRevenueChange,
      terminalGrowth: DEFAULT_TERMINAL_GROWTH + terminalTilt,
      exitMultiple: DEFAULT_EXIT_MULTIPLE,
      wacc,
      midYearConvention: true,
    },
    drivers,
    flags,
    notes,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/scenarios.test.ts
```

Expected: all passing. The Stockland capex-guard test is the one that matters most - if it fails, read the fixture and check whether the guard threshold or the ratio calculation is wrong before touching the test.

- [ ] **Step 5: Commit**

```bash
git add lib/scenarios.ts tests/scenarios.test.ts && git commit -m "feat: scenario presets, consensus fade and capex sustainability guard"
```

---

### Task 15: Orchestrator

**Files:**
- Create: `lib/valuation.ts`
- Test: `tests/valuation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/valuation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildValuation } from '@/lib/valuation';
import type { RawTicker } from '@/lib/yahoo';

function deps(ticker: string) {
  const raw: RawTicker = JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
  return {
    fetchTicker: async () => raw,
    fetchFxRate: async () => 1.45,
    resolveRiskFree: async () => ({ rate: 0.042, source: 'test', assumed: false }),
  };
}

describe('buildValuation', () => {
  it('produces a valuation with all workings for a straightforward company', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, deps('MSFT'));
    expect(v.fundamentals.name).toMatch(/Microsoft/);
    expect(v.wacc.wacc).toBeGreaterThan(0.04);
    expect(v.dcf.forecast).toHaveLength(5);
    expect(v.valuePerShareQuoted).toBeGreaterThan(0);
    expect(v.sensitivity.cells).toHaveLength(5);
  });

  it('reports upside against the live price in the same units', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 5 }, deps('MSFT'));
    const expectedUpside = v.valuePerShareQuoted / v.fundamentals.price - 1;
    expect(v.upside).toBeCloseTo(expectedUpside, 10);
  });

  it('converts to quote currency once, at the end, for a cross-currency reporter', async () => {
    const v = await buildValuation('BHP.AX', { scenario: 'base', horizonYears: 5 }, deps('BHP.AX'));
    expect(v.fundamentals.reportingCurrency).toBe('USD');
    expect(v.fundamentals.quoteCurrency).toBe('AUD');
    expect(v.valuePerShareQuoted).toBeCloseTo(v.dcf.gordon.valuePerShare * 1.45, 6);
  });

  it('handles a pence-quoted, dollar-reporting company without a 100x error', async () => {
    const v = await buildValuation('SHEL.L', { scenario: 'base', horizonYears: 5 }, deps('SHEL.L'));
    // Value per share in pence should be the same order of magnitude as the
    // quoted pence price, not 100x out.
    const ratio = v.valuePerShareQuoted / v.fundamentals.price;
    expect(ratio).toBeGreaterThan(0.05);
    expect(ratio).toBeLessThan(20);
  });

  it('still returns a model for a bank, carrying the sector warning', async () => {
    const v = await buildValuation('CBA.AX', { scenario: 'base', horizonYears: 5 }, deps('CBA.AX'));
    expect(v.flags.some((x) => x.code === 'FINANCIAL_SECTOR')).toBe(true);
    expect(v.dcf.forecast).toHaveLength(5);
  });

  it('merges flags from the normaliser, the scenario builder and the WACC guard', async () => {
    const v = await buildValuation('SHEL.L', { scenario: 'base', horizonYears: 5 }, deps('SHEL.L'));
    expect(v.flags.some((x) => x.code === 'BETA_CLAMPED')).toBe(true);
  });

  it('honours the requested horizon', async () => {
    const v = await buildValuation('MSFT', { scenario: 'base', horizonYears: 10 }, deps('MSFT'));
    expect(v.dcf.forecast).toHaveLength(10);
  });

  it('applies user overrides on top of the scenario and marks it modified', async () => {
    const v = await buildValuation(
      'MSFT',
      { scenario: 'base', horizonYears: 5, overrides: { terminalGrowth: 0.01, wacc: 0.12 } },
      deps('MSFT')
    );
    expect(v.assumptions.terminalGrowth).toBeCloseTo(0.01, 10);
    expect(v.assumptions.wacc).toBeCloseTo(0.12, 10);
    expect(v.modified).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/valuation.test.ts
```

Expected: FAIL - cannot resolve `@/lib/valuation`.

- [ ] **Step 3: Implement the orchestrator**

Create `lib/valuation.ts`:

```typescript
import { runDcf } from './dcf';
import { majorCurrency, toQuoteDisplayUnits } from './fx';
import { marketFor } from './markets';
import { normalise } from './normalise';
import { resolveRiskFree as liveResolveRiskFree, type RiskFree } from './riskfree';
import { buildScenario } from './scenarios';
import { sensitivityGrid, type SensitivityGrid } from './sensitivity';
import { buildWacc } from './wacc';
import { fetchFxRate as liveFetchFxRate, fetchTicker as liveFetchTicker, type RawTicker } from './yahoo';
import type { Assumptions, DataQualityFlag, DcfResult, Fundamentals, ScenarioName, WaccBreakdown } from './types';

export type ValuationRequest = {
  scenario: ScenarioName;
  horizonYears: 5 | 10;
  /** Any subset of the assumption set, applied over the scenario defaults. */
  overrides?: Partial<Assumptions>;
};

export type ValuationDeps = {
  fetchTicker: (ticker: string) => Promise<RawTicker>;
  fetchFxRate: (from: string, to: string) => Promise<number | null>;
  resolveRiskFree: (ticker: string) => Promise<RiskFree>;
};

const LIVE_DEPS: ValuationDeps = {
  fetchTicker: liveFetchTicker,
  fetchFxRate: liveFetchFxRate,
  resolveRiskFree: (ticker) => liveResolveRiskFree(ticker),
};

export type Valuation = {
  fundamentals: Fundamentals;
  assumptions: Assumptions;
  wacc: WaccBreakdown;
  dcf: DcfResult;
  sensitivity: SensitivityGrid;
  /** Value per share in the units the market quotes in, comparable to price. */
  valuePerShareQuoted: number;
  fxRate: number;
  upside: number;
  scenario: ScenarioName;
  /** True when user overrides were applied over the preset. */
  modified: boolean;
  flags: DataQualityFlag[];
  notes: string[];
};

export async function buildValuation(
  ticker: string,
  request: ValuationRequest,
  deps: ValuationDeps = LIVE_DEPS
): Promise<Valuation> {
  const raw = await deps.fetchTicker(ticker);
  const fundamentals = normalise(ticker, raw);

  if (fundamentals.years.length === 0) {
    throw new Error(`No annual financial statements available for ${ticker}.`);
  }

  const market = marketFor(ticker);
  const riskFree = await deps.resolveRiskFree(ticker);
  const latest = fundamentals.years[0];
  const prior = fundamentals.years[1] ?? latest;

  // The scenario needs a tax rate, and the WACC needs the scenario's tax rate,
  // so build the scenario once with a placeholder WACC, then rebuild with the
  // real one. Cheap, and keeps both modules ignorant of each other.
  const provisional = buildScenario(fundamentals, request.scenario, request.horizonYears, riskFree.rate);

  const wacc = buildWacc({
    riskFree,
    equityRiskPremium: market.equityRiskPremium,
    rawBeta: fundamentals.rawBeta,
    marketCap: fundamentals.marketCap,
    totalDebt: latest.totalDebt.value,
    interestExpense: latest.interestExpense?.value ?? null,
    priorTotalDebt: prior.totalDebt.value,
    taxRate: provisional.assumptions.taxRate,
  });

  const scenario = buildScenario(fundamentals, request.scenario, request.horizonYears, wacc.wacc);
  const overrides = request.overrides ?? {};
  const assumptions: Assumptions = { ...scenario.assumptions, ...overrides };

  const inputs = {
    baseRevenue: latest.revenue.value,
    netDebt: latest.totalDebt.value - latest.cash.value,
    dilutedShares: latest.shares.value,
  };

  const dcf = runDcf(inputs, assumptions);
  const sensitivity = sensitivityGrid(inputs, assumptions, {
    waccSteps: 2,
    waccStep: 0.01,
    growthSteps: 2,
    growthStep: 0.005,
  });

  const fxRate =
    majorCurrency(fundamentals.quoteCurrency) === fundamentals.reportingCurrency
      ? 1
      : (await deps.fetchFxRate(fundamentals.reportingCurrency, majorCurrency(fundamentals.quoteCurrency))) ?? 1;

  const { value: valuePerShareQuoted } = toQuoteDisplayUnits(dcf.gordon.valuePerShare, {
    reportingCurrency: fundamentals.reportingCurrency,
    quoteCurrency: fundamentals.quoteCurrency,
    fxRate,
  });

  const flags: DataQualityFlag[] = [...fundamentals.flags, ...scenario.flags];
  if (wacc.betaClamped) {
    flags.push({
      code: 'BETA_CLAMPED',
      severity: 'warn',
      message: `Reported beta of ${wacc.rawBeta?.toFixed(3)} is outside a defensible range and has been clamped to ${wacc.beta.toFixed(2)}.`,
    });
  }
  if (wacc.riskFreeAssumed) {
    flags.push({ code: 'RISK_FREE_ASSUMED', severity: 'info', message: `Risk-free rate is an assumption: ${wacc.riskFreeSource}.` });
  }
  if (dcf.forecast.some((y) => y.fcff < 0)) {
    flags.push({ code: 'NEGATIVE_FCFF', severity: 'warn', message: 'Free cashflow is negative in at least one forecast year, so terminal value carries most of the valuation.' });
  }
  if (dcf.gordon.terminal.blocked) {
    flags.push({ code: 'TERMINAL_GROWTH_BLOCKED', severity: 'error', message: dcf.gordon.terminal.blocked });
  }

  return {
    fundamentals,
    assumptions,
    wacc,
    dcf,
    sensitivity,
    valuePerShareQuoted,
    fxRate,
    upside: fundamentals.price > 0 ? valuePerShareQuoted / fundamentals.price - 1 : 0,
    scenario: request.scenario,
    modified: Object.keys(overrides).length > 0,
    flags,
    notes: scenario.notes,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/valuation.test.ts
```

Expected: all passing. The Shell 100x test is the important one - a failure there means the currency layer is wrong, not the test.

- [ ] **Step 5: Run the whole suite**

```bash
npm test
```

Expected: every suite green.

- [ ] **Step 6: Commit**

```bash
git add lib/valuation.ts tests/valuation.test.ts && git commit -m "feat: valuation orchestrator composing data, scenario, WACC and engine"
```

---

### Task 16: URL state

**Files:**
- Create: `lib/urlstate.ts`
- Test: `tests/urlstate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/urlstate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/lib/urlstate';

const STATE = {
  scenario: 'bull' as const,
  horizonYears: 10 as const,
  overrides: { wacc: 0.0925, terminalGrowth: 0.02, midYearConvention: false },
};

describe('url state', () => {
  it('round-trips a full state through a query string', () => {
    expect(decodeState(encodeState(STATE))).toEqual(STATE);
  });

  it('returns a sane default for an empty query string', () => {
    const d = decodeState('');
    expect(d.scenario).toBe('base');
    expect(d.horizonYears).toBe(5);
    expect(d.overrides).toEqual({});
  });

  it('ignores unknown or malformed parameters rather than throwing', () => {
    const d = decodeState('scenario=nonsense&horizon=99&wacc=abc&junk=1');
    expect(d.scenario).toBe('base');
    expect(d.horizonYears).toBe(5);
    expect(d.overrides.wacc).toBeUndefined();
  });

  it('produces a query string short enough to paste', () => {
    expect(encodeState(STATE).length).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/urlstate.test.ts
```

Expected: FAIL - cannot resolve `@/lib/urlstate`.

- [ ] **Step 3: Implement it**

Create `lib/urlstate.ts`:

```typescript
import type { Assumptions, ScenarioName } from './types';

export type UrlState = {
  scenario: ScenarioName;
  horizonYears: 5 | 10;
  overrides: Partial<Assumptions>;
};

const SCENARIOS: ScenarioName[] = ['base', 'bull', 'bear', 'consensus'];

/** Short query keys for the scalar overrides, to keep shared links pasteable. */
const SCALAR_KEYS: Record<string, keyof Assumptions> = {
  wacc: 'wacc',
  tg: 'terminalGrowth',
  em: 'exitMultiple',
  tax: 'taxRate',
  da: 'daPctRevenue',
  cx: 'capexPctRevenue',
  nwc: 'nwcPctRevenueChange',
};

export function encodeState(state: UrlState): string {
  const p = new URLSearchParams();
  p.set('scenario', state.scenario);
  p.set('horizon', String(state.horizonYears));

  for (const [short, key] of Object.entries(SCALAR_KEYS)) {
    const v = state.overrides[key];
    if (typeof v === 'number') p.set(short, String(v));
  }
  if (state.overrides.midYearConvention !== undefined) {
    p.set('mid', state.overrides.midYearConvention ? '1' : '0');
  }
  if (state.overrides.revenueGrowth) p.set('g', state.overrides.revenueGrowth.join('|'));
  if (state.overrides.ebitMargin) p.set('m', state.overrides.ebitMargin.join('|'));

  return p.toString();
}

function numberArray(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split('|').map(Number);
  return parts.every((n) => Number.isFinite(n)) ? parts : undefined;
}

export function decodeState(query: string): UrlState {
  const p = new URLSearchParams(query);

  const scenarioParam = p.get('scenario') as ScenarioName | null;
  const scenario = scenarioParam && SCENARIOS.includes(scenarioParam) ? scenarioParam : 'base';
  const horizonYears = p.get('horizon') === '10' ? 10 : 5;

  const overrides: Partial<Assumptions> = {};
  for (const [short, key] of Object.entries(SCALAR_KEYS)) {
    const raw = p.get(short);
    if (raw === null) continue;
    const v = Number(raw);
    if (Number.isFinite(v)) (overrides[key] as number) = v;
  }
  const mid = p.get('mid');
  if (mid === '0' || mid === '1') overrides.midYearConvention = mid === '1';

  const g = numberArray(p.get('g'));
  if (g) overrides.revenueGrowth = g;
  const m = numberArray(p.get('m'));
  if (m) overrides.ebitMargin = m;

  return { scenario, horizonYears, overrides };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/urlstate.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/urlstate.ts tests/urlstate.test.ts && git commit -m "feat: shareable URL state"
```

---

### Task 17: API routes and caching

**Files:**
- Create: `app/api/search/route.ts`
- Create: `app/api/valuation/route.ts`
- Test: `tests/search-ranking.test.ts`
- Create: `lib/rank.ts`

- [ ] **Step 1: Write the failing ranking test**

The probe found that "Woolworths" returns Frankfurt and Johannesburg listings ahead of `WOW.AX`, so ranking is real logic and deserves a test of its own.

Create `tests/search-ranking.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { rankHits } from '@/lib/rank';

const WOOLWORTHS = [
  { symbol: 'WN3.F', name: 'Woolworths Holdings Ltd.', exchange: 'FRA' },
  { symbol: 'WHL.JO', name: 'Woolworths Holdings Ltd', exchange: 'JNB' },
  { symbol: 'WOW.XA', name: 'WOOLWORTHS FPO', exchange: 'CXA' },
  { symbol: 'WOW.AX', name: 'WOOLWORTHS FPO', exchange: 'ASX' },
];

describe('rankHits', () => {
  it('puts the ASX line first for an Australian company', () => {
    expect(rankHits(WOOLWORTHS)[0].symbol).toBe('WOW.AX');
  });

  it('ranks a US primary listing above its foreign cross-listings', () => {
    const hits = [
      { symbol: 'MSF.DE', name: 'MICROSOFT CORP.', exchange: 'GER' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NMS' },
    ];
    expect(rankHits(hits)[0].symbol).toBe('MSFT');
  });

  it('drops exchanges it does not know how to model', () => {
    const hits = [
      { symbol: 'XYZ.QQ', name: 'Somewhere Ltd', exchange: 'QQQ' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NMS' },
    ];
    expect(rankHits(hits).map((h) => h.symbol)).toEqual(['MSFT']);
  });

  it('keeps the input order stable within one exchange', () => {
    const hits = [
      { symbol: 'CBAPJ.AX', name: 'CWLTH BANK NYR3QUT', exchange: 'ASX' },
      { symbol: 'CBA.AX', name: 'CWLTH BANK FPO', exchange: 'ASX' },
    ];
    expect(rankHits(hits).map((h) => h.symbol)).toEqual(['CBAPJ.AX', 'CBA.AX']);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/search-ranking.test.ts
```

Expected: FAIL - cannot resolve `@/lib/rank`.

- [ ] **Step 3: Implement ranking**

Create `lib/rank.ts`:

```typescript
import { EXCHANGE_RANK } from './markets';
import type { SearchHit } from './yahoo';

/**
 * Yahoo returns cross-listings before primary lines - a search for
 * "Woolworths" puts Frankfurt and Johannesburg ahead of WOW.AX. Rank by
 * exchange preference and drop exchanges the market registry cannot model.
 */
export function rankHits(hits: SearchHit[]): SearchHit[] {
  return hits
    .filter((h) => EXCHANGE_RANK.includes(h.exchange))
    .map((h, i) => ({ hit: h, rank: EXCHANGE_RANK.indexOf(h.exchange), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.hit);
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/search-ranking.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Write the search route**

Create `app/api/search/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { rankHits } from '@/lib/rank';
import { searchTickers } from '@/lib/yahoo';

export const revalidate = 3600;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ hits: [] });

  try {
    const hits = rankHits(await searchTickers(query)).slice(0, 8);
    return NextResponse.json({ hits });
  } catch {
    return NextResponse.json({ hits: [], error: 'Search is unavailable right now.' }, { status: 503 });
  }
}
```

- [ ] **Step 6: Write the valuation route with caching**

Create `app/api/valuation/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { decodeState } from '@/lib/urlstate';
import { buildValuation } from '@/lib/valuation';
import { fetchTicker } from '@/lib/yahoo';

/**
 * Fundamentals change quarterly, so cache them hard. The cache sits around the
 * fetch rather than the valuation, so changing an assumption never refetches.
 */
const cachedFetchTicker = unstable_cache(
  async (ticker: string) => fetchTicker(ticker),
  ['yahoo-ticker'],
  { revalidate: 86400 }
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get('ticker')?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: 'A ticker is required.' }, { status: 400 });

  const state = decodeState(url.searchParams.toString());

  try {
    const valuation = await buildValuation(
      ticker,
      { scenario: state.scenario, horizonYears: state.horizonYears, overrides: state.overrides },
      {
        fetchTicker: cachedFetchTicker,
        fetchFxRate: (await import('@/lib/yahoo')).fetchFxRate,
        resolveRiskFree: (await import('@/lib/riskfree')).resolveRiskFree,
      }
    );
    return NextResponse.json(valuation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Valuation failed.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
```

- [ ] **Step 7: Verify both routes against the live app**

```bash
cd ~/dev/dcf-studio && npm run dev
```

Then in another shell:

```bash
curl -s "http://localhost:3000/api/search?q=woolworths" | head -c 400
curl -s "http://localhost:3000/api/valuation?ticker=BHP.AX&scenario=base&horizon=5" | head -c 400
```

Expected: the search puts `WOW.AX` first. The valuation returns a JSON object with `valuePerShareQuoted` and `wacc`.

- [ ] **Step 8: Verify the stale-cache behaviour the spec flagged**

The spec promises stale data is served with its age shown when Yahoo rate-limits. `unstable_cache` serves stale while revalidating, but a *failed* fetch against a cold cache has nothing to serve. Check what actually happens:

```bash
curl -s "http://localhost:3000/api/valuation?ticker=NOTAREALTICKER123" | head -c 300
```

Expected: a 422 with a clear message, not a crash or an empty 200. If a cold-cache failure produces anything less clear than that, add an explicit last-good snapshot per ticker rather than relying on the framework cache, and note the decision in the spec.

- [ ] **Step 9: Commit**

```bash
git add lib/rank.ts tests/search-ranking.test.ts app/api && git commit -m "feat: search and valuation API routes with exchange ranking and caching"
```

---

### Task 18: UI - search entry

**Files:**
- Modify: `app/page.tsx`
- Create: `app/components/TickerSearch.tsx`

- [ ] **Step 1: Write the search component**

Create `app/components/TickerSearch.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Hit = { symbol: string; name: string; exchange: string };

export function TickerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setHits(data.hits ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="w-full max-w-xl">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Company name or ticker - BHP, Microsoft, Wesfarmers"
        className="w-full rounded border border-neutral-300 px-4 py-3 text-lg outline-none focus:border-neutral-900"
        aria-label="Company name or ticker"
      />
      {loading && <p className="mt-2 text-sm text-neutral-500">Searching...</p>}
      <ul className="mt-2 divide-y divide-neutral-200">
        {hits.map((hit) => (
          <li key={hit.symbol}>
            <button
              onClick={() => router.push(`/${encodeURIComponent(hit.symbol)}`)}
              className="flex w-full items-baseline justify-between px-1 py-3 text-left hover:bg-neutral-50"
            >
              <span className="font-medium">{hit.name}</span>
              <span className="text-sm text-neutral-500">
                {hit.symbol} · {hit.exchange}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Write the landing page**

Replace `app/page.tsx` with:

```typescript
import { TickerSearch } from './components/TickerSearch';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">DCF Studio</h1>
      <p className="mt-3 max-w-xl text-neutral-600">
        Type a company. Get a discounted cashflow valuation built from its own reported
        numbers, with every assumption on the surface and every line traceable back to
        the filing it came from.
      </p>
      <div className="mt-8">
        <TickerSearch />
      </div>
      <p className="mt-12 text-sm text-neutral-500">
        General information only, not financial advice. Data from Yahoo Finance and the
        Reserve Bank of Australia; figures may be stale or wrong. Not affiliated with
        Yahoo.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Verify it renders and the search works**

```bash
npm run dev
```

Open `http://localhost:3000`, type "woolworths", and confirm `WOW.AX` appears at the top of the list and clicking it navigates to `/WOW.AX`.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/components/TickerSearch.tsx && git commit -m "feat: search entry page"
```

---

### Task 19: UI - the model page

**Files:**
- Create: `app/[ticker]/page.tsx`
- Create: `app/components/Headline.tsx`
- Create: `app/components/FlagList.tsx`
- Create: `app/components/ForecastTable.tsx`
- Create: `app/components/WaccTable.tsx`
- Create: `app/components/TerminalComparison.tsx`
- Create: `app/components/SensitivityTable.tsx`
- Create: `lib/format.ts`

Presentational components only - no calculation. Anything that needs a number computed belongs in `lib/`.

- [ ] **Step 1: Write formatting helpers**

Create `lib/format.ts`:

```typescript
export function pct(v: number, dp = 1): string {
  return `${(v * 100).toFixed(dp)}%`;
}

/** Scales to k/m/bn. Statements come through in units, so the scaling matters. */
export function money(v: number, currency: string): string {
  const abs = Math.abs(v);
  const [scaled, suffix] =
    abs >= 1e9 ? [v / 1e9, 'bn'] : abs >= 1e6 ? [v / 1e6, 'm'] : abs >= 1e3 ? [v / 1e3, 'k'] : [v, ''];
  return `${currency} ${scaled.toFixed(suffix === '' ? 2 : 1)}${suffix}`;
}

export function perShare(v: number, currency: string): string {
  return `${currency} ${v.toFixed(2)}`;
}

export function signedPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}
```

- [ ] **Step 2: Write the flag list**

Create `app/components/FlagList.tsx`:

```typescript
import type { DataQualityFlag } from '@/lib/types';

const STYLES: Record<DataQualityFlag['severity'], string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-neutral-300 bg-neutral-50 text-neutral-700',
};

const ORDER: DataQualityFlag['severity'][] = ['error', 'warn', 'info'];

export function FlagList({ flags }: { flags: DataQualityFlag[] }) {
  if (flags.length === 0) return null;
  const sorted = [...flags].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

  return (
    <div className="space-y-2">
      {sorted.map((flag, i) => (
        <p key={`${flag.code}-${i}`} className={`rounded border px-4 py-3 text-sm ${STYLES[flag.severity]}`}>
          {flag.message}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the headline**

Create `app/components/Headline.tsx`:

```typescript
import { perShare, signedPct } from '@/lib/format';
import type { Valuation } from '@/lib/valuation';

export function Headline({ v }: { v: Valuation }) {
  const currency = v.fundamentals.quoteCurrency;
  const positive = v.upside >= 0;

  return (
    <header>
      <p className="text-sm text-neutral-500">
        {v.fundamentals.ticker} · {v.fundamentals.exchange}
        {v.fundamentals.sector ? ` · ${v.fundamentals.sector}` : ''}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{v.fundamentals.name}</h1>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div>
          <p className="text-sm text-neutral-500">Implied value per share</p>
          <p className="text-4xl font-semibold tabular-nums">{perShare(v.valuePerShareQuoted, currency)}</p>
        </div>
        <div>
          <p className="text-sm text-neutral-500">Market price</p>
          <p className="text-2xl tabular-nums">{perShare(v.fundamentals.price, currency)}</p>
        </div>
        <div>
          <p className="text-sm text-neutral-500">Implied upside</p>
          <p className={`text-2xl font-medium tabular-nums ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
            {signedPct(v.upside)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-500">
        Gordon growth terminal value, {v.assumptions.horizonYears}-year explicit forecast,{' '}
        {v.assumptions.midYearConvention ? 'mid-year' : 'year-end'} discounting. Scenario:{' '}
        {v.scenario}
        {v.modified ? ' (modified)' : ''}.
        {v.fxRate !== 1
          ? ` Converted from ${v.fundamentals.reportingCurrency} at ${v.fxRate.toFixed(4)}.`
          : ''}
      </p>
    </header>
  );
}
```

- [ ] **Step 4: Write the forecast table**

Create `app/components/ForecastTable.tsx`:

```typescript
import { money } from '@/lib/format';
import type { DcfResult } from '@/lib/types';

export function ForecastTable({ dcf, currency }: { dcf: DcfResult; currency: string }) {
  const rows: [string, (y: DcfResult['forecast'][number]) => number][] = [
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
        Capital expenditure and working capital are shown as they hit cash - negative is an outflow.
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
```

- [ ] **Step 5: Write the WACC table**

Create `app/components/WaccTable.tsx`:

```typescript
import { money, pct } from '@/lib/format';
import type { WaccBreakdown } from '@/lib/types';

export function WaccTable({ w, currency }: { w: WaccBreakdown; currency: string }) {
  const rows: [string, string, string][] = [
    ['Risk-free rate', pct(w.riskFreeRate, 2), w.riskFreeAssumed ? `${w.riskFreeSource} (assumption)` : w.riskFreeSource],
    ['Equity risk premium', pct(w.equityRiskPremium, 2), 'Market assumption, editable'],
    ['Beta', w.beta.toFixed(3), w.betaClamped ? `Clamped from a reported ${w.rawBeta?.toFixed(3)}` : 'As reported'],
    ['Cost of equity', pct(w.costOfEquity, 2), 'Risk-free + beta x equity risk premium'],
    ['Cost of debt', pct(w.costOfDebt, 2), w.costOfDebtSource],
    ['Market capitalisation', money(w.marketCap, currency), `${pct(w.equityWeight, 1)} of capital`],
    ['Total debt', money(w.totalDebt, currency), `${pct(w.debtWeight, 1)} of capital, book value as a proxy`],
    ['Tax rate', pct(w.taxRate, 1), 'Effective, capped at statutory'],
    ['WACC', pct(w.wacc, 2), 'E/V x Re + D/V x Rd x (1 - t)'],
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold">Discount rate</h2>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {rows.map(([label, value, note], i) => (
            <tr key={label} className={`border-b border-neutral-100 ${i === rows.length - 1 ? 'font-semibold' : ''}`}>
              <td className="py-2 pr-4 text-neutral-600">{label}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{value}</td>
              <td className="py-2 text-sm text-neutral-500">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 6: Write the terminal value comparison**

Create `app/components/TerminalComparison.tsx`:

```typescript
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
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Undiscounted</dt>
                  <dd>{money(m.terminal.undiscounted, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Present value</dt>
                  <dd>{money(m.terminal.presentValue, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Share of enterprise value</dt>
                  <dd>{pct(m.terminal.shareOfEv, 1)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Enterprise value</dt>
                  <dd>{money(m.enterpriseValue, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Less net debt</dt>
                  <dd>{money(m.enterpriseValue - m.equityValue, currency)}</dd>
                </div>
                <div className="flex justify-between border-t border-neutral-200 pt-1 font-medium">
                  <dt>Value per share</dt>
                  <dd>{perShare(m.valuePerShare, currency)}</dd>
                </div>
              </dl>
            )}
          </div>
        ))}
      </div>
      {gap !== null && (
        <p className="mt-3 text-sm text-neutral-600">
          The two methods differ by {pct(gap, 0)}.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Write the sensitivity table**

Create `app/components/SensitivityTable.tsx`:

```typescript
import { pct } from '@/lib/format';
import type { SensitivityGrid } from '@/lib/sensitivity';

export function SensitivityTable({ grid, currency, centrePrice }: { grid: SensitivityGrid; currency: string; centrePrice: number }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Sensitivity</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Value per share in {currency}. Shaded where the implied value exceeds the market price.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="text-sm tabular-nums">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium text-neutral-500">WACC \ terminal g</th>
              {grid.growthValues.map((g) => (
                <th key={g} className="px-3 py-2 text-right font-medium">
                  {pct(g, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.waccValues.map((w, i) => (
              <tr key={w} className="border-t border-neutral-100">
                <th className="px-3 py-2 text-left font-medium">{pct(w, 2)}</th>
                {grid.cells[i].map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 text-right ${cell !== null && cell > centrePrice ? 'bg-emerald-50' : ''}`}
                  >
                    {cell === null ? '-' : cell.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Write the model page**

Create `app/[ticker]/page.tsx`:

```typescript
import Link from 'next/link';
import { FlagList } from '../components/FlagList';
import { ForecastTable } from '../components/ForecastTable';
import { Headline } from '../components/Headline';
import { SensitivityTable } from '../components/SensitivityTable';
import { TerminalComparison } from '../components/TerminalComparison';
import { WaccTable } from '../components/WaccTable';
import { decodeState } from '@/lib/urlstate';
import { buildValuation, type Valuation } from '@/lib/valuation';

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ModelPage({ params, searchParams }: Props) {
  const { ticker } = await params;
  const raw = await searchParams;

  const query = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : []))
  ).toString();
  const state = decodeState(query);

  let valuation: Valuation;
  try {
    valuation = await buildValuation(decodeURIComponent(ticker), {
      scenario: state.scenario,
      horizonYears: state.horizonYears,
      overrides: state.overrides,
    });
  } catch (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Cannot model {decodeURIComponent(ticker)}</h1>
        <p className="mt-3 text-neutral-600">
          {error instanceof Error ? error.message : 'Something went wrong.'}
        </p>
        <Link href="/" className="mt-6 inline-block underline">
          Try another company
        </Link>
      </main>
    );
  }

  const reportingCurrency = valuation.fundamentals.reportingCurrency;

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <Link href="/" className="text-sm underline">
        New search
      </Link>

      <Headline v={valuation} />
      <FlagList flags={valuation.flags} />
      {valuation.notes.map((note) => (
        <p key={note} className="text-sm text-neutral-600">
          {note}
        </p>
      ))}

      <ForecastTable dcf={valuation.dcf} currency={reportingCurrency} />
      <WaccTable w={valuation.wacc} currency={reportingCurrency} />
      <TerminalComparison v={valuation} />
      <SensitivityTable
        grid={valuation.sensitivity}
        currency={valuation.fundamentals.quoteCurrency}
        centrePrice={valuation.fundamentals.price}
      />

      <p className="border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        General information only, not financial advice. This is what these assumptions
        imply, not what the share is worth. Data from Yahoo Finance and the Reserve Bank
        of Australia, and may be stale or wrong.
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Verify against the real app**

```bash
npm run dev
```

Check each of these and confirm what the spec promises actually appears:

```bash
# BHP: currency mismatch banner, USD workings, AUD headline
curl -s "http://localhost:3000/BHP.AX" | grep -c "reported in USD"
# CBA: the financial-sector error banner
curl -s "http://localhost:3000/CBA.AX" | grep -ci "banks and insurers"
# SHEL.L: beta clamp banner
curl -s "http://localhost:3000/SHEL.L" | grep -ci "clamped"
```

Expected: each returns at least 1. Then open `http://localhost:3000/BHP.AX`, `.../CBA.AX`, `.../SGP.AX` and `.../MSB.AX` in a browser and confirm the tables render and no value is `NaN`, `Infinity` or blank.

- [ ] **Step 10: Commit**

```bash
git add app lib/format.ts && git commit -m "feat: model page with headline, forecast, WACC, terminal comparison and sensitivity"
```

---

### Task 20: UI - assumption controls

**Files:**
- Create: `app/components/AssumptionPanel.tsx`
- Modify: `app/[ticker]/page.tsx`

- [ ] **Step 1: Write the panel**

Create `app/components/AssumptionPanel.tsx`:

```typescript
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Assumptions, ScenarioName } from '@/lib/types';

const SCENARIOS: { key: ScenarioName; label: string; hint: string }[] = [
  { key: 'base', label: 'Base', hint: "The company's own history" },
  { key: 'bull', label: 'Bull', hint: '+3pp growth, +2pp margin' },
  { key: 'bear', label: 'Bear', hint: '-3pp growth, -2pp margin' },
  { key: 'consensus', label: 'Consensus', hint: 'Analyst revenue, years 1-2' },
];

const SLIDERS: { key: keyof Assumptions; short: string; label: string; min: number; max: number; step: number; asPercent: boolean }[] = [
  { key: 'wacc', short: 'wacc', label: 'WACC', min: 0.03, max: 0.20, step: 0.0025, asPercent: true },
  { key: 'terminalGrowth', short: 'tg', label: 'Terminal growth', min: -0.01, max: 0.05, step: 0.0025, asPercent: true },
  { key: 'exitMultiple', short: 'em', label: 'Exit EV/EBITDA', min: 2, max: 25, step: 0.5, asPercent: false },
  { key: 'taxRate', short: 'tax', label: 'Tax rate', min: 0, max: 0.5, step: 0.005, asPercent: true },
  { key: 'capexPctRevenue', short: 'cx', label: 'Capex % revenue', min: 0, max: 0.30, step: 0.0025, asPercent: true },
  { key: 'daPctRevenue', short: 'da', label: 'D&A % revenue', min: 0, max: 0.30, step: 0.0025, asPercent: true },
  { key: 'nwcPctRevenueChange', short: 'nwc', label: 'Change in NWC % change in revenue', min: -0.5, max: 0.5, step: 0.01, asPercent: true },
];

export function AssumptionPanel({ assumptions, scenario, modified }: { assumptions: Assumptions; scenario: ScenarioName; modified: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    router.push(`?${next.toString()}`, { scroll: false });
  }

  return (
    <section className="rounded border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Assumptions</h2>
        {modified && (
          <button onClick={() => router.push('?', { scroll: false })} className="text-sm underline">
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
              scenario === s.key && !modified ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
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
          Modified from the {scenario} preset. The URL carries your changes - copy it to share this model.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {SLIDERS.map((s) => {
          const value = assumptions[s.key] as number;
          return (
            <label key={s.short} className="block text-sm">
              <span className="flex justify-between">
                <span className="text-neutral-600">{s.label}</span>
                <span className="tabular-nums font-medium">
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
```

- [ ] **Step 2: Wire it into the model page**

In `app/[ticker]/page.tsx`, add the import:

```typescript
import { AssumptionPanel } from '../components/AssumptionPanel';
```

and insert directly after the `<FlagList .../>` element:

```typescript
      <AssumptionPanel
        assumptions={valuation.assumptions}
        scenario={valuation.scenario}
        modified={valuation.modified}
      />
```

Wrap the page body's use of `useSearchParams` correctly: because `AssumptionPanel` is a client component using `useSearchParams`, it must sit inside a `<Suspense>` boundary. Add the import `import { Suspense } from 'react';` and wrap it:

```typescript
      <Suspense fallback={null}>
        <AssumptionPanel
          assumptions={valuation.assumptions}
          scenario={valuation.scenario}
          modified={valuation.modified}
        />
      </Suspense>
```

- [ ] **Step 3: Verify interactively**

```bash
npm run dev
```

Open `http://localhost:3000/BHP.AX`. Drag the WACC slider and confirm: the value per share changes, the URL gains a `wacc=` parameter, the "Modified" note appears, and pasting the URL into a fresh tab reproduces the same model. Click through all four scenarios and confirm Consensus differs from Base for a covered name.

- [ ] **Step 4: Commit**

```bash
git add app && git commit -m "feat: assumption panel with scenario presets, sliders and URL state"
```

---

### Task 21: Methodology page

**Files:**
- Create: `app/methodology/page.tsx`
- Modify: `app/page.tsx`

The differentiator is that the workings are visible. This page states the formulas and the data limits plainly.

- [ ] **Step 1: Write the page**

Create `app/methodology/page.tsx`:

```typescript
import Link from 'next/link';

export const metadata = { title: 'Methodology - DCF Studio' };

export default function Methodology() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <Link href="/" className="text-sm underline">
        Back
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Methodology</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The cashflow build</h2>
        <p className="text-neutral-700">
          Free cashflow to firm is built from drivers rather than taken from a reported
          total, so every line is traceable:
        </p>
        <pre className="overflow-x-auto rounded bg-neutral-100 p-4 text-sm">{`Revenue(t) = Revenue(t-1) x (1 + growth)
EBIT(t)    = Revenue(t) x margin
NOPAT(t)   = EBIT(t) x (1 - tax rate)
FCFF(t)    = NOPAT(t) + D&A(t) - Capex(t) - change in NWC(t)`}</pre>
        <p className="text-neutral-700">
          An increase in net working capital is a cash outflow and is subtracted. Yahoo
          reports the working-capital movement with the opposite sign, as a cashflow
          contribution, so it is flipped once during normalisation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Discount rate</h2>
        <pre className="overflow-x-auto rounded bg-neutral-100 p-4 text-sm">{`Cost of equity = risk-free + beta x equity risk premium
Cost of debt   = interest expense / average total debt, floored at the risk-free rate
WACC           = E/V x Re + D/V x Rd x (1 - tax rate)`}</pre>
        <p className="text-neutral-700">
          Risk-free rates are sourced live for the US (10-year Treasury) and Australia
          (RBA F2). Every other market uses a documented assumption, labelled as such on
          the model page. Beta is clamped to a range of 0.3 to 2.5, because reported
          betas are occasionally negative and a cost of equity below the risk-free rate
          is not a defensible discount rate.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Terminal value</h2>
        <p className="text-neutral-700">
          Both methods are shown, because terminal value is usually most of the answer
          and the gap between the two is the honest measure of how much rests on
          assumption. Gordon growth requires terminal growth below the WACC; where it is
          not, the calculation is blocked rather than fudged.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Scenario presets</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li><strong>Base</strong> - revenue CAGR, mean EBIT margin, mean capex and D&A as a share of revenue, and the median effective tax rate, all from the company's own reported history.</li>
          <li><strong>Bull</strong> - Base plus 3pp of revenue growth, 2pp of EBIT margin and 0.5pp of terminal growth.</li>
          <li><strong>Bear</strong> - Base less the same amounts.</li>
          <li><strong>Consensus</strong> - analyst revenue estimates for the first two years, fading linearly to the historical growth rate. No consensus exists for margins or capex, so those stay rule-based.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Where this breaks</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li><strong>Banks and insurers.</strong> They report no meaningful operating income, and capex and working capital do not mean what this model assumes. A dividend-discount or excess-returns model is the right tool. The model still runs, with a warning.</li>
          <li><strong>Property trusts.</strong> Reported capex can be a fraction of real investment. Where capex falls well below depreciation, it is set equal to depreciation and flagged.</li>
          <li><strong>Loss-makers.</strong> Terminal value ends up carrying essentially the whole valuation, which is disclosed rather than hidden.</li>
          <li><strong>History depth.</strong> Only four to five annual periods are available free, so the historical anchors are short-run averages.</li>
          <li><strong>Currency.</strong> Some companies report in one currency and trade in another, and some markets quote in a sub-unit such as pence. The model works in reporting currency and converts once, at the end.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data sources</h2>
        <p className="text-neutral-700">
          Statements, prices, betas, analyst estimates and FX from Yahoo Finance.
          Australian risk-free rates from the Reserve Bank of Australia (F2, capital
          market yields). Both are free sources and neither is guaranteed accurate or
          current. Not affiliated with Yahoo.
        </p>
      </section>

      <p className="border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        General information only, not financial advice.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Link it from the landing page**

In `app/page.tsx`, replace the closing disclaimer paragraph with:

```typescript
      <p className="mt-12 text-sm text-neutral-500">
        General information only, not financial advice. Data from Yahoo Finance and the
        Reserve Bank of Australia; figures may be stale or wrong. Not affiliated with
        Yahoo.{' '}
        <a href="/methodology" className="underline">
          How it works
        </a>
        .
      </p>
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```

Open `http://localhost:3000/methodology` and confirm it renders and the link from the landing page works.

- [ ] **Step 4: Commit**

```bash
git add app && git commit -m "feat: methodology page"
```

---

### Task 22: Full verification pass

**Files:**
- Modify: `docs/TODO.md` (only if something is deferred)

- [ ] **Step 1: Run the whole suite and the type check**

```bash
cd ~/dev/dcf-studio && npm test && npx tsc --noEmit && npm run lint
```

Expected: all tests pass, no type errors, no lint errors.

- [ ] **Step 2: Confirm the production build works**

```bash
npm run build
```

Expected: build succeeds. A failure here that the dev server did not show is usually a client/server boundary problem - a `useSearchParams` outside `<Suspense>`, or `lib/yahoo.ts` being pulled into a client component.

- [ ] **Step 3: Walk the probe tickers end to end**

Start `npm run dev`, then open each of these and confirm the stated behaviour:

| URL | Must show |
|---|---|
| `/MSFT` | Clean model, no error flags, terminal share of EV under 90% |
| `/BHP.AX` | Currency-mismatch banner, USD workings, AUD headline |
| `/ARB.AX` | Derived working-capital note in the flags |
| `/CBA.AX` | Financial-sector error banner, model still renders |
| `/SGP.AX` | Capex-below-depreciation banner |
| `/MSB.AX` | Negative-cashflow warning |
| `/SHEL.L` | Beta-clamp banner, value per share in pence, same order of magnitude as the price |
| `/NOTREAL99` | A clear "cannot model" message, not a stack trace |

Any `NaN`, `Infinity`, blank cell or unhandled error is a defect - fix it before continuing.

- [ ] **Step 4: Check the guard values are actually sensible**

For `/BHP.AX` with the Base scenario, sanity-check by hand that the implied value per share is within an order of magnitude of the market price. A result 10x off is a units or currency bug, not a valuation opinion.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: issues found in the end-to-end verification pass"
```

---

### Task 23: Deploy

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
# DCF Studio

Type a company. Get a discounted cashflow valuation built from its own reported
numbers, with every assumption on the surface and every line traceable back to the
field it came from.

Live: https://dcf-studio.vercel.app

## Running locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

The normaliser tests run against recorded Yahoo responses in `tests/fixtures/`, so
they never hit the network. Each fixture was chosen because it breaks something:
CBA and RY report no operating income, SHEL quotes pence while reporting dollars,
ARB and SGP report no working-capital movement, MSB is loss-making.

Re-record them deliberately, never casually - the gaps they capture are the
regression tests:

```bash
npx tsx scripts/record-fixtures.ts
```

## Design and plan

- `docs/superpowers/specs/2026-07-30-dcf-studio-design.md`
- `docs/superpowers/plans/2026-07-30-dcf-studio.md`
- `docs/TODO.md`

## Data sources

Yahoo Finance (statements, prices, betas, analyst estimates, FX) and the Reserve
Bank of Australia (F2 capital market yields). Both free. General information only,
not financial advice. Not affiliated with Yahoo.
```

- [ ] **Step 2: Push to GitHub**

```bash
cd ~/dev/dcf-studio && git add -A && git commit -m "docs: README" && gh repo create dcf-studio --private --source=. --remote=origin --push
```

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --yes
```

Then promote to production:

```bash
npx vercel --prod
```

- [ ] **Step 4: Verify the deployed site, not just the local one**

Open the production URL and re-run the Task 22 Step 3 table against it. Serverless behaviour differs from local: cold starts, missing environment configuration, and stricter timeouts all surface here rather than in dev. Confirm at least `/MSFT`, `/BHP.AX`, `/CBA.AX` and `/SHEL.L` render correctly in production.

- [ ] **Step 5: Commit and report**

```bash
git add -A && git commit -m "chore: deploy configuration" && git push
```

Report the production URL. Adding the hub card on `charlie-tren.github.io` is a
separate change to a separate repo - raise it, do not do it unasked.

---

## Deferred to post-v1

Tracked in `docs/TODO.md`: dividend-discount model for financials, Excel export with
live formulas, longer US history via SEC EDGAR, custom domain.
