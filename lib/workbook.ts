import ExcelJS from 'exceljs';
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

const MONEY = '#,##0.0,,;[Red](#,##0.0,,)';
const RATE = '0.00%';
const PER_SHARE = '#,##0.00;[Red](#,##0.00)';
const MULTIPLE = '0.0"x"';

type Sheet = ExcelJS.Worksheet;

function label(sheet: Sheet, row: number, text: string, indent = 0): ExcelJS.Cell {
  const cell = sheet.getCell(`A${row}`);
  cell.value = text;
  if (indent) cell.alignment = { indent };
  return cell;
}

function sectionHeading(sheet: Sheet, row: number, text: string): void {
  const cell = label(sheet, row, text);
  cell.font = { bold: true, size: 11 };
  cell.border = { bottom: { style: 'thin' } };
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
  a.getColumn('A').width = 40;
  a.getColumn('B').width = 16;
  a.getColumn('C').width = 52;

  a.getCell('A1').value = `${v.fundamentals.name} (${v.fundamentals.ticker})`;
  a.getCell('A1').font = { bold: true, size: 14 };
  a.getCell('A2').value = `DCF Studio - ${v.scenario} case${v.modified ? ', edited' : ''}`;
  a.getCell('A2').font = { color: { argb: 'FF666666' } };
  a.getCell('A3').value =
    'Shaded blue cells are inputs. Every other figure is a formula - change an input and the model reprices.';
  a.getCell('A3').font = { italic: true, color: { argb: 'FF666666' }, size: 9 };

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
  a.getCell(`C${rows.roic}`).value = v.dcf.gordon.terminal.steadyState?.roicFromAccounts
    ? 'From reported invested capital'
    : 'Floored at WACC (reported ROIC below cost of capital)';
  a.getCell(`C${rows.roic}`).font = { size: 9, color: { argb: 'FF666666' } };

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
  label(a, w.mcap, `Market capitalisation (${ccy})`);
  label(a, w.debt, `Total debt (${ccy})`);
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
  a.getCell(`C${w.rf}`).value = v.wacc.riskFreeSource;
  a.getCell(`C${w.cod}`).value = v.wacc.costOfDebtSource;
  a.getCell(`C${w.beta}`).value = v.wacc.betaClamped
    ? `Clamped from a reported ${v.wacc.rawBeta?.toFixed(3)}`
    : 'As reported';
  for (const r of [w.rf, w.cod, w.beta]) {
    a.getCell(`C${r}`).font = { size: 9, color: { argb: 'FF666666' } };
  }

  sectionHeading(a, 28, 'Base year');
  const base = { revenue: 29, netDebt: 30, shares: 31, midYear: 32 };
  label(a, base.revenue, `Revenue, last reported year (${ccy})`);
  label(a, base.netDebt, `Net debt (${ccy})`);
  label(a, base.shares, 'Diluted shares');
  label(a, base.midYear, 'Mid-year discounting (1 = yes, 0 = no)');
  const latest = v.fundamentals.years[0];
  inputCell(a, `B${base.revenue}`, latest.revenue.value, MONEY);
  inputCell(a, `B${base.netDebt}`, latest.totalDebt.value - latest.cash.value, MONEY);
  inputCell(a, `B${base.shares}`, latest.shares.value, '#,##0');
  inputCell(a, `B${base.midYear}`, v.assumptions.midYearConvention ? 1 : 0, '0');
  a.getCell(`C${base.revenue}`).value = `Fiscal year ended ${latest.periodEnd}`;
  a.getCell(`C${base.revenue}`).font = { size: 9, color: { argb: 'FF666666' } };

  // ------------------------------------------------------------------ Forecast
  const f = wb.addWorksheet('Forecast');
  f.getColumn('A').width = 42;
  for (let i = 0; i < n; i++) f.getColumn(col(i)).width = 15;

  f.getCell('A1').value = `Forecast cashflows (${ccy})`;
  f.getCell('A1').font = { bold: true, size: 12 };
  f.getCell('A2').value = 'Every figure below is a formula. Edit the drivers on Assumptions.';
  f.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

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
    c.border = { bottom: { style: 'thin' } };
  }

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
  formulaCell(f, `B17`, `SUM(B${r.pv}:${lastCol}${r.pv})`, MONEY, v.dcf.pvExplicit).font = {
    bold: true,
  };

  // ----------------------------------------------------------------- Valuation
  const val = wb.addWorksheet('Valuation');
  val.getColumn('A').width = 46;
  val.getColumn('B').width = 18;
  val.getColumn('C').width = 46;

  val.getCell('A1').value = `Valuation (${ccy})`;
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
  label(val, t.maintenance, 'Capex reset to depreciation');
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
  const x = { ebitda: 17, tv: 18, tvPv: 19, ev: 20, equity: 21, perShare: 22 };
  label(val, x.ebitda, 'Final year EBITDA');
  label(val, x.tv, 'Terminal value, undiscounted');
  label(val, x.tvPv, 'Terminal value, discounted');
  label(val, x.ev, 'Enterprise value');
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
    `B${x.equity}`,
    `B${x.ev}-Assumptions!B${base.netDebt}`,
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

  sectionHeading(val, 24, 'Against the market');
  label(val, 25, `Market price (${v.fundamentals.quoteCurrency})`);
  label(val, 26, 'FX, reporting to quote currency');
  label(val, 27, `Value per share (${v.fundamentals.quoteCurrency})`);
  label(val, 28, 'Implied upside');
  inputCell(val, 'B25', v.fundamentals.price, PER_SHARE);
  inputCell(val, 'B26', v.fxRate, '0.0000');
  formulaCell(val, 'B27', `B${t.perShare}*B26`, PER_SHARE, v.valuePerShareQuoted);
  formulaCell(val, 'B28', `B27/B25-1`, RATE, v.upside);
  val.getCell('B28').font = { bold: true };

  // --------------------------------------------------------------- Sensitivity
  const s = wb.addWorksheet('Sensitivity');
  s.getColumn('A').width = 18;
  s.getCell('A1').value = `Value per share (${ccy}) by WACC and terminal growth`;
  s.getCell('A1').font = { bold: true, size: 12 };
  s.getCell('A2').value =
    'Static grid: computed by DCF Studio, not linked to the sheets above. A live data table needs Excel to build it (Data > What-If > Data Table).';
  s.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  s.getCell('A4').value = 'WACC \\ growth';
  s.getCell('A4').font = { bold: true };
  v.sensitivity.growthValues.forEach((g, j) => {
    const c = s.getCell(`${col(j)}4`);
    c.value = g;
    c.numFmt = RATE;
    c.font = { bold: true };
    s.getColumn(col(j)).width = 13;
  });
  v.sensitivity.waccValues.forEach((wv, i) => {
    const row = 5 + i;
    const rc = s.getCell(`A${row}`);
    rc.value = wv;
    rc.numFmt = RATE;
    rc.font = { bold: true };
    v.sensitivity.cells[i].forEach((cellValue, j) => {
      const c = s.getCell(`${col(j)}${row}`);
      c.value = cellValue === null ? 'n/a' : cellValue;
      c.numFmt = PER_SHARE;
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
  src.getColumn('A').width = 40;
  src.getCell('A1').value = 'Reported history and provenance';
  src.getCell('A1').font = { bold: true, size: 12 };
  src.getCell('A2').value =
    'What the model was built from. "derived" means the figure was not reported and was computed - the note says how.';
  src.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };

  const hist = v.fundamentals.years;
  src.getCell('A4').value = 'Fiscal year end';
  src.getCell('A4').font = { bold: true };
  hist.forEach((y, i) => {
    const c = src.getCell(`${col(i)}4`);
    c.value = y.periodEnd;
    c.font = { bold: true };
    src.getColumn(col(i)).width = 17;
  });

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
    const noteCell = src.getCell(`${col(hist.length)}${row}`);
    noteCell.value = pick(hist[0]).note;
    noteCell.font = { size: 9, color: { argb: 'FF666666' } };
  });
  src.getColumn(col(hist.length)).width = 44;

  let noteRow = 5 + lines.length + 2;
  src.getCell(`A${noteRow}`).value = 'Model notes';
  src.getCell(`A${noteRow}`).font = { bold: true };
  noteRow++;
  for (const flag of [...v.flags]) {
    const c = src.getCell(`A${noteRow}`);
    c.value = `${flag.severity.toUpperCase()}: ${flag.message}`;
    c.alignment = { wrapText: true, vertical: 'top' };
    src.getRow(noteRow).height = 30;
    src.mergeCells(`A${noteRow}:${col(hist.length)}${noteRow}`);
    noteRow++;
  }
  for (const note of v.notes) {
    const c = src.getCell(`A${noteRow}`);
    c.value = note;
    c.alignment = { wrapText: true, vertical: 'top' };
    src.getRow(noteRow).height = 30;
    src.mergeCells(`A${noteRow}:${col(hist.length)}${noteRow}`);
    noteRow++;
  }
  noteRow++;
  src.getCell(`A${noteRow}`).value =
    'Data: Yahoo Finance; Australian risk-free rates from the RBA. General information, not advice.';
  src.getCell(`A${noteRow}`).font = { size: 9, color: { argb: 'FF666666' } };

  return wb.xlsx.writeBuffer();
}
