/** Where a normalised number came from. Rendered in the UI so any output is traceable. */
export type Provenance = {
  /** Raw Yahoo field name, or 'derived' when computed. */
  sourceField: string;
  /** Human-readable note, present only when derived. */
  derivation?: string;
  derived: boolean;
};

export type Sourced<T> = { value: T; provenance: Provenance };

export type DataQualityCode =
  | 'MISSING_FIELD_DERIVED'
  | 'FINANCIAL_SECTOR'
  | 'CURRENCY_MISMATCH'
  | 'BETA_CLAMPED'
  | 'BETA_MISSING'
  | 'RISK_FREE_ASSUMED'
  | 'THIN_ANALYST_COVERAGE'
  | 'NO_ANALYST_COVERAGE'
  | 'CAPEX_BELOW_DA'
  | 'NEGATIVE_FCFF'
  | 'IMPLAUSIBLE_RESULT'
  | 'SHORT_HISTORY'
  | 'TERMINAL_GROWTH_BLOCKED'
  | 'STALE_DATA'
  | 'NOT_ORDINARY_EQUITY';

export type DataQualityFlag = {
  code: DataQualityCode;
  severity: 'info' | 'warn' | 'error';
  message: string;
};

/**
 * What a severity is called in front of a reader. Lives here rather than in the
 * component because the Excel export shows the same flags, and it used to print
 * the raw enum: "ERROR: This is a financial" reads as a crash, not a caveat.
 */
export const FLAG_LABEL: Record<DataQualityFlag['severity'], string> = {
  error: 'Wrong tool',
  warn: 'Adjusted',
  info: 'Note',
};

/** Most serious first. Shared so the page and the workbook order them alike. */
export const FLAG_ORDER: DataQualityFlag['severity'][] = ['error', 'warn', 'info'];

/** One historical fiscal year, fully normalised. Signs are canonical (see lib/normalise.ts). */
export type FiscalYear = {
  periodEnd: string;
  revenue: Sourced<number>;
  ebit: Sourced<number>;
  taxProvision: Sourced<number>;
  pretaxIncome: Sourced<number>;
  dAndA: Sourced<number>;
  /** Positive = cash outflow. */
  capex: Sourced<number>;
  /** Positive = increase in net working capital = cash outflow. */
  changeInNwc: Sourced<number>;
  totalDebt: Sourced<number>;
  cash: Sourced<number>;
  shares: Sourced<number>;
  interestExpense: Sourced<number> | null;
  /** Equity + debt - cash, for ROIC. Null where not reported. */
  investedCapital: Sourced<number> | null;
};

export type Fundamentals = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  reportingCurrency: string;
  quoteCurrency: string;
  /** Newest year first. */
  years: FiscalYear[];
  /** As quoted, in quote currency display units (pence for GBp). */
  price: number;
  marketCap: number;
  rawBeta: number | null;
  /** Consensus revenue estimates, nearest period first. Empty when uncovered. */
  analystRevenue: { period: string; revenue: number; analysts: number }[];
  flags: DataQualityFlag[];
};

export type Assumptions = {
  horizonYears: 5 | 10;
  /** Length must equal horizonYears. */
  revenueGrowth: number[];
  /** Length must equal horizonYears. */
  ebitMargin: number[];
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctRevenueChange: number;
  terminalGrowth: number;
  exitMultiple: number;
  wacc: number;
  midYearConvention: boolean;
  /**
   * Put the terminal year on a steady-state footing: maintenance capex equal to
   * depreciation, plus the net reinvestment that terminal growth actually
   * requires (g / ROIC of NOPAT). See lib/dcf.ts. Off only to reproduce a
   * textbook build that capitalises the final year's FCFF as reported.
   */
  terminalCapexEqualsDA: boolean;
  /**
   * Return on invested capital used for the terminal reinvestment rate.
   * Null falls back to the WACC, where growth is value-neutral.
   */
  terminalRoic: number | null;
};

export type DcfInputs = {
  baseRevenue: number;
  netDebt: number;
  dilutedShares: number;
};

export type ForecastYear = {
  year: number;
  revenue: number;
  ebit: number;
  nopat: number;
  dAndA: number;
  capex: number;
  changeInNwc: number;
  fcff: number;
  discountFactor: number;
  presentValue: number;
};

export type TerminalValue = {
  method: 'gordon' | 'exitMultiple';
  undiscounted: number;
  presentValue: number;
  /** Terminal PV as a share of enterprise value, 0-1. */
  shareOfEv: number;
  /** Set when the method could not be computed; presentValue is 0 in that case. */
  blocked?: string;
  /**
   * How the capitalised cashflow was arrived at. The steady-state adjustment
   * swings terminal value by 9-33%, so it has to be on the page rather than
   * buried in the engine - an invisible assumption that large defeats the point
   * of showing the workings. Only set for the Gordon method.
   */
  steadyState?: {
    /** Final explicit year FCFF, before any normalisation. */
    forecastFcff: number;
    /** After capex is reset to depreciation. */
    maintenanceFcff: number;
    /** g / ROIC of NOPAT, the cash growth requires. */
    reinvestment: number;
    /** What the perpetuity actually capitalises. */
    capitalisedFcff: number;
    roic: number;
    roicFromAccounts: boolean;
    reinvestmentRate: number;
  };
};

export type ValuationByMethod = {
  terminal: TerminalValue;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
};

export type DcfResult = {
  forecast: ForecastYear[];
  pvExplicit: number;
  gordon: ValuationByMethod;
  exitMultiple: ValuationByMethod;
  warnings: string[];
};

export type WaccBreakdown = {
  riskFreeRate: number;
  riskFreeSource: string;
  riskFreeAssumed: boolean;
  equityRiskPremium: number;
  rawBeta: number | null;
  beta: number;
  betaClamped: boolean;
  /** True when the Blume adjustment moved the reported beta toward the market. */
  betaAdjusted: boolean;
  costOfEquity: number;
  costOfDebt: number;
  costOfDebtSource: string;
  marketCap: number;
  totalDebt: number;
  equityWeight: number;
  debtWeight: number;
  taxRate: number;
  wacc: number;
};

export type ScenarioName = 'base' | 'bull' | 'bear' | 'consensus';
