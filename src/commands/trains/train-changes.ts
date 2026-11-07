import { setTimesAs, typedTimedTime, type TimeAsked, type TimesRead } from '../parties/timed.js';
import type { Throttle } from '../../discord/throttle.js';
import type { AppContext } from '../../app-context.js';
import {
  attendeeOf,
  groupOf,
  isTrain,
  MAX_ROUTE_STOPS,
  memberOf,
  membersWhere,
  type TrainParty,
} from '../../domain/party/party.js';
import { RaidPrivacy } from '../../domain/party/status.js';
import type { GroupId, PartyProblem, TrainAtEnd, TrainKind } from '../../domain/party/party.js';
import { sameStop, type StopRef } from '../../domain/party/stops.js';
import {
  currentStop,
  mayNotMove,
  mayNotSplit,
  routeFinished,
  splitDrawn,
  type ConductorSeen,
  type TrainMove,
} from '../../domain/party/train.js';
import { noPostWords, problemText } from '../../render/activity.js';
import { groupWords } from '../../render/party-controls.js';
import { stopInWords, stopsFrom } from '../../render/train-stops.js';
import { count, memberText, plain } from '../../render/text.js';
import type { TrainPlaces } from '../../render/train-post.js';
import {
  atEndSentence,
  trainKindSentence,
  whereText,
  type TrainSurface,
} from '../../render/train-words.js';
import type { Member } from '../../services/attendance-service.js';
import type { TrainOutcome } from '../../services/party-service.js';
import type { TrainChangeOutcome, TrainManage } from '../../services/train-service.js';
import type { SavedRoute } from '../../db/repositories/saved-route-repository.js';
import { MAX_SAVED_ROUTES } from '../../db/repositories/saved-route-repository.js';
import { partyOver } from '../parties/reply.js';
import { noForumWords } from '../parties/timed.js';
import type { ReportNames } from '../raids/report.js';
import { IN_SETTINGS, IN_SETTINGS_ON_DISCORD } from '../../render/settings-words.js';

/**
 * What `/train`, `/route`, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond
 * reading their options, as one function each that the commands and the live map (plan 8M-5)
 * call alike: the change goes through `TrainService` (or `PartyService.createTrain`) as the
 * member, and the answer is the command's words. Mentions and markdown are Discord's; the map
 * makes them text (`pageWords`). A command throws a refusal and a train that has ended as a
 * `UserError`; the map answers them.
 */

/**
 * What changing a train needs: the train service, the limits of the words, the gyms and the kept
 * Wayspots (the stops of a route, plan 8X-4).
 */
export type TrainChanging = Pick<AppContext, 'trains' | 'attendance' | 'gyms' | 'wayspots'>;

/** What making a train needs: the members' settings, the party service, the limits of words. */
export type TrainStarting = Pick<AppContext, 'users' | 'partyService' | 'attendance'>;

/**
 * What came of a change, in the command's words: `ok`; `refused` with the service's reason (the
 * map tells a press against a train that moved on or a route that changed by it); `gone` for a
 * train that has ended.
 */
export type TrainAnswer =
  | { kind: 'ok'; text: string }
  /**
   * `applied`: part of what was asked went through before the refusal (Manage…'s times); `went`:
   * which of the times did, whose uses of their commands stay counted.
   */
  | {
      kind: 'refused';
      text: string;
      reason?: PartyProblem;
      applied?: true;
      went?: readonly TimeAsked[];
    }
  | { kind: 'gone'; text: string };

/** A train that has ended, as the commands answer it. */
const TRAIN_OVER = partyOver({ type: 'train' });

/** A train with the stops of its route, for what says where it is. */
export function trainPlaces(
  ctx: Pick<AppContext, 'gyms' | 'wayspots'>,
  party: TrainParty,
): TrainPlaces {
  return { party, stop: stopsFrom(ctx.gyms, ctx.wayspots) };
}

/** Why a train refused, as a sentence. */
export function trainRefusal(
  ctx: { attendance: Pick<AppContext['attendance'], 'limits'> },
  reason: Parameters<typeof problemText>[0],
): string {
  return problemText(reason, ctx.attendance.limits(), 'train');
}

