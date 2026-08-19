# DCF Studio

Type a company. Get a discounted cashflow valuation built from its own reported numbers,
with every assumption on the surface and every line traceable back to the field it came
from.

Live at **https://dcf.charlietrenorden.com** (also reachable at
charlietrenorden.com/dcf-studio and dcf-studio.vercel.app).

## Running locally

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

The data-layer tests run against recorded Yahoo responses in `tests/fixtures/`, so they
never hit the network. Each fixture was chosen because it breaks something: CBA and RY
report no operating income, SHEL quotes pence while reporting dollars, ARB and SGP report
no working-capital movement, SGP's capex is 0.1% of revenue, MSB is loss-making and
returns a negative beta.

Re-record them deliberately, never casually - the gaps they capture are the regression
tests:

```bash
npx tsx scripts/record-fixtures.ts
```

## Diagnostics

Green unit tests missed five real bugs during the build; each was caught by reading actual
output. Run these after any change to the data layer:

```bash
npx tsx scripts/inspect-normalised.ts
```

```bash
npx tsx scripts/inspect-valuations.ts
```

```bash
npx tsx scripts/check-rba-live.ts
```

## Design and plan

- `docs/superpowers/specs/2026-07-30-dcf-studio-design.md`
- `docs/superpowers/plans/2026-07-30-dcf-studio.md`
- `docs/TODO.md`

## Data sources

Yahoo Finance (statements, prices, betas, analyst estimates, FX) and the Reserve Bank of
Australia (F2 capital market yields, the 10-year Australian Government series). Both free.

General information only, not financial advice. Not affiliated with Yahoo.

<!-- visibility: this repo went PRIVATE on 18/08/2026. Vercel deploys private repos
     fine via its GitHub App; this line exists because that had to be PROVEN by a real
     push rather than assumed. -->
