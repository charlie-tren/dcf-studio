/**
 * The step from the last forecast year's cashflow to the cashflow the perpetuity
 * capitalises, across the recorded fixtures.
 *
 * Written for the 05/10/2026 review, which found GOOGL's terminal cashflow 74%
 * above its own final forecast year: buildout capex was charged for five years and
 * then the terminal assumed a steady state all at once. A ratio near 1 means the
 * forecast glides into the terminal; far from 1 means the model is making two
 * different assumptions about the same company a year apart.
 *
 *   npx tsx scripts/inspect-terminal-step.ts
 */
import { readFileSync } from 'node:fs';
import { buildValuation } from '../lib/valuation';
import type { RawTicker } from '../lib/yahoo';

const TICKERS = ['MSFT', 'BHP.AX', 'ARB.AX', 'SGP.AX', 'SHEL.L', 'CBA.AX', 'RY.TO', 'MSB.AX'];

async function main() {
  console.log('ticker    final FCFF   capitalised   ratio   value/share');
  for (const t of TICKERS) {
    const raw: RawTicker = JSON.parse(
      readFileSync(`tests/fixtures/${t.replace('.', '_')}.json`, 'utf8')
    );
    const v = await buildValuation(t, { scenario: 'base', horizonYears: 5 }, {
      fetchTicker: async () => raw,
      fetchFxRate: async () => 1,
      resolveRiskFree: async () => ({ rate: 0.0462, source: 'fixture', assumed: false }),
    });
    const fin = v.dcf.forecast[v.dcf.forecast.length - 1].fcff;
    const cap = v.dcf.gordon.terminal.steadyState?.capitalisedFcff ?? fin;
    const ratio = fin > 0 ? cap / fin : NaN;
    console.log(
      `${t.padEnd(9)} ${(fin / 1e9).toFixed(2).padStart(10)}bn ${(cap / 1e9).toFixed(2).padStart(10)}bn ` +
        `${Number.isFinite(ratio) ? ratio.toFixed(2).padStart(6) : '   n/a'}  ${v.dcf.gordon.valuePerShare.toFixed(2).padStart(10)}`
    );
  }
}

main();