/** A stop as an answer names it: `**The Stacks**`, `**Gazebo** (Power Spot)`. */
function named(ctx: Pick<AppContext, 'gyms' | 'wayspots'>, ref: StopRef): string {
  return stopInWords(stopsFrom(ctx.gyms, ctx.wayspots)(ref));
}

/** The answer of a change of a train: `said` of what it came to, or the refusal, or over. */
function answerOf<Extra>(
  ctx: Pick<AppContext, 'attendance'>,
  outcome: TrainChangeOutcome<Extra>,
  said: (ok: Extract<TrainChangeOutcome<Extra>, { kind: 'ok' }>) => string,
): TrainAnswer {
  if (outcome.kind === 'gone') return { kind: 'gone', text: TRAIN_OVER };
  if (outcome.kind === 'refused') {
    return { kind: 'refused', text: trainRefusal(ctx, outcome.reason), reason: outcome.reason };
  }
  return { kind: 'ok', text: said(outcome) };
}

/** A train to make: its name, the region it is made in, its mode, and when it starts. */
export interface TrainStart {
  name: string;
  /** The region channel it is made in: the post goes into that region's forum. */
  regionChannelId: string;
  atEnd?: TrainAtEnd;
  /** What it goes to (plan 8X-4); undefined: raids. */
  kind?: TrainKind;
  /**
   * When it starts, read by `typedTimedTime` (`/train start:`, the map); undefined: no start time yet. The train
   * is made with it, so that its post and the news of a new train say it from the first.
   */
  start?: number;
}

/** What came of making a train: `made` with the train, or a refusal in `/train`'s words. */
export type TrainStartAnswer =
  | { kind: 'made'; party: TrainParty; text: string }
  /** `givesBack`: none of the maker's doing (the post could not be made; plan 8S-3). */
  | { kind: 'refused'; text: string; givesBack?: true };

/**
 * What `/train` and the map add for a maker who is not signed up for the train they made (their
 * status in `/settings` is None); `where` says where to sign up, `settings` where that status
 * is set, as Discord says it unless a page says it (`IN_SETTINGS_ON_DISCORD`).
 */
export function notSignedUpWords(where: string, onPage = false): string {
  const status = onPage
    ? `your status is None (${IN_SETTINGS_ON_DISCORD})`
    : `your status ${IN_SETTINGS} is None`;
  return (
    `You are not signed up for it, since ${status}: sign up ${where} to move the train or ` +
    'to be its conductor.'
  );
}

/**
 * Makes a train as the member, as `/train` does: signed up as their automatic status says,
 * named unless their privacy is Anonymous, with its start when one is given (the map's form).
 * `names` says how the answer names the post and a region's channel (mentions on Discord; on
 * the map no post and a channel by its name). The text of `made` says that the train is made
 * and where its post is; what to do next is the caller's.
 */
export async function startTrainAs(
  ctx: TrainStarting,
  member: Member,
  request: TrainStart,
  names: ReportNames,
): Promise<TrainStartAnswer> {
  const { id, ...creator } = member;
  const settings = await ctx.users.get(id);
  const outcome: TrainOutcome = await ctx.partyService.createTrain({
    name: request.name,
    creatorId: id,
    creator,
    regionChannelId: request.regionChannelId,
    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
    autoStatus: settings.autoStatus,
    ...(request.atEnd === undefined ? {} : { atEnd: request.atEnd }),
    ...(request.kind === undefined ? {} : { kind: request.kind }),
    ...(request.start === undefined ? {} : { startTime: request.start }),
  });
  switch (outcome.kind) {
    case 'bad-name':
      return { kind: 'refused', text: problemText('bad-name', ctx.attendance.limits(), 'train') };
    case 'cannot-make':
      return {
        kind: 'refused',
        text: problemText(outcome.reason, ctx.attendance.limits(), 'train'),
      };
    case 'no-region':
      return { kind: 'refused', text: TRAIN_FROM_A_REGION };
    case 'no-forum':
      return { kind: 'refused', text: noForumWords(names.channel(outcome.region.channelId)) };
    case 'no-post':
      return {
        kind: 'refused',
        text: noPostWords(outcome.refused, (id) => names.channel(id)),
        givesBack: true,
      };
    case 'created': {
      const postId = outcome.party.forumPostId;
      const post = postId === null ? undefined : names.post(postId);
      const text = `Your train is made.${post === undefined ? '' : ` Its post is ${post}.`}`;
      return { kind: 'made', party: outcome.party, text };
    }
  }
}

