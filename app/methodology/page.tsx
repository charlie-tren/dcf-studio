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
          Free cashflow to firm is built from drivers rather than taken from a reported total, so
          every line is traceable:
        </p>
        <pre className="overflow-x-auto rounded bg-neutral-100 p-4 text-sm">{`Revenue(t) = Revenue(t-1) x (1 + growth)
EBIT(t)    = Revenue(t) x margin
NOPAT(t)   = EBIT(t) x (1 - tax rate)
FCFF(t)    = NOPAT(t) + D&A(t) - Capex(t) - change in NWC(t)`}</pre>
        <p className="text-neutral-700">
          An increase in net working capital is a cash outflow and is subtracted. Yahoo reports the
          working-capital movement with the opposite sign, as a cashflow contribution, so it is
          flipped once during normalisation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Discount rate</h2>
        <pre className="overflow-x-auto rounded bg-neutral-100 p-4 text-sm">{`Cost of equity = risk-free + beta x equity risk premium
Cost of debt   = interest expense / average total debt
WACC           = E/V x Re + D/V x Rd x (1 - tax rate)`}</pre>
        <p className="text-neutral-700">
          Risk-free rates are sourced live for the US (10-year Treasury) and Australia (RBA F2 table,
          the 10-year Australian Government series). Every other market uses a documented assumption,
          labelled as such on the model page.
        </p>
        <p className="text-neutral-700">
          Two guards apply, because reported inputs are sometimes not what they claim to be. Beta is
          clamped to a range of 0.3 to 2.5: reported betas are occasionally negative, and a cost of
          equity below the risk-free rate is not a defensible discount rate. The cost of debt is
          floored at the risk-free rate and capped at 800bp above it - beyond that, interest expense
          and reported debt are measuring different things rather than the company being distressed,
          which is common for banks whose interest expense includes deposits that total debt
          excludes.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Terminal value</h2>
        <p className="text-neutral-700">
          Both methods are shown, because terminal value is usually most of the answer and the gap
          between the two is the honest measure of how much rests on assumption. Gordon growth
          requires terminal growth below the WACC; where it is not, the calculation is blocked rather
          than fudged. Terminal value sits at the end of the final explicit year, so it discounts at
          full <em>t</em> even when the cashflows use the mid-year convention.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Scenario presets</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li>
            <strong>Base</strong> - revenue CAGR, mean EBIT margin, mean capex and D&amp;A as a share
            of revenue, and the median effective tax rate, all from the company&apos;s own reported
            history.
          </li>
          <li>
            <strong>Bull</strong> - Base plus 3pp of revenue growth, 2pp of EBIT margin and 0.5pp of
            terminal growth.
          </li>
          <li>
            <strong>Bear</strong> - Base less the same amounts.
          </li>
          <li>
            <strong>Consensus</strong> - analyst revenue estimates for the first two years, fading
            linearly to the historical growth rate. No consensus exists for margins or capex, so
            those stay rule-based.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Where this breaks</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-700">
          <li>
            <strong>Banks and insurers.</strong> They report no meaningful operating income, and
            capex and working capital do not mean what this model assumes. A dividend-discount or
            excess-returns model is the right tool. The model still runs, with a warning.
          </li>
          <li>
            <strong>Property trusts.</strong> Reported capex can be a fraction of real investment -
            one large REIT reports capital expenditure of 0.1% of revenue because it invests through
            investment properties rather than plant and equipment. Where capex is negligible or falls
            well below depreciation, it is substituted and flagged.
          </li>
          <li>
            <strong>Loss-makers.</strong> Terminal value ends up carrying essentially the whole
            valuation, which is disclosed rather than hidden.
          </li>
          <li>
            <strong>History depth.</strong> Only four to five annual periods are available free, so
            the historical anchors are short-run averages, and a five-year DCF anchored on trailing
            history will read low against a company the market is pricing for acceleration.
          </li>
          <li>
            <strong>Currency.</strong> Some companies report in one currency and trade in another,
            and some markets quote in a sub-unit such as pence. The model works in reporting currency
            throughout and converts once, at the end.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data sources</h2>
        <p className="text-neutral-700">
          Statements, prices, betas, analyst estimates and FX from Yahoo Finance. Australian
          risk-free rates from the Reserve Bank of Australia (F2, capital market yields). Both are
          free sources and neither is guaranteed accurate or current. Not affiliated with Yahoo.
        </p>
      </section>

      <p className="border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        General information only, not financial advice.
      </p>
    </main>
  );
}
