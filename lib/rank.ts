import { EXCHANGE_RANK } from './markets';
import type { SearchHit } from './yahoo';

/**
 * Yahoo returns cross-listings ahead of primary lines: a search for
 * "Woolworths" puts Frankfurt, Hamburg, Johannesburg and Chi-X above WOW.AX.
 * Rank by exchange preference so the primary listing surfaces first.
 *
 * Unknown exchanges are DEMOTED, never dropped. An allowlist filter looked
 * right in unit tests and then returned an empty list for "woolworths" against
 * the live API, because none of the five hits Yahoo returned was on a
 * recognised exchange. A search that finds matches must always show them - the
 * ones we model well simply come first.
 */
export function rankHits(hits: SearchHit[]): SearchHit[] {
  return hits
    .map((hit, i) => {
      const rank = EXCHANGE_RANK.indexOf(hit.exchange);
      return { hit, rank: rank === -1 ? EXCHANGE_RANK.length : rank, i };
    })
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.hit);
}
