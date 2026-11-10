import type { Settings } from '../../config/settings.js';
import type { RaidBoss } from '../pogo/raid-bosses.js';
import type { RaidTier } from '../pogo/raid-tier.js';
import type { RaidDurationRules } from '../time/raid-durations.js';
import { sameDay, zoned } from '../time/zoned.js';
import { askGroupWhetherComplete, completeUnanswered } from './attendance.js';
import {
  attendeeOf,
  isMax,
  isRaid,
  isTimed,
  isTrain,
  type BattleParty,
  type GroupId,
  type MaxParty,
  type Party,
  type PartyGroup,
  type RaidBossRef,
  type RaidParty,
  type RaidStage,
  type TimedParty,
} from './party.js';
import { certainMoves, raidBossRef, raidStage, setBoss } from './raid.js';
import { startTimeOf } from './timed.js';

const MINUTE = 60_000;

export type TickSettings = Pick<
  Settings,
  | 'startClearTime'
  | 'deletionGraceTime'
  | 'deletionWarningTime'
  | 'trainOrMeetupDeletionWarningTime'
  | 'raidCompleteTimeout'
>;

export interface TickInput {
  now: number;
  /** When the previous tick ran; null for the first tick after a start. */
  previous: number | null;
  settings: TickSettings;
  rules: RaidDurationRules;
  /**
   * What an egg of this tier hatches as when nobody has said (`ctx.raidBosses.autoset`), with
   * the moves to preset; undefined when that is not certain.
   */
  autoset: (
    tier: RaidTier,
  ) => { boss: RaidBossRef; fastMove?: string | null; chargedMove?: string | null } | undefined;
}

/**
 * What the caller must do after a tick, besides saving the party and, when `render` is true,
 * showing the post anew.
 */
export type TickEffect =
  /**
   * The raid hatched or ended (or went back, after a time was corrected): post, tags, title.
   * Only a raid has stages; that a timed party has ended is only shown (`render`).
   */
  | { kind: 'stage'; from: RaidStage; to: RaidStage; bossSet: boolean }
  /** These present members of a group are asked whether they completed the raid. */
  | { kind: 'ask-complete'; group: GroupId; members: string[] }
  /** These members did not answer in time and count as having completed the raid. */
  | { kind: 'completed'; members: string[] }
  /** The post will be archived at `deletionTime`: say so in it. */
  | { kind: 'warn'; deletionTime: number }
  /** Archive the post and call `endParty`. Comes alone, on every tick until the party is ended. */
  | { kind: 'end' };

export interface TickResult<P extends Party = Party> {
  party: P;
  effects: TickEffect[];
  /**
   * The post must be shown anew: the tick changed the party, or the calendar day changed since
   * the previous tick (times are shown without a date only on the day itself), or this is the
   * first tick after a start, or the start or the end time of a timed party has passed since
   * the previous tick. False when the tick only asks for the end.
   */
  render: boolean;
}

/**
 * The `autoset` of a `TickInput` over `ctx.raidBosses`: the boss that tier's eggs hatch as, as
 * the reference to store, with the moves that are certain for it (`certainMoves`).
 */
export function tickAutoset(bosses: {
  autoset(tier: RaidTier): RaidBoss | undefined;
}): TickInput['autoset'] {
  return (tier) => {
    const found = bosses.autoset(tier);
    return found ? { boss: raidBossRef(found), ...certainMoves(found.entry) } : undefined;
  };
}

/**
 * Everything the clock does to a party, as one pure step: given the party and the time, the
 * party as it should be now and what the caller has to do about it.
 *
 * Every rule compares the time with what the party itself records (the stage its post shows, a
 * group's clear time, an attendee's time to answer, the archiving time), so one tick after the
 * bot was down for an hour applies everything that was missed, and a second tick straight after
 * it does nothing. What depends on the previous tick is only whether the post is shown anew:
 * for the change of the calendar day, and for the start and the end of a timed party; the first
 * tick after a start shows every post.
 *
 * A party that is due to be archived gets that and nothing else, whatever its kind. A raid then
 * has its stages, the meeting times of its groups and the questions to those who are present
 * (`raidTick`); a timed party has none of these (`timedTick`).
 */
export function partyTick<P extends Party>(party: P, input: TickInput): TickResult<P>;
export function partyTick(party: Party, input: TickInput): TickResult {
  if (party.status !== 'active') return { party, effects: [], render: false };
  if (!party.saved && party.deletionTime !== null && input.now >= party.deletionTime) {
    return { party, effects: [{ kind: 'end' }], render: false };
  }
  if (isRaid(party)) return raidTick(party, input);
  return isMax(party) ? maxTick(party, input) : timedTick(party, input);
}

/**
 * The party with its archiving scheduled, `warningMinutes` ahead, once the last moment it can
 * be going on is past by the grace time; the very same party while that is not so, or when it
 * is scheduled already or a moderator keeps the party.
 */
function scheduled<P extends Party>(party: P, input: TickInput, warningMinutes: number): P {
  const { now, settings } = input;
  const over = party.lastPossibleTime;
  if (
    party.saved ||
    party.deletionTime !== null ||
    over === null ||
    now <= over + settings.deletionGraceTime * MINUTE
  ) {
    return party;
  }
  return { ...party, deletionTime: now + warningMinutes * MINUTE };
}

