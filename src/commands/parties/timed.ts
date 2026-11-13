import type { ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Guard } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { answer as answerLate } from '../../discord/late-reply.js';
import { guildIdOf, isStaff, partyOf, regionChannelOf } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import {
  isMeetup,
  partyWord,
  type MeetupParty,
  type PartyProblem,
  type TimedParty,
  type TrainParty,
} from '../../domain/party/party.js';
import {
  nameOf,
  startTimeOf,
  tidyName,
  timesInOrder,
  withTimed,
} from '../../domain/party/timed.js';
import { dateExample } from '../../domain/time/clock-input.js';
import { resolvePartyTime } from '../../domain/time/party-time.js';
import { addDays, zoned } from '../../domain/time/zoned.js';
import { ACCESS_UNKNOWN, problemText } from '../../render/activity.js';
import type { MeetupChangeTold } from '../../render/meetup-safety.js';
import { clockOrDay, plain, timestamp, truncate } from '../../render/text.js';
import type { TimedChangeOutcome } from '../../services/timed-party-service.js';
import type { Member } from '../../services/attendance-service.js';
import { forumBarred } from '../../services/forum-access.js';
import { between } from '../raids/raid-input.js';
import { actingMember, partyOver } from './reply.js';

/**
 * How often one member may change the start of a timed party: as often as they may shout, since
 * it is the same thing to the others, a message that pings everybody who is signed up.
 */
export const START_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };

/**
 * How a time is to be typed for a train or meetup: a bare number is an hour there, not minutes.
 * The date of the example is three days from `now` (`dateExample`), so it never goes stale.
 */
export function timedTimeHint(now: number, zone: string): string {
  return (
    `Try \`6:15pm\`, \`${dateExample(now, zone)} 6:15pm\` (a date, month-day, and a time) or ` +
    '`in 30` (minutes from now).'
  );
}

/** What a member is told who makes a train or meetup in a region that has no forum yet. */
export function noForumYet(regionChannelId: string): string {
  return noForumWords(`<#${regionChannelId}>`);
}

/**
 * `noForumYet` with the region named as the caller names it (a mention on Discord, `#name` on
 * the live map).
 */
export function noForumWords(region: string): string {
  return (
    `The region ${region} has no forum yet. ` +
    'A moderator can create it with `/admin setup-forums`.'
  );
}

/**
 * What a member is told who would make a train or meetup in a region whose forum somebody keeps
 * them out of (plan 8Z-2), as a report says it (`REPORT_BARRED`): never by whom or why.
 */
export function newPartyBarred(word: string): string {
  return `You cannot make a ${word} here: you are kept out of the forum its post would be in.`;
}

/**
 * The guard of a command that makes a timed party (`/meetup`, `/train`). Everything that can be
 * known before the party is made is refused here, so that a use that made nothing does not
 * count towards the two a member has in a quarter of an hour: also a maker somebody keeps out of
 * the region's forum (`forumBarred`; one it is only hidden from makes it, and is let in).
 *
 * Such a command is used in the text channel of a region, or in a post of its forum that is no
 * party, and the party then belongs to that region. Not in the post of a party: a post is no
 * place to start another from (the legacy bot refused it in a party's channel too);
 * `fromARegion` says so. The region needs its forum, and the name must be one. `word` names
 * the kind of party that is made.
 */
export function requirePlaceForNew(word: string, fromARegion: string): Guard {
  return async (interaction, ctx) => {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (partyOf(interaction, ctx) || regionChannelId === undefined) {
      throw new UserError(fromARegion);
    }
    const region = ctx.regions.byChannel(regionChannelId);
    if (!region) throw new UserError(fromARegion);
    if (region.forumChannelId === null) throw new UserError(noForumYet(regionChannelId));
    // Not into a forum somebody keeps the maker out of (plan 8Z-2), as the map's routes ask
    // before they make one (`forumBarred`): the maker is signed up for it, and its post is theirs.
    let kept: boolean;
    try {
      kept = await forumBarred(
        (forumId, memberId) => ctx.partyService.memberAccess(forumId, memberId),
        region.forumChannelId,
        interaction.user.id,
      );
    } catch (err) {
      ctx.log.warn(
        { err, forum: region.forumChannelId, user: interaction.user.id },
        'could not ask Discord whether a member is kept out of the forum of a new party; refused',
      );
      throw new UserError(ACCESS_UNKNOWN);
    }
    if (kept) throw new UserError(newPartyBarred(word));
    if (
      interaction.isChatInputCommand() &&
      tidyName(interaction.options.getString('name') ?? '') === undefined
    ) {
      throw new UserError(problemText('bad-name', ctx.attendance.limits(), word));
    }
  };
}

