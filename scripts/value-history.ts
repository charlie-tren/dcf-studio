/**
 * Value a batch of point-in-time fundamentals with the live model.
 *
 * Run with: npx tsx scripts/value-history.ts <in.json> <out.json>
 *
 * The input is written by Crosscheck's dcf_history.py: one entry per (company, past
 * date), each carrying Fundamentals rebuilt from the SEC filings public by that date,
 * the price on that date, a beta from the five years before it and the 10-year
 * Treasury yield that day. This script adds nothing of its own: it runs
 * valueFundamentals, the same function the site runs, and applies the same two rules
 * publish-valuations.ts applies before a ratio may be ranked (declinedByModel, then
 * publishableRatio). So a historical ratio and a live one differ only in their inputs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { valueFundamentals } from '../lib/valuation';
import { declinedByModel, publishableRatio } from '../lib/batch';
import type { Fundamentals } from '../lib/types';
import type { RiskFree } from '../lib/riskfree';

type Entry = { key: string; fundamentals: Fundamentals; riskFree: RiskFree };

async function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) throw new Error('usage: value-history.ts <in.json> <out.json>');
  const entries: Entry[] = JSON.parse(await readFile(inPath, 'utf8'));
  const out: Record<string, { ratio: number | null; why?: string }> = {};
  const tally: Record<string, number> = { valued: 0, declined: 0, dropped: 0, failed: 0 };
  for (const e of entries) {
    try {
      const v = valueFundamentals(e.fundamentals, e.riskFree, 1, { scenario: 'base', horizonYears: 10 });
      if (declinedByModel(v.flags)) {
        out[e.key] = { ratio: null, why: v.flags.filter((f) => f.severity === 'error').map((f) => f.code).join(',') };
        tally.declined++;
        continue;
      }
      const ratio = publishableRatio(v.valuePerShareQuoted, e.fundamentals.price);
      if (ratio === null) {
        out[e.key] = { ratio: null, why: 'unpublishable' };
        tally.dropped++;
        continue;
      }
      out[e.key] = { ratio: Number(ratio.toFixed(4)) };
      tally.valued++;
    } catch (err) {
      out[e.key] = { ratio: null, why: String((err as Error).message).slice(0, 80) };
      tally.failed++;
    }
  }
  await writeFile(outPath, JSON.stringify(out));
  console.log(`${entries.length} entries: ${JSON.stringify(tally)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
