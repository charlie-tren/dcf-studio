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

- [x] **A blocked perpetuity still prints a headline number** - DONE 26/08/2026. Toyota (7203.T) has a WACC
  of 2.38% against 2.50% terminal growth, so the perpetuity cannot converge. The engine
  does the right thing internally - terminal value floors to zero, and an error flag says
  why - but what the reader then sees is "Value per share (3,027.73), implied upside
  -198.62%" in bold on both the page and the Valuation tab, which looks like an answer
  rather than a refusal. The methodology page says the calculation is "blocked rather than
  fudged"; it is blocked, and then the blocked result is published. Charlie's call on the
  fix: suppress the perpetuity headline and lead with the exit multiple, show an explicit
  "no perpetuity value at this WACC" in place of the number, or leave it and rely on the
  flag. Found 26/08/2026 while sweeping five tickers through the Excel export.

  **Resolved without a new design call.** `TerminalComparison` had already chosen the
  answer - print the refusal in place of the number - and the headline, the value bars
  and the workbook simply never applied it. The headline now reads "No perpetuity value"
  and drops the upside block; the bars drop the perpetuity row; the Valuation sheet
  carries a warning beside its heading, written as a formula so that fixing the WACC in
  Excel clears it (verified over COM).

- [x] **Loss-makers invert the sign on the terminal reinvestment row** - DONE 26/08/2026. Mesoblast shows
  "Less reinvestment to fund terminal growth 56.6" as a positive, because NOPAT is negative
  and the row is `-NOPAT x rate`. It does not propagate - capitalised cashflow is floored
  at zero - so this is cosmetic, but a "Less" row that adds reads as an error. Small.
  Found 26/08/2026.

  **Fixed as the real thing rather than a relabel**: the charge is floored at zero,
  because a business cannot fund growth out of a loss. It moves no published number in
  the case observed, since capitalised cashflow was already floored, but it does move one
  wherever maintenance cashflow is positive on negative NOPAT, and it moves it the
  conservative way. Floored in the engine AND in the sheet formula - the cached result
  alone would have looked right while Excel recalculated the floor away on open.

- [ ] **No fixture covers a JSE or TASE name.** The sub-unit conversion for ZAc and ILA is
  now covered by unit tests on `quoteConversionFactor`, which is the right level for the
  arithmetic, but nothing exercises the full chain end to end the way `SHEL.L` does for
  pence. Worth recording NPN.JO and TEVA.TA the next time `record-fixtures.ts` runs.
  Noted 27/08/2026.

- [ ] **Yahoo's `totalDebt` is intermittent on NPN.JO.** A cached payload had it at 0 with
  a "No total debt reported" derived value, while a fresh pull gave 18.0bn - which flips
  the name between net cash and net debt and moved the valuation from +15.08 to -7.87 per
  share. The model has no way to tell a real zero from a missing field. Noted 27/08/2026
  while diffing a deployed run against a local one; not investigated further.

- [x] **Reverse DCF verified end to end** - DONE 27/08/2026. Every solved driver was fed
  back through the engine as an override and the market price checked out: 19 solved drivers
  across nine tickers, all reproducing the price to 0.000%. The nulls are principled rather
  than missing - SGP has no revenue growth that reaches its price, CBA no margin, and the
  loss-maker and the blocked-perpetuity name return nothing at all, which is what the
  methodology page promises. Proven discriminating: perturbing a solved driver by 10% moves
  the resulting price about 10% off the market, so the check can fail.

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

  **Correction, 26/08/2026.** That reconciliation stopped at the reporting-currency value
  per share, so it never touched the last two rows of the Valuation sheet, and a pence
  quote shipped wrong for nine days: Shell showed 38.16 against 3,345.75p because the
  conversion cell held the bare FX rate with no sub-unit multiply. Fixed, and the tests now
  recompute the quoted value and the upside too. The lesson is the general one - a
  reconciliation that stops one row short of the number the reader actually looks at is not
  a reconciliation.
- [ ] **Longer US history via SEC EDGAR `companyfacts`.** Free, keyless, official.
  **Probed 17/08/2026 - it is NOT the quick win it looks like.** The endpoint works
  (`data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json`, needs a User-Agent header)
  and returns up to 11 annual periods, but coverage per line is RAGGED: on GOOGL,
  `OperatingIncomeLoss` / capex / tax / cash all give 11 years, while `Revenues` gives
  only 6 NON-CONTIGUOUS years (gaps at FY18-19 and FY22-24, because the company switched
  XBRL tags to `RevenueFromContractWithCustomerExcludingAssessedTax`), D&A is under
  neither standard tag, and diluted shares gives 2. So it needs a per-line tag-resolution
  chain per company, and it is US-only - no ASX. Medium-large, not small. Also worth
  asking first whether 11 years of history materially improves a 5-year model, given the
  drivers are already short-run averages.
- [x] **Custom domain** - DONE 11/08/2026 by Charlie. `charlietrenorden.com/dcf-studio`
  serves a redirect page to `dcf.charlietrenorden.com`, which serves the live app (verified
  17/08: HTTP 200, API returns a valuation). Same pattern as Crowdwise. The item was stale -
  written when no domain existed.
