# DCF Studio - Design

**Date:** 30/07/2026
**Status:** Approved design, pre-implementation
**Repo:** `~/dev/dcf-studio` (off OneDrive, per Windows/Node scaffold rules)

## 1. What it is

A public web app: type a company name, pick a scenario, adjust any assumption, get a
discounted cashflow valuation with every intermediate line visible on screen.

Fourth card on the personal hub, alongside Crowdwise, One Story and The Aftertimes.
Audience is finance-literate - the name uses the acronym deliberately.

All data from free sources: Yahoo Finance for fundamentals, prices, betas, analyst
estimates and FX; the RBA for the AUD risk-free rate.

## 2. Data probe findings (30/07/2026)

The design is built on a probe of real tickers, not assumptions about coverage. These
findings drive most of the decisions below.

**What works.** Full annual statement sets for US, ASX, LSE, Xetra, Euronext Paris,
HKEX, Tokyo, Toronto, Swiss, India NSE, Korea and NZX. 4-5 annual periods.
`fundamentalsTimeSeries` returns 166-200 fields per ticker. FX pairs
(`AUDUSD=X`, `CNYHKD=X`, `USDINR=X` ...) all resolve. Analyst revenue estimates exist
even for A$600m ASX small caps (Jumbo Interactive, n=11).

**What doesn't, and what the code must therefore handle:**

| Finding | Ticker evidence | Consequence |
|---|---|---|
| Banks and insurers report no operating income | CBA.AX, RY.TO | Sector guard (section 8) |
| Reporting currency differs from quote currency | BHP.AX (USD/AUD), Tencent (CNY/HKD), Infosys (USD/INR) | Currency layer (section 6) |
| Quote in a sub-unit of the currency | SHEL.L quotes **GBp**, reports USD | 100x error path - explicit sub-unit table |
| Change in working capital absent | ARB.AX, SGP.AX | Fallback chain (section 5) |
| D&A appears under three different labels | ARB.AX, SGP.AX | Fallback chain (section 5) |
| Nonsensical beta | SHEL.L returns -0.235 | Beta guard, else WACC lands below the risk-free rate |
| No 10y govt yield outside the US | `^GDBR10`, `^GBGB10`, `^JP10YT=RR` all empty | Tiered risk-free (section 7) |
| `quoteSummary` statement modules dead since Nov 2024 | All tickers - library warns explicitly | Must use `fundamentalsTimeSeries` |
| Analyst estimates extend 2 years only, revenue only | All tickers - no `+5y`, no margin or capex consensus | Consensus scenario fades after year 2 |
| No quarterly statements on the free tier | WES.AX returns empty | Annual only |

## 3. Stack

Next.js (App Router) + TypeScript, deployed on Vercel. `yahoo-finance2` v3 for the data
layer (note: v3 requires `new YahooFinance()`, not the v2 default export).

Data fetching is server-side, in a route handler. This is a constraint, not a
preference: browser-side calls to Yahoo fail CORS, and the server route is the only
place caching can live. It rules out the static GitHub Pages pattern used for One Story
and The Aftertimes.

Caching: fundamentals revalidate 24h, quotes 15 min, FX 1h. Keyed by ticker. Protects
against the unofficial endpoints' rate limits.

## 4. Module boundaries

