import ExcelJS from 'exceljs';
import { majorCurrency, quoteConversionFactor } from './fx';
import { FLAG_LABEL, FLAG_ORDER } from './types';
import type { Valuation } from './valuation';

/**
 * Exports the model as a LIVE workbook, not a snapshot of numbers.
 *
 * The rule, and the whole point of the export: only genuine inputs are typed
 * values - the drivers, the WACC components, the base-year figures. Everything
 * derived is an Excel formula pointing at those cells. Change the growth rate in
 * the sheet and revenue, EBIT, FCFF, the terminal value and the value per share
 * all reprice, because the calculation chain is really there rather than pasted.
 *
 * A pasted-numbers export would be quicker to write and worth much less: you
 * could read it but not interrogate it, and there would be no way to check the
 * site's arithmetic independently. Here the workbook IS the check.
 */

/** Two commas scale by a million, so every MONEY cell reads in millions. Every
 *  heading that sits above one has to say so, or 3,651,215.0 reads as dollars. */
const MONEY = '#,##0.0,,;[Red](#,##0.0,,)';
const RATE = '0.00%';
const PER_SHARE = '#,##0.00;[Red](#,##0.00)';
const MULTIPLE = '0.0"x"';
const GREY = 'FF666666';

type Sheet = ExcelJS.Worksheet;

/** "USD m" - the unit label that belongs on anything formatted with MONEY. */
function millions(currency: string): string {
  return `${currency} m`;
}

function label(sheet: Sheet, row: number, text: string, indent = 0): ExcelJS.Cell {
  const cell = sheet.getCell(`A${row}`);
  cell.value = text;
  if (indent) cell.alignment = { indent };
  return cell;
}

function note(cell: ExcelJS.Cell, text: string): void {
  cell.value = text;
  cell.font = { size: 9, color: { argb: GREY } };
  // A one-space indent keeps the note off the right-aligned figure beside it.
  cell.alignment = { indent: 1 };
}

/**
 * A heading rule that stops at column A reads as a truncated line, because the
 * figures it introduces sit two columns over. Carry the border across the block.
 */
function sectionHeading(sheet: Sheet, row: number, text: string, lastCol = 'C'): void {
  const cell = label(sheet, row, text);
  cell.font = { bold: true, size: 11 };
  for (const c of columnsTo(lastCol)) {
    sheet.getCell(`${c}${row}`).border = { bottom: { style: 'thin' } };
  }
}

/** ['A', 'B', ... last]. Single-letter columns only, which is all this file uses. */
function columnsTo(last: string): string[] {
  const out: string[] = [];
  for (let c = 'A'.charCodeAt(0); c <= last.charCodeAt(0); c++) out.push(String.fromCharCode(c));
  return out;
}

/** Rules a header row underneath, so a table reads as a table. */
function underline(sheet: Sheet, row: number, cols: string[]): void {
  for (const c of cols) {
    const cell = sheet.getCell(`${c}${row}`);
    cell.border = { ...cell.border, bottom: { style: 'thin' } };
  }
}

