import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildValuation, type Valuation } from '@/lib/valuation';
import { buildWorkbook } from '@/lib/workbook';
import type { RawTicker } from '@/lib/yahoo';

/** Reads xl/workbook.xml out of the .xlsx zip, to assert on what actually ships. */
async function readWorkbookXml(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  // ExcelJS does not expose the raw part, so re-read the zip directly.
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('xl/workbook.xml')!.async('string');
}

async function valuationFor(
  ticker: string,
  fxRate = 1,
  overrides: Parameters<typeof buildValuation>[1]['overrides'] = undefined
): Promise<Valuation> {
  const raw: RawTicker = JSON.parse(
    readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8')
  );
  return buildValuation(
    ticker,
    { scenario: 'base', horizonYears: 5, overrides },
    {
      fetchTicker: async () => raw,
      fetchFxRate: async () => fxRate,
      resolveRiskFree: async () => ({ rate: 0.0462, source: 'test', assumed: false }),
    }
  );
}

async function open(v: Valuation): Promise<ExcelJS.Workbook> {
  const buffer = await buildWorkbook(v);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return wb;
}

const num = (wb: ExcelJS.Workbook, sheet: string, ref: string): number =>
  wb.getWorksheet(sheet)!.getCell(ref).value as number;

const formula = (wb: ExcelJS.Workbook, sheet: string, ref: string): string => {
  const value = wb.getWorksheet(sheet)!.getCell(ref).value;
  return typeof value === 'object' && value !== null && 'formula' in value
    ? (value as { formula: string }).formula
    : '';
};

describe('workbook structure', () => {
  it('has the sheets a reader needs to follow the model', async () => {
    const wb = await open(await valuationFor('MSFT'));
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Assumptions',
      'Forecast',
      'Valuation',
      'Sensitivity',
      'Source data',
    ]);
  });

  it('is deterministic - the same model exports byte-identically', async () => {
    // A timestamp in the file would make every export differ, which defeats
    // diffing two versions of a model.
    const v = await valuationFor('MSFT');
    const a = Buffer.from((await buildWorkbook(v)) as ArrayBuffer);
    const b = Buffer.from((await buildWorkbook(v)) as ArrayBuffer);
    expect(a.equals(b)).toBe(true);
  });
});

describe('workbook renders without a recalculation', () => {
  /**
   * The bug this guards: ExcelJS writes a formula cell as <f> with no <v>, so a
   * reader whose Excel has automatic calculation off - and Google Sheets,
   * Numbers, and every file previewer - sees a BLANK sheet. The Forecast and
   * Valuation tabs shipped empty for exactly that reason.
   *
   * It survived the first round of testing because the COM check called
   * CalculateFullRebuild(), which is the one thing a real reader never does.
   * These assertions read the cached result only.
   */
  it('caches a computed result on every formula cell', async () => {
    const v = await valuationFor('MSFT');
    const wb = await open(v);
    const missing: string[] = [];

    for (const sheet of wb.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          const value = cell.value;
          if (value !== null && typeof value === 'object' && 'formula' in value) {
            const result = (value as { result?: unknown }).result;
            if (result === undefined || result === null) {
              missing.push(`${sheet.name}!${cell.address}`);
            }
          }
        });
      });
    }
    expect(missing, `formula cells with no cached value: ${missing.join(', ')}`).toEqual([]);
  });

  it('shows the site numbers straight from the cache, with no recalculation', async () => {
    const v = await valuationFor('MSFT');
    const wb = await open(v);
    const cached = (sheet: string, ref: string) =>
      (wb.getWorksheet(sheet)!.getCell(ref).value as { result: number }).result;

    expect(cached('Assumptions', 'B26'), 'WACC').toBeCloseTo(v.wacc.wacc, 8);
    expect(cached('Forecast', 'B6'), 'year 1 revenue').toBeCloseTo(v.dcf.forecast[0].revenue, 2);
    expect(cached('Forecast', 'B17'), 'PV explicit').toBeCloseTo(v.dcf.pvExplicit, 2);
    expect(cached('Valuation', 'B14'), 'perpetuity per share').toBeCloseTo(
      v.dcf.gordon.valuePerShare,
      6
    );
    expect(cached('Valuation', 'B23'), 'exit per share').toBeCloseTo(
      v.dcf.exitMultiple.valuePerShare,
      6
    );
  });

  it('asks Excel to recalculate on open so an edit is never stale', async () => {
    // Assert on the FILE, not on ExcelJS's in-memory round-trip: calcProperties
    // is written to xl/workbook.xml but is not read back into the object model,
    // so checking the loaded workbook tests the library rather than the output.
    const v = await valuationFor('MSFT');
    const buffer = Buffer.from((await buildWorkbook(v)) as ArrayBuffer);
    const xml = await readWorkbookXml(buffer);
    expect(xml).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"/);
  });
});