/** What reading a time of a timed party asks of it: its kind, when it was made, its times. */
export interface TimedTimes {
  type: TimedParty['type'];
  createdAt: number;
  endTime: number | null;
  timed: { startTime: number | null };
}

/**
 * A timed party that is not made yet, as reading its start sees it (the map's form of a new
 * train, plan 8M-5): made now, without times.
 */
export function newPartyTimes(type: TimedParty['type'], now: number): TimedTimes {
  return { type, createdAt: now, endTime: null, timed: { startTime: null } };
}

/**
 * A time a member typed for a timed party that exists (a meetup or a train), or for a meetup
 * about to be made (`newPartyTimes`): when it
 * starts (`meet`) or when it ends. `'unset'` when the member asked to remove it (`cancel`,
 * `none`, `unset`). Throws a `UserError` for a text that is no time or lies outside what the
 * party can have: a start from now, an end from the start or from now, both within some three
 * months (`resolvePartyTime`, which reads a time without a date on the day of the start, or
 * of the end when the start gives none that is still to come, or on today's date, and never
 * into the past). The sibling of `typedPartyTime`, which is for a raid.
 *
 * A time without a date that fits on no day it could mean is refused with the day it was read
 * on, and with the way to name another: the member cannot see what "5" was taken for.
 */
export function typedTimedTime(
  ctx: Pick<AppContext, 'config'>,
  party: TimedTimes,
  parameter: 'meet' | 'end',
  text: string,
  now: number,
  zone: string,
): { at: number } | 'unset' {
  const { settings } = ctx.config;
  const result = resolvePartyTime({
    text,
    now,
    zone,
    parameter,
    partyType: party.type,
    // Asked of every request; nothing about a timed party depends on it.
    raidKind: 'standard',
    party: {
      creationTime: party.createdAt,
      endTime: party.endTime,
      startTime: party.timed.startTime,
    },
    settings,
  });
  if (result.kind === 'unset') return 'unset';
  if (result.kind === 'time') return { at: result.at };
  const word = partyWord(party);
  const what = parameter === 'meet' ? `the time the ${word} starts` : `the time the ${word} ends`;
  const typed = plain(truncate(text, 80));
  if (result.kind === 'out-of-range') {
    const range = `it must be ${between(result.first, result.last, now)}`;
    if (result.read === undefined) {
      throw new UserError(`"${typed}" cannot be ${what}: ${range}.`);
    }
    // The example shows the day after the one that was just refused, not that day again. In
    // its code span the text stands as typed: an escape (`10\.17`) would show there. A text
    // that was read as a clock time holds no backtick.
    const day = addDays(zoned(result.read, zone), 1);
    throw new UserError(
      `"${typed}" cannot be ${what}: I read it as ${timestamp(result.read, 'F')}, and ${range}. ` +
        `For another day, give the date first, month-day: \`${day.month}-${day.day} ${text.trim()}\`.`,
    );
  }
  throw new UserError(`I could not read "${typed}" as ${what}. ${timedTimeHint(now, zone)}`);
}

/**
 * The end typed for a timed party about to be made that starts at `startTime` (`/meetup end:`),
 * read as `/end` reads the end of one that exists (`typedTimedTime`, from the start): undefined
 * for no text or `none`. Throws a `UserError` for a text that is no time or lies too far ahead,
 * and for an end not after the start (`timesInOrder`) in `/end`'s words (`end-before-start`).
 */
export function typedNewEnd(
  ctx: Pick<AppContext, 'config' | 'attendance'>,
  type: TimedParty['type'],
  startTime: number,
  text: string | null,
  now: number,
  zone: string,
): number | undefined {
  if (text === null || text.trim() === '') return undefined;
  const party = { ...newPartyTimes(type, now), timed: { startTime } };
  const typed = typedTimedTime(ctx, party, 'end', text, now, zone);
  if (typed === 'unset') return undefined;
  if (!timesInOrder(startTime, typed.at)) {
    throw new UserError(problemText('end-before-start', ctx.attendance.limits(), type));
  }
  return typed.at;
}

