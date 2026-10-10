import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { declinedByModel, publishableRatio, guardCoverage } from '@/lib/batch';
import { buildValuation } from '@/lib/valuation';
import type { RawTicker } from '@/lib/yahoo';

/**
 * The batch that publishes this model's output for Crosscheck to join against.
 *
 * The rules here are all about what NOT to publish. A DCF run over 609 companies on
 * defaults produces a usable ORDERING and a bad fair value - measured 09/09/2026, the
 * median implied value is 0.57x the market price - so the consumer shows a rank. That
 * only works if the rows feeding the rank are ones the model could actually model.
 */
describe('publishableRatio', () => {
  it('returns the ratio of implied value to market price', () => {
    expect(publishableRatio(50, 100)).toBeCloseTo(0.5, 10);
    expect(publishableRatio(250, 100)).toBeCloseTo(2.5, 10);
  });

  it('refuses a result the page itself would disown', () => {
    // Exactly the IMPLAUSIBLE_RESULT rule, not a second threshold. A row the company's
    // own page flags as a modelling failure must not silently become a rank.
    expect(publishableRatio(1200, 100)).toBeNull();
    expect(publishableRatio(3.4, 170)).toBeNull();
  });

  it('keeps an ordinary disagreement, however large', () => {
    // A 9x or a 0.11x is a strong opinion, not a bug, and dropping those would trim
    // the ends off the very distribution the rank is built from.
    expect(publishableRatio(900, 100)).toBeCloseTo(9, 10);
    expect(publishableRatio(11, 100)).toBeCloseTo(0.11, 10);
  });

  it('refuses a negative or zero implied value', () => {
    // Legitimate for a loss-maker and useless in a ranked column: it is not "cheapest",
    // it is "the model says the equity is worthless", which is a different claim.
    expect(publishableRatio(-20, 100)).toBeNull();
    expect(publishableRatio(0, 100)).toBeNull();
  });

  it('refuses when there is no price to compare against', () => {
    expect(publishableRatio(50, 0)).toBeNull();
    expect(publishableRatio(50, NaN)).toBeNull();
    expect(publishableRatio(NaN, 100)).toBeNull();
  });
});

describe('declinedByModel', () => {
  it('declines only on an error flag, never on a warning or a note', () => {
    expect(declinedByModel([{ severity: 'error' }])).toBe(true);
    expect(declinedByModel([{ severity: 'warn' }, { severity: 'info' }])).toBe(false);
    expect(declinedByModel([])).toBe(false);
  });

  /**
   * The case that motivated it, through the real engine. A bank's page prints
   * "Wrong tool", and its ratio used to be published regardless: financials ran at
   * a median 1.28x against 0.61x for everything else, so they rode a number their
   * own source disowns into Crosscheck's top fifth at double their weight.
   */
  async function from(ticker: string) {
    const raw: RawTicker = JSON.parse(
      readFileSync(`tests/fixtures/${ticker.replace('.', '_')}.json`, 'utf8')
    );
    return buildValuation(ticker, { scenario: 'base', horizonYears: 5 }, {
      fetchTicker: async () => raw,
      fetchFxRate: async () => 1,
      resolveRiskFree: async () => ({ rate: 0.0462, source: 'test', assumed: false }),
    });
  }

  it('declines anything carrying an error flag', () => {
    expect(declinedByModel([{ severity: 'warn' }, { severity: 'error' }])).toBe(true);
    expect(declinedByModel([{ severity: 'warn' }, { severity: 'info' }])).toBe(false);
  });

  // Declined until 10/10/2026 as the wrong tool; now valued on excess returns.
  it.each(['CBA.AX', 'RY.TO'])('publishes %s, a bank valued on excess returns', async (t) => {
    const v = await from(t);
    expect(v.excessReturns).not.toBeNull();
    expect(declinedByModel(v.flags)).toBe(false);
  });

  it.each(['MSFT', 'BHP.AX', 'ARB.AX'])('publishes %s, which it values', async (t) => {
    expect(declinedByModel((await from(t)).flags)).toBe(false);
  });
});

describe('guardCoverage', () => {
  it('accepts a first run, which has nothing to compare against', () => {
    expect(guardCoverage(600, null)).toBeNull();
  });

  it('accepts ordinary drift in how many companies the model could value', () => {
    // Yahoo drops a statement, a company restates, an index rebalances. This moves by
    // tens every week and a guard that fires on that gets turned off.
    expect(guardCoverage(560, 600)).toBeNull();
  });

  it('refuses a collapse, and says what it saw', () => {
    // The failure it exists for: Yahoo rate-limits the run, most calls throw, and the
    // batch publishes forty rows. Forty rows is a working-looking file, and the
    // consumer would rank forty companies and show a column that looks fine.
    const why = guardCoverage(40, 600);
    expect(why).toContain('40');
    expect(why).toContain('600');
  });

  it('draws the line at half, the same place every other guard on the estate does', () => {
    expect(guardCoverage(300, 600)).toBeNull();
    expect(guardCoverage(299, 600)).not.toBeNull();
  });
});