Each module has one job, a typed interface, and can be tested alone. The engine is
deliberately free of I/O so it can be unit-tested against a hand-computed reference.

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/yahoo.ts` | The only code that talks to Yahoo. `fundamentalsTimeSeries`, `quoteSummary`, `search`, `chart` for FX. Returns raw shapes. | network |
| `lib/normalise.ts` | Raw fields → canonical `Fundamentals`. Owns every fallback chain and emits `DataQuality` flags. | - |
| `lib/markets.ts` | Market registry: exchange suffix → currency, sub-unit divisor, statutory tax rate, risk-free source, tier. | - |
| `lib/fx.ts` | Reporting vs quote currency conversion, sub-unit handling. | `lib/yahoo.ts`, `lib/markets.ts` |
| `lib/riskfree.ts` | `^TNX` for USD, RBA F2 CSV for AUD, documented default table elsewhere. | `lib/yahoo.ts`, `lib/markets.ts` |
| `lib/scenarios.ts` | Derives Base / Bull / Bear from history, Consensus from `earningsTrend`. | `lib/normalise.ts` |
| `lib/wacc.ts` | Cost of equity and debt, weights, guards. Returns every component. | `lib/riskfree.ts` |
| `lib/dcf.ts` | **Pure.** Assumptions in, valuation out. No network, no clock, no config. | - |
| `lib/sensitivity.ts` | WACC × terminal-growth grid, calling `lib/dcf.ts`. | `lib/dcf.ts` |
| `lib/urlstate.ts` | Encode/decode the full assumption set to a shareable query string. | - |

## 5. Normalisation and fallback chains

Every canonical field is `{ value, sourceField, derivation }`. The UI renders that
provenance, so a user can trace any output back to the raw Yahoo field or the
derivation that produced it. This is the methodology-exposure requirement expressed in
the type system rather than in a footnote.

- **Revenue**: `totalRevenue`
- **EBIT**: `ebit` → `operatingIncome` → `pretaxIncome + interestExpense`
- **D&A**: `depreciationAndAmortization` → `reconciledDepreciation` →
  `depreciationAndAmortizationInIncomeStatement`
- **Capex**: `capitalExpenditure` (sign-normalised to positive outflow)
- **ΔNWC**: `changeInWorkingCapital` → balance-sheet delta
  (Δreceivables + Δinventory − Δpayables) → % of Δrevenue, flagged as modelled
- **Net debt**: `totalDebt − cashAndCashEquivalents`
- **Shares**: `ordinarySharesNumber` → `shareIssued`, diluted where available
- **Effective tax rate**: median of `taxProvision / pretaxIncome` across available
  years, clamped to [0, statutory rate for the domicile], ignoring loss years

Sign conventions are normalised once, in this module. Nowhere downstream should a
`Math.abs` appear.

## 6. Currency handling

Three distinct currencies can be in play: reporting, quote, and quote sub-unit.

1. All model arithmetic runs in **reporting currency**. No conversion mid-model.
2. Equity value converts **once**, at the end, to quote currency at spot.
3. The quote sub-unit divisor applies after that (GBp ÷ 100, ZAc ÷ 100, ILA ÷ 100).
4. Both currencies and the FX rate used are displayed. A mismatch is stated on screen,
   not silently handled - it is the most likely source of a wrong answer.

## 7. WACC

Re = rf + β × ERP. Every component is a visible line and every one is overridable.

- **Risk-free, tiered by market:**
  - *Sourced:* USD from `^TNX`, AUD from the RBA F2 series
  - *Assumed:* every other currency from a documented default table in
    `lib/markets.ts`, labelled on screen as an assumption rather than a fetched rate
- **Beta guard:** raw beta clamped to [0.3, 2.5]; the raw value and the clamp are both
  shown. Without this, Shell's -0.235 produces a cost of equity below the risk-free
  rate.
- **ERP:** single editable input, defaulted per market, sourced to a published estimate
  in the methodology text.
- **Cost of debt:** `interestExpense / average totalDebt`, floored at the risk-free
  rate. Falls back to an editable default where interest expense is absent.
- **Weights:** market capitalisation vs total debt (book value as a proxy for market
  value of debt - stated as such).
- **Tax shield:** at the effective tax rate, capped at statutory.

## 8. Sector guard

Financials (banks, insurers, diversified financial services) genuinely cannot be valued
with FCFF - no meaningful EBIT, and capex and working capital do not mean what the model
assumes. Three of the probed tickers were affected.

Behaviour: a prominent warning explains why a DCF misprices the company and what the
right tool would be. The model still runs on best-effort numbers. Chosen deliberately -
blocking would be intellectually cleaner but less useful, and the explanation is itself
the educational content.

A dividend-discount model for financials is logged in `docs/TODO.md` as post-v1 work.

## 9. Assumption scenarios

Preset bundles fill every driver; any single driver remains editable afterwards. Editing
a preset marks the scenario "modified" rather than silently claiming to still be Base.

- **Base** - the company's own history: revenue CAGR, mean EBIT margin, mean capex/rev,
  mean D&A/rev, mean ΔNWC/Δrev, median effective tax rate
- **Bull / Bear** - defined tilts off Base (growth, margin, terminal growth), stated
  numerically in the methodology so they are reproducible, not vibes
- **Consensus** - revenue growth for years 1-2 from `earningsTrend`, fading linearly to
  the Base rate by the end of the horizon. Margins and capex stay rule-based, because no
  consensus exists for them. Analyst count displayed; thin coverage (n < 3) flagged.

## 10. DCF engine

Driver-based FCFF build, so every line is traceable and the missing-ΔNWC problem is
solved by construction:

```
Revenue(t)   = Revenue(t-1) × (1 + g(t))
EBIT(t)      = Revenue(t) × margin(t)
NOPAT(t)     = EBIT(t) × (1 − tax rate)
FCFF(t)      = NOPAT(t) + D&A(t) − Capex(t) − ΔNWC(t)
             where D&A(t)   = Revenue(t) × D&A%rev
                   Capex(t) = Revenue(t) × capex%rev
                   ΔNWC(t)  = [Revenue(t) − Revenue(t-1)] × ΔNWC%Δrev