/**
 * A time as an answer names it: with its date when it is not today (in `zone`, the party's
 * server's), and how long until then.
 */
function when(time: number, now: number, zone: string): string {
  return `${clockOrDay(time, now, zone)} (${timestamp(time, 'R')})`;
}

/**
 * What setting a train's times needs of the bot (`setTrainTimesAs`): the timed parties, the limits
 * of the words, the settings, and the party's server's zone (`PartyService.zoneOf`, plan 19A-2),
 * in which its times are read and said.
 */
export type TimesChanging = Pick<AppContext, 'timedParties' | 'attendance' | 'config'> & {
  partyService: Pick<AppContext['partyService'], 'zoneOf'>;
};

/**
 * What `/name`, `/meet`, `/cancel-meet`, `/end` (of a timed party) and `/info` need of the bot to
 * change a timed party (plan 8M-5M: the live map calls the same functions): `TimesChanging`, and
 * who tells the moderators of a change of an approved meetup (its times too since plan 8Z-2).
 */
export type TimedChanging = TimesChanging & Pick<AppContext, 'meetupSafety'>;

/**
 * What came of a change of a timed party, in the command's words: `ok`; `refused` with the
 * service's reason (the map tells a change drawn from what the party no longer is by it,
 * `changed-meanwhile`); `gone` for a party that has ended. A command throws what is not `ok` as
 * a `UserError` (`replyTimed`); the map answers it.
 */
export type TimedAnswer =
  | { kind: 'ok'; text: string }
  /** `went`: of two times asked at once (`setTimesAs`), which went through before the refusal. */
  | { kind: 'refused'; text: string; reason: PartyProblem; went?: readonly TimeAsked[] }
  | { kind: 'gone'; text: string };

/** The times of a timed party that can be changed together, each as its command does. */
export type TimeAsked = 'start' | 'end';

/** The answer of a change of `party`: `said` of what it came to, or the refusal, or over. */
export function timedAnswer<Extra, P extends TimedParty>(
  ctx: Pick<AppContext, 'attendance'>,
  party: Pick<TimedParty, 'type'>,
  outcome: TimedChangeOutcome<Extra, P>,
  said: (ok: Extract<TimedChangeOutcome<Extra, P>, { kind: 'ok' }>) => string,
): TimedAnswer {
  if (outcome.kind === 'gone') return { kind: 'gone', text: partyOver(party) };
  if (outcome.kind === 'refused') {
    return {
      kind: 'refused',
      text: problemText(outcome.reason, ctx.attendance.limits(), partyWord(party)),
      reason: outcome.reason,
    };
  }
  return { kind: 'ok', text: said(outcome) };
}

/**
 * Tells the member, privately, what came of a change to a timed party: the answer's words; a
 * refusal and a party that has ended are thrown as `UserError`s.
 */
export async function replyTimed(
  interaction: ChatInputCommandInteraction,
  answer: TimedAnswer,
): Promise<void> {
  if (answer.kind !== 'ok') throw new UserError(answer.text);
  // In the place of a late acknowledgement where there is one (`/meet`, `/cancel-meet`, `/end`).
  await answerLate(interaction, { content: answer.text });
}

/**
 * `/name` as the member: another name for the train or meetup, in its words; the caller has
 * asked whether they may (`meetupChangeRefusal`, for a meetup). The moderators are told of an
 * approved meetup's new name, in the background (`MeetupSafety.tellChange`). `drawn`: the name
 * the change was drawn from (the live map), refused when the party has another by now.
 */
export async function renameAs(
  ctx: TimedChanging,
  serverId: string,
  party: TimedParty,
  member: Member,
  text: string,
  drawn?: string,
): Promise<TimedAnswer> {
  const word = partyWord(party);
  const outcome = await ctx.timedParties.setName(party.id, member, text, drawn);
  if (outcome.kind === 'ok' && outcome.changed && isMeetup(outcome.party)) {
    ctx.meetupSafety.tellChange({
      serverId,
      party: outcome.party,
      by: member,
      changes: [{ kind: 'name', name: nameOf(outcome.party) }],
    });
  }
  return timedAnswer(ctx, party, outcome, (ok) => {
    const called = `**${plain(nameOf(ok.party))}**`;
    return ok.changed
      ? `This ${word} is now called ${called}.`
      : `This ${word} is called ${called} already.`;
  });
}

