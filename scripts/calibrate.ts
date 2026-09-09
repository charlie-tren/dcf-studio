/**
 * Population calibration: runs the model over a broad, deliberately mixed sample
 * and reports the DISTRIBUTION of implied value against market price.
 *
 * This exists because on 09/09/2026 two consecutive fixes were judged on whether
 * they moved AMD. Both were correct in themselves and neither told you anything
 * about the model, because a change tested on the name that motivated it is
 * fitted to that name by construction. Charlie's instruction: "make sure they're
 * not only making the amd one better."
 *
 * What good looks like. NOT "every ratio near 1.0" - if the model agreed with
 * the market everywhere it would be an expensive way to read a share price. What
 * it should not have is BIAS: a median far from 1.0 means the machinery is
 * systematically wrong rather than the market being systematically wrong, and a
 * page that calls every company overvalued is making no call at all.
 *
 * So the three numbers that matter, in order:
 *   1. median ratio          - bias. Should sit near 1.0.
 *   2. share within 0.5-2.0x - how often the model produces a usable opinion.
 *   3. implausible count     - how often it produces nothing at all.
 * Dispersion is NOT a defect. It is the entire product.
 *
 * Run with: npx tsx scripts/calibrate.ts [--json out.json]
 */
import { writeFileSync } from 'node:fs';
import { buildValuation } from '../lib/valuation';

/**
 * Chosen to SPAN the axes the model can fail on, not to be a fair index sample:
 * heavy acquirers whose D&A is mostly amortisation, capital-intensive builders
 * mid-cycle, asset-light compounders, financials with no operating income,
 * miners, a REIT, and four non-US markets so currency and statutory tax are
 * exercised. If a change helps only one band, this list will say so.
 */
const SAMPLE = [
  // acquisitive, D&A far above capex
  'AVGO', 'IBM', 'AMD', 'ORCL', 'CRM', 'ABBV', 'TMO', 'DHR',
  // capital-intensive, capex far above D&A
  'MSFT', 'GOOGL', 'META', 'AMZN', 'TSLA', 'INTC', 'TXN', 'NEE',
  // asset-light compounders
  'AAPL', 'V', 'MA', 'ADBE', 'NVDA', 'COST', 'NKE', 'SBUX',
  // slow, stable, dividend-paying
  'KO', 'PEP', 'JNJ', 'PG', 'MCD', 'VZ', 'CVX', 'XOM',
  // financials and property
  'JPM', 'BAC', 'CBA.AX', 'RY.TO', 'SGP.AX', 'O',
  // resources and non-US
  'BHP.AX', 'RIO.AX', 'SHEL.L', 'AZN.L', 'ARB.AX', 'WES.AX',
];

type Row = { ticker: string; ratio: number | null; note: string };

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export async function calibrate(sample: string[] = SAMPLE): Promise<{
  rows: Row[];
  median: number;
  p25: number;
  p75: number;
  usable: number;
  implausible: number;
  failed: number;
}> {
  const rows: Row[] = [];
  for (const ticker of sample) {
    try {
      const v = await buildValuation(ticker, { scenario: 'base', horizonYears: (Number(process.env.HZ ?? 5) as 5 | 10) });
      const ratio = v.fundamentals.price > 0 ? v.valuePerShareQuoted / v.fundamentals.price : null;
      rows.push({
        ticker,
        ratio,
        note: v.flags.some((f) => f.code === 'IMPLAUSIBLE_RESULT') ? 'implausible' : '',
      });
    } catch (e) {
      rows.push({ ticker, ratio: null, note: `failed: ${(e as Error).message.slice(0, 50)}` });
    }
  }
  // A negative value per share is a real answer (the model says the equity is
  // worthless) but it has no place in a ratio distribution, so it is counted
  // rather than averaged.
  const ratios = rows.map((r) => r.ratio).filter((r): r is number => r !== null && r > 0).sort((a, b) => a - b);
  return {
    rows,
    median: quantile(ratios, 0.5),
    p25: quantile(ratios, 0.25),
    p75: quantile(ratios, 0.75),
    usable: rows.filter((r) => r.ratio !== null && r.ratio >= 0.5 && r.ratio <= 2).length,
    implausible: rows.filter((r) => r.note === 'implausible').length,
    failed: rows.filter((r) => r.ratio === null).length,
  };
}

async function main() {
  const out = await calibrate();
  for (const r of out.rows) {
    console.log(
      `${r.ticker.padEnd(8)} ${r.ratio === null ? '   -  ' : r.ratio.toFixed(2).padStart(6)}x  ${r.note}`
    );
  }
  console.log(
    `\nn=${out.rows.length}  median ${out.median.toFixed(2)}x  ` +
      `p25 ${out.p25.toFixed(2)}x  p75 ${out.p75.toFixed(2)}x  ` +
      `usable(0.5-2.0x) ${out.usable}/${out.rows.length}  ` +
      `implausible ${out.implausible}  failed ${out.failed}`
  );
  const json = process.argv.indexOf('--json');
  if (json > -1 && process.argv[json + 1]) {
    writeFileSync(process.argv[json + 1], JSON.stringify(out, null, 2));
  }
}

if (process.argv[1]?.includes('calibrate')) main().catch((e) => { console.error(e); process.exit(1); });
