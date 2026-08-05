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

- [ ] **Read Expectations Investing (Mauboussin & Rappaport) and rebuild the model on it.**
  Requested 30/07/2026. The book inverts the usual exercise: instead of forecasting
  cashflows to reach a value, start from the market price and solve for the expectations
  embedded in it, then judge whether those are beatable. `lib/backsolve.ts` and the
  "Priced in" panel are a crude first step in that direction, but the real framework is
  more structured:
  - **Value drivers** proper - sales growth, operating profit margin, incremental
    investment rate - rather than the loose driver set used now.
  - **Market-implied expectations** as the STARTING point of the page, not a footnote to a
    DCF that disagrees with it.
  - **Expectations infrastructure** - which driver the price is most sensitive to (the
    "turbo trigger"), so a reader knows which assumption to interrogate first.
  - **Historical benchmarking** of each implied driver against what the company has
    actually achieved, which is the test of whether the expectation is plausible.
  This is a genuine redesign of the model's spine, not a feature. Worth reading first and
  deciding whether it replaces the current DCF-first framing or sits beside it as a second
  mode.

- [ ] **"Assumption Stress" - ship market-implied expectations as a first-class mode.**
  Requested 05/08/2026. Concrete build spec for the Expectations Investing item above,
  not a separate project. Today the model runs forward: enter assumptions, get a value.
  The inverse is rarer and more useful: enter today's price, solve for what the market
  must be assuming.
  - Entry point is the PRICE, not the driver panel. The page opens with "at $X, the
    market is assuming...".
  - Solve for the implied triplet - revenue growth, operating margin, and the duration
    over which the company earns above its cost of capital. Show the solution surface,
    not one point, since many combinations clear the same price.
  - Sensitivity ranking: which driver moves value most from here (the "turbo trigger"),
    so a reader knows which assumption to interrogate first.
  - Plausibility check: benchmark each implied driver against what the company has
    actually delivered historically. That comparison is the whole payoff - the reader
    should be able to see at a glance whether the market is asking for something the
    business has ever done.
  - Stress grid: shock each implied driver and show the price that falls out, so the
    reader can see how much has to go wrong to justify a lower price.
  `lib/backsolve.ts` and the "Priced in" panel are the crude first step; this is the
  full version. Decide alongside the Expectations Investing read whether it REPLACES the
  DCF-first framing or sits beside it as a second mode.

## Post-v1

- [ ] **Dividend-discount model for financials.** Banks and insurers have no meaningful
  EBIT, capex or working capital, so FCFF misprices them. v1 warns loudly and runs
  anyway; the correct fix is to detect the financial sector and switch to a DDM or
  excess-returns model. Probe evidence: CBA.AX and RY.TO both return no operating
  income. Charlie's call, 30/07/2026.
- [ ] Excel / CSV export of the full model with live formulas (house style is a
  traceable calc chain, not pasted values).
- [ ] Longer US history via SEC EDGAR `companyfacts` (free, keyless, official) to extend
  beyond Yahoo's 4-5 annual periods.
- [ ] Custom domain, once one is bought for the hub cluster.
