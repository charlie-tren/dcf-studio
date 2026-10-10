# DCF Studio - TODO

## Open items - Tier 0 (Auto + unblocked) first, then by Score descending

Last refresh: 2026-10-11 - excess-returns model, its Excel workbook and trade working capital
shipped.

| ID | Item | Score | Owner | Build | Prerequisites | Notes |
|---|---|---|---|---|---|---|
| 1 | Market-implied expectations mode (Assumption Stress) | 3.2 | Auto | 2 days | None | Price-first upgrade of the Priced In panel, beside the DCF: implied growth, margin and duration surface, turbo trigger, plausibility against delivered history, stress grid. |
| 2 | Longer US history via SEC EDGAR | 2.2 | Auto | 2 days | None | Ragged tag coverage per line, US only. With consensus now setting years 1-2, history only sets the margin and capex anchors, so the case is weaker than before. |

## Shipped
- ~~Base growth path: consensus years 1-2, fading to terminal growth, ten-year default~~ - 2026-10-10. Universe median 0.54x -> 0.67x, inside 0.5-2.0x 49% -> 60%, published 428 -> 451 (with the row below).
- ~~Equity risk premium from Damodaran, January 2026~~ - 2026-10-10. 4.23% mature plus country premium.
- ~~Debt that cannot tell zero from missing~~ - 2026-10-10. Components, then prior year carried, then a DEBT_UNREPORTED flag.
- ~~JSE and TASE fixtures~~ - 2026-10-10. NPN.JO and TEVA.TA end to end.
- ~~Excel workbook for banks and insurers~~ - 2026-10-11. Excess Returns and Source data sheets, ROE and payout medians as formulas over the reported history. Excel recalc check: 13 tickers, 5,179 cells, 0 mismatches; an injected x0.5 on per-share caught.
- ~~Excess-returns model for banks and insurers~~ - 2026-10-11. Book plus PV of ROE above cost of equity, ROE fading to min(ROE, 20%). 27 financials: median 0.76x, 23 inside 0.5-2.0x (the pretax proxy ran at 1.28x). Universe now publishes 529 of 614, declined 136 -> 29.
- ~~Workbook not byte-identical across exports~~ - 2026-10-11. Zip entries and `modified` carried the clock; the test only passed because it built both inside a second.
- ~~Working capital from the trade balance, not the cashflow line~~ - 2026-10-10. Visa, Coca-Cola, Thermo, Starbucks were on the +1.0 clamp; Apple drew a 29bn release from one down year. Population-neutral (0.783x -> 0.770x); the fix is to the forecast rows.
- ~~Cost-of-debt label read "2bp" for a 200bp spread~~ - 2026-10-10, found on the AAPL page.

## Removed
- ~~Margin path from the latest year, fading to the mean~~ - measured 10/10/2026 on the 44-name sample: median 0.783 -> 0.780 fading, 0.765 holding the latest, usable 26 either way. No population gain.

## Item details

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

  **Framing - DECIDED 11/10/2026: beside the DCF, not replacing it.** Expectations
  Investing (Mauboussin & Rappaport) starts from the price and solves for the expectations
  in it. That is an upgrade of the Priced In panel, not a new page: the DCF, the Excel
  export and Crosscheck's ratio stay as they are. This step used to read "read the book
  first" and sat for two months as Owner: User because it named no reader; it was never
  waiting on Charlie.

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

- [x] **The three P2 items left from the 03/10 external review** - CLOSED 06/10/2026.
  - **Cost of debt from a synthetic rating** - DONE. The floor is now the risk-free plus
    the spread for the rating interest cover implies (Damodaran, January 2026), capped
    at the 200bp fallback. An 800bp cap was tried first and rejected on the population:
    Intel, Boeing and Baxter went to 13% debt while rated investment grade. Measured
    across Crosscheck's 610 with `scripts/inspect-cost-of-debt.ts`: 396 of 484 move,
    median +55bp, rank correlation of the published ratio 0.995.
  - **Country equity risk premium** - MIS-SCOPED. Every market already carries its own
    ERP in `lib/markets.ts` (US 5.5%, India 8%, HK 7%...). What the review was really
    missing is a source and a date for them; those are hand-set, within the range
    practitioners use, and moving them to Damodaran's implied 4.3% mature premium
    would lift every headline value on the site by a fifth. Left as set; revisit only
    if the model's calibration against market prices is reopened.
  - **Sector-aware exit-multiple band** - DECLINED. The exit multiple is the company's
    own EV/EBITDA, and the 3-20x band only bites on the few names outside it; the exit
    method is the second opinion, not the headline, and the slider goes to 25x.

- [x] **03/10 external review - what was built** - DONE 06/10/2026. Capex fades to the
  steady state the terminal assumes (GOOGL's terminal step 1.74x -> 1.09x); the workbook
  mirrors the depreciation split (it was 31% out on AMD); the publisher declines any
  result the page calls the wrong tool (banks were tilting Crosscheck); the risk-free
  rate, price and accounts are dated on the page; the PV row lost its growth rate.
  Refuted on the data: the risk-free rate was ^TNX exactly, correctly scaled. Declined
  with reasons in the commits: a D&A roll-forward, a revenue fade to terminal g, a 50bp
  rate alarm, and a check row that would always read about 1.0 now the fade exists.

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
