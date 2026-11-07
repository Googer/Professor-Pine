import { maxEnded } from './max.js';
import { isMax, isRaid, type Party } from './party.js';
import { raidStage } from './raid.js';
import { timedOver } from './timed.js';

/**
 * Whether a party is over by the clock, whatever its kind: a raid whose stage is `ended`
 * (`raidStage`), a max battle whose end has come (`maxEnded`), a train or meetup whose end time
 * has passed (`timedOver`; one without an end never is). Its post stands until the scheduler
 * archives it, a while later; meanwhile what members do there is refused as for a party that
 * has ended (`AttendanceService`).
 */
export function overByClock(party: Party, now: number): boolean {
  if (isRaid(party)) return raidStage(party, now) === 'ended';
  return isMax(party) ? maxEnded(party, now) : timedOver(party, now);
}
