/**
 * Diagnostic: prints the normalised view of every recorded fixture so the
 * numbers can be eyeballed against the filings. Not a test - a reading tool.
 * Run with: npx tsx scripts/inspect-normalised.ts
 */
import { readFileSync } from 'node:fs';
import { normalise } from '../lib/normalise';

const TICKERS = ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO'];
const m = (v: number) => (v / 1e6).toLocaleString('en', { maximumFractionDigits: 0 });

for (const t of TICKERS) {
  const raw = JSON.parse(readFileSync(`tests/fixtures/${t.replace('.', '_')}.json`, 'utf8'));
  const f = normalise(t, raw);
  const y = f.years[0];
  console.log(`\n${t}  ${f.name}  [report ${f.reportingCurrency} / quote ${f.quoteCurrency}]  px=${f.price}`);
  console.log(
    `  ${y.periodEnd}  rev ${m(y.revenue.value)}  ebit ${m(y.ebit.value)} (${y.ebit.provenance.derived ? 'DERIVED' : y.ebit.provenance.sourceField})  margin ${((100 * y.ebit.value) / y.revenue.value).toFixed(1)}%`
  );
  console.log(
    `  D&A ${m(y.dAndA.value)} (${y.dAndA.provenance.sourceField})  capex ${m(y.capex.value)}  dNWC ${m(y.changeInNwc.value)} (${y.changeInNwc.provenance.derived ? 'derived' : 'reported'})`
  );
  console.log(
    `  debt ${m(y.totalDebt.value)}  cash ${m(y.cash.value)}  net debt ${m(y.totalDebt.value - y.cash.value)}  shares ${m(y.shares.value)} (${y.shares.provenance.sourceField})`
  );
  console.log(
    `  tax ${((100 * y.taxProvision.value) / y.pretaxIncome.value).toFixed(1)}%  capex/rev ${((100 * y.capex.value) / y.revenue.value).toFixed(2)}%  D&A/rev ${((100 * y.dAndA.value) / y.revenue.value).toFixed(2)}%`
  );
  console.log(`  mcap/shares = ${(f.marketCap / y.shares.value).toFixed(2)}  vs quoted price ${f.price}`);
  console.log(`  flags: ${f.flags.map((x) => x.code).join(', ') || 'none'}`);
}