/**
 * The member the first archive warning of a party is meant for, to be pinged when they allow it:
 * of a timed party that has no end time, the conductor of a train when it has one, otherwise
 * the member who made the party; and only somebody who is still signed up for it (who left it
 * is not called back to it). Nothing else tells them that their party is about to go. Nobody
 * for a party with an end time, and for a raid: those are over by times that everybody saw.
 *
 * Also the maker of a train who chose not to be named (`anonymous`): somebody must be asked,
 * and a ping at the end of the warning names nobody as the maker; they are in the list of
 * trainers like anybody who is signed up.
 */
export function warningAddressee(party: Party): string | undefined {
  if (!isTimed(party) || party.endTime !== null) return undefined;
  const lead = isTrain(party) ? (party.train.conductorId ?? party.createdById) : party.createdById;
  return attendeeOf(party, lead) ? lead : undefined;
}

/** Whether the calendar day changed since the previous tick; the first tick takes it as changed. */
function dayChanged(input: TickInput): boolean {
  const { zone } = input.rules;
  return input.previous === null || !sameDay(zoned(input.previous, zone), zoned(input.now, zone));
}

/**
 * The clock of a timed party: a meetup or a train. There is no egg that hatches, no meeting
 * time of a group to clear and nobody to ask whether they are done: only the archiving, which
 * goes by the end time, or by the day a party without one is given (`latestTime`), and is
 * announced `trainOrMeetupDeletionWarningTime` ahead, longer than for a raid.
 *
 * When the start or the end time passes, the post is shown anew (it says "started", then
 * "ended", from then on), and nothing is said. That is known by the previous tick and not
 * recorded in the party: the first tick after a start shows every post anyway.
 */
function timedTick(party: TimedParty, input: TickInput): TickResult<TimedParty> {
  const { now, previous, settings } = input;
  const effects: TickEffect[] = [];
  const current = scheduled(party, input, settings.trainOrMeetupDeletionWarningTime);
  if (current.deletionTime !== null && current !== party) {
    effects.push({ kind: 'warn', deletionTime: current.deletionTime });
  }
  const passed = (time: number | null): boolean =>
    time !== null && previous !== null && previous < time && now >= time;
  const shown = passed(startTimeOf(party)) || passed(party.endTime);
  return { party: current, effects, render: current !== party || shown || dayChanged(input) };
}

function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
  const { now } = input;
  const effects: TickEffect[] = [];
  let current = party;

  // The stage by the clock against the stage the post shows.
  const from = current.raid.stageSeen;
  const to = raidStage(current, now);
  if (to !== from) {
    let bossSet = false;
    if (from === 'egg' && current.raid.boss === null) {
      const hatchesAs = input.autoset(current.raid.tier);
      if (hatchesAs) {
        const change = { tier: current.raid.tier, ...hatchesAs };
        current = setBoss(current, change, input.rules, now).party;
        bossSet = true;
      }
    }
    current = { ...current, raid: { ...current.raid, stageSeen: to } };
    effects.push({ kind: 'stage', from, to, bossSet });
  }

  // Nobody can have completed an egg (a meeting time from before the hatch was corrected).
  current = battleClock(current, input, effects, (asked) => raidStage(asked, now) !== 'egg');
  // Times are shown without a date only on the day itself.
  return { party: current, effects, render: current !== party || dayChanged(input) };
}

/**
 * What the clock does to a battle besides its stages (a raid's and a max battle's alike): a
 * meeting time stays shown for a while after it passed, then the group is asked whether it is
 * done (unless `mayAsk` says nobody can be: an egg); who did not answer in time counts as done;
 * the archiving is scheduled and warned of as for a raid.
 */
function battleClock<P extends BattleParty>(
  party: P,
  input: TickInput,
  effects: TickEffect[],
  mayAsk: (party: P) => boolean,
): P {
  const { now, settings } = input;
  let current = party;
  for (let group of current.groups) {
    if (group.startTime === undefined || now <= group.startTime) continue;
    if (group.startClearTime === undefined) {
      group = { ...group, startClearTime: group.startTime + settings.startClearTime * MINUTE };
      current = withGroup(current, group);
    }
    if (group.startClearTime !== undefined && now > group.startClearTime) {
      const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
      current = withGroup(current, rest);
      if (!mayAsk(current)) continue;
      const asked = askGroupWhetherComplete(current, group.id, now, settings.raidCompleteTimeout);
      current = asked.party;
      if (asked.asked.length > 0) {
        effects.push({ kind: 'ask-complete', group: group.id, members: asked.asked });
      }
    }
  }

  const unanswered = completeUnanswered(current, now);
  if (unanswered.completed.length > 0) {
    current = unanswered.party;
    effects.push({ kind: 'completed', members: unanswered.completed });
  }

  const warned = scheduled(current, input, settings.deletionWarningTime);
  if (warned.deletionTime !== null && warned !== current) {
    current = warned;
    effects.push({ kind: 'warn', deletionTime: warned.deletionTime });
  }
  return current;
}

/**
 * The clock of a max battle (plan 8X-3; design 3.1): no hatch and no stage of its own; the
 * meeting times, the questions and the archiving as a raid's (`battleClock`, warned
 * `deletionWarningTime` ahead). When its end passes the post is shown anew ("Ended", by the
 * previous tick, as a timed party's end), and on a new day.
 */
function maxTick(party: MaxParty, input: TickInput): TickResult<MaxParty> {
  const { now, previous } = input;
  const effects: TickEffect[] = [];
  const current = battleClock(party, input, effects, () => true);
  const end = party.endTime;
  const ended = end !== null && previous !== null && previous < end && now >= end;
  return { party: current, effects, render: current !== party || ended || dayChanged(input) };
}

function withGroup<P extends BattleParty>(party: P, group: PartyGroup): P {
  return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
}
