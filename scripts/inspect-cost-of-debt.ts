/**
 * What the synthetic-rating floor on the cost of debt does across Crosscheck's
 * universe: how many companies it moves, by how much, and what that does to the
 * published ratio and its ordering.
 *
 * Written 06/10/2026 when the floor changed from the risk-free rate to the
 * risk-free plus the spread a coverage-implied rating carries. Each company is
 * valued once as built, then again with the WACC overridden to what the old floor
 * gave, so both runs share one Yahoo pull and the same override path.
 *
 *   npx tsx scripts/inspect-cost-of-debt.ts
 */
import { buildValuation, type ValuationDeps } from '../lib/valuation';
import { buildWacc } from '../lib/wacc';
import { declinedByModel, publishableRatio } from '../lib/batch';
import { fetchTicker, fetchFxRate } from '../lib/yahoo';
import { resolveRiskFree } from '../lib/riskfree';

const UNIVERSE = 'https://charlietrenorden.com/crosscheck/tickers.json';

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

type Row = { t: string; oldCod: number; newCod: number; oldR: number | null; newR: number | null; moved: boolean };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  idx.forEach(([, i], k) => (r[i] = k));
  return r;
}

async function main() {
  const manifest = await fetch(UNIVERSE).then((r) => r.json());
  const tickers: string[] = manifest.tickers;
  const rows = await pool(tickers, 4, async (t): Promise<Row | null> => {
    try {
      const raw = await fetchTicker(t);
      const rf = await resolveRiskFree(t);
      const deps: ValuationDeps = {
        fetchTicker: async () => raw,
        fetchFxRate: (a, b) => fetchFxRate(a, b),
        resolveRiskFree: async () => rf,
      };
      const v = await buildValuation(t, { scenario: 'base', horizonYears: 5 }, deps);
      if (declinedByModel(v.flags)) return null;
      const y = v.fundamentals.years;
      const old = buildWacc({
        riskFree: rf,
        equityRiskPremium: v.wacc.equityRiskPremium,
        rawBeta: v.fundamentals.rawBeta,
        marketCap: v.fundamentals.marketCap,
        totalDebt: y[0].totalDebt.value,
        interestExpense: y[0].interestExpense?.value ?? null,
        priorTotalDebt: (y[1] ?? y[0]).totalDebt.value,
        taxRate: v.wacc.taxRate,
        ebit: null,
      });
      const moved = Math.abs(old.costOfDebt - v.wacc.costOfDebt) > 1e-9;
      let oldR = publishableRatio(v.valuePerShareQuoted, v.fundamentals.price);
      if (moved) {
        const o = await buildValuation(t, { scenario: 'base', horizonYears: 5, overrides: { wacc: old.wacc } }, deps);
        oldR = publishableRatio(o.valuePerShareQuoted, o.fundamentals.price);
      }
      const newR = publishableRatio(v.valuePerShareQuoted, v.fundamentals.price);
      return { t, oldCod: old.costOfDebt, newCod: v.wacc.costOfDebt, oldR, newR, moved };
    } catch {
      return null;
    }
  });
  const ok = rows.filter((r): r is Row => r !== null);
  const moved = ok.filter((r) => r.moved);
  const both = ok.filter((r) => r.oldR !== null && r.newR !== null);
  console.log(`valued ${ok.length} of ${tickers.length}; cost of debt moved for ${moved.length}`);
  const dCod = moved.map((r) => (r.newCod - r.oldCod) * 1e4);
  console.log(`cost of debt change, bp: median ${median(dCod).toFixed(0)}, max ${Math.max(...dCod).toFixed(0)}`);
  const dR = moved.filter((r) => r.oldR !== null && r.newR !== null).map((r) => r.newR! / r.oldR! - 1);
  console.log(`ratio change where moved: median ${(median(dR) * 100).toFixed(1)}%, worst ${(Math.min(...dR) * 100).toFixed(1)}%`);
  const a = ranks(both.map((r) => r.oldR!));
  const b = ranks(both.map((r) => r.newR!));
  const n = both.length;
  const d2 = a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  console.log(`rank correlation old vs new over ${n}: ${(1 - (6 * d2) / (n * (n * n - 1))).toFixed(4)}`);
  const pubOld = ok.filter((r) => r.oldR !== null).length;
  const pubNew = ok.filter((r) => r.newR !== null).length;
  console.log(`publishable: ${pubOld} -> ${pubNew}`);
  console.log('largest ratio moves:');
  moved
    .filter((r) => r.oldR !== null && r.newR !== null)
    .sort((x, y) => x.newR! / x.oldR! - y.newR! / y.oldR!)
    .slice(0, 8)
    .forEach((r) =>
      console.log(
        `  ${r.t.padEnd(10)} ${(r.oldCod * 100).toFixed(2)}% -> ${(r.newCod * 100).toFixed(2)}%  ratio ${r.oldR!.toFixed(3)} -> ${r.newR!.toFixed(3)}`
      )
    );
  console.log('largest cost-of-debt moves:');
  moved
    .sort((x, y) => y.newCod - y.oldCod - (x.newCod - x.oldCod))
    .slice(0, 12)
    .forEach((r) =>
      console.log(
        `  ${r.t.padEnd(10)} ${(r.oldCod * 100).toFixed(2)}% -> ${(r.newCod * 100).toFixed(2)}%  ratio ${r.oldR?.toFixed(3) ?? 'n/a'} -> ${r.newR?.toFixed(3) ?? 'n/a'}`
      )
    );
}

main();
