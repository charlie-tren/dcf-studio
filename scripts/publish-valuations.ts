/**
 * Publish this model's output as a static file, so Crosscheck can join against it.
 *
 * Run with: npx tsx scripts/publish-valuations.ts
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A SCRAPER. The three-way join sat recorded as
 * "blocked - DCF Studio publishes no data at all", with the fallback being to request
 * all 609 pages over HTTP: roughly fifty minutes of Vercel function time, nothing
 * cached, and 609 Yahoo pulls behind it anyway. None of that is needed. buildValuation
 * is a plain function and runs perfectly well in Node, so the model can be run
 * directly and the answer committed - the same way Shortfall and Consensus Drift
 * already publish theirs. No HTTP to our own app, no Vercel in the path.
 *
 * Measured 09/09/2026: 20 large caps in 32.4s serially, 1.62s each, 20 of 20
 * successful. At the concurrency below that is about four minutes for 609, and the
 * only external dependency is Yahoo, which the sibling sites already hit daily at
 * similar volume.
 *
 * WHAT IT PUBLISHES, AND WHAT IT DELIBERATELY DOES NOT. A ratio of implied value to
 * market price per company, never a fair value in the consumer's units. This model on
 * defaults runs systematically below the market - median 0.57x across 44 large caps,
 * measured the same day - which makes it a usable ORDERING and a bad price. The
 * consumer ranks these; publishing the ratio rather than the dollar figure is what
 * keeps it honest about which of those it is.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildValuation } from '../lib/valuation';
import { publishableRatio, guardCoverage } from '../lib/batch';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'valuations.json');

/**
 * The universe is Crosscheck's own manifest, not this site's, because Crosscheck is
 * the only consumer and it covers the 609 companies Shortfall and Consensus Drift
 * both carry. Valuing the other 600-odd names would double the run for rows nobody
 * reads. This is not a cycle: Crosscheck's ticker list is decided by its two parents
 * and does not depend on anything here.
 */
const UNIVERSE = 'https://charlietrenorden.com/crosscheck/tickers.json';

/**
 * Four at a time. Yahoo is the constraint rather than CPU, and a bare Promise.all over
 * 609 is exactly the fan-out that gets a batch rate-limited - the failure then looks
 * like "the model cannot value these companies" rather than "we asked too fast".
 */
const CONCURRENCY = 4;

type Row = { ticker: string; ratio: number };

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function previousCount(): Promise<number | null> {
  try {
    const prior = JSON.parse(await readFile(OUT, 'utf8'));
    return typeof prior.published === 'number' ? prior.published : null;
  } catch {
    return null;
  }
}

async function main() {
  const manifest = await fetch(UNIVERSE, {
    headers: { 'User-Agent': 'dcf-studio-publish' },
  }).then((r) => r.json());
  const tickers: string[] = manifest.tickers ?? [];
  if (tickers.length === 0) throw new Error(`${UNIVERSE} carried no tickers`);
  console.log(`universe: ${tickers.length} companies from ${manifest.site}`);

  const started = Date.now();
  let failed = 0;
  let dropped = 0;

  const results = await pool(tickers, CONCURRENCY, async (ticker): Promise<Row | null> => {
    try {
      const v = await buildValuation(ticker, { scenario: 'base', horizonYears: 5 });
      const ratio = publishableRatio(v.valuePerShareQuoted, v.fundamentals.price);
      if (ratio === null) {
        dropped++;
        return null;
      }
      return { ticker, ratio: Number(ratio.toFixed(4)) };
    } catch {
      // A company the model cannot value is an ordinary outcome here, not an error:
      // no statements, a currency with no rate, a blocked perpetuity. It is COUNTED,
      // because a run where that number jumps is the signal that something upstream
      // broke.
      failed++;
      return null;
    }
  });

  const rows = results.filter((r): r is Row => r !== null);
  const secs = (Date.now() - started) / 1000;
  console.log(
    `valued ${rows.length}, dropped ${dropped} as implausible, ${failed} could not be ` +
      `modelled, in ${(secs / 60).toFixed(1)} min`
  );

  const why = guardCoverage(rows.length, await previousCount());
  if (why) {
    console.error(`REFUSING TO WRITE: ${why}`);
    process.exit(1);
  }

  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  await writeFile(
    OUT,
    JSON.stringify(
      {
        site: 'DCF Studio',
        url: 'https://dcf.charlietrenorden.com/',
        as_of: new Date().toISOString().slice(0, 10),
        // What the number IS, stated in the file, because a bare ratio invites the
        // reader to treat it as a price.
        measure:
          'implied value per share divided by market price, base case, 5-year forecast',
        note:
          'An ORDERING, not a fair value. This model on defaults runs systematically '
          + 'below market prices, so rank these rather than printing them.',
        attempted: tickers.length,
        published: rows.length,
        dropped_implausible: dropped,
        could_not_model: failed,
        ratios: Object.fromEntries(rows.map((r) => [r.ticker, r.ratio])),
      },
      null,
      1
    ) + '\n',
    'utf8'
  );
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