/** Who changes a timed party's times: the member, and whether they are staff (`isStaff`). */
export interface TimesBy {
  member: Member;
  /** An admin, a moderator or the bot's owner: a meetup's times are its maker's and theirs. */
  staff: boolean;
}

/** A time of a meetup that changed, as the moderators are to hear of it. */
interface ToldTime {
  /** The meetup as the change left it. */
  party: MeetupParty;
  change: MeetupChangeTold;
}

/** What came of setting one time: the answer, and what the moderators are to hear of it. */
interface TimeSet {
  answer: TimedAnswer;
  /** Only of a meetup, only when the time changed. */
  told?: ToldTime;
}

/** What the moderators are to hear of a time as a change left it: of a meetup that changed. */
function toldTime(outcome: TimedChangeOutcome, kind: TimeAsked): { told?: ToldTime } {
  if (outcome.kind !== 'ok' || !outcome.changed || !isMeetup(outcome.party)) return {};
  const { party } = outcome;
  const at = kind === 'start' ? startTimeOf(party) : party.endTime;
  return { told: { party, change: { kind, at } } };
}

/**
 * Tells the moderators of the times of an approved meetup that changed (plan 8Z-2), in one notice,
 * the start first, in the background (`MeetupSafety.tellChange`, as `renameAs` tells a name):
 * nobody of a train, of a time that stayed, or of a meetup that needed no approval.
 */
function tellTimes(
  ctx: Pick<AppContext, 'meetupSafety'>,
  serverId: string,
  member: Member,
  told: readonly ToldTime[],
): void {
  const last = told.at(-1);
  if (last === undefined) return;
  const changes = [
    ...told.filter(({ change }) => change.kind === 'start'),
    ...told.filter(({ change }) => change.kind !== 'start'),
  ].map(({ change }) => change);
  ctx.meetupSafety.tellChange({ serverId, party: last.party, by: member, changes });
}

/** The start set as `startAs` sets it, the moderators not told yet (`setTimesAs` tells once). */
async function setStart(
  ctx: TimesChanging,
  party: TimedParty,
  { member, staff }: TimesBy,
  time: number | null,
  now: number,
  drawn?: number | null,
): Promise<TimeSet> {
  const word = partyWord(party);
  const outcome = await ctx.timedParties.setStartTime(party.id, member, staff, time, drawn);
  const answer = timedAnswer(ctx, party, outcome, (ok) => {
    const start = startTimeOf(ok.party);
    const told = ok.changed && ok.others.length > 0 ? ' I am telling the others.' : '';
    if (start === null) {
      return ok.changed
        ? `This ${word} has no start time any more.${told}`
        : `This ${word} had no start time.`;
    }
    const zone = ctx.partyService.zoneOf(party);
    if (!ok.changed) return `This ${word} already starts at ${when(start, now, zone)}.`;
    return `This ${word} starts at ${when(start, now, zone)}.${told}`;
  });
  return { answer, ...toldTime(outcome, 'start') };
}

/** The end set as `endAs` sets it, the moderators not told yet (`setTimesAs` tells once). */
async function setEnd(
  ctx: TimesChanging,
  party: TimedParty,
  { member, staff }: TimesBy,
  text: string,
  now: number,
  drawn?: number | null,
): Promise<TimeSet> {
  const word = partyWord(party);
  const zone = ctx.partyService.zoneOf(party);
  const typed = typedTimedTime(ctx, party, 'end', text, now, zone);
  const outcome = await ctx.timedParties.setEndTime(
    party.id,
    member,
    staff,
    typed === 'unset' ? null : typed.at,
    drawn,
  );
  const answer = timedAnswer(ctx, party, outcome, (ok) => {
    const end = ok.party.endTime;
    if (end === null) {
      return ok.changed
        ? `This ${word} has no end time any more.`
        : `This ${word} had no end time.`;
    }
    return ok.changed
      ? `This ${word} ends at ${when(end, now, zone)}.`
      : `This ${word} already ends at ${when(end, now, zone)}.`;
  });
  return { answer, ...toldTime(outcome, 'end') };
}