/** Where `/train` works, said wherever it does not. */
export const TRAIN_FROM_A_REGION = 'Create a train from a region channel.';

/**
 * How often one member may add, take off or move a stop (`/route`, the map), which goes on as fast
 * as places are tapped (Matt, 2026-10-30). A post's edits and lines are gathered every two seconds
 * however fast they come, so this only stops what runs away.
 */
export const ROUTE_STOP_THROTTLE: Throttle = { uses: 60, perSeconds: 60 };

/** Adds a stop, a gym or a power spot, at the end of the route (`/route add`, the map). */
export async function addStopAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  added: StopRef,
  staff: boolean,
  drawn?: readonly string[],
): Promise<TrainAnswer> {
  const outcome = await ctx.trains.addStop(party.id, member, added, staff, drawn);
  return answerOf(ctx, outcome, (ok) => {
    const here = sameStop(currentStop(ok.party), added) ? ' The train is there now.' : '';
    return `${named(ctx, added)} is stop ${ok.number} of the route.${here}`;
  });
}

/** Takes the stop with this number off the route (`/route remove`, the map). */
export async function removeStopAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  number: number,
  staff: boolean,
  drawn?: readonly string[],
): Promise<TrainAnswer> {
  const outcome = await ctx.trains.removeStop(party.id, member, number, staff, drawn);
  return answerOf(ctx, outcome, (ok) => {
    const left = ok.party.train.route.length;
    // The stop the train was at is gone: where it is now.
    const at = currentStop(ok.party);
    const where = !ok.moved
      ? ''
      : at !== undefined
        ? ` The train is at ${named(ctx, at)} now.`
        : left > 0
          ? ' The train has finished its route.'
          : '';
    return `${named(ctx, ok.stop)} is off the route, which has ${count(left, 'stop')} now.${where}`;
  });
}

/**
 * Moves the stop `from` to the number `to` (`/route move`, the map), and says where it stands
 * now (before which stop, or last) and, when the number of the stop the train is at changed, that
 * the train stays there (Matt, 2026-10-24: a member took the move for one of the train).
 */
export async function moveStopAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  from: number,
  to: number,
  staff: boolean,
  drawn?: readonly string[],
): Promise<TrainAnswer> {
  const outcome = await ctx.trains.moveStop(party.id, member, from, to, staff, drawn);
  return answerOf(ctx, outcome, (ok) => {
    if (!ok.changed) return `${named(ctx, ok.stop)} is stop ${to} of the route already.`;
    const { route, stop } = ok.party.train;
    const after = route[to];
    const where = after === undefined ? ', the last' : `, before ${named(ctx, after)}`;
    const here = routeFinished(ok.party) ? undefined : route[stop];
    const stays =
      here === undefined || stop === party.train.stop
        ? ''
        : ` The train is still at ${sameStop(here, ok.stop) ? 'it' : named(ctx, here)}, now stop ${stop + 1}.`;
    return `${named(ctx, ok.stop)} is stop ${to} of the route now${where}.${stays}`;
  });
}

/**
 * Empties the route (`/route clear`, the map): for the conductor, and for `staff`, which for this
 * is bot management, as the legacy bot had it.
 */
export async function clearRouteAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  staff: boolean,
  drawn?: readonly string[],
): Promise<TrainAnswer> {
  return answerOf(ctx, await ctx.trains.clearRoute(party.id, member, staff, drawn), (ok) =>
    ok.changed ? 'The route of this train is cleared.' : 'This train had no route.',
  );
}

/** The name of a saved route as an answer shows it. A route that was just saved has one. */
function routeName(route: SavedRoute): string {
  return `**${plain(route.name)}**`;
}

