/**
 * Refresh lib/peers.json - which companies the sibling sites cover.
 *
 *   node tools/peers.mjs
 *
 * Shortfall and Consensus Drift each publish a tickers.json listing what they cover,
 * and this page offers a link to them only when they actually have the company. The
 * result is COMMITTED rather than fetched at request time, for the same reason CFA
 * Companion bakes its question bank into a script tag: a fetch is a failure mode in
 * someone else's browser, and this is a few hundred kilobytes that changes weekly.
 *
 * Deliberately paranoid about what comes back. A Cloudflare error page or an empty
 * array would otherwise silently empty the peer set and quietly delete every link on
 * the site - a wrong answer that looks like a working build. So a sibling publishing
 * under half its previous universe is refused, and the previous file stands.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'lib', 'peers.json');

const SITES = {
  shortfall: {
    label: 'Shortfall',
    href: (t) => `https://charlietrenorden.com/shortfall/?q=${encodeURIComponent(t)}`,
    manifest: 'https://charlietrenorden.com/shortfall/tickers.json',
  },
  'consensus-drift': {
    label: 'Consensus Drift',
    href: (t) => `https://charlietrenorden.com/consensus-drift/?q=${encodeURIComponent(t)}`,
    manifest: 'https://charlietrenorden.com/consensus-drift/tickers.json',
  },
  // Crosscheck is the two sites above crossed against each other, so it only covers a
  // company both of them carry - 609 of Shortfall's 640. It publishes the same manifest
  // as the others precisely so this link can be checked rather than assumed.
  crosscheck: {
    label: 'Crosscheck',
    href: (t) => `https://charlietrenorden.com/crosscheck/?q=${encodeURIComponent(t)}`,
    manifest: 'https://charlietrenorden.com/crosscheck/tickers.json',
  },
};

const MIN_KEEP = 0.5;

async function existing() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return {};
  }
}

const old = await existing();
const next = { ...old };
let failed = 0;

for (const [slug, site] of Object.entries(SITES)) {
  try {
    const res = await fetch(site.manifest, {
      headers: { 'user-agent': 'dcf-studio-build/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const tickers = body?.tickers;
    if (!Array.isArray(tickers) || tickers.length === 0) {
      throw new Error('no ticker list in the response');
    }
    const before = old[slug]?.tickers?.length ?? 0;
    if (before && tickers.length < before * MIN_KEEP) {
      throw new Error(`published ${tickers.length} against ${before} last time`);
    }
    next[slug] = { label: site.label, asOf: body.as_of ?? null, tickers: tickers.sort() };
    console.log(`peers: ${slug} ${tickers.length} tickers, as of ${body.as_of}`);
  } catch (err) {
    failed += 1;
    const kept = old[slug]?.tickers?.length;
    console.warn(
      `peers: ${slug} unreachable (${err.message})` +
        (kept ? ` - keeping the cached ${kept}` : ' - and never cached, so no links to it')
    );
  }
}

await writeFile(OUT, JSON.stringify(next, null, 1) + '\n', 'utf8');
console.log(`wrote ${OUT}${failed ? ` (${failed} sibling(s) unreachable)` : ''}`);
