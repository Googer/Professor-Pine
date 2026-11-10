import { maxEnded } from './max.js';
import { isBattle, isMax, isRaid, type Party } from './party.js';
import { raidStage } from './raid.js';
import { timedOver } from './timed.js';

/**
 * Whether a party is over by the clock, whatever its kind: a raid whose stage is `ended`
 * (`raidStage`), a max battle whose end has come (`maxEnded`), a train or meetup whose end time
 * has passed (`timedOver`; one without an end never is). Its post stands until the scheduler
 * archives it, a while later.
 */
export function overByClock(party: Party, now: number): boolean {
  if (isRaid(party)) return raidStage(party, now) === 'ended';
  return isMax(party) ? maxEnded(party, now) : timedOver(party, now);
}

/**
 * Whether a party takes no newcomers any more although its post still stands (Matt, 2026-11-07):
 * a raid or a max battle over by the clock. Who is signed up goes on until the post is archived
 * (`AttendanceService`). A train or meetup never is: its members set its end, and it often runs
 * late.
 */
export function closedToNewcomers(party: Party, now: number): boolean {
  return isBattle(party) && overByClock(party, now);
}