/** Said for a saved route the member does not have (for the region of the train). */
export const NO_SUCH_ROUTE =
  'You have no such saved route for this region. Pick one from the list.';

/** Saves the route of the train for the member under a name (`/route save`, the map). */
export async function saveRouteAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  name: string,
  drawn?: readonly string[],
): Promise<TrainAnswer> {
  const outcome = await ctx.trains.saveRoute(party.id, member, name, drawn);
  switch (outcome.kind) {
    case 'gone':
      return { kind: 'gone', text: TRAIN_OVER };
    case 'refused':
      return {
        kind: 'refused',
        ...(outcome.reason === 'route-edited' ? { reason: outcome.reason } : {}),
        text:
          outcome.reason === 'empty-route'
            ? 'This train has no route to save yet.'
            : outcome.reason === 'name-like-choice'
              ? 'A saved route cannot be called `id:` and a number: that is how the list of ' +
                'saved routes names its choices. Give it another name.'
              : problemText(outcome.reason, ctx.attendance.limits(), 'train'),
      };
    case 'full':
      return {
        kind: 'refused',
        text:
          `You have ${MAX_SAVED_ROUTES} saved routes for this region, which is as many as you ` +
          'can keep. Remove one with `/route forget` first, or save under the name of one ' +
          'to replace it.',
      };
    case 'saved':
    case 'replaced': {
      const stops = count(outcome.route.stops.length, 'stop');
      const mode = atEndSentence(outcome.route.atEnd);
      return {
        kind: 'ok',
        text:
          outcome.kind === 'saved'
            ? `I saved this route as ${routeName(outcome.route)}: ${stops}. ${mode} ` +
              '`/route load` puts it into a train of this region.'
            : `I replaced your saved route ${routeName(outcome.route)} with this one: ` +
              `${stops}. ${mode}`,
      };
    }
  }
}

/** Puts one of the member's saved routes into the train (`/route load`, the map). */
export async function loadRouteAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  routeId: number,
  staff: boolean,
  drawn?: readonly string[],
): Promise<TrainAnswer> {
  const loaded = await ctx.trains.loadRoute(party.id, member, routeId, staff, drawn);
  if (loaded.kind === 'none') return { kind: 'refused', text: NO_SUCH_ROUTE };
  if (loaded.kind === 'no-stops') {
    return { kind: 'refused', text: 'That saved route has no stops.' };
  }
  if (loaded.kind === 'refused' && loaded.reason === 'empty-route') {
    return { kind: 'refused', text: 'None of the stops of that route exists any more.' };
  }
  return answerOf(ctx, loaded, (ok) => {
    const stops = count(ok.party.train.route.length, 'stop');
    const mode = atEndSentence(ok.party.train.atEnd);
    const missing =
      ok.missing === 0
        ? ''
        : ` ${ok.missing === 1 ? 'One stop of it no longer exists and was' : `${ok.missing} stops of it no longer exist and were`} left out.`;
    const cut =
      ok.cut === 0
        ? ''
        : ` ${count(ok.cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`;
    // A route of the legacy bot may have no name.
    const has =
      ok.route.name === ''
        ? 'a saved route without a name as its route now'
        : `the route ${routeName(ok.route)} now`;
    return ok.changed
      ? `This train has ${has}: ${stops}. It is at the first. ${mode}${missing}${cut}`
      : `This train has that route already, and is at its first stop. ${mode}${missing}${cut}`;
  });
}

/** Deletes one of the member's saved routes of the region of the train (`/route forget`, the map). */
export async function forgetRouteAs(
  ctx: TrainChanging,
  party: TrainParty,
  memberId: string,
  routeId: number,
): Promise<TrainAnswer> {
  const gone = await ctx.trains.forgetRoute(party.id, memberId, routeId);
  if (!gone) return { kind: 'refused', text: NO_SUCH_ROUTE };
  return {
    kind: 'ok',
    text:
      gone.name === ''
        ? 'I forgot your saved route without a name.'
        : `I forgot your saved route ${routeName(gone)}.`,
  };
}

