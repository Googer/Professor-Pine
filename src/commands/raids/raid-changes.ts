import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import type { RaidParty } from '../../domain/party/party.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { manageWords, type RaidChangeAsked } from '../../domain/web/raid-manage.js';
import { matchNamed } from '../../domain/search/word-match.js';
import { postsRefusedMoveWords, problemText } from '../../render/activity.js';
import { isFarOff, plain, timestamp, truncate } from '../../render/text.js';
import type { Member } from '../../services/attendance-service.js';
import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
import { partyOver } from '../parties/reply.js';
import { reportedBoss, typedPartyTime, type RaidReading } from './raid-input.js';

/**
 * The changes of a raid that `/hatch`, `/end`, `/boss` and `/moveset` make, as one function each
 * that the commands and the live map (plan 8M-4) call alike: what the member typed is read with
 * the command's reader (a `UserError` for what it refuses), the change goes through
 * `RaidChangeService` as the member, and the answer is the command's words. Mentions and
 * timestamps are Discord's; the map makes them text.
 */

/** What changing a raid needs: the readers, the service, the limits and how a raid is shown. */
export type RaidChanging = RaidReading & Pick<AppContext, 'raids' | 'attendance' | 'partyService'>;

/**
 * What came of a change, in the command's words: `ok` with the raid as it is stored now;
 * `refused` (the service's refusal) and `gone` (the raid ended), which a command throws.
 */
export type RaidChangeAnswer =
  { kind: 'ok'; text: string; party: RaidParty } | { kind: 'refused' | 'gone'; text: string };

/** How a post is named in an answer: a mention on Discord; nothing where it cannot be linked. */
export type PostNamer = (postId: string) => string | undefined;

const mention: PostNamer = (postId) => `<#${postId}>`;

/**
 * `It hatches at <t> and ends at <t>.`: the times of a raid as an answer names them (`hatched`,
 * `ended` for what is past), with the day when they are not within half a day of now (an
 * elite raid, or a clock time that was read as another day than the member meant).
 */
export function timesText(party: RaidParty, now: number = Date.now()): string {
  const { hatchTime, endTime } = party;
  if (hatchTime === null || endTime === null) return 'It has no times yet.';
  const style = isFarOff(hatchTime, now) ? 'f' : 't';
  return (
    `It ${hatchTime > now ? 'hatches' : 'hatched'} at ${timestamp(hatchTime, style)} and ` +
    `${endTime > now ? 'ends' : 'ended'} at ${timestamp(endTime, style)}.`
  );
}

/**
 * Why a change of a raid was refused, in the posts' words; a move into a forum where the bot may
 * not make posts names the forum and what it lacks there (plan 8S-3).
 */
export function raidRefusalText(
  outcome: Extract<RaidChangeOutcome, { kind: 'refused' }>,
  limits: { maxNumber: number },
): string {
  return outcome.refused === undefined
    ? problemText(outcome.reason, limits, 'raid')
    : postsRefusedMoveWords(outcome.refused, (id) => `<#${id}>`);
}

/**
 * The answer to a change of a raid: `said` when it changed, `same` when the raid already was so;
 * a refusal in the posts' words, for `gym-taken` with the post of the raid that holds the gym
 * where `post` names it; a raid that has ended as over.
 */
export function raidChangeAnswer(
  limits: { maxNumber: number },
  outcome: RaidChangeOutcome,
  said: (party: RaidParty) => string,
  same: string,
  post: PostNamer = mention,
): RaidChangeAnswer {
  if (outcome.kind === 'gone') return { kind: 'gone', text: partyOver({ type: 'raid' }) };
  if (outcome.kind === 'refused') {
    const postId = outcome.other?.forumPostId;
    const named = postId ? post(postId) : undefined;
    return {
      kind: 'refused',
      text:
        raidRefusalText(outcome, limits) + (named === undefined ? '' : ` Its post is ${named}.`),
    };
  }
  return {
    kind: 'ok',
    text: outcome.changed ? said(outcome.party) : same,
    party: outcome.party,
  };
}

/**
 * Sets the hatch or the end time of a raid from what a member typed (`/hatch`, `/end`, the "Set
 * time" form, the map). Throws a `UserError` for a text that is no time for this raid, or that
 * asks to remove a time.
 */
