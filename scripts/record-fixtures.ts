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
//
// AMD joined on 09/09/2026 as the acquisition-amortisation case. Three quarters
// of its D&A is Xilinx intangible amortisation (2,254 of 3,004), and the capex
// floor was substituting the whole charge for capex - 5,298m/yr against 974m
// actually spent. It is the only recorded ticker where depreciation and D&A
// differ by an order of magnitude, so it is the only one that can catch a
// regression here.
//
// NPN.JO and TEVA.TA joined on 10/10/2026: the other two sub-unit quotes (ZAc,
// ILA), so the conversion is exercised end to end as SHEL.L does for pence.
const TICKERS = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO', 'AMD', 'NPN.JO', 'TEVA.TA'];

// Name tickers on the command line to record just those, leaving the rest alone.
async function main() {
  mkdirSync('tests/fixtures', { recursive: true });
  const only = process.argv.slice(2);
  for (const ticker of only.length > 0 ? only : TICKERS) {
    const raw = await fetchTicker(ticker);
    const file = `tests/fixtures/${ticker.replace('.', '_')}.json`;
    writeFileSync(file, JSON.stringify(raw, null, 2));
    console.log(`${file}: ${raw.statements.length} annual periods`);
  }
}

main();