describe('workbook is live, not pasted', () => {
  it('writes drivers as typed inputs and everything derived as a formula', async () => {
    const v = await valuationFor('MSFT');
    const wb = await open(v);

    // Inputs: real numbers.
    expect(typeof num(wb, 'Assumptions', 'B6')).toBe('number');
    expect(typeof num(wb, 'Assumptions', 'B8')).toBe('number');

    // Derived: formulas, not values.
    expect(formula(wb, 'Assumptions', 'B20')).toContain('B17'); // cost of equity
    expect(formula(wb, 'Assumptions', 'B26')).toContain('B24'); // WACC
    expect(formula(wb, 'Forecast', 'B6')).toContain('Assumptions!B29'); // revenue off base
    expect(formula(wb, 'Forecast', 'B13')).toContain('B9'); // FCFF off NOPAT
    expect(formula(wb, 'Valuation', 'B14')).toContain('Assumptions!B31'); // per share
  });

  it('chains the forecast year on year rather than repeating a constant', async () => {
    const v = await valuationFor('MSFT');
    const wb = await open(v);
    // Year 2 revenue must reference year 1, or the model is five independent
    // numbers rather than a compounding forecast.
    expect(formula(wb, 'Forecast', 'C6')).toContain('B6');
    expect(formula(wb, 'Forecast', 'D6')).toContain('C6');
  });

  it('routes the mid-year toggle through the formula', async () => {
    const v = await valuationFor('MSFT');
    const wb = await open(v);
    // Flipping the flag on Assumptions must reprice, so the discount factor has
    // to reference it rather than bake the convention in.
    expect(formula(wb, 'Forecast', 'B14')).toContain('Assumptions!$B$32');
    expect(formula(wb, 'Valuation', 'B10')).toContain('Assumptions!B32');
  });
});