/**
 * `/meet` and `/cancel-meet` as the member in a timed party: when it starts, for everybody, or
 * no start (`time` null), in their words. Who may is decided inside the store (`timesRefusal`: a
 * meetup's maker and staff; of a train who is signed up, and its maker); the caller has asked
 * whether a meetup's maker is blocked (`meetupChangeRefusal`). The others are told a moment
 * later, once the start has stood for a few seconds (`TimedPartyService`); the moderators are
 * told of an approved meetup's new start, in the background (`MeetupSafety.tellChange`).
 * `drawn`: the start the change was drawn from (the live map).
 */
export async function startAs(
  ctx: TimedChanging,
  serverId: string,
  party: TimedParty,
  by: TimesBy,
  time: number | null,
  now: number,
  drawn?: number | null,
): Promise<TimedAnswer> {
  const { answer, told } = await setStart(ctx, party, by, time, now, drawn);
  tellTimes(ctx, serverId, by.member, told ? [told] : []);
  return answer;
}

/**
 * `/end` as the member in a timed party: when it ends, from what they typed (`typedTimedTime`,
 * whose refusal is thrown as a `UserError`), or no end (`none`, `cancel`, `unset`), in its words.
 * Who may is decided inside the store (`timesRefusal`: a meetup's maker and staff; of a train
 * anybody in its post); the caller has asked whether a meetup's maker is blocked
 * (`meetupChangeRefusal`). The moderators are told of an approved meetup's new end, in the
 * background. `drawn`: the end the change was drawn from (the live map).
 */
export async function endAs(
  ctx: TimedChanging,
  serverId: string,
  party: TimedParty,
  by: TimesBy,
  text: string,
  now: number,
  drawn?: number | null,
): Promise<TimedAnswer> {
  const { answer, told } = await setEnd(ctx, party, by, text, now, drawn);
  tellTimes(ctx, serverId, by.member, told ? [told] : []);
  return answer;
}

/**
 * Times asked of a timed party together: the start as read (`null` removes it), the end as typed,
 * which is read from that start (`endAs`); left out, each stays.
 */
export interface TimesRead {
  start?: number | null;
  end?: string;
}

/** Why times do not lie in order as they would stand: none where they do. */
function timesProblem(
  ctx: Pick<TimesChanging, 'config' | 'partyService'>,
  party: TimedParty,
  { start, end }: TimesRead,
  now: number,
): 'start-after-end' | 'end-before-start' | undefined {
  const startsAt = start === undefined ? party.timed.startTime : start;
  const read = start === undefined ? party : withTimed(party, { startTime: start });
  const zone = ctx.partyService.zoneOf(party);
  const typed = end === undefined ? undefined : typedTimedTime(ctx, read, 'end', end, now, zone);
  const endsAt = typed === undefined ? party.endTime : typed === 'unset' ? null : typed.at;
  if (timesInOrder(startsAt, endsAt)) return undefined;
  return end === undefined ? 'start-after-end' : 'end-before-start';
}

/**
 * The times a member typed for a timed party, before anything counts or changes: the start as
 * `/meet` reads it, the end as `/end` does from that start. Throws a `UserError` for one it cannot
 * read and for two that would not lie in order, so that a refused pair changes nothing.
 */
export function readTimes(
  ctx: Pick<TimesChanging, 'config' | 'attendance' | 'partyService'>,
  party: TimedParty,
  typed: { start?: string; end?: string },
  now: number,
): TimesRead {
  const read: TimesRead = {};
  if (typed.start !== undefined) {
    const start = typedTimedTime(
      ctx,
      party,
      'meet',
      typed.start,
      now,
      ctx.partyService.zoneOf(party),
    );
    read.start = start === 'unset' ? null : start.at;
  }
  if (typed.end !== undefined) read.end = typed.end;
  const problem = timesProblem(ctx, party, read, now);
  if (problem !== undefined) {
    throw new UserError(problemText(problem, ctx.attendance.limits(), partyWord(party)));
  }
  return read;
}

/**
 * Sets a timed party's start and end together, the one way for a train's Manage… and a meetup's
 * editor: the end read from the start asked; times that would not lie in order refused before
 * anything changes; then the start as `startAs` sets it and the end as `endAs` does, the start
 * first, or the end first where the new start lies at or past the end as it is now, which would
 * refuse it (both moved later). The answer joins their words, the start's first whichever went
 * first, and so does the post (`together`: a new start's message says the end after it); a
 * refusal says what went through in the order it happened, then why (`went`). `told` gathers what
 * the moderators are to hear of a meetup's times that went through.
 */