/** Inputs are blue-on-pale, the convention every modeller already reads. */
function markInput(cell: ExcelJS.Cell): void {
  cell.font = { color: { argb: 'FF0000CC' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF6E3' } };
}

function inputCell(
  sheet: Sheet,
  ref: string,
  value: number,
  numFmt: string
): ExcelJS.Cell {
  const cell = sheet.getCell(ref);
  cell.value = value;
  cell.numFmt = numFmt;
  markInput(cell);
  return cell;
}

/**
 * Writes a formula AND its computed result.
 *
 * The cached result is not optional. A formula cell written without one has an
 * <f> element and no <v>, so anything that does not recalculate on open renders
 * it BLANK - Excel with automatic calculation switched off, Google Sheets,
 * Numbers, and every file previewer. The Forecast and Valuation sheets shipped
 * empty for exactly this reason, and a COM test that called
 * CalculateFullRebuild() masked it, because forcing a recalc is the one thing a
 * real reader does not do.
 *
 * The result comes from the engine, so the file shows the same numbers as the
 * page the moment it opens, and recalculates to the same numbers if edited.
 */
function formulaCell(
  sheet: Sheet,
  ref: string,
  formula: string,
  numFmt: string,
  result: number
): ExcelJS.Cell {
  const cell = sheet.getCell(ref);
  cell.value = { formula, result, date1904: false };
  cell.numFmt = numFmt;
  return cell;
}

/** Column letter for forecast year i (0-based). Year 1 lands in column B. */
function col(i: number): string {
  return String.fromCharCode('B'.charCodeAt(0) + i);
}

/**
 * Gridlines off on every sheet. They are the difference between a spreadsheet
 * and a model: the borders here are deliberate and gridlines drown them.
 */
function present(sheet: Sheet, freezeFirstColumn = false): void {
  sheet.views = [
    freezeFirstColumn
      ? { state: 'frozen', xSplit: 1, showGridLines: false }
      : { showGridLines: false },
  ];
}

export async function buildWorkbook(v: Valuation): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DCF Studio';
  wb.created = new Date(0); // Deterministic: the same model exports byte-identically.
  // Belt and braces alongside the cached results: Excel recalculates on open, so
  // an edited input is reflected even before the user touches a cell.
  wb.calcProperties.fullCalcOnLoad = true;

  const ccy = v.fundamentals.reportingCurrency;
  const n = v.assumptions.horizonYears;
  const years = v.forecastYearLabels;

  // ---------------------------------------------------------------- Assumptions
  const a = wb.addWorksheet('Assumptions');
  present(a);
  a.getColumn('A').width = 40;
  a.getColumn('B').width = 16;
  a.getColumn('C').width = 52;

  const scenarioName = v.scenario.charAt(0).toUpperCase() + v.scenario.slice(1);

  a.getCell('A1').value = `${v.fundamentals.name} (${v.fundamentals.ticker})`;
  a.getCell('A1').font = { bold: true, size: 14 };
  a.getCell('A2').value = `DCF Studio - ${scenarioName} case${v.modified ? ', edited' : ''}`;
  a.getCell('A2').font = { color: { argb: GREY } };
  a.getCell('A3').value =
    `Blue figures on a cream fill are inputs. Every other figure is a formula - change an input and the model reprices. Currency figures are ${ccy} millions unless the row says otherwise.`;
  a.getCell('A3').font = { italic: true, color: { argb: GREY }, size: 9 };

  sectionHeading(a, 5, 'Drivers');
  const rows = {
    growth: 6,
    margin: 7,
    tax: 8,
    da: 9,
    capex: 10,
    nwc: 11,
    terminalGrowth: 12,
    exitMultiple: 13,
    roic: 14,
  };
  label(a, rows.growth, 'Revenue growth');
  label(a, rows.margin, 'EBIT margin');
  label(a, rows.tax, 'Tax rate');
  label(a, rows.da, 'Depreciation & amortisation, % of revenue');
  label(a, rows.capex, 'Capital expenditure, % of revenue');
  label(a, rows.nwc, 'Change in working capital, % of revenue growth');
  label(a, rows.terminalGrowth, 'Terminal growth');
  label(a, rows.exitMultiple, 'Exit EV/EBITDA');
  label(a, rows.roic, 'Terminal ROIC');

  // A flat driver is one input; a per-year path is one input per year, which is
  // why growth and margin are written to the Forecast sheet instead when they
  // vary. Here they hold the year-1 value and the Forecast row points at it.
  inputCell(a, `B${rows.growth}`, v.assumptions.revenueGrowth[0], RATE);
  inputCell(a, `B${rows.margin}`, v.assumptions.ebitMargin[0], RATE);
  inputCell(a, `B${rows.tax}`, v.assumptions.taxRate, RATE);
  inputCell(a, `B${rows.da}`, v.assumptions.daPctRevenue, RATE);
  inputCell(a, `B${rows.capex}`, v.assumptions.capexPctRevenue, RATE);
  inputCell(a, `B${rows.nwc}`, v.assumptions.nwcPctRevenueChange, RATE);
  inputCell(a, `B${rows.terminalGrowth}`, v.assumptions.terminalGrowth, RATE);
  inputCell(a, `B${rows.exitMultiple}`, v.assumptions.exitMultiple, MULTIPLE);
  inputCell(
    a,
    `B${rows.roic}`,
    v.dcf.gordon.terminal.steadyState?.roic ?? v.wacc.wacc,
    RATE
  );
  note(
    a.getCell(`C${rows.roic}`),
    v.dcf.gordon.terminal.steadyState?.roicFromAccounts
      ? 'From reported invested capital'
      : 'Floored at WACC (reported ROIC below cost of capital)'
  );

  sectionHeading(a, 16, 'Discount rate');
  const w = {
    rf: 17,
    erp: 18,
    beta: 19,
    coe: 20,
    cod: 21,
    mcap: 22,
    debt: 23,
    equityWeight: 24,
    debtWeight: 25,
    wacc: 26,
  };
  label(a, w.rf, 'Risk-free rate');
  label(a, w.erp, 'Equity risk premium');
  label(a, w.beta, 'Beta');
  label(a, w.coe, 'Cost of equity');
  label(a, w.cod, 'Cost of debt');
  label(a, w.mcap, `Market capitalisation (${millions(ccy)})`);
  label(a, w.debt, `Total debt (${millions(ccy)})`);
  label(a, w.equityWeight, 'Equity weight');
  label(a, w.debtWeight, 'Debt weight');
  label(a, w.wacc, 'WACC');

  inputCell(a, `B${w.rf}`, v.wacc.riskFreeRate, RATE);
  inputCell(a, `B${w.erp}`, v.wacc.equityRiskPremium, RATE);
  inputCell(a, `B${w.beta}`, v.wacc.beta, '0.000');
  formulaCell(a, `B${w.coe}`, `B${w.rf}+B${w.beta}*B${w.erp}`, RATE, v.wacc.costOfEquity);
  inputCell(a, `B${w.cod}`, v.wacc.costOfDebt, RATE);
  inputCell(a, `B${w.mcap}`, v.wacc.marketCap, MONEY);
  inputCell(a, `B${w.debt}`, v.wacc.totalDebt, MONEY);
  formulaCell(a, `B${w.equityWeight}`, `B${w.mcap}/(B${w.mcap}+B${w.debt})`, RATE, v.wacc.equityWeight);
  formulaCell(a, `B${w.debtWeight}`, `1-B${w.equityWeight}`, RATE, v.wacc.debtWeight);
  formulaCell(
    a,
    `B${w.wacc}`,
    `B${w.equityWeight}*B${w.coe}+B${w.debtWeight}*B${w.cod}*(1-B${rows.tax})`,
    RATE,
    v.wacc.wacc
  );
  a.getCell(`B${w.wacc}`).font = { bold: true };
  note(a.getCell(`C${w.rf}`), v.wacc.riskFreeSource);
  note(a.getCell(`C${w.cod}`), v.wacc.costOfDebtSource);
  note(
    a.getCell(`C${w.beta}`),
    v.wacc.betaClamped
      ? `Clamped from a reported ${v.wacc.rawBeta?.toFixed(3)}`
      : 'As reported'
  );

  sectionHeading(a, 28, 'Base year');
  const base = { revenue: 29, netDebt: 30, shares: 31, midYear: 32 };
  label(a, base.revenue, `Revenue, last reported year (${millions(ccy)})`);
  label(a, base.netDebt, `Net debt (${millions(ccy)})`);
  label(a, base.shares, 'Diluted shares');
  label(a, base.midYear, 'Mid-year discounting (1 = yes, 0 = no)');
  const latest = v.fundamentals.years[0];
  inputCell(a, `B${base.revenue}`, latest.revenue.value, MONEY);
  inputCell(a, `B${base.netDebt}`, latest.totalDebt.value - latest.cash.value, MONEY);
  inputCell(a, `B${base.shares}`, latest.shares.value, '#,##0');
  inputCell(a, `B${base.midYear}`, v.assumptions.midYearConvention ? 1 : 0, '0');
  note(a.getCell(`C${base.revenue}`), `Fiscal year ended ${latest.periodEnd}`);

  // ------------------------------------------------------------------ Forecast
  const f = wb.addWorksheet('Forecast');
  present(f, true);
  f.getColumn('A').width = 42;
  for (let i = 0; i < n; i++) f.getColumn(col(i)).width = 15;

  f.getCell('A1').value = `Forecast cashflows (${millions(ccy)})`;
  f.getCell('A1').font = { bold: true, size: 12 };
  f.getCell('A2').value = 'Every figure below is a formula. Edit the drivers on Assumptions.';
  f.getCell('A2').font = { italic: true, size: 9, color: { argb: GREY } };

  const r = {
    header: 4,
    growth: 5,
    revenue: 6,
    margin: 7,
    ebit: 8,
    nopat: 9,
    da: 10,
    capex: 11,
    nwc: 12,
    fcff: 13,
    df: 14,
    pv: 15,
  };
  f.getCell(`A${r.header}`).value = 'Year';
  f.getCell(`A${r.header}`).font = { bold: true };
  for (let i = 0; i < n; i++) {
    const c = f.getCell(`${col(i)}${r.header}`);
    c.value = years[i];
    c.font = { bold: true };
    c.alignment = { horizontal: 'right' };
  }
  // Across the label column too: a rule that starts under the first year reads
  // as a stray line rather than as the head of the table.
  underline(f, r.header, ['A', ...Array.from({ length: n }, (_, i) => col(i))]);

  label(f, r.growth, 'Revenue growth');
  label(f, r.revenue, 'Revenue');
  label(f, r.margin, 'EBIT margin');
  label(f, r.ebit, 'EBIT');
  label(f, r.nopat, 'NOPAT');
  label(f, r.da, 'Add depreciation & amortisation');
  label(f, r.capex, 'Less capital expenditure');
  label(f, r.nwc, 'Less increase in working capital');
  label(f, r.fcff, 'Free cashflow to firm');
  label(f, r.df, 'Discount factor');
  label(f, r.pv, 'Present value');
  f.getCell(`A${r.fcff}`).font = { bold: true };
  f.getCell(`A${r.pv}`).font = { bold: true };

  for (let i = 0; i < n; i++) {
    const c = col(i);
    const prev = i === 0 ? null : col(i - 1);

    // Per-year growth and margin: year 1 points at the Assumptions input so the
    // single-driver case stays live; later years are their own inputs, which is
    // what makes a fading path editable rather than fixed.
    const fy = v.dcf.forecast[i];
    if (i === 0) {
      formulaCell(f, `${c}${r.growth}`, `Assumptions!B${rows.growth}`, RATE, v.assumptions.revenueGrowth[0]);
      formulaCell(f, `${c}${r.margin}`, `Assumptions!B${rows.margin}`, RATE, v.assumptions.ebitMargin[0]);
    } else {
      const sameGrowth = v.assumptions.revenueGrowth[i] === v.assumptions.revenueGrowth[0];
      const sameMargin = v.assumptions.ebitMargin[i] === v.assumptions.ebitMargin[0];
      if (sameGrowth) {
        formulaCell(f, `${c}${r.growth}`, `Assumptions!B${rows.growth}`, RATE, v.assumptions.revenueGrowth[i]);
      } else {
        inputCell(f, `${c}${r.growth}`, v.assumptions.revenueGrowth[i], RATE);
      }
      if (sameMargin) {
        formulaCell(f, `${c}${r.margin}`, `Assumptions!B${rows.margin}`, RATE, v.assumptions.ebitMargin[i]);
      } else {
        inputCell(f, `${c}${r.margin}`, v.assumptions.ebitMargin[i], RATE);
      }
    }

    const priorRevenue = prev ? `${prev}${r.revenue}` : `Assumptions!B${base.revenue}`;
    formulaCell(f, `${c}${r.revenue}`, `${priorRevenue}*(1+${c}${r.growth})`, MONEY, fy.revenue);
    formulaCell(f, `${c}${r.ebit}`, `${c}${r.revenue}*${c}${r.margin}`, MONEY, fy.ebit);
    formulaCell(f, `${c}${r.nopat}`, `${c}${r.ebit}*(1-Assumptions!B${rows.tax})`, MONEY, fy.nopat);
    formulaCell(f, `${c}${r.da}`, `${c}${r.revenue}*Assumptions!B${rows.da}`, MONEY, fy.dAndA);
    formulaCell(f, `${c}${r.capex}`, `-${c}${r.revenue}*Assumptions!B${rows.capex}`, MONEY, -fy.capex);
    formulaCell(
      f,
      `${c}${r.nwc}`,
      `-(${c}${r.revenue}-${priorRevenue})*Assumptions!B${rows.nwc}`,
      MONEY,
      -fy.changeInNwc
    );
    formulaCell(
      f,
      `${c}${r.fcff}`,
      `${c}${r.nopat}+${c}${r.da}+${c}${r.capex}+${c}${r.nwc}`,
      MONEY,
      fy.fcff
    );
    // Mid-year toggle lives in the formula, so flipping the flag on Assumptions
    // reprices without touching anything else.
    formulaCell(
      f,
      `${c}${r.df}`,
      `1/(1+Assumptions!$B$${w.wacc})^(${i + 1}-0.5*Assumptions!$B$${base.midYear})`,
      '0.0000',
      fy.discountFactor
    );
    formulaCell(f, `${c}${r.pv}`, `${c}${r.fcff}*${c}${r.df}`, MONEY, fy.presentValue);
    f.getCell(`${c}${r.fcff}`).font = { bold: true };
    f.getCell(`${c}${r.pv}`).font = { bold: true };
  }

  const lastCol = col(n - 1);
  label(f, 17, 'Present value of the explicit forecast').font = { bold: true };
  const pvTotal = formulaCell(
    f,
    `B17`,
    `SUM(B${r.pv}:${lastCol}${r.pv})`,
    MONEY,
    v.dcf.pvExplicit
  );
  pvTotal.font = { bold: true };
  // A total sitting bare under the FY1 column reads as an FY1 figure. The rule
  // says it is the sum of the row above, not another year.
  pvTotal.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  f.getCell('A17').border = { top: { style: 'thin' } };

  // ----------------------------------------------------------------- Valuation
  const val = wb.addWorksheet('Valuation');
  present(val);
  val.getColumn('A').width = 46;
  val.getColumn('B').width = 18;
  val.getColumn('C').width = 46;

  val.getCell('A1').value = `Valuation (${millions(ccy)}, except per share)`;
  val.getCell('A1').font = { bold: true, size: 12 };

  const ss = v.dcf.gordon.terminal.steadyState;
  const finalYear = v.dcf.forecast[n - 1];

  sectionHeading(val, 3, 'Terminal value - perpetuity growth');
  const t = {
    finalFcff: 4,
    maintenance: 5,
    reinvestRate: 6,
    reinvest: 7,
    capitalised: 8,
    tv: 9,
    tvPv: 10,
    ev: 11,
    netDebt: 12,
    equity: 13,
    perShare: 14,
  };
  label(val, t.finalFcff, 'Final year free cashflow');
  label(val, t.maintenance, 'Free cashflow with capex at depreciation');
  label(val, t.reinvestRate, 'Reinvestment rate (g / ROIC)');
  label(val, t.reinvest, 'Less reinvestment to fund terminal growth');
  label(val, t.capitalised, 'Cashflow capitalised');
  label(val, t.tv, 'Terminal value, undiscounted');
  label(val, t.tvPv, 'Terminal value, discounted');
  label(val, t.ev, 'Enterprise value');
  label(val, t.netDebt, 'Less net debt');
  label(val, t.equity, 'Equity value');
  label(val, t.perShare, 'Value per share');

  formulaCell(val, `B${t.finalFcff}`, `Forecast!${lastCol}${r.fcff}`, MONEY, finalYear.fcff);
  // Maintenance capex: add back the excess of capex over depreciation.
  formulaCell(
    val,
    `B${t.maintenance}`,
    `B${t.finalFcff}-Forecast!${lastCol}${r.capex}-Forecast!${lastCol}${r.da}`,
    MONEY,
    ss?.maintenanceFcff ?? finalYear.fcff
  );
  formulaCell(
    val,
    `B${t.reinvestRate}`,
    `MIN(Assumptions!B${rows.terminalGrowth}/MAX(Assumptions!B${rows.roic},Assumptions!B${w.wacc}),0.9)`,
    RATE,
    ss?.reinvestmentRate ?? 0
  );
  formulaCell(
    val,
    `B${t.reinvest}`,
    `-Forecast!${lastCol}${r.nopat}*B${t.reinvestRate}`,
    MONEY,
    -(ss?.reinvestment ?? 0)
  );
  formulaCell(
    val,
    `B${t.capitalised}`,
    `MAX(B${t.maintenance}+B${t.reinvest},0)`,
    MONEY,
    ss?.capitalisedFcff ?? finalYear.fcff
  );
  formulaCell(
    val,
    `B${t.tv}`,
    `B${t.capitalised}*(1+Assumptions!B${rows.terminalGrowth})/(Assumptions!B${w.wacc}-Assumptions!B${rows.terminalGrowth})`,
    MONEY,
    v.dcf.gordon.terminal.undiscounted
  );
  // Terminal value discounts on the same convention as the flows.
  formulaCell(
    val,
    `B${t.tvPv}`,
    `B${t.tv}/(1+Assumptions!B${w.wacc})^(${n}-0.5*Assumptions!B${base.midYear})`,
    MONEY,
    v.dcf.gordon.terminal.presentValue
  );
  formulaCell(val, `B${t.ev}`, `Forecast!B17+B${t.tvPv}`, MONEY, v.dcf.gordon.enterpriseValue);
  formulaCell(
    val,
    `B${t.netDebt}`,
    `-Assumptions!B${base.netDebt}`,
    MONEY,
    -(v.dcf.gordon.enterpriseValue - v.dcf.gordon.equityValue)
  );
  formulaCell(val, `B${t.equity}`, `B${t.ev}+B${t.netDebt}`, MONEY, v.dcf.gordon.equityValue);
  formulaCell(
    val,
    `B${t.perShare}`,
    `B${t.equity}/Assumptions!B${base.shares}`,
    PER_SHARE,
    v.dcf.gordon.valuePerShare
  );
  val.getCell(`B${t.perShare}`).font = { bold: true, size: 12 };
  val.getCell(`A${t.perShare}`).font = { bold: true };

  sectionHeading(val, 16, 'Terminal value - exit multiple');
  // Same bridge as the perpetuity block, line for line. It used to jump from
  // enterprise value straight to equity value, so the one method a reader would
  // check against the other hid the step where they could differ.
  const x = { ebitda: 17, tv: 18, tvPv: 19, ev: 20, netDebt: 21, equity: 22, perShare: 23 };
  label(val, x.ebitda, 'Final year EBITDA');
  label(val, x.tv, 'Terminal value, undiscounted');
  label(val, x.tvPv, 'Terminal value, discounted');
  label(val, x.ev, 'Enterprise value');
  label(val, x.netDebt, 'Less net debt');
  label(val, x.equity, 'Equity value');
  label(val, x.perShare, 'Value per share');
  formulaCell(
    val,
    `B${x.ebitda}`,
    `Forecast!${lastCol}${r.ebit}+Forecast!${lastCol}${r.da}`,
    MONEY,
    finalYear.ebit + finalYear.dAndA
  );
  formulaCell(
    val,
    `B${x.tv}`,
    `B${x.ebitda}*Assumptions!B${rows.exitMultiple}`,
    MONEY,
    v.dcf.exitMultiple.terminal.undiscounted
  );
  formulaCell(
    val,
    `B${x.tvPv}`,
    `B${x.tv}/(1+Assumptions!B${w.wacc})^(${n}-0.5*Assumptions!B${base.midYear})`,
    MONEY,
    v.dcf.exitMultiple.terminal.presentValue
  );
  formulaCell(val, `B${x.ev}`, `Forecast!B17+B${x.tvPv}`, MONEY, v.dcf.exitMultiple.enterpriseValue);
  formulaCell(
    val,
    `B${x.netDebt}`,
    `-Assumptions!B${base.netDebt}`,
    MONEY,
    -(v.dcf.exitMultiple.enterpriseValue - v.dcf.exitMultiple.equityValue)
  );
  formulaCell(
    val,
    `B${x.equity}`,
    `B${x.ev}+B${x.netDebt}`,
    MONEY,
    v.dcf.exitMultiple.equityValue
  );
  formulaCell(
    val,
    `B${x.perShare}`,
    `B${x.equity}/Assumptions!B${base.shares}`,
    PER_SHARE,
    v.dcf.exitMultiple.valuePerShare
  );
  val.getCell(`B${x.perShare}`).font = { bold: true };
  val.getCell(`A${x.perShare}`).font = { bold: true };

  const quote = v.fundamentals.quoteCurrency;
  const fxContext = {
    reportingCurrency: ccy,
    quoteCurrency: quote,
    fxRate: v.fxRate,
  };
  // One factor, not a bare FX rate: a pence quote needs the sub-unit multiply as
  // well, and the sheet used to omit it. The engine and the sheet now read the
  // same function, so they cannot disagree again.
  const conversion = quoteConversionFactor(fxContext);
  const subUnit = majorCurrency(quote) !== quote;

  sectionHeading(val, 25, 'Against the market');
  const m = { price: 26, conversion: 27, perShare: 28, upside: 29 };
  label(val, m.price, `Market price (${quote})`);
  label(val, m.conversion, `Conversion, ${ccy} to ${quote}`);
  label(val, m.perShare, `Value per share (${quote})`);
  label(val, m.upside, 'Implied upside');
  inputCell(val, `B${m.price}`, v.fundamentals.price, PER_SHARE);
  inputCell(val, `B${m.conversion}`, conversion, '0.0000');
  note(
    val.getCell(`C${m.conversion}`),
    majorCurrency(quote) === ccy && !subUnit
      ? 'Same currency, no conversion'
      : [
          majorCurrency(quote) === ccy
            ? null
            : `${ccy}/${majorCurrency(quote)} at ${v.fxRate.toFixed(4)}`,
          subUnit ? `then x100, because ${quote} is a sub-unit of ${majorCurrency(quote)}` : null,
        ]
          .filter(Boolean)
          .join(', ')
  );
  formulaCell(
    val,
    `B${m.perShare}`,
    `B${t.perShare}*B${m.conversion}`,
    PER_SHARE,
    v.valuePerShareQuoted
  );
  formulaCell(val, `B${m.upside}`, `B${m.perShare}/B${m.price}-1`, RATE, v.upside);
  val.getCell(`B${m.upside}`).font = { bold: true };
  val.getCell(`A${m.upside}`).font = { bold: true };

  // --------------------------------------------------------------- Sensitivity
  const s = wb.addWorksheet('Sensitivity');
  present(s, true);
  s.getColumn('A').width = 14;
  s.getCell('A1').value = `Value per share (${ccy}) by WACC and terminal growth`;
  s.getCell('A1').font = { bold: true, size: 12 };
  s.getCell('A2').value =
    'WACC down the side, terminal growth across the top. Static grid: computed by DCF Studio, not linked to the sheets above. A live data table needs Excel to build it (Data > What-If > Data Table).';
  s.getCell('A2').font = { italic: true, size: 9, color: { argb: GREY } };

  s.getCell('A4').value = 'WACC';
  s.getCell('A4').font = { bold: true };
  v.sensitivity.growthValues.forEach((g, j) => {
    const c = s.getCell(`${col(j)}4`);
    c.value = g;
    c.numFmt = RATE;
    c.font = { bold: true };
    c.alignment = { horizontal: 'right' };
    s.getColumn(col(j)).width = 13;
  });
  underline(s, 4, ['A', ...v.sensitivity.growthValues.map((_, j) => col(j))]);
  v.sensitivity.waccValues.forEach((wv, i) => {
    const row = 5 + i;
    const rc = s.getCell(`A${row}`);
    rc.value = wv;
    rc.numFmt = RATE;
    rc.font = { bold: true };
    // Rules the stub column off from the grid, so a reader never loses which
    // WACC row a figure belongs to.
    rc.border = { right: { style: 'thin' } };
    v.sensitivity.cells[i].forEach((cellValue, j) => {
      const c = s.getCell(`${col(j)}${row}`);
      // 'n/a' is a string and would left-align against right-aligned figures.
      // Toyota's grid is mostly blocked cells, and it read as a jumble.
      c.value = cellValue === null ? 'n/a' : cellValue;
      c.numFmt = PER_SHARE;
      c.alignment = { horizontal: 'right' };
      if (i === v.sensitivity.centre.waccIndex && j === v.sensitivity.centre.growthIndex) {
        c.font = { bold: true };
        c.border = {
          top: { style: 'medium' },
          left: { style: 'medium' },
          bottom: { style: 'medium' },
          right: { style: 'medium' },
        };
      }
    });
  });

  // -------------------------------------------------------------------- Source
  const src = wb.addWorksheet('Source data');
  present(src, true);
  src.getColumn('A').width = 40;
  src.getCell('A1').value = `Reported history and provenance (${millions(ccy)}, except shares)`;
  src.getCell('A1').font = { bold: true, size: 12 };
  src.getCell('A2').value =
    'What the model was built from. "derived" means the figure was not reported and was computed - the note says how.';
  src.getCell('A2').font = { italic: true, size: 9, color: { argb: GREY } };

  const hist = v.fundamentals.years;
  const fieldCol = col(hist.length);
  src.getCell('A4').value = 'Fiscal year end';
  src.getCell('A4').font = { bold: true };
  hist.forEach((y, i) => {
    const c = src.getCell(`${col(i)}4`);
    c.value = y.periodEnd;
    c.font = { bold: true };
    // The dates are strings and the figures under them are numbers, so without
    // this the header sat left while its own column sat right.
    c.alignment = { horizontal: 'right' };
    src.getColumn(col(i)).width = 17;
  });
  const fieldHeader = src.getCell(`${fieldCol}4`);
  fieldHeader.value = 'Yahoo field, latest year';
  fieldHeader.font = { bold: true, size: 9 };
  fieldHeader.alignment = { indent: 1 };
  underline(src, 4, ['A', ...hist.map((_, i) => col(i)), fieldCol]);

  const lines: [string, (y: (typeof hist)[number]) => { value: number; note: string }][] = [
    ['Revenue', (y) => ({ value: y.revenue.value, note: y.revenue.provenance.sourceField })],
    ['EBIT', (y) => ({ value: y.ebit.value, note: y.ebit.provenance.derived ? 'derived' : y.ebit.provenance.sourceField })],
    ['Depreciation & amortisation', (y) => ({ value: y.dAndA.value, note: y.dAndA.provenance.sourceField })],
    ['Capital expenditure', (y) => ({ value: y.capex.value, note: y.capex.provenance.sourceField })],
    ['Change in working capital', (y) => ({ value: y.changeInNwc.value, note: y.changeInNwc.provenance.derived ? 'derived' : y.changeInNwc.provenance.sourceField })],
    ['Total debt', (y) => ({ value: y.totalDebt.value, note: y.totalDebt.provenance.sourceField })],
    ['Cash and equivalents', (y) => ({ value: y.cash.value, note: y.cash.provenance.sourceField })],
    ['Diluted shares', (y) => ({ value: y.shares.value, note: y.shares.provenance.sourceField })],
  ];
  lines.forEach(([name, pick], k) => {
    const row = 5 + k;
    label(src, row, name);
    hist.forEach((y, i) => {
      const { value } = pick(y);
      const c = src.getCell(`${col(i)}${row}`);
      c.value = value;
      c.numFmt = name === 'Diluted shares' ? '#,##0' : MONEY;
    });
    note(src.getCell(`${fieldCol}${row}`), pick(hist[0]).note);
  });
  src.getColumn(fieldCol).width = 44;

  /**
   * A merged cell does not auto-fit, so a fixed height silently guillotines the
   * text: CBA's "a DCF will misprice it" warning shipped cut off mid-sentence,
   * which is the one note a reader most needs to finish. Size the row from the
   * text instead, erring long - blank space costs nothing, a lost caveat does.
   */
  const noteWidth = 40 + hist.length * 17 + 44;
  function wrappedNote(row: number, text: string): void {
    const c = src.getCell(`A${row}`);
    c.value = text;
    c.alignment = { wrapText: true, vertical: 'top' };
    src.mergeCells(`A${row}:${fieldCol}${row}`);
    const perLine = Math.max(20, Math.floor(noteWidth * 0.9));
    src.getRow(row).height = Math.ceil(text.length / perLine) * 16 + 6;
  }

  let noteRow = 5 + lines.length + 2;
  src.getCell(`A${noteRow}`).value = 'Model notes';
  src.getCell(`A${noteRow}`).font = { bold: true };
  noteRow++;
  const flags = [...v.flags].sort(
    (x1, x2) => FLAG_ORDER.indexOf(x1.severity) - FLAG_ORDER.indexOf(x2.severity)
  );
  for (const flag of flags) {
    // FLAG_LABEL, not the raw enum: "ERROR: This is a financial" read as a crash
    // rather than as the caveat it is, and the page has always said "Wrong tool".
    wrappedNote(noteRow, `${FLAG_LABEL[flag.severity]}: ${flag.message}`);
    noteRow++;
  }
  for (const line of v.notes) {
    wrappedNote(noteRow, line);
    noteRow++;
  }
  noteRow++;
  src.getCell(`A${noteRow}`).value =
    `Data: Yahoo Finance. Risk-free rate: ${v.wacc.riskFreeSource}. General information, not advice.`;
  src.getCell(`A${noteRow}`).font = { size: 9, color: { argb: GREY } };

  return wb.xlsx.writeBuffer();
}
