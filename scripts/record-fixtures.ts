/**
 * Records live Yahoo responses so tests never hit the network.
 * Run with: npx tsx scripts/record-fixtures.ts
 * Re-run only deliberately - the recorded gaps are the regression tests.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fetchTicker } from '../lib/yahoo';

// Chosen because each one broke something during the data probe:
// CBA and RY have no operating income; SHEL quotes GBp while reporting USD;
// ARB and SGP have no change-in-working-capital; MSB is loss-making.
const TICKERS = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO'];

async function main() {
  mkdirSync('tests/fixtures', { recursive: true });
  for (const ticker of TICKERS) {
    const raw = await fetchTicker(ticker);
    const file = `tests/fixtures/${ticker.replace('.', '_')}.json`;
    writeFileSync(file, JSON.stringify(raw, null, 2));
    console.log(`${file}: ${raw.statements.length} annual periods`);
  }
}

main();