/**
 * Moves the train along its route (`/next`, `/previous`, `/skip`, `/finish`, the map) and says
 * where it is now. `surface` is where the member moved it (a command, Move… of the post, the
 * map), so that a finished route names what takes it back there; `from` and `target` are for a
 * control drawn at a place (Move…, on Discord and on the map), and a command gives `from` as the
 * train was when it came (`placeOf`), so that two quick `/previous` move it once.
 */
export async function moveTrainAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  move: TrainMove,
  staff: boolean,
  surface: TrainSurface,
  from?: string,
  target?: string,
): Promise<TrainAnswer> {
  const outcome = await ctx.trains.move(party.id, member, move, staff, from, target);
  return answerOf(ctx, outcome, (ok) => {
    // Told only when the movements gathered still say something: a Finish taken back at once
    // tells nobody anything.
    const others =
      membersWhere(ok.party, (_attendee, id) => id !== member.id).length > 0 &&
      ctx.trains.tells(party.id);
    const where = whereText(trainPlaces(ctx, ok.party), surface);
    return `${where}${others ? ' I am telling the others.' : ''}`;
  });
}

/**
 * What Manage… needs (plan 8M-8C): what changing a train needs, and the store, which says where
 * the train is now when a change from a form drawn elsewhere is refused.
 */
export type TrainManaging = TrainChanging & Pick<AppContext, 'parties' | 'timedParties' | 'config'>;

/** What a Submit is told when the train moved on, or its route changed, since its form opened. */
export const MOVED_ON = 'The train has moved on since you opened this: ';

/**
 * What a command that moves the train is told when another move came first, while it was on its
 * way (two quick `/previous`): it is not made a second time.
 */
export const MOVED_BEFORE = 'The train was moved just before your command. ';

/** The refusals of a change that the train's moving on, or its route's change, explain. */
const STALE_MOVES: ReadonlySet<string> = new Set(['train-moved-on', 'route-changed']);

/**
 * The words of a refusal of Move…'s or Manage…'s Submit (on Discord and on the map): where the
 * train moved on, or its route changed, since the form opened, where it is now (`MOVED_ON`, with
 * `whereText` as the member has it there, `surface`; a command opens with `MOVED_BEFORE`);
 * otherwise `text`, as the commands say it.
 */
export function movedOnWords(
  ctx: TrainManaging,
  partyId: string,
  reason: string | undefined,
  text: string,
  surface: TrainSurface,
  opening = MOVED_ON,
): string {
  const now = ctx.parties.get(partyId);
  if (reason !== undefined && STALE_MOVES.has(reason) && now && isTrain(now)) {
    return `${opening}${whereText(trainPlaces(ctx, now), surface)}`;
  }
  return text;
}

/** Whether a refusal is one the train's moving on, or its route's change, explains. */
export const movedOn = (reason: string | undefined): boolean =>
  reason !== undefined && STALE_MOVES.has(reason);

/**
 * Why Move… and Manage… do not open for this member (plan 8X-G: for who may move the train and
 * staff, `mayNotMove`), in the commands' words; undefined where they open. On Discord before the
 * dialog, on the map before the form.
 */
export function manageRefusal(
  ctx: Pick<AppContext, 'attendance'>,
  party: TrainParty,
  memberId: string,
  staff: boolean,
): string | undefined {
  const problem = mayNotMove(party, memberId, staff);
  return problem === undefined ? undefined : trainRefusal(ctx, problem);
}

/**
 * What Manage… showed (on Discord its custom id carries it, on the map its form sends it back):
 * where the train was (`placeOf`), the stop the route began with (`stopHandle`, or `-` without a
 * route), and the mode and the kind it showed picked.
 */
export interface ManageShown {
  from: string;
  first: string;
  atEnd: TrainAtEnd;
  kind: TrainKind;
}

/**
 * What was picked in Manage…: the kind; the route (left out where the form had only Keep); the
 * mode (left out for a train without a route, whose form asks its kind alone); the start as read
 * from what was typed (`typedStartOf`; null removes it, left out for a blank line); the end as
 * typed, as `/end` takes it (the map's alone: a dialog of Discord has no room for it).
 */
