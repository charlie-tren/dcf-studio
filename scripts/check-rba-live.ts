/**
 * Diagnostic: fetches the live RBA F2 CSV and checks the parser picks the
 * 10-year column, not the 2-year sitting two columns to its left.
 * Run with: npx tsx scripts/check-rba-live.ts
 */
import { fetchRbaTenYear, parseRbaF2, RBA_TEN_YEAR_SERIES_ID } from '../lib/riskfree';

const URL = 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv';

async function main() {
  const res = await fetch(URL);
  console.log(`GET f2-data.csv -> HTTP ${res.status}`);
  const csv = await res.text();

  const seriesRow = csv.split(/\r?\n/).find((l) => l.includes(RBA_TEN_YEAR_SERIES_ID));
  console.log(`series row: ${seriesRow}`);
  console.log(`10y series ${RBA_TEN_YEAR_SERIES_ID} is column index ${seriesRow?.split(',').indexOf(RBA_TEN_YEAR_SERIES_ID)}`);

  const lastData = csv
    .split(/\r?\n/)
    .filter((l) => /^\d{1,2}-[A-Za-z]{3}-\d{4},/.test(l))
    .pop();
  console.log(`last data row: ${lastData}`);

  const parsed = parseRbaF2(csv);
  console.log(`parseRbaF2 -> ${parsed} (${parsed !== null ? (parsed * 100).toFixed(3) + '%' : 'null'})`);

  const viaFetch = await fetchRbaTenYear();
  console.log(`fetchRbaTenYear -> ${viaFetch}`);

  const cells = lastData?.split(',') ?? [];
  const tenYear = Number(cells[4]);
  const twoYear = Number(cells[1]);
  console.log(`\n10y on that row: ${tenYear}%   2y: ${twoYear}%`);
  if (parsed !== null && Math.abs(parsed * 100 - tenYear) < 1e-9) {
    console.log('OK - parser returns the 10-year');
  } else if (parsed !== null && Math.abs(parsed * 100 - twoYear) < 1e-9) {
    console.log('BUG - parser returned the 2-YEAR yield');
  } else {
    console.log('UNEXPECTED - parser matched neither column');
  }
}

main();