async function setTimes(
  ctx: TimesChanging,
  party: TimedParty,
  by: TimesBy,
  asked: TimesRead,
  now: number,
  drawn: { start?: number | null; end?: number | null },
  told: ToldTime[],
): Promise<TimedAnswer> {
  const { start, end } = asked;
  const problem = timesProblem(ctx, party, asked, now);
  if (problem !== undefined) {
    return {
      kind: 'refused',
      text: problemText(problem, ctx.attendance.limits(), partyWord(party)),
      reason: problem,
      went: [],
    };
  }
  const steps: { time: TimeAsked; run: () => Promise<TimeSet> }[] = [
    ...(start === undefined
      ? []
      : [
          {
            time: 'start' as const,
            run: () => setStart(ctx, party, by, start, now, drawn.start),
          },
        ]),
    ...(end === undefined
      ? []
      : [
          {
            time: 'end' as const,
            run: () => {
              const read = start === undefined ? party : withTimed(party, { startTime: start });
              return setEnd(ctx, read, by, end, now, drawn.end);
            },
          },
        ]),
  ];
  const endFirst = end !== undefined && start !== undefined && !timesInOrder(start, party.endTime);
  if (endFirst) steps.reverse();
  const said: string[] = [];
  const went: TimeAsked[] = [];
  // Together, so that the post says the start before the end whichever went first (staging of
  // 2026-11-07): the end's line follows the start in the message that tells the others of it.
  return ctx.timedParties.together(party.id, async (): Promise<TimedAnswer> => {
    for (const { time, run } of steps) {
      const set = await run();
      const { answer } = set;
      if (set.told) told.push(set.told);
      said.push(answer.text);
      const text = said.join(' ');
      if (answer.kind === 'refused') return { ...answer, text, went };
      if (answer.kind === 'gone') return { ...answer, text };
      went.push(time);
    }
    return { kind: 'ok', text: (endFirst ? said.toReversed() : said).join(' ') };
  });
}

/**
 * Both times of a timed party in one call (`setTimes`), as the map's editor of a meetup and
 * Manage… of its post ask them: who may is decided inside the store for each (`timesRefusal`);
 * the caller has asked whether a meetup's maker is blocked (`meetupTimesCheck`). The moderators
 * are told of an approved meetup's new times in one notice, of what went through (also when the
 * other time was refused, or its reader threw), without waiting for the start's announcement.
 * `drawn`: the values the change was drawn from (the live map).
 */
export async function setTimesAs(
  ctx: TimedChanging,
  serverId: string,
  party: TimedParty,
  by: TimesBy,
  asked: TimesRead,
  now: number,
  drawn: { start?: number | null; end?: number | null } = {},
): Promise<TimedAnswer> {
  const told: ToldTime[] = [];
  try {
    return await setTimes(ctx, party, by, asked, now, drawn, told);
  } finally {
    // One notice for both times, whatever became of the second.
    tellTimes(ctx, serverId, by.member, told);
  }
}

/**
 * Both times of a train in one call, for its Manage… on Discord and on the map (`setTimes`, the
 * steps of `setTimesAs`): a train needs no approval, so there are no moderators to tell and no
 * server is asked for.
 */
export function setTrainTimesAs(
  ctx: TimesChanging,
  party: TrainParty,
  by: TimesBy,
  asked: TimesRead,
  now: number,
): Promise<TimedAnswer> {
  return setTimes(ctx, party, by, asked, now, {}, []);
}

/**
 * `/meet` and `/cancel-meet` in the post of a timed party: sets when it starts, for everybody,
 * or removes the start (`time` null), and answers (`startAs`).
 */
export async function changeStart(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TimedParty,
  time: number | null,
): Promise<void> {
  const by = { member: actingMember(interaction), staff: isStaff(interaction, ctx) };
  await replyTimed(
    interaction,
    await startAs(ctx, guildIdOf(interaction), party, by, time, Date.now()),
  );
}

/**
 * `/end` in the post of a timed party: sets when it ends from what the member typed, or removes
 * the end (`none`, `cancel`, `unset`), and answers (`endAs`).
 */
export async function changeEnd(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TimedParty,
  text: string,
): Promise<void> {
  const by = { member: actingMember(interaction), staff: isStaff(interaction, ctx) };
  await replyTimed(
    interaction,
    await endAs(ctx, guildIdOf(interaction), party, by, text, Date.now()),
  );
}
