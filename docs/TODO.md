# DCF Studio - TODO

## Next up

- [x] **Add DCF Studio to the personal website** - DONE 30/07/2026 by Charlie himself
  (commit 6506f39 in the hub repo, verified live on charlie-tren.github.io linking to
  dcf-studio.vercel.app with a dcf-studio.png thumbnail). This item was stale - written
  before the work was done and never re-checked.
- [x] **Bare "woolworths" search does not surface WOW.AX** - DONE 30/07/2026. Yahoo caps
  `search` at 5 quotes whatever `quotesCount` asks for, and WHICH five depends on the
  caller's region. `searchTickers` now runs a default-region and an AU-region call in
  parallel and merges on symbol. Verified live: woolworths, telstra, csl and commonwealth
  bank all lead with the .AX line, and microsoft still leads with MSFT.

- [ ] **Market-implied expectations as a first-class mode ("Assumption Stress").**
  Requested 30/07 and sharpened 05/08/2026; merged into one item 17/08 because the second
  entry was the build spec for the first, not a separate project.

  **Step 1 - read Expectations Investing** (Mauboussin & Rappaport). The book inverts the
  usual exercise: rather than forecasting cashflows to reach a value, start from the market
  price and solve for the expectations embedded in it, then judge whether those are
  beatable. Read before building - the point of the read is to decide whether this REPLACES
  the DCF-first framing or sits beside it as a second mode.

  **Step 2 - build.** `lib/backsolve.ts` and the "Priced In" panel are a crude first step;
  the full version is:
  - Entry point is the PRICE, not the driver panel. The page opens with "at $X, the market
    is assuming...".
  - Solve for the implied triplet - revenue growth, operating margin, and the **duration**
    over which the company earns above its cost of capital. Show the **solution surface**,
    not one point: many combinations clear the same price, so a single point estimate is
    misleading.
  - **Value drivers proper** - sales growth, operating profit margin, incremental investment
    rate - rather than the loose driver set used now.
  - **Turbo trigger**: rank which driver moves value most from here, so a reader knows which
    assumption to interrogate first.
  - **Plausibility check**: benchmark each implied driver against what the company has
    actually delivered. This is the whole payoff - the reader should see at a glance whether
    the market is asking for something the business has never done.
  - **Stress grid**: shock each implied driver and show the price that falls out.

## Post-v1

- [ ] **Dividend-discount model for financials.** Banks and insurers have no meaningful
  EBIT, capex or working capital, so FCFF misprices them. v1 warns loudly and runs
  anyway; the correct fix is to detect the financial sector and switch to a DDM or
  excess-returns model. Probe evidence: CBA.AX and RY.TO both return no operating
  income. Charlie's call, 30/07/2026.
- [x] **Excel export with live formulas** - DONE 17/08/2026. Five sheets (Assumptions,
  Forecast, Valuation, Sensitivity, Source data). Only genuine inputs are typed values;
  every derived figure is a formula, so editing a driver reprices the whole workbook.
  Verified in Excel itself via COM: it computes WACC 10.6909%, PV 408.0578bn, perpetuity
  225.4393, exit 454.6375 - identical to the site to 4dp - and a +5pp growth edit repriced
  225.44 -> 268.65. Tests recompute the sheet's own formula chain and assert it ties to the
  site across five tickers. CSV not built: the point was the live calc chain, which CSV
  cannot carry.
- [ ] Longer US history via SEC EDGAR `companyfacts` (free, keyless, official) to extend
  beyond Yahoo's 4-5 annual periods.
- [x] **Custom domain** - DONE 11/08/2026 by Charlie. `charlietrenorden.com/dcf-studio`
  serves a redirect page to `dcf.charlietrenorden.com`, which serves the live app (verified
  17/08: HTTP 200, API returns a valuation). Same pattern as Crowdwise. The item was stale -
  written when no domain existed.
