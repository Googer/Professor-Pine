import { localDay, nextLocalMidnight } from '../time/local-day.js';
import { isHideout, parseRocketKey, typeKeyOf } from './lineups.js';

/*
 * Rocket reports at a stop (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2, Matt's
 * answer 4): one per stop and day, so that a stop has either grunts or a hideout that day. Pure:
 * the decision is taken by the storage inside the transaction that holds the stop's row.
 */

/**
 * What becomes of a Rocket report at a stop: `report` (made, in the place of what stood there),
 * `refine` (plan 8R-4L, Matt's B2: a lineup of the grunt type that stands, over "not sure which"
 * or the other lineup; the standing report is changed in place, keeping its id and messages),
 * `already` (the same grunt stands: nothing is posted or sent), or `asks` (a grunt where a
 * hideout stands today: the member is asked first).
 */
export type RocketDecision = 'report' | 'refine' | 'already' | 'asks';

/**
 * What the decision reads of a Rocket report: its key (a `rocketKey`) and, of a lineup (plan
 * 8R-4L), its first slot in short (`RocketDetail.lineup`), which tells a lineup rotated within a
 * grunt's 30 minutes from the one that stands (review L5).
 */
export interface RocketWhoAt {
  subjectKey: string;
  rocket?: { lineup?: string };
}

/** What the decision reads of the report standing at the stop. */
export interface StandingRocket extends RocketWhoAt {
  id: number;
  kind: string;
  endsAt: number;
}

/**
 * The decision on a Rocket `report` (its key and lineup) at a stop where `standing` is
 * the stop's Rocket report that stands, of today or a grunt of yesterday past midnight (fix A2),
 * else today's ended one, at `now` (design 5.2):
 *
 * - nothing standing, or what stood has ended: reported;
 * - a hideout (a leader, Giovanni, the decoy) replaces whatever stands, the same hideout too;
 * - a grunt where the same grunt stands is reported already (Matt's answer 4); where another
 *   grunt stands it replaces it;
 * - of one grunt type (plan 8R-4L, S10): "not sure which" where a lineup stands is reported
 *   already (the lineup says more); a lineup where "not sure which" or the other lineup stands
 *   refines it in place (`refine`, Matt's B2), and so does the same lineup of another first slot
 *   (the lineups rotated within the grunt's time, review L5);
 * - a grunt where a hideout stands is asked about first, unless `replacing` is that very report
 *   (the member said Replace to it: a hideout reported meanwhile is asked about again).
 */
export function decideRocket(
  standing: StandingRocket | undefined,
  report: RocketWhoAt,
  now: number,
  replacing?: number,
): RocketDecision {
  if (!standing || standing.endsAt <= now) return 'report';
  const { subjectKey } = report;
  const who = parseRocketKey(subjectKey);
  if (!who || isHideout(who)) return 'report';
  const there = parseRocketKey(standing.subjectKey);
  if (there === undefined || !isHideout(there)) {
    // The same key of another first slot is the lineup rotated meanwhile (review L5).
    if (standing.subjectKey === subjectKey) {
      return standing.rocket?.lineup === report.rocket?.lineup ? 'already' : 'refine';
    }
    if (typeKeyOf(standing.subjectKey) !== typeKeyOf(subjectKey)) return 'report';
    return typeKeyOf(subjectKey) === subjectKey ? 'already' : 'refine';
  }
  return standing.id === replacing ? 'report' : 'asks';
}

/**
 * The day a Rocket report belongs to (design 5.2: hideouts keep their stop all day; events do
 * not change hideouts): `day:<yyyy-mm-dd>` of the local day of `time`, ending at the next local
 * midnight (Temporal in `zone`, a day of a change of the clocks included).
 */
export function rocketDay(time: number, zone: string): { key: string; end: number } {
  return { key: `day:${localDay(time, zone)}`, end: nextLocalMidnight(time, zone) };
}