export interface ManagePicked {
  kind: TrainKind;
  route?: 'keep' | 'reverse' | 'finish';
  atEnd?: TrainAtEnd;
  start?: number | null;
  end?: string;
}

/** The start typed in Manage…, as `/meet` reads it; what it cannot read is its `UserError`. */
export function typedStartOf(
  ctx: Pick<AppContext, 'config'>,
  party: TrainParty,
  typed: string,
  now: number,
): number | null {
  const read = typedTimedTime(ctx, party, 'meet', typed, now);
  return read === 'unset' ? null : read.at;
}

/** What a Submit of Manage… that changes nothing is told. */
export const NOTHING_CHANGED = 'Nothing changed.';

/** What a Submit of Manage… says it did, in the words of the commands. */
function managedWords(
  ctx: TrainChanging,
  party: TrainParty,
  done: { kindSet: boolean; route?: 'reversed' | 'finished'; atEndSet: boolean },
  surface: TrainSurface,
): string {
  const said = [
    done.kindSet ? trainKindSentence(party.train.kind) : undefined,
    done.route === 'reversed' ? 'The route is reversed.' : undefined,
    done.atEndSet ? atEndSentence(party.train.atEnd) : undefined,
    // A finished route says so itself ("The train has finished its route of N stops.").
    done.route === undefined ? undefined : whereText(trainPlaces(ctx, party), surface),
  ].filter((sentence) => sentence !== undefined);
  return said.length === 0 ? NOTHING_CHANGED : said.join(' ');
}

/**
 * The Submit of Manage… (plan 8X-G on Discord, plan 8M-8C on the map): only what was picked
 * otherwise than shown is asked (review R5: a form opened before somebody else set the mode does
 * not set it back), and nothing asked is `Nothing changed.`; what is asked is one change
 * (`TrainService.manage`: the kind, the route, the mode, all or nothing, with where the train was
 * and the stop the route began with). A refusal of a route change from a form drawn where the
 * train no longer is says where it is now (`movedOnWords`); a refusal of several parts adds that
 * nothing was changed (review r0 B2). `surface` names what takes a finished route back. The start
 * and the end go `/meet`'s and `/end`'s way once the rest went through (`setTimesAs`, which a
 * meetup's editor shares, and who may arrange the train).
 */
export async function manageTrainAs(
  ctx: TrainManaging,
  party: TrainParty,
  member: Member,
  staff: boolean,
  shown: ManageShown,
  picked: ManagePicked,
  surface: TrainSurface,
  now = Date.now(),
): Promise<TrainAnswer> {
  const asked: TrainManage = {
    ...(picked.kind === shown.kind ? {} : { kind: picked.kind }),
    ...(picked.route === undefined || picked.route === 'keep' ? {} : { route: picked.route }),
    ...(picked.atEnd === undefined || picked.atEnd === shown.atEnd ? {} : { atEnd: picked.atEnd }),
  };
  const { start, end } = picked;
  const timed = async (done?: string): Promise<TrainAnswer> => {
    const times: TimesRead = {
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
    };
    const answer = await setTimesAs(ctx, party, member, times, now);
    const text = done === undefined ? answer.text : `${done} ${answer.text}`;
    if (answer.kind !== 'refused') return { ...answer, text };
    const applied = done !== undefined || (answer.went ?? []).length > 0;
    return { ...answer, text, ...(applied ? { applied: true as const } : {}) };
  };
  const timesAsked = start !== undefined || end !== undefined;
  if (Object.keys(asked).length === 0) {
    return timesAsked ? timed() : { kind: 'ok', text: NOTHING_CHANGED };
  }
  const outcome = await ctx.trains.manage(party.id, member, staff, asked, {
    from: shown.from,
    first: shown.first,
  });
  if (outcome.kind === 'gone') return { kind: 'gone', text: TRAIN_OVER };
  if (outcome.kind === 'refused') {
    const text = trainRefusal(ctx, outcome.reason);
    const words = movedOnWords(ctx, party.id, outcome.reason, text, surface);
    // Of several parts asked, none was applied: said, as one refusal refuses all (review r0 B2).
    const several = Object.keys(asked).length > 1 || timesAsked;
    return {
      kind: 'refused',
      text: several ? `${words} Nothing was changed.` : words,
      reason: outcome.reason,
    };
  }
  const done = managedWords(ctx, outcome.party, outcome, surface);
  // What was asked was so already: only the times are news.
  return timesAsked
    ? timed(done === NOTHING_CHANGED ? undefined : done)
    : { kind: 'ok', text: done };
}

