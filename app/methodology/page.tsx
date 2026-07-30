import Link from 'next/link';

export const metadata = { title: 'Methodology - DCF Studio' };

export default function Methodology() {
  return (
    <main className="mx-auto max-w-3xl space-y-9 px-6 py-12">
      <Link href="/" className="text-sm text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:no-underline">
        Back to search
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-white">Methodology</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">The cashflow build</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Free cashflow to firm is built from drivers rather than taken from a reported total, so
          every line is traceable:
        </p>
        <pre className="nums overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-dim)]">{`Revenue(t) = Revenue(t-1) x (1 + growth)
EBIT(t)    = Revenue(t) x margin
NOPAT(t)   = EBIT(t) x (1 - tax rate)
FCFF(t)    = NOPAT(t) + D&A(t) - Capex(t) - change in NWC(t)`}</pre>
        <p className="leading-relaxed text-[var(--text-dim)]">
          An increase in net working capital is a cash outflow and is subtracted. Yahoo reports the
          working-capital movement with the opposite sign, as a cashflow contribution, so it is
          flipped once during normalisation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Discount rate</h2>
        <pre className="nums overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-dim)]">{`Cost of equity = risk-free + beta x equity risk premium
Cost of debt   = interest expense / average total debt
WACC           = E/V x Re + D/V x Rd x (1 - tax rate)`}</pre>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Risk-free rates are sourced live for the US (10-year Treasury) and Australia (RBA F2 table,
          the 10-year Australian Government series). Every other market uses a documented assumption,
          labelled as such on the model page.
        </p>
        <p className="leading-relaxed text-[var(--text-dim)]">
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
        <h2 className="text-xl font-semibold text-white">Terminal value</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Both methods are shown, because terminal value is usually most of the answer and the gap
          between the two is the honest measure of how much rests on assumption. Gordon growth
          requires terminal growth below the WACC; where it is not, the calculation is blocked rather
          than fudged. Terminal value sits at the end of the final explicit year, so it discounts at
          full <em>t</em> even when the cashflows use the mid-year convention.
        </p>
        <p className="leading-relaxed text-[var(--text-dim)]">
          One further adjustment matters more than it sounds. A perpetuity is a steady state, and in a
          steady state capital expenditure settles at roughly the level that maintains the asset base
          - which is depreciation. Companies mid-buildout break that badly: Alphabet currently spends
          about 22% of revenue on capex against 5% of depreciation. Carrying that gap forward forever
          assumes it outspends its own depreciation in perpetuity, which understated its value per
          share by roughly 44% with no input being wrong. Terminal capex is therefore normalised to
          depreciation, and the toggle on the model page turns that off if you want the naive version.
          The explicit forecast years always show the real capex being spent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Scenario presets</h2>
        <ul className="list-disc space-y-2 pl-5 leading-relaxed text-[var(--text-dim)]">
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
        <h2 className="text-xl font-semibold text-white">What the market must be assuming</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          A model that disagrees with the price by 60% is not very useful on its own. So each input is
          also solved in reverse: what would revenue growth, or margin, or the discount rate have to
          be for today&apos;s price to be the right answer, holding everything else where the model has
          it? That turns &quot;this looks expensive&quot; into a claim you can actually judge - Alphabet
          currently needs about 47% annual revenue growth for five years against 12.5% of history, or
          a discount rate near 6%. Each line is an alternative, not a set; any one of them on its own
          closes the gap. Solved by bisection against the same engine that produces the headline.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Where this breaks</h2>
        <ul className="list-disc space-y-2 pl-5 leading-relaxed text-[var(--text-dim)]">
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
        <h2 className="text-xl font-semibold text-white">Data sources</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Statements, prices, betas, analyst estimates and FX from Yahoo Finance. Australian
          risk-free rates from the Reserve Bank of Australia (F2, capital market yields). Both are
          free sources and neither is guaranteed accurate or current. Not affiliated with Yahoo.
        </p>
      </section>

      <p className="border-t border-[var(--border)] pt-6 text-sm text-[var(--text-faint)]">
        General information only, not financial advice.
      </p>
    </main>
  );
}
