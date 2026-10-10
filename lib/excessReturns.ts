import type { Fundamentals } from './types';

/**
 * Excess-returns valuation for banks and insurers: book equity plus the present
 * value of what the book earns above the cost of equity.
 *
 * A free-cashflow model cannot value a financial. It has no meaningful operating
 * income, and capex and working capital do not mean what that model assumes, so
 * until 10/10/2026 these names were valued on pretax income as a proxy and then
 * declined as the wrong tool. Measured on 27 US, Australian and Canadian banks and
 * insurers that day, the proxy ran at a median 1.28x of price on the universe; this
 * runs at 0.77x with 22 of 27 inside 0.5-2.0x, in line with the non-financial
 * median of 0.67x.
 *
 * The drivers, all from the company's own history:
 * - ROE is net income to common over OPENING book equity, median across years.
 * - Book grows at ROE x retention, fading to terminal growth by the final year.
 * - ROE fades towards min(ROE, 20%). Holding it flat put two insurers at peak-cycle
 *   returns (Allstate 29%, Progressive 43%) in perpetuity, at 4.7x and 3.5x price;
 *   fading all the way to the cost of equity assumed no bank keeps any franchise
 *   and put the median at 0.57x. The cap tested best of the three.
 * - Terminal: the final year's excess return as a growing perpetuity.
 */
export const ROE_CEILING = 0.2;

export type ExcessReturnsYear = {
  year: number;
  openingBook: number;
  roe: number;
  excessReturn: number;
  presentValue: number;
};

export type ExcessReturns = {
  roe: number;
  payout: number;
  costOfEquity: number;
  terminalGrowth: number;
  bookValue: number;
  years: ExcessReturnsYear[];
  pvExcess: number;
  terminalExcess: number;
  terminalValue: number;
  terminalPresentValue: number;
  equityValue: number;
  valuePerShare: number;
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Null where the history cannot support the model: no book, no earnings, a loss. */
export function excessReturns(
  f: Fundamentals,
  costOfEquity: number,
  horizon: number,
  terminalGrowth: number
): ExcessReturns | null {
  const years = f.years;
  const book = years[0]?.bookEquity?.value ?? null;
  const shares = years[0]?.shares.value ?? 0;
  if (book === null || book <= 0 || shares <= 0) return null;
  if (costOfEquity <= terminalGrowth) return null;

  const roes: number[] = [];
  const payouts: number[] = [];
  for (let i = 0; i < years.length - 1; i++) {
    const ni = years[i].netIncomeCommon?.value;
    const opening = years[i + 1].bookEquity?.value;
    if (ni === undefined || opening === undefined || opening <= 0) continue;
    roes.push(ni / opening);
    const paid = years[i].dividendsPaid?.value;
    if (ni > 0 && paid !== undefined) payouts.push(paid / ni);
  }
  if (roes.length === 0) return null;
  const roe = median(roes);
  if (roe <= 0) return null;
  const payout = payouts.length > 0 ? Math.min(Math.max(median(payouts), 0), 1) : 0;

  const startGrowth = Math.min(Math.max(roe * (1 - payout), 0), 0.2);
  const longRunRoe = Math.min(roe, ROE_CEILING);
  let opening = book;
  let pvExcess = 0;
  const rows: ExcessReturnsYear[] = [];
  for (let t = 1; t <= horizon; t++) {
    const roeT = roe + (longRunRoe - roe) * (t / horizon);
    const excessReturn = (roeT - costOfEquity) * opening;
    const presentValue = excessReturn / (1 + costOfEquity) ** t;
    rows.push({ year: t, openingBook: opening, roe: roeT, excessReturn, presentValue });
    pvExcess += presentValue;
    opening *= 1 + startGrowth + (terminalGrowth - startGrowth) * (t / horizon);
  }
  const terminalExcess = (longRunRoe - costOfEquity) * opening;
  const terminalValue = terminalExcess / (costOfEquity - terminalGrowth);
  const terminalPresentValue = terminalValue / (1 + costOfEquity) ** horizon;
  const equityValue = book + pvExcess + terminalPresentValue;

  return {
    roe,
    payout,
    costOfEquity,
    terminalGrowth,
    bookValue: book,
    years: rows,
    pvExcess,
    terminalExcess,
    terminalValue,
    terminalPresentValue,
    equityValue,
    valuePerShare: equityValue / shares,
  };
}