/** What splitting a group off needs: the train service, the members' privacy, the words. */
export type TrainSplitting = Pick<AppContext, 'trains' | 'attendance' | 'users' | 'parties'>;

/** What a Submit of Split… answers when the split failed (the old train is as it was). */
export const SPLIT_FAILED = 'The split did not work: nothing was split off.';

/** What a Submit of Split… answers for a group called otherwise, or gone, since it opened. */
export const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split… again.';

/**
 * Why the member may split no group of the train, in words (plan 8T-H; on Discord before the
 * dialog, on the map before the form): a train of one group, one without a post yet, or the new
 * train of a split not settled yet; for staff and the conductor, who may split any other group,
 * what the group that has members says (everybody in it: `whole-train`), or that nobody is in any
 * (`empty-group`); for anybody else what their own group says (the conductor in it, everybody in
 * it), and for anybody in no group `not-in-group`.
 */
export function splitRefusalFor(
  ctx: Pick<AppContext, 'attendance'>,
  party: TrainParty,
  memberId: string,
  staff: boolean,
): string {
  if (party.groups.length < 2) return trainRefusal(ctx, 'one-group');
  if (party.forumPostId === null) return trainRefusal(ctx, 'unposted');
  if (party.train.splitFrom?.pending === true) return trainRefusal(ctx, 'split-pending');
  if (staff || party.train.conductorId === memberId) {
    const filled = Object.values(party.attendees)[0]?.group;
    return filled === undefined
      ? trainRefusal(ctx, 'empty-group')
      : splitRefusal(ctx, party, 'whole-train', filled);
  }
  const own = attendeeOf(party, memberId)?.group;
  const problem = own === undefined ? undefined : mayNotSplit(party, memberId, staff, own);
  return problem === undefined || own === undefined
    ? trainRefusal(ctx, 'not-in-group')
    : splitRefusal(ctx, party, problem, own);
}

/**
 * Why a member may not split a group off this train, in the command's words: as any refusal of a
 * train (`trainRefusal`), but a group that holds everybody on the train is named (Matt,
 * 2026-10-17): `Everybody on this train is in group B (Fast): there is nothing to split it
 * from.`
 */
export function splitRefusal(
  ctx: Pick<AppContext, 'attendance'>,
  party: TrainParty,
  reason: PartyProblem,
  groupId: GroupId,
): string {
  if (reason !== 'whole-train') return trainRefusal(ctx, reason);
  const words = groupWords(groupOf(party, groupId) ?? { id: groupId });
  return `Everybody on this train is in ${words}: there is nothing to split it from.`;
}

/** A group to split off a train, as the member asks it (plan 8T). */
export interface SplitAsk {
  party: TrainParty;
  member: Member;
  group: GroupId;
  staff: boolean;
  /** The group's mark as the dialog showed it (`groupMark`); a stale one is refused. */
  drawn?: string;
}

/**
 * What came of a split, in the command's words: `split` with the new train; `already` when the
 * group the dialog showed is the one split off last, by an earlier Submit or somebody else
 * (`splitDrawn`): it says where it went. `givesBack` on a refusal that is none of the member's
 * doing (the new post could not be made; plan 8S-3).
 */
export type SplitAnswer =
  | { kind: 'split'; party: TrainParty; text: string }
  | { kind: 'already'; text: string }
  | { kind: 'refused'; text: string; reason?: PartyProblem; givesBack?: true }
  | { kind: 'gone'; text: string };

/**
 * Splits a group off the train into a train of its own as the member (`TrainService.split`),
 * named as their privacy says (in `/settings`, as for `/train`), and says what came of it:
 * `Split off: <post>` (`names.post`; the map names no post), the reason of a refusal (`splitRefusal`),
 * or that the train is over. A Submit drawn for the very group that was split off last (a second
 * Submit of one dialog, or somebody else's split of it) says where it went, as if it had
 * split it. The one code path of the dialog's Submit and, later, the map's.
 */
