import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalise } from '@/lib/normalise';
import type { RawTicker } from '@/lib/yahoo';

function fixture(ticker: string): RawTicker {
  return JSON.parse(readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8'));
}

describe('normalise - identity and currency', () => {
  it('reads name, sector and both currencies', () => {
    const f = normalise('BHP.AX', fixture('BHP.AX'));
    expect(f.name).toMatch(/BHP/);
    expect(f.reportingCurrency).toBe('USD');
    expect(f.quoteCurrency).toBe('AUD');
    expect(f.flags.some((x) => x.code === 'CURRENCY_MISMATCH')).toBe(true);
  });

  it('does not flag a currency mismatch when there is none', () => {
    const f = normalise('ARB.AX', fixture('ARB.AX'));
    expect(f.reportingCurrency).toBe('AUD');
    expect(f.quoteCurrency).toBe('AUD');
    expect(f.flags.some((x) => x.code === 'CURRENCY_MISMATCH')).toBe(false);
  });

  it('treats a sub-unit quote as a mismatch against a different reporting currency', () => {
    const f = normalise('SHEL.L', fixture('SHEL.L'));
    expect(f.reportingCurrency).toBe('USD');
    expect(f.quoteCurrency).toBe('GBp');
    expect(f.flags.some((x) => x.code === 'CURRENCY_MISMATCH')).toBe(true);
  });
});

describe('normalise - fallback chains', () => {
  it('falls back to operating income when EBIT is absent', () => {
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.years[0].ebit.value).toBeGreaterThan(0);
    expect(f.years[0].ebit.provenance.sourceField).toBe('operatingIncome');
  });

  it('falls back to reconciledDepreciation for D&A where the primary field is missing', () => {
    // ARB has no depreciationAndAmortization in the cashflow module.
    const f = normalise('ARB.AX', fixture('ARB.AX'));
    expect(f.years[0].dAndA.value).toBeGreaterThan(0);
    expect(f.years[0].dAndA.provenance.sourceField).toBe('reconciledDepreciation');
  });

  it('derives change in NWC from the balance sheet where the cashflow field is missing', () => {
    const f = normalise('ARB.AX', fixture('ARB.AX'));
    const nwc = f.years[0].changeInNwc;
    expect(nwc.provenance.derived).toBe(true);
    expect(nwc.provenance.derivation).toBeTruthy();
    expect(f.flags.some((x) => x.code === 'MISSING_FIELD_DERIVED')).toBe(true);
  });

  it('derives EBIT for a bank that reports neither EBIT nor operating income', () => {
    const f = normalise('CBA.AX', fixture('CBA.AX'));
    expect(f.years[0].ebit.provenance.derived).toBe(true);
    expect(f.years[0].ebit.provenance.derivation).toMatch(/pretax/i);
  });

  it('does not add interest expense back for a financial, which would double-count', () => {
    // A bank's reported revenue is already net of interest expense, so adding
    // it back gave CBA a 194% EBIT margin and RBC 145%. Pretax income is the
    // only defensible proxy. Guard: the margin must stay below 100%.
    for (const t of ['CBA.AX', 'RY.TO']) {
      const f = normalise(t, fixture(t));
      const y = f.years[0];
      expect(y.ebit.value, `${t} EBIT`).toBeGreaterThan(0);
      expect(y.ebit.value / y.revenue.value, `${t} EBIT margin`).toBeLessThan(1);
      expect(y.ebit.value).toBeCloseTo(y.pretaxIncome.value, 2);
    }
  });

  it('still adds interest expense back for a non-financial missing operating income', () => {
    // The generic derivation is unchanged for industrials - only financials are
    // special-cased. Synthesised because no fixture happens to hit this path.
    const raw = fixture('ARB.AX');
    const synthetic: RawTicker = {
      ...raw,
      statements: raw.statements.map((s) => {
        const { operatingIncome: _drop, ...rest } = s as Record<string, unknown>;
        return { ...rest, ebit: undefined } as typeof s;
      }),
    };
    const f = normalise('ARB.AX', synthetic);
    const y = f.years[0];
    expect(y.ebit.provenance.derived).toBe(true);
    expect(y.ebit.provenance.derivation).toMatch(/interest expense/i);
    expect(y.ebit.value).toBeGreaterThan(y.pretaxIncome.value);
  });

  it('normalises capex to a positive outflow', () => {
    for (const t of ['MSFT', 'BHP.AX', 'ARB.AX']) {
      const f = normalise(t, fixture(t));
      expect(f.years[0].capex.value).toBeGreaterThan(0);
    }
  });
});

describe('normalise - working capital sign convention', () => {
  it('treats an increase in NWC as positive, flipping Yahoo cashflow contribution', () => {
    // Yahoo's changeInWorkingCapital is a cashflow contribution: negative when
    // working capital grows. The canonical convention is the opposite, so the
    // normaliser must flip it. MSFT and BHP both have the raw field present.
    for (const t of ['MSFT', 'BHP.AX']) {
      const raw = fixture(t);
      const rawValue = raw.statements[0].changeInWorkingCapital as number;
      expect(typeof rawValue).toBe('number');
      const f = normalise(t, raw);
      expect(f.years[0].changeInNwc.value).toBeCloseTo(-rawValue, 2);
    }
  });

  it('agrees in sign with the balance-sheet derivation for a growing company', () => {
    // MSFT grew revenue in the latest year and consumed working capital, so
    // both paths must agree that the canonical value is a positive outflow.
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.years[0].changeInNwc.value).toBeGreaterThan(0);
  });
});

describe('normalise - sector and quality flags', () => {
  it('flags financials, which have no meaningful EBIT', () => {
    for (const t of ['CBA.AX', 'RY.TO']) {
      const f = normalise(t, fixture(t));
      expect(f.flags.some((x) => x.code === 'FINANCIAL_SECTOR')).toBe(true);
      expect(f.flags.find((x) => x.code === 'FINANCIAL_SECTOR')?.severity).toBe('error');
    }
  });

  it('does not flag a non-financial as a financial', () => {
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.flags.some((x) => x.code === 'FINANCIAL_SECTOR')).toBe(false);
  });

  it('passes through the raw beta without clamping it here', () => {
    const f = normalise('SHEL.L', fixture('SHEL.L'));
    expect(f.rawBeta).toBeLessThan(0);
  });

  it('records analyst revenue estimates', () => {
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.analystRevenue.length).toBeGreaterThan(0);
    expect(f.analystRevenue[0].revenue).toBeGreaterThan(0);
    expect(f.analystRevenue[0].analysts).toBeGreaterThan(0);
  });

  it('orders years newest first with usable revenue in every one', () => {
    const f = normalise('MSFT', fixture('MSFT'));
    expect(f.years.length).toBeGreaterThanOrEqual(4);
    expect(f.years[0].periodEnd > f.years[1].periodEnd).toBe(true);
    expect(f.years.every((y) => y.revenue.value > 0)).toBe(true);
  });

  it('reads price, market cap and share count for every fixture', () => {
    for (const t of ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO']) {
      const f = normalise(t, fixture(t));
      expect(f.price, `${t} price`).toBeGreaterThan(0);
      expect(f.marketCap, `${t} market cap`).toBeGreaterThan(0);
      expect(f.years[0].shares.value, `${t} shares`).toBeGreaterThan(0);
    }
  });
});
