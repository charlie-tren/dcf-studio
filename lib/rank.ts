import { EXCHANGE_RANK } from './markets';
import type { SearchHit } from './yahoo';

/**
 * Yahoo returns cross-listings before primary lines - a search for
 * "Woolworths" puts Frankfurt and Johannesburg ahead of WOW.AX. Rank by
 * exchange preference and drop exchanges the market registry cannot model.
 */
export function rankHits(hits: SearchHit[]): SearchHit[] {
  return hits
    .filter((h) => EXCHANGE_RANK.includes(h.exchange))
    .map((hit, i) => ({ hit, rank: EXCHANGE_RANK.indexOf(hit.exchange), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.hit);
}