export async function splitGroupAs(
  ctx: TrainSplitting,
  ask: SplitAsk,
  names: ReportNames,
): Promise<SplitAnswer> {
  const { party, member, group, staff, drawn } = ask;
  const settings = await ctx.users.get(member.id);
  const outcome = await ctx.trains.split(party.id, member, staff, group, {
    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
    ...(drawn === undefined ? {} : { drawn }),
  });
  switch (outcome.kind) {
    case 'gone':
      return { kind: 'gone', text: TRAIN_OVER };
    case 'refused': {
      const now = ctx.parties.get(party.id);
      // The group that went may be the one split off (by an earlier Submit, or somebody else).
      const stale = outcome.reason === 'group-changed' || outcome.reason === 'no-such-group';
      const went =
        stale && drawn !== undefined && now && isTrain(now)
          ? splitDrawn(now, group, drawn)
          : undefined;
      if (went) return { kind: 'already', text: splitOffWords(went.postId, names) };
      return {
        kind: 'refused',
        text: splitRefusal(ctx, party, outcome.reason, group),
        reason: outcome.reason,
      };
    }
    case 'no-forum':
      return { kind: 'refused', text: 'The region of this train has no forum any more.' };
    case 'no-post':
      // None of the member's doing (plan 8S-3): the use goes back.
      return {
        kind: 'refused',
        text: noPostWords(outcome.refused, (id) => names.channel(id)),
        givesBack: true,
      };
    case 'split': {
      const postId = outcome.party.forumPostId;
      return {
        kind: 'split',
        party: outcome.party,
        text: postId === null ? 'Split off.' : splitOffWords(postId, names),
      };
    }
  }
}

/** `Split off: <post>`, or `Split off.` where posts are not named (the map). */
function splitOffWords(postId: string, names: Pick<ReportNames, 'post'>): string {
  const post = names.post(postId);
  return post === undefined ? 'Split off.' : `Split off: ${post}`;
}

/**
 * How the answer of a takeover names the conductor before (`setConductorAs`): on Discord the
 * member as a sentence names them (`DISCORD_CONDUCTOR`); the map names nobody.
 */
export type ConductorNamer = (party: TrainParty, previousId: string) => string;

/** The conductor before as `/conductor set` names them: `memberText`. */
export const DISCORD_CONDUCTOR: ConductorNamer = (party, previousId) =>
  memberText(memberOf(party, previousId));

/**
 * Makes the member the conductor (`/conductor set`, the map); a takeover names the conductor
 * before as `previous` says. `seen` is whose the role was as the map drew the button (refused
 * as `conductor-changed` when it is another's by now); a command gives none.
 */
export async function setConductorAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  previous: ConductorNamer,
  seen?: ConductorSeen,
): Promise<TrainAnswer> {
  return answerOf(ctx, await ctx.trains.setConductor(party.id, member, seen), (ok) => {
    const only = 'Only you and the moderators can move it now.';
    return !ok.changed
      ? 'You are the conductor of this train already.'
      : ok.previous === null
        ? `You are the conductor of this train. ${only}`
        : `You are the conductor of this train, in the place of ${previous(party, ok.previous)}. ${only}`;
  });
}

/** Leaves the train without a conductor (`/conductor clear`, the map; `seen` as for a set). */
export async function clearConductorAs(
  ctx: TrainChanging,
  party: TrainParty,
  member: Member,
  staff: boolean,
  seen?: ConductorSeen,
): Promise<TrainAnswer> {
  return answerOf(ctx, await ctx.trains.clearConductor(party.id, member, staff, seen), (ok) => {
    const anybody = 'Anybody who is signed up can move it.';
    return !ok.changed
      ? `This train has no conductor. ${anybody}`
      : ok.previous === member.id
        ? `You are no longer the conductor of this train. ${anybody}`
        : `This train has no conductor any more. ${anybody}`;
  });
}