describe('workbook reconciles to the site', () => {
  /**
   * Recomputes the terminal and discount chain in TypeScript from the sheet's
   * INPUT cells, and checks it lands on the value the site displays.
   *
   * Read what that does and does not cover, because the old comment here
   * claimed it was "the test that makes the export trustworthy" and it is not.
   * It re-types the chain by hand; it never reads a derived formula out of the
   * workbook. So it catches an engine that drifts from the chain we intend, and
   * it is blind to the sheet actually shipping a different formula - which is
   * the failure that has now happened twice, on the FX conversion cell and on
   * the terminal reinvestment floor. Both were verified: with both sheet
   * formulas reverted to their broken form, every case below still passes.
   *
   * The tests that do cover the file are the ones that assert on
   * `formula(...)`, plus the cached-result sweep above. When you add arithmetic
   * to a sheet, add an assertion there, not only here. Mirror any floor or
   * guard in this harness too, or it silently documents the wrong chain: the
   * two Math.max calls below were missing, which is how the loss-maker case
   * came to look reconciled.
   */
  async function recomputeFromInputs(
    ticker: string,
    fxRate = 1,
    overrides: Parameters<typeof buildValuation>[1]['overrides'] = undefined
  ) {
    const v = await valuationFor(ticker, fxRate, overrides);
    const wb = await open(v);
    const A = (ref: string) => num(wb, 'Assumptions', ref);

    const tax = A('B8');
    const daPct = A('B9');
    const capexPct = A('B10');
    const nwcPct = A('B11');
    const terminalGrowth = A('B12');
    const roic = A('B14');
    const rf = A('B17');
    const erp = A('B18');
    const beta = A('B19');
    const cod = A('B21');
    const mcap = A('B22');
    const debt = A('B23');
    const baseRevenue = A('B29');
    const netDebt = A('B30');
    const shares = A('B31');
    const midYear = A('B32');

    // The WACC chain exactly as the sheet computes it.
    const coe = rf + beta * erp;
    const equityWeight = mcap / (mcap + debt);
    const wacc = equityWeight * coe + (1 - equityWeight) * cod * (1 - tax);

    // The forecast chain, reading per-year growth and margin from the sheet.
    const n = v.assumptions.horizonYears;
    let prevRevenue = baseRevenue;
    let pvExplicit = 0;
    let finalFcff = 0;
    let finalNopat = 0;
    let finalCapex = 0;
    let finalDa = 0;
    let finalEbit = 0;

    for (let i = 0; i < n; i++) {
      const c = String.fromCharCode('B'.charCodeAt(0) + i);
      const cell = wb.getWorksheet('Forecast')!.getCell(`${c}5`).value;
      const growth =
        typeof cell === 'number' ? cell : v.assumptions.revenueGrowth[i];
      const marginCell = wb.getWorksheet('Forecast')!.getCell(`${c}7`).value;
      const margin =
        typeof marginCell === 'number' ? marginCell : v.assumptions.ebitMargin[i];

      const revenue = prevRevenue * (1 + growth);
      const ebit = revenue * margin;
      const nopat = ebit * (1 - tax);
      const da = revenue * daPct;
      const capex = revenue * capexPct;
      const nwc = (revenue - prevRevenue) * nwcPct;
      const fcff = nopat + da - capex - nwc;
      const df = 1 / (1 + wacc) ** (i + 1 - 0.5 * midYear);

      pvExplicit += fcff * df;
      prevRevenue = revenue;
      finalFcff = fcff;
      finalNopat = nopat;
      finalCapex = capex;
      finalDa = da;
      finalEbit = ebit;
    }

    // The terminal chain as the Valuation sheet computes it. Both floors are
    // mirrored deliberately: this harness omitted them, which is precisely why
    // a loss-maker's reinvestment credit and a blocked perpetuity both got past
    // a suite that claimed to reconcile the sheet to the engine.
    const maintenance = finalFcff + finalCapex - finalDa;
    const reinvestRate = Math.min(terminalGrowth / Math.max(roic, wacc), 0.9);
    const capitalised = Math.max(maintenance - Math.max(finalNopat, 0) * reinvestRate, 0);
    const tv =
      terminalGrowth >= wacc
        ? 0
        : (capitalised * (1 + terminalGrowth)) / (wacc - terminalGrowth);
    const tvPv = tv / (1 + wacc) ** (n - 0.5 * midYear);
    const ev = pvExplicit + tvPv;
    const perShare = (ev - netDebt) / shares;

    // Exit multiple chain.
    const exitTv = (finalEbit + finalDa) * A('B13');
    const exitPerShare =
      (pvExplicit + exitTv / (1 + wacc) ** (n - 0.5 * midYear) - netDebt) / shares;

    return { v, wacc, pvExplicit, perShare, exitPerShare };
  }

  // MSB.AX is the loss-maker and it was missing from this list, which is the
  // reason the unfloored reinvestment charge survived. Add the case that breaks
  // differently, not another name that breaks the same way.
  it.each(['MSFT', 'BHP.AX', 'ARB.AX', 'SGP.AX', 'SHEL.L', 'MSB.AX'])(
    '%s - the sheet formulas reproduce the site valuation',
    async (ticker) => {
      const { v, wacc, pvExplicit, perShare, exitPerShare } = await recomputeFromInputs(ticker);

      expect(wacc, 'WACC').toBeCloseTo(v.wacc.wacc, 8);
      expect(pvExplicit, 'PV of explicit forecast').toBeCloseTo(v.dcf.pvExplicit, 2);
      expect(perShare, 'perpetuity value per share').toBeCloseTo(
        v.dcf.gordon.valuePerShare,
        4
      );
      expect(exitPerShare, 'exit multiple value per share').toBeCloseTo(
        v.dcf.exitMultiple.valuePerShare,
        4
      );
    }
  );

  it('reproduces the site valuation when the perpetuity is blocked', async () => {
    // No fixture has a WACC below its terminal growth, so force it. The whole
    // perpetuity column collapses to the explicit forecast less net debt, and
    // the sheet has to land on the same figure the engine does - the site is
    // not publishing it as a valuation any more, but the workbook still shows
    // the bridge, and a bridge that disagrees with the engine is worse than one
    // that refuses.
    const { v, perShare, exitPerShare } = await recomputeFromInputs('MSFT', 1, {
      terminalGrowth: 0.5,
    });
    expect(v.dcf.gordon.terminal.blocked, 'the case must actually be blocked').toBeTruthy();
    expect(v.dcf.gordon.terminal.presentValue, 'terminal value must be nil').toBe(0);
    expect(perShare, 'perpetuity value per share').toBeCloseTo(v.dcf.gordon.valuePerShare, 4);
    expect(exitPerShare, 'exit multiple value per share').toBeCloseTo(
      v.dcf.exitMultiple.valuePerShare,
      4
    );
  });

  it('converts to quote currency on the sheet for a cross-currency reporter', async () => {
    // BHP reports USD and trades AUD. The sheet must apply the FX itself.
    const v = await valuationFor('BHP.AX', 1.45);
    const wb = await open(v);
    expect(num(wb, 'Valuation', 'B27')).toBeCloseTo(1.45, 8);
    expect(formula(wb, 'Valuation', 'B28')).toContain('B27');
    expect(formula(wb, 'Valuation', 'B29')).toContain('B26');
  });

  /**
   * The bug this guards: the conversion cell held the bare FX rate, so a market
   * quoting in a sub-unit lost the x100. Shell reports USD and quotes pence, and
   * the workbook valued it at 38.16 against a price of 3,345.75p - a 99%
   * downside on a name the page had at +14%. fullCalcOnLoad meant Excel
   * recalculated the correct cached figure away on open, so the file looked
   * right until you opened it.
   *
   * Recomputes the last two rows from the sheet's own inputs, which is the only
   * check that would have caught it: every other assertion stops at the
   * reporting-currency value per share.
   */
  it.each(['MSFT', 'BHP.AX', 'SHEL.L'])(
    '%s - the sheet reaches the quoted value per share and upside',
    async (ticker) => {
      const v = await valuationFor(ticker, 1.45);
      const wb = await open(v);
      const perShareReporting = (
        wb.getWorksheet('Valuation')!.getCell('B14').value as { result: number }
      ).result;
      const conversion = num(wb, 'Valuation', 'B27');
      const price = num(wb, 'Valuation', 'B26');

      expect(perShareReporting * conversion, 'value per share in quoted units').toBeCloseTo(
        v.valuePerShareQuoted,
        6
      );
      expect((perShareReporting * conversion) / price - 1, 'implied upside').toBeCloseTo(
        v.upside,
        8
      );
    }
  );

  it('spells out a sub-unit conversion rather than showing a bare FX rate', async () => {
    const v = await valuationFor('SHEL.L', 0.75);
    const wb = await open(v);
    // 0.75 USD/GBP, then x100 into pence.
    expect(num(wb, 'Valuation', 'B27')).toBeCloseTo(75, 8);
    expect(wb.getWorksheet('Valuation')!.getCell('A27').value).toBe('Conversion, USD to GBp');
    expect(String(wb.getWorksheet('Valuation')!.getCell('C27').value)).toMatch(/sub-unit/);
  });

  it('floors the terminal reinvestment formula, not just its cached result', async () => {
    // The cached result comes from the engine and was already floored, so a
    // cache-only assertion passes while Excel recalculates the floor away on
    // open. Read the FORMULA. Same miss as the FX conversion cell.
    const v = await valuationFor('MSB.AX');
    const wb = await open(v);
    expect(formula(wb, 'Valuation', 'B7')).toMatch(/^-MAX\(Forecast!F9,0\)\*B6$/);
  });

  it('bridges enterprise to equity value on both terminal methods', async () => {
    // The exit-multiple block used to jump straight from EV to equity, hiding
    // the one step where the two methods could differ.
    const v = await valuationFor('MSFT');
    const wb = await open(v);
    expect(wb.getWorksheet('Valuation')!.getCell('A21').value).toBe('Less net debt');
    expect(formula(wb, 'Valuation', 'B22')).toBe('B20+B21');
  });
});

