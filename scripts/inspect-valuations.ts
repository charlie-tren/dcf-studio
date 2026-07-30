/**
 * Diagnostic: runs a full valuation off each recorded fixture and prints the
 * headline against the market price. A result more than ~10x off the price is a
 * units or currency bug, not a valuation opinion.
 * Run with: npx tsx scripts/inspect-valuations.ts
 */
import { readFileSync } from 'node:fs';
import { buildValuation } from '../lib/valuation';
import type { RawTicker } from '../lib/yahoo';

const TICKERS = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO'];

// Rough spot rates, reporting currency -> quote major currency.
const FX: Record<string, number> = { 'USD->AUD': 1.4364, 'USD->GBP': 0.79 };

function deps(ticker: string) {
  const raw: RawTicker = JSON.parse(
    readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8')
  );
  return {
    fetchTicker: async () => raw,
    fetchFxRate: async (from: string, to: string) => FX[`${from}->${to}`] ?? 1,
    resolveRiskFree: async () => ({
      rate: ticker.endsWith('.AX') ? 0.04989 : 0.0462,
      source: 'diagnostic',
      assumed: false,
    }),
  };
}

async function main() {
  for (const ticker of TICKERS) {
    const v = await buildValuation(ticker, { scenario: 'base', horizonYears: 5 }, deps(ticker));
    const g = v.dcf.gordon;
    const x = v.dcf.exitMultiple;
    const ccy = v.fundamentals.quoteCurrency;

    console.log(`\n${ticker}  ${v.fundamentals.name}`);
    console.log(
      `  value ${ccy} ${v.valuePerShareQuoted.toFixed(2)}   price ${ccy} ${v.fundamentals.price}   upside ${(v.upside * 100).toFixed(1)}%   ratio ${(v.valuePerShareQuoted / v.fundamentals.price).toFixed(2)}x`
    );
    console.log(
      `  WACC ${(v.wacc.wacc * 100).toFixed(2)}%  (rf ${(v.wacc.riskFreeRate * 100).toFixed(2)}%  beta ${v.wacc.beta.toFixed(2)}${v.wacc.betaClamped ? ' CLAMPED' : ''}  Re ${(v.wacc.costOfEquity * 100).toFixed(2)}%  Rd ${(v.wacc.costOfDebt * 100).toFixed(2)}%  E/V ${(v.wacc.equityWeight * 100).toFixed(0)}%)`
    );
    console.log(
      `  growth ${(v.assumptions.revenueGrowth[0] * 100).toFixed(1)}%  margin ${(v.assumptions.ebitMargin[0] * 100).toFixed(1)}%  capex/rev ${(v.assumptions.capexPctRevenue * 100).toFixed(2)}%  tax ${(v.assumptions.taxRate * 100).toFixed(1)}%`
    );
    console.log(
      `  gordon/share ${g.valuePerShare.toFixed(2)} (TV ${(g.terminal.shareOfEv * 100).toFixed(0)}% of EV)   exit/share ${x.valuePerShare.toFixed(2)} (TV ${(x.terminal.shareOfEv * 100).toFixed(0)}%)`
    );
    console.log(`  flags: ${v.flags.map((f) => f.code).join(', ') || 'none'}`);
  }
}

main();
