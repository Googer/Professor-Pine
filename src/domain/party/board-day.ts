import { nextLocalMidnight } from '../time/local-day.js';
import { isRaid, isTimed, type Party } from './party.js';
import { startTimeOf } from './timed.js';

/**
 * When a party starts, as the region's board sorts it into today and coming up (plan 8R-9, B8):
 * a train's or meetup's start, a raid's hatch; null where it has none (a max battle, which is
 * always on now, or a raid or meetup without a time).
 */
export function partyStart(party: Party): number | null {
  if (isRaid(party)) return party.hatchTime;
  if (isTimed(party)) return startTimeOf(party);
  return null;
}

/**
 * Whether a party is under today on the region's board (plan 8R-9, B8): it has started, starts
 * before the next local midnight, or has no time set; anything else is coming up, every kind (an
 * elite raid's egg days ahead too). The one rule of the board and of `/status` alike.
 */
export function isToday(party: Party, now: number, zone: string): boolean {
  const start = partyStart(party);
  return start === null || start < nextLocalMidnight(now, zone);
}