export async function changeRaidTime(
  ctx: RaidChanging,
  party: RaidParty,
  member: Member,
  parameter: 'hatch' | 'end',
  text: string,
  now: number = Date.now(),
  post?: PostNamer,
): Promise<RaidChangeAnswer> {
  const typed = typedPartyTime(ctx, party, parameter, text, now);
  if (typed === 'unset') {
    throw new UserError('A raid keeps its times once it has them. Give the right time instead.');
  }
  const outcome =
    parameter === 'hatch'
      ? await ctx.raids.setHatchTime(party.id, member, typed.at)
      : await ctx.raids.setEndTime(party.id, member, typed.at);
  return raidChangeAnswer(
    ctx.attendance.limits(),
    outcome,
    (changed) => `Done. ${timesText(changed, now)}`,
    `Nothing changed. ${timesText(party, now)}`,
    post,
  );
}

/**
 * Sets the boss of a raid, or the tier of its egg, from what a member typed or picked (`/boss`,
 * the map), read as `/raid` reads it. Throws a `UserError` for what names no boss or tier.
 */
export async function changeRaidBoss(
  ctx: RaidChanging,
  party: RaidParty,
  member: Member,
  text: string,
  post?: PostNamer,
): Promise<RaidChangeAnswer> {
  const reported = reportedBoss(ctx, text);
  const outcome = await ctx.raids.setBoss(party.id, member, reported);
  return raidChangeAnswer(
    ctx.attendance.limits(),
    outcome,
    () =>
      reported.boss === null
        ? `This is now: ${reported.label}.`
        : `The boss is now ${reported.label}.`,
    `This raid already is: ${reported.label}.`,
    post,
  );
}

export type MoveKind = 'quick' | 'charge';

const KIND_WORDS: Readonly<Record<MoveKind, string>> = { quick: 'fast', charge: 'charged' };

/** The ids of the moves of one kind that a Pokémon can have as a raid boss. */
export function movesOf(entry: PokemonEntry, kind: MoveKind): readonly string[] {
  return kind === 'quick' ? entry.fastMoves : entry.chargedMoves;
}

/**
 * The move a text names among those the boss has: a choice of the list (a move id), or typed
 * text that fits exactly one of them. Throws a `UserError` that lists the moves otherwise.
 */
function typedMove(ctx: RaidReading, entry: PokemonEntry, kind: MoveKind, text: string): string {
  const { catalogue } = ctx.gameData;
  const ids = movesOf(entry, kind);
  const picked = text.trim();
  if (ids.includes(picked)) return picked;
  const named = ids.map((id) => ({ value: id, names: [catalogue.move(id)?.name ?? id] }));
  const fits = matchNamed(named, picked);
  const [only] = fits;
  if (only !== undefined && fits.length === 1) return only;
  const names = named.map((move) => plain(move.names[0] ?? move.value)).join(', ');
  throw new UserError(
    `"${plain(truncate(picked, 80))}" is not one ${KIND_WORDS[kind]} move of ${plain(entry.name)}. ` +
      `Its ${KIND_WORDS[kind]} moves are: ${names}.`,
  );
}

/**
 * Sets one or both moves of a raid's boss from what a member typed or picked (`/moveset`, the
 * map); null leaves a move as it is. Throws a `UserError` without a move, without a boss the game
 * master knows, or for a move the boss does not have.
 */
export async function changeRaidMoves(
  ctx: RaidChanging,
  party: RaidParty,
  member: Member,
  quick: string | null,
  charge: string | null,
  post?: PostNamer,
): Promise<RaidChangeAnswer> {
  if (quick === null && charge === null) {
    throw new UserError('Give the fast move, the charged move, or both.');
  }
  const shown = ctx.partyService.view(party).boss;
  if (!shown) throw new UserError(problemText('no-boss', ctx.attendance.limits(), 'raid'));
  const { entry } = shown;
  if (!entry) throw new UserError(`I do not know the moves of ${plain(shown.name)} yet.`);
  const moves = {
    ...(quick === null ? {} : { fastMove: typedMove(ctx, entry, 'quick', quick) }),
    ...(charge === null ? {} : { chargedMove: typedMove(ctx, entry, 'charge', charge) }),
  };
  const outcome = await ctx.raids.setMoveset(party.id, member, moves);
  const name = (id: string | null): string =>
    plain((id && ctx.gameData.catalogue.move(id)?.name) ?? '????');
  return raidChangeAnswer(
    ctx.attendance.limits(),
    outcome,
    (changed) =>
      `The moves are now ${name(changed.raid.fastMove)} / ${name(changed.raid.chargedMove)}.`,
    'The raid already had those moves.',
    post,
  );
}

