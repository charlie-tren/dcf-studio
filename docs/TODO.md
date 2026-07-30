# DCF Studio - TODO

## Next up

- [ ] **Add DCF Studio to the personal website** - link card on `charlie-tren.github.io`
  pointing at https://dcf-studio.vercel.app, alongside Crowdwise / One Story / The
  Aftertimes. Separate repo (`charlie-tren/charlie-tren.github.io`); needs a screenshot
  thumbnail to match the existing cards. Requested 30/07/2026.
- [ ] **Bare "woolworths" search does not surface WOW.AX.** Yahoo caps `search` at 5 quotes
  regardless of `quotesCount`, and for that term all five are the South African Woolworths
  Holdings plus cross-listings. "woolworths group" ranks WOW.AX first. Options: a
  region-biased second call (`region: 'AU'` returns a different five), or merging two calls.

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