describe('workbook refuses rather than publishes a blocked perpetuity', () => {
  /**
   * Toyota's WACC of 2.38% sits below its 2.50% terminal growth, so the
   * perpetuity cannot converge. The engine floors terminal value to nil and
   * raises a flag, but the Valuation sheet then showed "(3,027.73) per share"
   * with nothing on it saying the model had declined to answer.
   */
  const blockedNote = /Blocked: terminal growth is at or above the WACC/;

  it('warns on the Valuation sheet when terminal growth is above the WACC', async () => {
    const v = await valuationFor('MSFT', 1, { terminalGrowth: 0.5 });
    expect(v.dcf.gordon.terminal.blocked, 'fixture must actually be blocked').toBeTruthy();
    const wb = await open(v);
    const cell = wb.getWorksheet('Valuation')!.getCell('C3').value as {
      formula: string;
      result: string;
    };
    expect(cell.result).toMatch(blockedNote);
    // A formula, not a typed sentence: fixing the WACC in Excel must clear it.
    expect(cell.formula).toMatch(/^IF\(Assumptions!B12>=Assumptions!B26,/);
  });

  it('says nothing on a model whose perpetuity converges', async () => {
    const v = await valuationFor('MSFT');
    expect(v.dcf.gordon.terminal.blocked).toBeFalsy();
    const wb = await open(v);
    expect(wb.getWorksheet('Valuation')!.getCell('C3').value ?? '').not.toMatch(blockedNote);
  });
});

describe('workbook carries provenance and caveats', () => {
  it('records the reported history and where each line came from', async () => {
    const v = await valuationFor('ARB.AX');
    const wb = await open(v);
    const src = wb.getWorksheet('Source data')!;
    expect(src.getCell('A5').value).toBe('Revenue');
    expect(src.getCell('B5').value).toBeCloseTo(v.fundamentals.years[0].revenue.value, 2);
    // ARB's working capital is derived, and the sheet must say so.
    const notes = JSON.stringify(src.getSheetValues());
    expect(notes).toMatch(/derived/);
  });

  it('carries the model flags into the workbook', async () => {
    // A reader who opens the file without seeing the page still needs the
    // "this is a financial" warning.
    const v = await valuationFor('CBA.AX');
    const wb = await open(v);
    const dump = JSON.stringify(wb.getWorksheet('Source data')!.getSheetValues());
    expect(dump).toMatch(/financial/i);
  });
});
