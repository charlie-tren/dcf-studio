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
        const rest = { ...(s as Record<string, unknown>) };
        delete rest.operatingIncome;
        delete rest.ebit;
        return rest as typeof s;
      }),
    };
    const f = normalise('ARB.AX', synthetic);
    const y = f.years[0];
    expect(y.ebit.provenance.derived).toBe(true);
    expect(y.ebit.provenance.derivation).toMatch(/interest expense/i);
    expect(y.ebit.value).toBeGreaterThan(y.pretaxIncome.value);
  });

  it('nets off short-term investments, not just cash on hand', () => {
    // Alphabet holds USD 30.7bn cash against USD 96.1bn of short-term
    // investments; MSFT is similar. Taking cashAndCashEquivalents first
    // understated cash by the securities balance and overstated net debt by the
    // same, costing roughly USD 8 a share on GOOGL. Broadest measure wins.
    const raw = fixture('MSFT');
    const s = raw.statements[0] as Record<string, unknown>;
    const broad = s.cashCashEquivalentsAndShortTermInvestments as number;
    const narrow = s.cashAndCashEquivalents as number;
    expect(broad).toBeGreaterThan(narrow);

    const f = normalise('MSFT', raw);
    expect(f.years[0].cash.value).toBeCloseTo(broad, 2);
    expect(f.years[0].cash.provenance.sourceField).toBe(
      'cashCashEquivalentsAndShortTermInvestments'
    );
  });

  it('falls back to plain cash where no securities balance is reported', () => {
    // CBA reports no combined line, so the narrow field is correct there.
    const f = normalise('CBA.AX', fixture('CBA.AX'));
    expect(f.years[0].cash.provenance.sourceField).toBe('cashAndCashEquivalents');
    expect(f.years[0].cash.value).toBeGreaterThan(0);
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

describe('normalise - non-ordinary lines', () => {
  it('flags a security with no market capitalisation as not ordinary equity', () => {
    // CBAPJ.AX is a CBA hybrid note. Yahoo types it EQUITY like the ordinary
    // line, so quoteType cannot separate them - but a listed ordinary share
    // always has a market cap and a hybrid has none. Left unflagged it was
    // handed CBA's entire A$28.7bn of group revenue and divided by the hybrid's
    // own share count, producing A$79.12 for a A$100 face-value instrument.
    const raw = fixture('CBA.AX');
    const hybrid: RawTicker = {
      ...raw,
      quote: { ...raw.quote, price: { ...raw.quote.price, marketCap: undefined } },
    };
    const f = normalise('CBAPJ.AX', hybrid);
    const flag = f.flags.find((x) => x.code === 'NOT_ORDINARY_EQUITY');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('error');
    expect(flag?.message).toMatch(/hybrid|preference|note/i);
  });

  it('does not flag an ordinary line that reports a market cap', () => {
    for (const t of ['MSFT', 'CBA.AX', 'BHP.AX', 'SHEL.L']) {
      const f = normalise(t, fixture(t));
      expect(f.marketCap, `${t} market cap`).toBeGreaterThan(0);
      expect(f.flags.some((x) => x.code === 'NOT_ORDINARY_EQUITY'), `${t}`).toBe(false);
    }
  });
});

describe('normalise - depreciation of productive assets, split out from D&A', () => {
  // The capex floor exists to catch a business that depreciates more than it
  // invests. That premise holds for PP&E and fails for amortisation of acquired
  // intangibles, which is purchase accounting running off an asset already
  // bought - nothing has to be spent to replace it. So the floor needs the
  // depreciation half on its own, and this is where it comes from.
  it('reads the reported depreciation line where there is one', () => {
    const f = normalise('AMD', fixture('AMD'));
    const y = f.years[0];
    expect(y.dAndA.value).toBeGreaterThan(2.5e9);
    expect(y.depreciation?.value).toBeGreaterThan(0);
    // AMD's D&A is roughly four times its depreciation. That gap is Xilinx.
    expect(y.depreciation!.value).toBeLessThan(y.dAndA.value / 3);
    expect(y.depreciation!.provenance.sourceField).toBe('depreciation');
  });

  it('leaves depreciation equal to D&A for a company with no acquired intangibles', () => {
    // Microsoft reports the same number in both fields. The split must be a
    // no-op here, or this change would move a valuation it has no business
    // moving.
    const f = normalise('MSFT', fixture('MSFT'));
    const y = f.years[0];
    expect(y.depreciation?.value).toBeCloseTo(y.dAndA.value, 0);
  });

  it('derives depreciation as D&A less intangible amortisation where the line is missing', () => {
    // BHP's oldest recorded year reports depreciationAndAmortization but no
    // depreciation line, and the years around it do report one - so the derived
    // branch has to produce something consistent with its neighbours rather
    // than a hole.
    const f = normalise('BHP.AX', fixture('BHP.AX'));
    const withValue = f.years.filter((y) => y.depreciation !== null);
    expect(withValue.length).toBeGreaterThan(0);
    for (const y of withValue) expect(y.depreciation!.value).toBeLessThanOrEqual(y.dAndA.value);
  });

  it('reports null rather than guessing when neither the line nor the split exists', () => {
    // Mesoblast reports depreciationAndAmortization and nothing else. Inventing
    // a depreciation figure here would put a number the accounts do not contain
    // underneath a capex decision.
    const f = normalise('MSB.AX', fixture('MSB.AX'));
    expect(f.years[0].depreciation).toBeNull();
  });

  it('never returns a negative depreciation from the derived branch', () => {
    for (const t of ['MSFT', 'BHP.AX', 'ARB.AX', 'CBA.AX', 'SGP.AX', 'MSB.AX', 'SHEL.L', 'RY.TO', 'AMD']) {
      const f = normalise(t, fixture(t));
      for (const y of f.years) {
        if (y.depreciation) expect(y.depreciation.value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the price carries its date', () => {
  // Printed in the model strip beside the accounts' year end, so a reader can see
  // the two inputs are of different ages.
  it('reads the trading day off the quote', () => {
    const raw = JSON.parse(readFileSync('tests/fixtures/MSFT.json', 'utf8'));
    expect(normalise('MSFT', raw).priceAsOf).toBe('2026-07-29');
  });
});
