/**
 * Diagnostic: full normalised history + driver derivation for one live ticker.
 * Run with: npx tsx scripts/diagnose-ticker.ts GOOGL
 */
import { normalise } from '../lib/normalise';
import { historicalDrivers } from '../lib/scenarios';
import { fetchTicker } from '../lib/yahoo';

const ticker = process.argv[2] ?? 'GOOGL';

async function main() {
  const raw = await fetchTicker(ticker);
  const f = normalise(ticker, raw);
  const m = (v: number) => (v / 1e6).toLocaleString('en', { maximumFractionDigits: 0 });

  console.log(`${ticker} ${f.name} [${f.reportingCurrency}/${f.quoteCurrency}] px=${f.price}`);
  console.log('\nper-year normalised:');
  for (const y of f.years) {
    console.log(
      `  ${y.periodEnd}  rev ${m(y.revenue.value)}  ebit ${m(y.ebit.value)} (${y.ebit.provenance.sourceField})` +
        `  D&A ${m(y.dAndA.value)} (${y.dAndA.provenance.sourceField})` +
        `  capex ${m(y.capex.value)}  dNWC ${m(y.changeInNwc.value)} (${y.changeInNwc.provenance.derived ? 'derived' : 'reported'})`
    );
    console.log(
      `              margin ${((100 * y.ebit.value) / y.revenue.value).toFixed(1)}%` +
        `  D&A/rev ${((100 * y.dAndA.value) / y.revenue.value).toFixed(2)}%` +
        `  capex/rev ${((100 * y.capex.value) / y.revenue.value).toFixed(2)}%` +
        `  tax ${((100 * y.taxProvision.value) / y.pretaxIncome.value).toFixed(1)}%`
    );
  }

  const d = historicalDrivers(f);
  console.log('\nderived drivers:');
  console.log(`  revenueCagr        ${(100 * d.revenueCagr).toFixed(2)}%`);
  console.log(`  ebitMargin         ${(100 * d.ebitMargin).toFixed(2)}%`);
  console.log(`  daPctRevenue       ${(100 * d.daPctRevenue).toFixed(2)}%`);
  console.log(`  capexPctRevenue    ${(100 * d.capexPctRevenue).toFixed(2)}%`);
  console.log(`  nwcPctRevChange    ${(100 * d.nwcPctRevenueChange).toFixed(2)}%`);
  console.log(`  taxRate            ${(100 * d.taxRate).toFixed(2)}%`);

  console.log('\nraw fields in newest statement that mention depreciation/amortisation:');
  const s = raw.statements[0] as Record<string, unknown>;
  for (const k of Object.keys(s).sort()) {
    if (/deprec|amort|ebitda/i.test(k) && typeof s[k] === 'number') {
      console.log(`  ${k.padEnd(52)} ${m(s[k] as number)}`);
    }
  }
  console.log('\nworking-capital related raw fields:');
  for (const k of Object.keys(s).sort()) {
    if (/workingCapital|receivab|inventor|payabl/i.test(k) && typeof s[k] === 'number') {
      console.log(`  ${k.padEnd(52)} ${m(s[k] as number)}`);
    }
  }
  console.log('\nreported free cashflow for comparison:');
  for (const k of ['freeCashFlow', 'operatingCashFlow', 'capitalExpenditure']) {
    if (typeof s[k] === 'number') console.log(`  ${k.padEnd(52)} ${m(s[k] as number)}`);
  }
}

main();
