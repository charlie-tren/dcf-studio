import { describe, expect, it } from 'vitest';
import peers from '../lib/peers.json';

/**
 * The cross-site handoff. DCF Studio routes any ticker, so it is the one of the three
 * that can always receive - but it must not offer a link INTO a site that does not
 * have the company, and half the names it can model are outside Shortfall's S&P 500 +
 * ASX 200 universe.
 *
 * These test the peer manifest rather than the component, because the manifest is
 * what actually decides, it is refreshed from the network by tools/peers.mjs, and a
 * silently emptied list would delete every link on the site while every render still
 * succeeded.
 */
type Peer = { label: string; asOf: string | null; tickers: string[] };
const sites = peers as Record<string, Peer>;

describe('peer manifest', () => {
  it('carries both sibling sites', () => {
    expect(Object.keys(sites).sort()).toEqual(['consensus-drift', 'shortfall']);
  });

  it('is not empty for either site', () => {
    // The failure this guards: a fetch that returned an error page would leave an
    // empty array, every link would vanish, and nothing would look broken.
    for (const [slug, p] of Object.entries(sites)) {
      expect(p.tickers.length, `${slug} has no tickers`).toBeGreaterThan(100);
    }
  });

  it('holds plain Yahoo-suffixed symbols, uppercase, with no duplicates', () => {
    for (const [slug, p] of Object.entries(sites)) {
      const set = new Set(p.tickers);
      expect(set.size, `${slug} has duplicate tickers`).toBe(p.tickers.length);
      for (const t of p.tickers) {
        expect(t, `${slug}: ${t}`).toBe(t.toUpperCase());
        expect(t.trim(), `${slug}: ${t} has whitespace`).toBe(t);
      }
    }
  });

  it('agrees with the other sites on the shared key', () => {
    // All three route by the same plain Yahoo symbol - AMD, A2M.AX, III.L - which is
    // the whole reason no translation layer exists. If a site changed format the
    // overlap would collapse rather than throw.
    const sf = new Set(sites.shortfall.tickers);
    const overlap = sites['consensus-drift'].tickers.filter((t) => sf.has(t));
    expect(overlap.length).toBeGreaterThan(400);
  });

  it('does not claim coverage a site does not have', () => {
    // Shortfall ranks the S&P 500 and the ASX 200 only. A Canadian or Hong Kong
    // listing must not appear in its manifest, or the omit-not-grey rule silently
    // becomes a dead link.
    const sf = sites.shortfall.tickers;
    for (const suffix of ['.TO', '.HK', '.L', '.PA', '.MC', '.NS', '.NZ']) {
      expect(sf.filter((t) => t.endsWith(suffix)), `Shortfall claims ${suffix}`).toEqual([]);
    }
  });
});