/**
 * One change of a raid as its command makes it (`changeRaidBoss`, `changeRaidTime`,
 * `changeRaidMoves`): the one path of the map's `POST /api/raids/<id>/<change>` and of Manage… of
 * the post (plan 8M-21). Throws a `UserError` for what the command's reader refuses.
 */
export function raidChangeAs(
  ctx: RaidChanging,
  party: RaidParty,
  member: Member,
  asked: RaidChangeAsked,
  now: number,
  post?: PostNamer,
): Promise<RaidChangeAnswer> {
  switch (asked.change) {
    case 'hatch':
    case 'end':
      return changeRaidTime(ctx, party, member, asked.change, asked.time, now, post);
    case 'boss':
      return changeRaidBoss(ctx, party, member, asked.boss, post);
    case 'moves':
      return changeRaidMoves(ctx, party, member, asked.quick, asked.charge, post);
  }
}

/**
 * How a Submit of Manage… counts each change (review M1: in its command's window, as the map's
 * route counts it): what gives the use back, or the refusal of a full window in its words.
 */
export type RaidChangeCount = (
  change: RaidChangeAsked,
) => { giveBack(now: number): void } | { refusal: string };

/**
 * The changes a Submit of Manage… asks for (`raidChangesAsked`), made in turn as the map's form
 * sends them (`raidChangeAs`), each on the raid as the change before left it, and each counted as
 * the map's route counts it (`count`: a full window stops there; an unexpected error or a refusal
 * that is none of the member's doing gives the use back, a refusal stays counted): the words of
 * each joined (`manageWords`); a refusal, a raid that ended or what a reader refused stops there,
 * its words after what went through. `NOTHING_CHANGED` when nothing was asked.
 */
export async function manageRaidAs(
  ctx: RaidChanging,
  party: RaidParty,
  member: Member,
  asked: readonly RaidChangeAsked[],
  now: number,
  count: RaidChangeCount,
  clock: () => number = Date.now,
  post?: PostNamer,
): Promise<{ kind: 'ok' | 'refused' | 'gone'; text: string; went: number }> {
  const said: string[] = [];
  let current = party;
  const stop = (kind: 'refused' | 'gone', text: string) => ({
    kind,
    text: manageWords([...said, text]),
    went: said.length,
  });
  for (const change of asked) {
    const counted = count(change);
    if ('refusal' in counted) return stop('refused', counted.refusal);
    let answer: RaidChangeAnswer;
    try {
      answer = await raidChangeAs(ctx, current, member, change, now, post);
    } catch (err) {
      if (!(err instanceof UserError) || err.givesBack) counted.giveBack(clock());
      if (!(err instanceof UserError)) throw err;
      return stop('refused', err.message);
    }
    if (answer.kind !== 'ok') return stop(answer.kind, answer.text);
    said.push(answer.text);
    current = answer.party;
  }
  return { kind: 'ok', text: manageWords(said), went: said.length };
}

/** A move as a pick list offers it: its id (what `/moveset` takes) and its name. */
export interface MoveChoice {
  id: string;
  name: string;
}

/**
 * The moves the boss of a raid can have, as `/moveset` offers them: undefined while the raid has
 * no boss the game master knows.
 */
export function bossMoves(
  ctx: Pick<RaidChanging, 'partyService' | 'gameData'>,
  party: RaidParty,
): { boss: string; fast: MoveChoice[]; charged: MoveChoice[] } | undefined {
  const entry = ctx.partyService.view(party).boss?.entry;
  if (!entry) return undefined;
  const choices = (kind: MoveKind): MoveChoice[] =>
    movesOf(entry, kind).map((id) => ({
      id,
      name: ctx.gameData.catalogue.move(id)?.name ?? id,
    }));
  return { boss: entry.name, fast: choices('quick'), charged: choices('charge') };
}
