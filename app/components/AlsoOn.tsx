import peers from '@/lib/peers.json';

/**
 * The same company on the sibling sites: what the accounting tests say about it, and
 * where analyst estimates are heading. A site that does not cover the company is
 * OMITTED rather than greyed, so the row shortens rather than offering a dead link.
 *
 * Membership comes from each site's published tickers.json, refreshed into
 * lib/peers.json by tools/peers.mjs. It has to be checked rather than assumed: only
 * about half of Consensus Drift's names are in Shortfall's S&P 500 + ASX 200 universe,
 * and Consensus Drift itself drops around a hundred names a week where estimate
 * history is too sparse to plot.
 *
 * DCF Studio is the only one of the three that routes any ticker, which is why this
 * component exists here and nothing symmetrical is needed on the other side.
 */
const SITES: Record<string, (t: string) => string> = {
  shortfall: (t) => `https://charlietrenorden.com/shortfall/?q=${encodeURIComponent(t)}`,
  'consensus-drift': (t) =>
    `https://charlietrenorden.com/consensus-drift/?q=${encodeURIComponent(t)}`,
  crosscheck: (t) => `https://charlietrenorden.com/crosscheck/?q=${encodeURIComponent(t)}`,
};

type Peer = { label: string; asOf: string | null; tickers: string[] };

export function AlsoOn({ ticker }: { ticker: string }) {
  const symbol = ticker.toUpperCase();
  const on = Object.entries(peers as Record<string, Peer>)
    .filter(([slug, p]) => SITES[slug] && p.tickers.includes(symbol))
    .map(([slug, p]) => ({ label: p.label, href: SITES[slug](symbol) }));

  if (on.length === 0) return null;

  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--text-dim)]">
      <span>Also on</span>
      {on.map((site, i) => (
        <span key={site.href} className="flex items-baseline gap-x-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          <a
            href={site.href}
            className="text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {site.label}
          </a>
        </span>
      ))}
    </p>
  );
}
