import Link from 'next/link';

export const metadata = { title: 'Methodology - DCF Studio' };

export default function Methodology() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      {/* Link and heading share a block so the page's space-y-10 does not strand
          the back-link 40px above the title. Muted with a left arrow, matching the
          header's "Other projects" link rather than shouting in the accent colour. */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-dim)] transition-colors hover:text-[var(--text)]"
        >
          {/* The arrow's ink sits low in its em box beside a capital: nudge it up 1px. */}
          <span aria-hidden="true" className="relative -top-px">
            ←
          </span>
          Back to search
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Methodology</h1>
      </div>

      <section className="space-y-3">
        <h2 className="pt-2 text-xl font-semibold text-white">The cashflow build</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Free cashflow to firm is built from drivers rather than taken from a reported total, so
          every line is traceable:
        </p>
        <pre className="nums overflow-x-auto scroll-subtle rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-dim)]">{`Revenue(t) = Revenue(t-1) x (1 + growth)
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
        <h2 className="pt-2 text-xl font-semibold text-white">Discount rate</h2>
        <pre className="nums overflow-x-auto scroll-subtle rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-dim)]">{`Cost of equity = risk-free + beta x equity risk premium
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
        <h2 className="pt-2 text-xl font-semibold text-white">Terminal value</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Both methods are shown, because terminal value is usually most of the answer and the gap
          between the two says how much rests on assumption. Perpetuity growth requires terminal
          growth below the WACC; where it is not, the calculation is blocked rather than fudged.
        </p>
        <p className="leading-relaxed text-[var(--text-dim)]">
          The exit multiple defaults to the company&apos;s own current EV/EBITDA rather than a fixed
          number - a single multiple applied to a software business, an oil major and a property trust
          alike is an arbitrary anchor, not a second opinion. It is clamped to 3-20x, because a
          depressed or blown-out trailing multiple should not be projected five years out unchallenged.
          Note what this makes it: anchored to today&apos;s price, so it answers &quot;what if the
          rating holds&quot; rather than providing an independent intrinsic check. The perpetuity
          method is the intrinsic one.
        </p>
        <p className="leading-relaxed text-[var(--text-dim)]">
          The terminal year is put on a steady-state footing, which matters more than it sounds and
          cuts both ways. Carrying a buildout capex rate into perpetuity understates value - Alphabet
          spends ~22% of revenue on capex against ~5% depreciation, and assuming that gap persists
          forever cost ~44% of value per share. But setting capex equal to depreciation and then
          growing the result is the opposite error: zero net reinvestment with positive growth implies
          infinite return on incremental capital, and overstates terminal value by 9-33%.
        </p>
        <p className="leading-relaxed text-[var(--text-dim)]">
          So the reinvestment identity is applied instead: g = ROIC x reinvestment rate.
        </p>
        <pre className="nums overflow-x-auto scroll-subtle rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-dim)]">{`FCFF terminal = NOPAT x (1 - g / ROIC)`}</pre>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Depreciation covers maintenance; the reinvestment rate funds growth on top. ROIC is NOPAT
          over invested capital from the company&apos;s own accounts, floored at the WACC - below that,
          growth destroys value, which on this data usually means invested capital is the wrong
          denominator (financials) rather than a genuine finding. Both discount at the same convention
          as the explicit flows: under mid-year the terminal value discounts at n - 0.5, because the
          perpetuity it capitalises also arrives through the year. The forecast years always show the
          real capex being spent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="pt-2 text-xl font-semibold text-white">Scenario presets</h2>
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
        <h2 className="pt-2 text-xl font-semibold text-white">Priced in</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Each input is also solved in reverse: what would revenue growth, margin, or the discount
          rate have to be for today&apos;s price to hold, with the others left where the model has them.
          Bisection against the same engine that produces the headline. Alphabet currently needs ~46%
          annual revenue growth for five years against 12.5% of history, or a discount rate near 6% -
          alternatives, not a set. Returns nothing where the price is unreachable in any input, rather
          than extrapolating past the bracket.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="pt-2 text-xl font-semibold text-white">Where this breaks</h2>
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
            <strong>Hybrids and preference lines.</strong> Yahoo types a hybrid note the same as
            ordinary shares, so a search for a bank can return both. A hybrid has no claim on group
            free cashflow - its value is its coupon and call schedule - and it carries no market
            capitalisation, which is how those lines are detected and flagged.
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
        <h2 className="pt-2 text-xl font-semibold text-white">Data sources</h2>
        <p className="leading-relaxed text-[var(--text-dim)]">
          Statements, prices, betas, analyst estimates and FX from Yahoo Finance. Australian
          risk-free rates from the Reserve Bank of Australia (F2, capital market yields). Both are
          free sources and neither is guaranteed accurate or current.
        </p>
      </section>

      <p className="border-t border-[var(--border)] pt-6 text-sm text-[var(--text-faint)]">
        General information only, not financial advice.
      </p>
    </main>
  );
}