```

- **Horizon:** user picks 5 (default) or 10 years. Default 5 because only 4-5 years of
  history exist to anchor on.
- **Discounting:** mid-year convention (t − 0.5) by default, toggleable to year-end.
- **Terminal value, both methods side by side:**
  - Gordon growth: `FCFF(n) × (1 + g) / (WACC − g)`, with a guard requiring
    `g < WACC` and a warning where `g` exceeds the risk-free rate
  - Exit multiple: `terminal EBITDA × multiple`, defaulted from the company's own
    trailing EV/EBITDA
  - The **gap between the two is displayed** - that gap is the real information, and
    each method's share of total value is shown
- **Bridge:** EV → less net debt → equity value → ÷ diluted shares → per share →
  converted to quote currency
- **Loss-makers:** negative FCFF is not suppressed. Terminal value's share of total
  value is called out, since for a loss-maker that share is effectively the whole answer.

## 11. Output

Headline: implied value per share and % upside or downside against the live price.

Below, all expanded by default rather than hidden behind tabs:

1. Year-by-year FCFF build table (the block in section 10, as rendered rows)
2. WACC decomposition, every component with its source or "assumption" label
3. EV → equity bridge
4. Both terminal values, with each one's share of total value
5. Sensitivity grid: WACC × terminal growth
6. Data-quality strip: years of history, derived fields, analyst counts, currency
   mismatch, any guard that fired
7. Methodology section explaining the formulas, the preset tilts, and the data sources

## 12. Sharing

Full assumption set encoded in the URL query string. Copy, send, reopen. No accounts, no
database, stays inside Vercel's free tier.

## 13. Error handling

| Case | Behaviour |
|---|---|
| Name matches nothing | Suggest close matches from `search`, exchange-ranked |
| Ticker resolves, no statements | Explicit "no fundamentals available", no partial model |
| Financial-sector company | Warn prominently, run anyway (section 8) |
| Negative EBIT throughout | Run, flag that terminal value dominates |
| ΔNWC or D&A missing | Derive, mark the field as derived in the provenance |
| Beta absurd or absent | Clamp or default, show raw value |
| Risk-free unavailable | Fall back to the market default table, labelled as assumed |
| `g ≥ WACC` | Block the Gordon calculation with an explanation; exit multiple still shown |
| Yahoo unreachable or rate-limited | Serve stale cache with its age shown; explain if nothing cached |

Name→ticker resolution ranks by exchange preference (ASX and US first, then the tier-1
list), because the probe showed "Woolworths" returns Frankfurt and Johannesburg lines
ahead of `WOW.AX`.

## 14. Testing

- **Engine** (`lib/dcf.ts`): unit tests against a hand-computed reference model, to the
  same standard as a client workbook - independent recompute, not eyeballing. Covers
  mid-year vs year-end, both terminal methods, `g ≥ WACC`, negative FCFF, 5 and 10 year
  horizons.
- **Normaliser**: recorded JSON fixtures from the probed tickers (MSFT, BHP.AX, ARB.AX,
  CBA.AX, SGP.AX, MSB.AX, SHEL.L, RY.TO). Tests never hit the network, and every gap the
  probe found becomes a permanent regression test.
- **Currency**: SHEL.L (GBp quote, USD reporting) as the canonical case.
- **WACC**: SHEL.L negative beta as the canonical guard case.
- **End-to-end**: one route-level test per tier-1 market, verifying a valuation is
  produced and no guard silently swallows a failure.

## 15. Out of scope for v1

Accounts, database, dividend-discount model for financials, Excel or CSV export,
intraday updates, multi-currency debt detail, options or convertibles in the share
count, minority interests in the bridge (net debt only, stated).

## 16. Compliance framing

Public site, general information only. Carries a plain disclaimer: not financial advice,
no relationship with Yahoo, figures derived from third-party data that may be wrong or
stale. The output is deliberately framed as "what these assumptions imply", not "what
this share is worth".
