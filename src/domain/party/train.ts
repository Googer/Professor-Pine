import {
  attendeeOf,
  groupOf,
  newestFirst,
  groupStamp,
  stampedGroup,
  mayArrange,
  MAX_PARTY_NAME,
  MAX_ROUTE_STOPS,
  MAX_SPLITS_KEPT,
  membersWhere,
  NO_PROMPTS,
  refused,
  sameBoss,
  type Attendee,
  type Change,
  type GroupId,
  type PartyGroup,
  type RaidBossRef,
  type SplitOff,
  type TrainAtEnd,
  type TrainDetails,
  type TrainKind,
  type TrainLink,
  type TrainParty,
} from './party.js';
import { PartyStatus } from './status.js';
import {
  hasStop,
  sameStop,
  stopHandle,
  stopIndexOf,
  stopKey,
  stopsByHandle,
  type StopRef,
} from './stops.js';
import { stopsAhead } from './stops-ahead.js';
import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';

// The stops ahead and their numbers (plan 8M-15) live where the map's page can take them too.
export { arrivalNumbers, stopsAhead } from './stops-ahead.js';

/**
 * What it takes to make a train: what any timed party takes, and what its maker has set for
 * the parties they start (Matt, 2026-10-13: a train follows privacy and auto-status as a raid
 * they report does; a meetup does not).
 */
export interface NewTrain extends NewTimedParty {
  /** The post does not say who made it (`RaidPrivacy.Anonymous`). Left out: it does. */
  anonymous?: boolean;
  /**
   * The maker's automatic status (`User.status`): signed up as that when it is interested,
   * coming or here, and not at all for anything else. Left out: interested.
   */
  autoStatus?: PartyStatus;
  /** What the train does at the last stop of its route. Left out: it finishes the route. */
  atEnd?: TrainAtEnd;
  /** What kind of battles it goes to (plan 8X-4). Left out: raids. */
  kind?: TrainKind;
}

/**
 * A new raid train: a name and nothing else yet. It has no route, no conductor and no boss. The
 * member who made it is signed up as their automatic status says, in group A (as coming when
 * it says here: a train without a stop has no "here"), or not at all (`autoStatus`), and is
 * never its conductor by that alone; a train whose maker asked not to be named is `anonymous`,
 * and its post then names no maker. Like a meetup it has no times, so it counts as going on for
 * a day until somebody sets one. Refused with `bad-name` when the text is no name.
 */
export function createTrain(input: NewTrain): Change<TrainParty> {
  const name = tidyName(input.name);
  if (name === undefined) return refused('bad-name');
  const asked = input.autoStatus ?? PartyStatus.Interested;
  // A new train is at no stop, so nobody is "here" yet: Here is Coming.
  const status = asked === PartyStatus.Present ? PartyStatus.Coming : asked;
  const signedUp = status === PartyStatus.Interested || status === PartyStatus.Coming;
  const train: TrainParty = {
    ...newTimedParty(input, name),
    anonymous: input.anonymous === true,
    attendees: signedUp
      ? { [input.createdById]: { number: 1, status, group: 'A', remote: false } }
      : {},
    type: 'train',
    train: {
      kind: input.kind ?? 'raid',
      route: [],
      stop: 0,
      finishedFrom: null,
      atEnd: input.atEnd ?? 'finish',
      conductorId: null,
      boss: null,
      splitFrom: null,
      splitOff: [],
    },
  };
  return { ok: true, party: settled(train, input.now) };
}

/**
 * Whether the train has been through its whole route. A train without a route has not finished
 * one: it has none yet.
 */
export function routeFinished(party: TrainParty): boolean {
  const { route, stop } = party.train;
  return route.length > 0 && stop >= route.length;
}

/**
 * The stop the train is at: a gym or a power spot. Undefined while it has no route, and once the
 * route is finished. This is where a train is: `gymId` is not used for one.
 */
export function currentStop(party: TrainParty): StopRef | undefined {
  return party.train.route[party.train.stop];
}

/**
 * The stop Next takes the train to: the next stop, and at the last stop the first one again (a
 * train that loops) or the one before (a train that turns back). Undefined where Next finishes
 * the route, and wherever there is no current stop.
 */
export function nextStop(party: TrainParty): StopRef | undefined {
  if (currentStop(party) === undefined) return undefined;
  const { route, stop } = destinationOf(party, 'next');
  return route[stop];
}

/**
 * What Next does at the last stop of the route: goes round to the first stop (`round`, a train
 * that loops) or turns back (`back`). Undefined everywhere else, and where Next finishes the
 * route.
 */
export function turnAhead(party: TrainParty): TrainTurn | undefined {
  if (currentStop(party) === undefined) return undefined;
  return destinationOf(party, 'next').turn;
}

/** A route of at most this many stops is shown whole in the post (Matt, 2026-10-17). */
export const WHOLE_ROUTE_STOPS = 3;

/**
 * A stop the train goes to: its number in the route as it is stored now, the stop, and how the
 * train got past the end to reach it.
 */
export interface StopAhead {
  number: number;
  stop: StopRef;
  turn?: TrainTurn;
}

/**
 * What lies ahead of a train, as its post says it under where it is (Matt, 2026-10-17):
 * `no-route`; a route of `WHOLE_ROUTE_STOPS` or fewer `whole` (the index of the current stop,
 * undefined once finished, and what the train does at the end as far as it can, `endMode`);
 * a longer one `finished`, at its `last-stop` (a train that finishes there), or the `next` one or
 * two stops the train goes to, in the order it travels: past the end of a loop (`round`) or of a
 * train that turns back (`back`), the numbers those of the route as it is stored now. `then`
 * says what follows them: the train is `back-here` (a train that turns back, one stop before the
 * end: the second next stop would be this one), they reach the `last-stop`, or the train
 * `turns-back` at the second. `rest` counts the stops left after them, `toward` the end of the route,
 * round the loop, back to the start, or the turn.
 */
export type RouteAhead =
  | { kind: 'no-route' }
  | {
      kind: 'whole';
      route: readonly StopRef[];
      current: number | undefined;
      atEnd: TrainAtEnd;
    }
  | { kind: 'finished' }
  | { kind: 'last-stop' }
  | {
      kind: 'next';
      stops: readonly StopAhead[];
      then?: 'back-here' | 'last-stop' | 'turns-back';
      /** The stops left after those shown, when there are any, and where they lead. */
      rest?: { count: number; toward: 'end' | 'loop' | 'start' | 'turn' };
    };

/** What lies ahead of the train from where it is (`RouteAhead`). */
export function routeAhead(party: TrainParty): RouteAhead {
  const { route, stop } = party.train;
  const length = route.length;
  if (length === 0) return { kind: 'no-route' };
  const mode = endMode(party);
  const finished = stop >= length;
  if (length <= WHOLE_ROUTE_STOPS) {
    return { kind: 'whole', route, current: finished ? undefined : stop, atEnd: mode };
  }
  if (finished) return { kind: 'finished' };
  const ahead = stopsAhead(length, stop, mode);
  const last = length - 1;
  /**
   * The `count` first stops ahead (`stopsAhead`), each marked where the train got past the end
   * to reach it: round a loop, or back at the turn.
   */
  const first = (count: number): StopAhead[] =>
    ahead.slice(0, count).map((index, at) => {
      const ref = route[index];
      if (ref === undefined) throw new Error(`no stop ${index} on a route of ${length}`);
      const before = at === 0 ? stop : (ahead[at - 1] ?? stop);
      const turn: TrainTurn | undefined =
        index >= before
          ? undefined
          : mode === 'loop'
            ? 'round'
            : before === last
              ? 'back'
              : undefined;
      return { number: index + 1, stop: ref, ...(turn === undefined ? {} : { turn }) };
    });
  switch (mode) {
    case 'finish':
      if (stop === last) return { kind: 'last-stop' };
      if (ahead.length <= 2) return { kind: 'next', stops: first(2), then: 'last-stop' };
      return { kind: 'next', stops: first(2), rest: { count: ahead.length - 2, toward: 'end' } };
    case 'loop':
      return { kind: 'next', stops: first(2), rest: { count: length - 3, toward: 'loop' } };
    case 'turn-back':
      if (stop === last) {
        return { kind: 'next', stops: first(2), rest: { count: last - 2, toward: 'start' } };
      }
      if (stop === last - 1) {
        // The second stop ahead is this one, on the way back.
        return {
          kind: 'next',
          stops: first(1),
          then: 'back-here',
          rest: { count: stop, toward: 'start' },
        };
      }
      if (stop === last - 2) return { kind: 'next', stops: first(2), then: 'turns-back' };
      return {
        kind: 'next',
        stops: first(2),
        rest: { count: last - stop - 2, toward: 'turn' },
      };
  }
}

/**
 * What the train does at the end of its route as far as it can: a route of fewer than two stops
 * finishes in every mode, since there is nowhere to go round or back to. The live map draws a
 * train's line by it (`MapTrain.atEnd`, plan 8M-11B).
 */
export function endMode(party: TrainParty): TrainAtEnd {
  return party.train.route.length < 2 ? 'finish' : party.train.atEnd;
}

/**
 * The stops the train will still reach by what its mode does (plan 8X-G, review r0 C4; Matt,
 * 2026-10-22): a train that finishes the current stop and those after it; one that loops or
 * turns back every stop (a turn-back stores the route reversed and keeps its mode, so it reaches
 * every stop again); a finished route none. What "Passing through" of a region's summary asks.
 */
export function stopsStillReached(party: TrainParty): readonly StopRef[] {
  const { route, stop } = party.train;
  if (route.length === 0 || routeFinished(party)) return [];
  return endMode(party) === 'finish' ? route.slice(stop) : route;
}

/**
 * The party with this in the part that only a train has. The stop the route was finished from
 * (`finishedFrom`) is kept only while it means something: on a finished route that still has
 * that stop. Every other route forgets it here, so that no change of a train has to.
 */
function withTrain(party: TrainParty, change: Partial<TrainDetails>): TrainParty {
  const train = { ...party.train, ...change };
  const { route, stop, finishedFrom } = train;
  const remembered =
    finishedFrom !== null &&
    route.length > 0 &&
    stop >= route.length &&
    hasStop(route, finishedFrom);
  return { ...party, train: remembered ? train : { ...train, finishedFrom: null } };
}

/**
 * The train with another route, at the stop it was at: the current stop follows it through
 * every edit (the legacy bot kept the number, so removing an earlier stop moved the train on).
 * When that stop is no longer on the route, the train is at the stop that took its place, which
 * `fallback` names (an index of the new route). A finished route stays finished and goes on
 * remembering the stop it was finished from while that stop is on it (`withTrain`), and a train
 * whose route is empty is at the start.
 */
function withRoute(party: TrainParty, route: readonly StopRef[], fallback: number): TrainParty {
  if (route.length === 0) return withTrain(party, { route, stop: 0 });
  if (routeFinished(party)) return withTrain(party, { route, stop: route.length });
  const at = currentStop(party);
  const kept = at === undefined ? -1 : stopIndexOf(route, at);
  return withTrain(party, { route, stop: kept >= 0 ? kept : Math.min(fallback, route.length) });
}

/** A stop number as members give it (from 1) as an index of the route; undefined when there is none. */
function stopIndex(party: TrainParty, number: number): number | undefined {
  return Number.isInteger(number) && number >= 1 && number <= party.train.route.length
    ? number - 1
    : undefined;
}

/**
 * Where a train is, as a word that an edit of the route does not change while the train stays
 * there: the handle of its current stop (`stopHandle`: a gym's id, a power spot's short hash),
 * `end` once the route is finished, `none` while it has no route. A control that moves the train
 * carries it, so that a press is for the place the control was drawn at (`moveTrain`).
 */
export function placeOf(party: TrainParty): string {
  const at = currentStop(party);
  if (at !== undefined) return stopHandle(at);
  return routeFinished(party) ? 'end' : 'none';
}

/**
 * Where a train is, as `placeOf` says it but by the stop's key (`stopKey`), which tells every two
 * stops apart: what the code compares to know whether a change took the train somewhere else.
 */
export function whereOf(party: TrainParty): string {
  const at = currentStop(party);
  if (at !== undefined) return stopKey(at);
  return routeFinished(party) ? 'end' : 'none';
}

/**
 * Whether a handle a control carries (`placeOf`, `targetOf`, Reverse's `first`) could stand for
 * two stops of the route (design 6.2: a power spot's hash is short): then nobody can tell which
 * the control meant, and it is refused as `route-changed`.
 */
function ambiguous(party: TrainParty, handle: string): boolean {
  return stopsByHandle(party.train.route, handle).length > 1;
}

/**
 * Why a control drawn where the train was (`from`, `placeOf`) no longer fits: its handle could
 * be two stops of the route (`route-changed`), or the train is somewhere else (`train-moved-on`);
 * undefined when the train is still there.
 */
function placeRefusal(
  party: TrainParty,
  from: string,
): 'route-changed' | 'train-moved-on' | undefined {
  if (ambiguous(party, from)) return 'route-changed';
  return from === placeOf(party) ? undefined : 'train-moved-on';
}

/**
 * Why a member may not move the train, or undefined when they may: with a conductor, only the
 * conductor and staff (`not-conductor`); without one, anybody who is signed up
 * (`not-attending`), and staff. (The legacy bot knew the conductor by their user name.)
 */
export function mayNotMove(
  party: TrainParty,
  memberId: string,
  staff: boolean,
): 'not-conductor' | 'not-attending' | undefined {
  if (staff) return undefined;
  const { conductorId } = party.train;
  if (conductorId !== null) return conductorId === memberId ? undefined : 'not-conductor';
  return attendeeOf(party, memberId) ? undefined : 'not-attending';
}

/**
 * Why a member may not edit the stops of the route (add, remove, move one), or undefined when
 * they may: who is signed up, who made the train (`mayArrange`), and staff (`not-attending`).
 * An edit that moves the train asks for the right to move it as well.
 */
export function mayNotArrange(
  party: TrainParty,
  memberId: string,
  staff: boolean,
): 'not-attending' | undefined {
  return staff || mayArrange(party, memberId) ? undefined : 'not-attending';
}

/** Why a member may not clear the route: only the conductor and staff may (`conductor-or-staff`). */
export function mayNotClear(
  party: TrainParty,
  memberId: string,
  staff: boolean,
): 'conductor-or-staff' | undefined {
  return leads(party, memberId, staff) ? undefined : 'conductor-or-staff';
}

/**
 * Why a member may not load a saved route into the train (`replaceRoute`): it takes the right to
 * move the train (`mayNotMove`), but for who made it, who may give it its first route.
 */
export function mayNotLoad(
  party: TrainParty,
  memberId: string,
  staff: boolean,
): 'not-conductor' | 'not-attending' | undefined {
  const problem = mayNotMove(party, memberId, staff);
  const firstRoute = party.train.route.length === 0 && mayArrange(party, memberId);
  return problem && !(problem === 'not-attending' && firstRoute) ? problem : undefined;
}

/**
 * Whether the route is still the one a control was drawn from (`drawn`, its stops' keys in
 * order, `stopKey`: the live map's route editor, plan 8M-5): undefined when it is, or when
 * nothing was drawn (a
 * command), and `route-edited` when it changed meanwhile, so that an edit by the numbers of the
 * stops it showed is not made on another route.
 */
export function routeDrawn(
  party: TrainParty,
  drawn: readonly string[] | undefined,
): 'route-edited' | undefined {
  if (drawn === undefined) return undefined;
  const { route } = party.train;
  const same =
    route.length === drawn.length && route.every((ref, index) => drawn[index] === stopKey(ref));
  return same ? undefined : 'route-edited';
}

/** Whose the conductor role is as a member sees it: theirs, another's, or nobody's. */
export type ConductorSeen = 'none' | 'other' | 'you';

/** Whose the conductor role is as the member sees it (the live map names nobody). */
export function conductorSeenBy(party: TrainParty, memberId: string): ConductorSeen {
  const { conductorId } = party.train;
  return conductorId === null ? 'none' : conductorId === memberId ? 'you' : 'other';
}

/**
 * Whether the conductor role is still whose it was when a button was drawn (`seen`: the live
 * map, plan 8M-5): undefined when it is, or when nothing was drawn (a command), and
 * `conductor-changed` when it changed meanwhile, so that a press does not take the role over
 * from, or take it off, somebody the button did not show.
 */
export function conductorDrawn(
  party: TrainParty,
  memberId: string,
  seen: ConductorSeen | undefined,
): 'conductor-changed' | undefined {
  if (seen === undefined) return undefined;
  return conductorSeenBy(party, memberId) === seen ? undefined : 'conductor-changed';
}

/** Everybody who is here is coming again: they are on their way to the next stop. */
function allAboard(party: TrainParty): TrainParty {
  let moved = false;
  const attendees: Record<string, Attendee> = {};
  for (const [memberId, attendee] of Object.entries(party.attendees)) {
    const here = attendee.status === PartyStatus.Present;
    moved ||= here;
    // Count, group and remote stay (the legacy bot dropped remote here).
    attendees[memberId] = here ? { ...attendee, status: PartyStatus.Coming } : attendee;
  }
  return moved ? { ...party, attendees } : party;
}

/**
 * The train after it was taken to another place: everybody who is here is coming again when
 * there is a stop to come to. At the end of its route, and without one, who is here stays here
 * (as with the legacy bot's Finish: there is nowhere to come to).
 */
function arrived(party: TrainParty): TrainParty {
  return currentStop(party) === undefined ? party : allAboard(party);
}

/**
 * What an edit of the route comes to. An edit after which the train is somewhere else than
 * before (at another stop, at the end of its route, or off it) is a movement of the train:
 * `moved`. It takes the right to move the train (`mayNotMove`; `always` asks for that right
 * whatever the edit does), and it puts who is here back to coming like a move (`arrived`). An
 * edit that leaves the train where it is, is for whoever the caller let through.
 *
 * A train that had no route was nowhere: its first stop, or a route that is loaded into it, is
 * an ordinary edit and no movement. Nobody was on the way anywhere, so who is here stays here.
 */
function edited<Extra>(
  before: TrainParty,
  after: TrainParty,
  memberId: string,
  staff: boolean,
  extra: Extra,
  always = false,
): Change<TrainParty, Extra & { moved: boolean }> {
  const moved = before.train.route.length > 0 && whereOf(before) !== whereOf(after);
  if (moved || always) {
    const problem = mayNotMove(before, memberId, staff);
    if (problem) return refused(problem);
  }
  return { ok: true, party: moved ? arrived(after) : after, ...extra, moved };
}

/**
 * Adds a stop, a gym or a power spot, to the end of the route. Only for a member who is signed
 * up, for who made the train (`mayArrange`) and for staff (`not-attending`); a stop that is on
 * the route already is refused (`already-on-route`), and so is a stop beyond what a route holds
 * (`route-full`). A stop added to a finished route makes the train go on there: that is a
 * movement of the train (`moved`, see `edited`), after which the stop it had finished from is
 * forgotten. The first stop of a route is where the train then is, and is no movement. The
 * caller has checked that there is such a stop.
 */
export function addStop(
  party: TrainParty,
  memberId: string,
  added: StopRef,
  staff = false,
): Change<TrainParty, { number: number; moved: boolean }> {
  const forbidden = mayNotArrange(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  const { route } = party.train;
  if (hasStop(route, added)) return refused('already-on-route');
  if (route.length >= MAX_ROUTE_STOPS) return refused('route-full');
  // The stop the train is at keeps its number; a finished route has the new stop at that number.
  const longer = withTrain(party, { route: [...route, added] });
  return edited(party, longer, memberId, staff, { number: route.length + 1 });
}

/**
 * Takes a stop off the route, by its number (from 1). Only for a member who is signed up, and
 * for staff; a
 * number the route does not have is refused (`no-such-stop`). The train stays at the stop it is
 * at; when that very stop is removed, the one after it is the current one, or the route is
 * finished when it was the last: that is a movement of the train (`moved`, see `edited`), and
 * no Finish that Previous could take back, so Previous then leads to the last stop. On a train
 * that loops or turns back, with two stops or more left, the last stop that was current does
 * not finish the route: a loop goes to its first stop, a turn-back train has what is left
 * reversed and stands at its index 0 (the stop before the one removed). Previous
 * also leads to the last stop once the stop a finished route was finished from is removed.
 * `stop` is the stop that was removed.
 */
export function removeStop(
  party: TrainParty,
  memberId: string,
  number: number,
  staff = false,
): Change<TrainParty, { stop: StopRef; moved: boolean }> {
  const forbidden = mayNotArrange(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  const index = stopIndex(party, number);
  const removed = index === undefined ? undefined : party.train.route[index];
  if (index === undefined || removed === undefined) return refused('no-such-stop');
  const route = party.train.route.filter((_stop, at) => at !== index);
  // The current last stop of a train that goes round or turns back: it goes on, as Next would
  // have taken it, instead of finishing a route that has somewhere to go.
  const { stop, atEnd } = party.train;
  const extra = { stop: removed };
  if (index === stop && index === party.train.route.length - 1 && route.length >= 2) {
    if (atEnd === 'loop') {
      return edited(party, withTrain(party, { route, stop: 0 }), memberId, staff, extra);
    }
    if (atEnd === 'turn-back') {
      const turned = [...route].reverse();
      return edited(party, withTrain(party, { route: turned, stop: 0 }), memberId, staff, extra);
    }
  }
  // Only the current stop itself can be missing afterwards: what came after it is at its number.
  return edited(party, withRoute(party, route, index), memberId, staff, extra);
}

/**
 * Moves a stop to another place of the route: `from` is its number, `to` the number it has
 * afterwards (so a stop can be moved to the end, which the legacy bot could not). Only for a
 * member who is signed up, and for staff; numbers the route does not have are refused
 * (`no-such-stop`). The
 * train stays at the stop it is at, so this is never a movement of the train. The very same
 * party comes back when nothing moves. `stop` is the stop that was moved.
 */
export function moveStop(
  party: TrainParty,
  memberId: string,
  from: number,
  to: number,
  staff = false,
): Change<TrainParty, { stop: StopRef }> {
  const forbidden = mayNotArrange(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  const [source, target] = [stopIndex(party, from), stopIndex(party, to)];
  const moved = source === undefined ? undefined : party.train.route[source];
  if (source === undefined || target === undefined || moved === undefined) {
    return refused('no-such-stop');
  }
  if (source === target) return { ok: true, party, stop: moved };
  const route = party.train.route.filter((_stop, at) => at !== source);
  route.splice(target, 0, moved);
  return { ok: true, party: withRoute(party, route, party.train.stop), stop: moved };
}

/**
 * Whether a member may do what only the conductor and the staff may: clear the route, and take
 * the conductor off. `staff` says whether the member is staff.
 */
function leads(party: TrainParty, memberId: string, staff: boolean): boolean {
  return staff || party.train.conductorId === memberId;
}

/**
 * Empties the route and puts the train at the start. Only for the conductor and for staff
 * (`conductor-or-staff`). `moved` says whether that took the train from where it was; who is
 * here stays here. The very same party comes back when there is no route.
 */
export function clearRoute(
  party: TrainParty,
  memberId: string,
  staff: boolean,
): Change<TrainParty, { moved: boolean }> {
  const forbidden = mayNotClear(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  if (party.train.route.length === 0 && party.train.stop === 0) {
    return { ok: true, party, moved: false };
  }
  const cleared = withTrain(party, { route: [], stop: 0 });
  return { ok: true, party: cleared, moved: whereOf(party) !== whereOf(cleared) };
}

/**
 * Replaces the route (a saved one that is loaded) and puts the train at its first stop, with
 * what the train does at the end of it when that is given (`atEnd`: a saved route keeps its
 * mode). That always takes the right to move the train (`mayNotMove`), wherever the train ends
 * up; when it is at another place than before, it is a movement (`moved`, see `edited`: not for
 * a train that had no route). A stop that is named twice counts once, and what a route does not
 * hold is left off; a route without any stop is refused (`empty-route`). The caller has left out
 * the stops that no longer exist. The very same party comes back when the train has that route
 * and that mode already and is at its first stop. Who made the train may give it its first
 * route without being signed up (`mayArrange`): that moves nothing. With a route to replace
 * they need the right to move like anybody.
 */
export function replaceRoute(
  party: TrainParty,
  memberId: string,
  stops: readonly StopRef[],
  staff = false,
  atEnd: TrainAtEnd = party.train.atEnd,
): Change<TrainParty, { moved: boolean }> {
  const problem = mayNotLoad(party, memberId, staff);
  if (problem) return refused(problem);
  const firstRoute = party.train.route.length === 0 && mayArrange(party, memberId);
  const route: StopRef[] = [];
  for (const ref of stops) if (!hasStop(route, ref)) route.push(ref);
  route.splice(MAX_ROUTE_STOPS);
  if (route.length === 0) return refused('empty-route');
  const same =
    party.train.stop === 0 &&
    party.train.atEnd === atEnd &&
    party.train.route.length === route.length &&
    route.every((ref, index) => sameStop(party.train.route[index], ref));
  if (same) return { ok: true, party, moved: false };
  // The right to move was asked for above, with the one exception it has.
  const loaded = withTrain(party, { route, stop: 0, atEnd });
  return edited(party, loaded, memberId, staff, {}, !firstRoute);
}

/** The ways a train moves along its route. */
export const TRAIN_MOVES = ['next', 'previous', 'skip', 'finish'] as const;
export type TrainMove = (typeof TRAIN_MOVES)[number];

export function isTrainMove(value: string): value is TrainMove {
  return (TRAIN_MOVES as readonly string[]).includes(value);
}

/** How a move went past the end of the route: round to the first stop, or back along it. */
export type TrainTurn = 'round' | 'back';

/**
 * Why the train cannot move this way from where it is, or undefined when it can. All of them
 * need a route (`no-route`). `next` goes on from every stop (from the last one it finishes the
 * route, goes round or turns back, as the train's mode says) and not from a finished route;
 * `finish` is refused once the route is finished. `previous` goes back from everywhere but the
 * first stop, also from a finished route (`destinationOf` says where to); a train that loops
 * goes back from its first stop to its last. `skip` needs a stop after the next one that is
 * not the stop the train is at: on a route that finishes, a stop after the next one at all; on
 * one that loops, three stops or more; on one that turns back, the stop after the next one in
 * the order the train travels (at the second to last stop that would be the stop it is at).
 * A route of one stop finishes in every mode.
 */
export function cannotMove(
  party: TrainParty,
  move: TrainMove,
): 'no-route' | 'route-finished' | 'at-first-stop' | 'no-stop-to-skip' | undefined {
  const { route, stop } = party.train;
  const length = route.length;
  if (length === 0) return 'no-route';
  const finished = stop >= length;
  const mode = endMode(party);
  switch (move) {
    case 'next':
    case 'finish':
      return finished ? 'route-finished' : undefined;
    case 'previous':
      return stop === 0 && mode !== 'loop' ? 'at-first-stop' : undefined;
    case 'skip': {
      if (finished) return 'no-stop-to-skip';
      const skips =
        stop + 2 < length ||
        (mode === 'loop' && length >= 3) ||
        (mode === 'turn-back' && stop === length - 1 && length >= 3);
      return skips ? undefined : 'no-stop-to-skip';
    }
  }
}

/** Where a move leaves the train: the route as it is then, and the stop on it. */
export interface TrainDestination {
  /** The route afterwards: the same one, or the same stops in the other order after a turn. */
  route: readonly StopRef[];
  /** The index of the stop on that route; its length is the end. */
  stop: number;
  /** The move went past the end of the route: round to its first stop, or back along it. */
  turn?: TrainTurn;
  /** The stop that was left out, for a skip. */
  skipped?: StopRef;
}

/**
 * Where a move takes the train from where it is, as `cannotMove` allows it (for a move that it
 * refuses, somewhere harmless: the caller asks `cannotMove` first). `previous` from a finished
 * route leads to the stop the route was finished from, which takes a mistaken Finish back, and
 * to the last stop when none is remembered.
 *
 * At the last stop `next` finishes the route of a train that finishes, takes a train that loops
 * to its first stop (`turn: 'round'`), and turns a train that turns back: its route is stored
 * in the other order, and the train is at index 1 of it, the stop before the one it turned at
 * (`turn: 'back'`). `skip` goes round the end of a loop like `next`, and at the last stop of a
 * train that turns back to index 2 of the route in the other order. `previous` at the first
 * stop of a train that loops leads to its last stop.
 */
export function destinationOf(party: TrainParty, move: TrainMove): TrainDestination {
  const { route, stop } = party.train;
  const length = route.length;
  const last = length - 1;
  const mode = endMode(party);
  const reversed = (): StopRef[] => [...route].reverse();
  switch (move) {
    case 'next':
      if (stop !== last) return { route, stop: Math.min(stop + 1, length) };
      if (mode === 'loop') return { route, stop: 0, turn: 'round' };
      if (mode === 'turn-back') return { route: reversed(), stop: 1, turn: 'back' };
      return { route, stop: length };
    case 'skip': {
      if (mode === 'loop' && length >= 3 && stop < length) {
        const to = (stop + 2) % length;
        const skipped = route[(stop + 1) % length];
        return {
          route,
          stop: to,
          ...(to < stop ? { turn: 'round' as const } : {}),
          ...(skipped === undefined ? {} : { skipped }),
        };
      }
      if (mode === 'turn-back' && stop === last && length >= 3) {
        const turned = reversed();
        const skipped = turned[1];
        return {
          route: turned,
          stop: 2,
          turn: 'back',
          ...(skipped === undefined ? {} : { skipped }),
        };
      }
      const skipped = route[stop + 1];
      return {
        route,
        stop: Math.min(stop + 2, length),
        ...(skipped === undefined ? {} : { skipped }),
      };
    }
    case 'previous':
      if (stop >= length) return { route, stop: finishedFromStop(party) ?? Math.max(last, 0) };
      if (stop === 0 && mode === 'loop') return { route, stop: last };
      return { route, stop: Math.max(stop - 1, 0) };
    case 'finish':
      return { route, stop: length };
  }
}

/**
 * The stop a finished route was finished from, as an index of the route; undefined when the
 * route is not finished or nothing is remembered of it.
 */
function finishedFromStop(party: TrainParty): number | undefined {
  const { route, finishedFrom } = party.train;
  if (!routeFinished(party) || finishedFrom === null) return undefined;
  const index = stopIndexOf(route, finishedFrom);
  return index >= 0 ? index : undefined;
}

/**
 * Where a move would take the train from where it is, as `placeOf` names a place: the handle of
 * that stop (`stopHandle`), or `end`. A control that leads to a stop ("Next is …", "Previous
 * takes it back to …") carries it, so that a press leads there or nowhere (`moveTrain`). A move
 * that turns the train back leads to a stop like any other: the one before the stop it turns at.
 */
export function targetOf(party: TrainParty, move: TrainMove): string {
  const { route, stop } = destinationOf(party, move);
  const ref = route[stop];
  return ref === undefined ? 'end' : stopHandle(ref);
}

/** Where a move has taken the train. */
export interface TrainMoved {
  move: TrainMove;
  /** The stop the train is at now; undefined when the route is finished. */
  at: StopRef | undefined;
  /** The stop that was left out, for a skip. */
  skipped?: StopRef;
  /** The move went past the end of the route: round to its first stop, or back along it. */
  turn?: TrainTurn;
  /** The move finished the route (`finish`, or `next` from the last stop). */
  finished: boolean;
}

/**
 * Moves the train along its route: to the next stop, back to the one before, past the next one,
 * or to the end of the route; at the end of the route as its mode says (`destinationOf`).
 * Refused for a member who may not move it (`mayNotMove`) and for a move that cannot be made
 * from where the train is (`cannotMove`), in that order. A move to a stop puts everybody who is
 * here back to coming, also one that goes round or turns back; at the end of the route who is
 * here stays here. Finishing the route does not end the party and changes none of its times (as
 * with the legacy bot). A move that goes round or turns back never finishes the route.
 *
 * A move that finishes the route remembers the stop it was made from (`finishedFrom`), and
 * Previous from the end leads back there: a Finish that was a mistake is taken back. Who is
 * here stays here then as well, since the train is where they are and nobody went anywhere.
 * From a finished route that remembers no stop, Previous leads to the last one like a move to
 * any other stop.
 *
 * `from` is where the train was when the member asked (`placeOf`), for a control that was drawn
 * then: when the train is somewhere else by now, the move is refused (`train-moved-on`), so
 * that two members who press Next on the same stop move the train once. `target` is where that
 * control said the move would lead (`targetOf`): when the route was edited since and the move
 * would lead elsewhere, it is refused too (`route-changed`). Without them (a command) the move
 * is made from wherever the train is, to wherever it leads.
 */
export function moveTrain(
  party: TrainParty,
  memberId: string,
  move: TrainMove,
  staff: boolean,
  from?: string,
  target?: string,
): Change<TrainParty, TrainMoved> {
  const forbidden = mayNotMove(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  const stale = from === undefined ? undefined : placeRefusal(party, from);
  if (stale) return refused(stale);
  const problem = cannotMove(party, move);
  if (problem) return refused(problem);
  if (target !== undefined && (ambiguous(party, target) || target !== targetOf(party, move))) {
    return refused('route-changed');
  }
  const { route, stop } = party.train;
  const destination = destinationOf(party, move);
  // Only a move that finishes the route leaves something to remember: the stop it was made at.
  const finishes = destination.stop >= destination.route.length;
  const finishedFrom = finishes ? (route[stop] ?? null) : null;
  const placed = withTrain(party, {
    route: destination.route,
    stop: destination.stop,
    finishedFrom,
  });
  const moved = destination.stop === finishedFromStop(party) ? placed : arrived(placed);
  const { skipped, turn } = destination;
  return {
    ok: true,
    party: moved,
    move,
    at: currentStop(moved),
    ...(skipped === undefined ? {} : { skipped }),
    ...(turn === undefined ? {} : { turn }),
    finished: routeFinished(moved),
  };
}

/**
 * Why the route of the train cannot be reversed from where the train is, or undefined when it
 * can. A route of fewer than two stops has no other order (`no-route`, `one-stop-route`); a
 * train that turns back at the end does it by itself (`reverse-turns-back`). A train that loops
 * may be reversed at any stop; one that finishes only at its first or last stop
 * (`reverse-mid-route`; it then runs the route from where it is). A finished route, of either
 * mode, only when it was finished from its last stop (`reverse-finished-elsewhere`; it then
 * starts the route again from there).
 */
export function cannotReverse(
  party: TrainParty,
):
  | 'no-route'
  | 'one-stop-route'
  | 'reverse-turns-back'
  | 'reverse-mid-route'
  | 'reverse-finished-elsewhere'
  | undefined {
  const { route, stop, atEnd, finishedFrom } = party.train;
  const length = route.length;
  if (length === 0) return 'no-route';
  if (length === 1) return 'one-stop-route';
  if (atEnd === 'turn-back') return 'reverse-turns-back';
  if (stop >= length) {
    return sameStop(finishedFrom, route[length - 1]) ? undefined : 'reverse-finished-elsewhere';
  }
  if (atEnd === 'loop' || stop === 0 || stop === length - 1) return undefined;
  return 'reverse-mid-route';
}

/**
 * Reverses the route: the same stops in the other order, with the train at the same stop (stop
 * `n - 1 - stop` of `n`). It is no movement: who is here stays here, and nobody is told but in
 * a line of the post. The mode of the train stays what it was. A finished route that may be
 * reversed (it was finished from its last stop) starts again: the train is at the first stop of
 * the reversed route, which is that stop, and remembers no Finish (`restarted`).
 *
 * Refused for a member who may not move the train (`mayNotMove`), for a control drawn where the
 * train no longer is (`from`, `train-moved-on`), for one drawn while the route ran the other way
 * (`first`, the handle of the stop the route began with then: `route-changed`), and where `cannotReverse` says
 * so, in that order. Reverse leaves the train where it is, so `from` alone would let a second
 * press of one panel, or a panel drawn before another member's Reverse, flip the route back.
 */
export function reverseRoute(
  party: TrainParty,
  memberId: string,
  staff: boolean,
  from?: string,
  first?: string,
): Change<TrainParty, { restarted: boolean }> {
  const forbidden = mayNotMove(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  const stale = from === undefined ? undefined : placeRefusal(party, from);
  if (stale) return refused(stale);
  const begins = party.train.route[0];
  if (
    first !== undefined &&
    (ambiguous(party, first) || first !== (begins === undefined ? '' : stopHandle(begins)))
  ) {
    return refused('route-changed');
  }
  const problem = cannotReverse(party);
  if (problem) return refused(problem);
  const { route, stop } = party.train;
  const restarted = routeFinished(party);
  const reversed = withTrain(party, {
    route: [...route].reverse(),
    stop: restarted ? 0 : route.length - 1 - stop,
    finishedFrom: null,
  });
  return { ok: true, party: reversed, restarted };
}

/**
 * Sets what the train does at the end of its route. It never moves the train, so it is for whoever
 * may arrange the route (`mayArrange`: who is signed up, conductor or not, and the maker, who may
 * give the train its route and with a saved route its mode) and for staff; anybody else is
 * refused (`not-attending`). With `from` (the map's panel; Manage… after a change of the route)
 * the train must still be there (`train-moved-on`). A finished route stays finished. The very same party comes back
 * when the train has that mode already.
 */
export function setAtEnd(
  party: TrainParty,
  memberId: string,
  staff: boolean,
  atEnd: TrainAtEnd,
  from?: string,
): Change<TrainParty> {
  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
  const stale = from === undefined ? undefined : placeRefusal(party, from);
  if (stale) return refused(stale);
  if (party.train.atEnd === atEnd) return { ok: true, party };
  return { ok: true, party: withTrain(party, { atEnd }) };
}

/**
 * Sets what kind of battles the train goes to (plan 8X-4; design 6.1: Manage…'s menu "What the
 * train is mainly for", plan 8X-G, and the map's panel). It changes the lobby the post counts at once (`lobbySize`); groups
 * already made stay as they are. For who may move the train and for staff (`mayNotMove`: Manage…
 * opens only for them). The very same party comes back when the train is of that kind
 * already.
 */
export function setTrainKind(
  party: TrainParty,
  memberId: string,
  staff: boolean,
  kind: TrainKind,
): Change<TrainParty> {
  const forbidden = mayNotMove(party, memberId, staff);
  if (forbidden) return refused(forbidden);
  if (party.train.kind === kind) return { ok: true, party };
  return { ok: true, party: withTrain(party, { kind }) };
}

/**
 * Makes a member the conductor. They must be signed up (`not-attending`; the legacy bot did not
 * ask). Taking it over from another conductor is allowed: somebody who went offline must be
 * replaceable. `previous` is who was the conductor before; the very same party comes back for
 * the member who is it already.
 */
export function setConductor(
  party: TrainParty,
  memberId: string,
): Change<TrainParty, { previous: string | null }> {
  if (!attendeeOf(party, memberId)) return refused('not-attending');
  const previous = party.train.conductorId;
  if (previous === memberId) return { ok: true, party, previous };
  return { ok: true, party: withTrain(party, { conductorId: memberId }), previous };
}

/**
 * Leaves the train without a conductor. Only the conductor themself and staff may
 * (`conductor-or-staff`; with the legacy bot anybody could). `previous` is who was the
 * conductor; the very same party comes back when there was none.
 */
export function clearConductor(
  party: TrainParty,
  memberId: string,
  staff: boolean,
): Change<TrainParty, { previous: string | null }> {
  const previous = party.train.conductorId;
  if (previous === null) return { ok: true, party, previous };
  if (!leads(party, memberId, staff)) return refused('conductor-or-staff');
  return { ok: true, party: withTrain(party, { conductorId: null }), previous };
}

/**
 * Sets which Pokémon the train is after, or none with null: for the picture and what the post
 * says about that boss. It has no tier, no moves and no times: a train goes from raid to raid.
 * The very same party comes back when the boss is what it was.
 */
export function setTrainBoss(party: TrainParty, boss: RaidBossRef | null): Change<TrainParty> {
  if (sameBoss(party.train.boss, boss)) return { ok: true, party };
  return { ok: true, party: withTrain(party, { boss }) };
}

/*
 * Splitting a group off a train (plan 8T, docs/superpowers/specs/2026-10-17-train-split-design.md):
 * the group becomes a train of its own with the same route, stop, mode, boss and times, its
 * members moved there; the old train goes on without them. Who may is `mayNotSplit`; the new
 * train is `splitTrain`, the old one `splitOffGroup`, and what changed on the new one while its
 * post was being made is kept by `carriedSplit`.
 */

/**
 * Why a member may not split this group off the train, or undefined when they may. Nobody may
 * split a train of one group (`one-group`), one without a post yet (`unposted`: the new train
 * links to it), the new train of a split that is not settled yet (`split-pending`: until the
 * paired write commits the group is still on the old train too, and a group split off it would
 * outlive its take-back), a group it does not have (`no-such-group`), one that nobody is in
 * (`empty-group`) or one that everybody on the train is in (`whole-train`: the old train would
 * be left empty; Matt, 2026-10-17). Staff may split any other group, and so may the conductor;
 * a member of the group (signed up in it, whatever their status) may split their own group
 * (`not-in-group` for anybody else), unless the conductor is in it (`conductor-in-group`): then
 * only the conductor and staff may. Without a conductor, any member of the group may.
 */
export function mayNotSplit(
  party: TrainParty,
  memberId: string,
  staff: boolean,
  groupId: string,
):
  | 'one-group'
  | 'unposted'
  | 'split-pending'
  | 'no-such-group'
  | 'empty-group'
  | 'whole-train'
  | 'not-in-group'
  | 'conductor-in-group'
  | undefined {
  if (party.groups.length < 2) return 'one-group';
  if (party.forumPostId === null) return 'unposted';
  if (party.train.splitFrom?.pending === true) return 'split-pending';
  if (!groupOf(party, groupId)) return 'no-such-group';
  const members = membersWhere(party, (attendee) => attendee.group === groupId);
  if (members.length === 0) return 'empty-group';
  if (members.length === Object.keys(party.attendees).length) return 'whole-train';
  const { conductorId } = party.train;
  if (staff || conductorId === memberId) return undefined;
  if (!members.includes(memberId)) return 'not-in-group';
  if (conductorId !== null && members.includes(conductorId)) return 'conductor-in-group';
  return undefined;
}

/** The groups this member may split off the train, in the order of the groups. */
export function splittableGroups(party: TrainParty, memberId: string, staff: boolean): GroupId[] {
  return party.groups
    .filter((group) => mayNotSplit(party, memberId, staff, group.id) === undefined)
    .map((group) => group.id);
}

/**
 * Whether the train has something to split: two groups or more with somebody in them, and no
 * split of its own pending (`mayNotSplit`; the post shows "Split…" only then).
 */
export function splitsPossible(party: TrainParty): boolean {
  if (party.train.splitFrom?.pending === true) return false;
  const filled = new Set(Object.values(party.attendees).map((attendee) => attendee.group));
  return party.groups.filter((group) => filled.has(group.id)).length >= 2;
}

/** FNV-1a of a group's label and the newest split before it, in base 36 (`groupMark`). */
function markOf(label: string | undefined, newest: string | undefined): string {
  let hash = 0x811c9dc5;
  for (const unit of `${label ?? ''}\u0000${newest ?? ''}`) {
    hash ^= unit.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * A short mark of a group as it is now: `<stamp>.<hash>`, when it was opened (`groupStamp`, plan
 * 8X-1B), then a hash of its label (or none) and which group was split off the train last (the
 * newest `splitOff`'s party). The split's dialog carries it, so that a Submit for a group that
 * went (pruned once it emptied, or split off) or whose letter a group opened since has, is
 * refused as no such group, and one for a group whose label changed since, or whose letter
 * another group has after a split (even with the same label), as `group-changed`, instead of
 * splitting what it did not show. Undefined for a group the train does not have.
 */
export function groupMark(party: TrainParty, groupId: string): string | undefined {
  const group = groupOf(party, groupId);
  if (!group) return undefined;
  return `${groupStamp(party, group)}.${markOf(group.label, party.train.splitOff[0]?.partyId)}`;
}

/** The stamp a mark was drawn with (`groupMark`): what comes before its dot. */
function markStamp(mark: string): string {
  return mark.slice(0, Math.max(0, mark.indexOf('.')));
}

/**
 * The split a stale mark was drawn for, when that very group is the one split off last: the
 * newest `splitOff` is of this letter, and the mark is what that group had just before (its
 * stamp, its label then, the split before it). An answer to a second Submit of one dialog can
 * then say where the group went. Undefined otherwise.
 */
export function splitDrawn(
  party: TrainParty,
  groupId: string,
  drawn: string,
): SplitOff | undefined {
  const [newest, before] = party.train.splitOff;
  if (newest?.group !== groupId) return undefined;
  const mark = `${groupStamp(party, newest)}.${markOf(newest.label, before?.partyId)}`;
  return mark === drawn ? newest : undefined;
}

/** The members of a group, with their records, in the order they signed up. */
function groupMembers(party: TrainParty, groupId: string): Record<string, Attendee> {
  return Object.fromEntries(
    Object.entries(party.attendees).filter(([, attendee]) => attendee.group === groupId),
  );
}

/**
 * Who leads the train a group becomes: the conductor of the old train when they go with the
 * group, otherwise the member who splits it when they do and did not ask not to be named
 * (`anonymous`: as a train made anonymously, it has none until `/conductor set`; Matt,
 * 2026-10-17), otherwise nobody (staff, or the conductor of the old train, splitting a group they
 * are not in).
 */
function splitConductor(
  party: TrainParty,
  moved: Readonly<Record<string, Attendee>>,
  by: string,
  anonymous: boolean,
): string | null {
  const { conductorId } = party.train;
  if (conductorId !== null && Object.hasOwn(moved, conductorId)) return conductorId;
  return !anonymous && Object.hasOwn(moved, by) ? by : null;
}

/** At most `room` characters of a text, cut at the end with `…`, never inside a character. */
function cutName(text: string, room: number): string {
  if (text.length <= room) return text;
  return `${text.slice(0, Math.max(0, room - 1)).replace(/[\uD800-\uDBFF]$/u, '')}…`;
}

/**
 * The name of the train a group becomes: `<old name> (<label>)`, or `(<letter>)` for a group
 * without a label, within `MAX_PARTY_NAME`. When it is too long, the group's part keeps at least
 * half of the room (more when the old name is short) and the old name what is left, each cut
 * with `…`.
 */
function splitName(name: string, tag: string): string {
  const whole = `${name} (${tag})`;
  if (whole.length <= MAX_PARTY_NAME) return whole;
  const room = MAX_PARTY_NAME - 3;
  const tagRoom = Math.min(tag.length, Math.max(Math.floor(room / 2), room - name.length));
  return tidyName(`${cutName(name, room - tagRoom)} (${cutName(tag, tagRoom)})`) ?? name;
}

/** What it takes to split a group off a train, besides the train. */
export interface NewSplit {
  /** A fresh UUID: the id of the new train. */
  id: string;
  /** Snowflake of the member who splits it off: the maker of the new train. */
  by: string;
  /** They asked not to be named (`RaidPrivacy.Anonymous`), as for a train they make. */
  anonymous: boolean;
  group: GroupId;
  now: number;
}

/**
 * The train a group of `party` becomes (it must have the group, and a post: `mayNotSplit`):
 * `<name> (<label or letter>)`, in the same server and region, made now by the member who splits
 * it off (named unless they asked not to be, as for `/train`), with nothing on Discord yet. It
 * is where the old train is, as it is: its route, stop, the stop a finished route was finished
 * from, its mode, its boss, its start and end. It has one group, A, with the group's label; the
 * group's members are in it as they are (status, head count, remote, name, team). It is led as
 * `splitConductor` says, and remembers the train and post it was split off from, `pending`
 * until the split is settled (`splitSettled`).
 */
export function splitTrain(party: TrainParty, split: NewSplit): TrainParty {
  const group = groupOf(party, split.group);
  const moved = groupMembers(party, split.group);
  const label = group?.label;
  const postId = party.forumPostId;
  const base: TrainParty = {
    id: split.id,
    type: 'train',
    guildId: party.guildId,
    status: 'active',
    regionId: party.regionId,
    gymId: null,
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    createdById: split.by,
    anonymous: split.anonymous,
    hatchTime: null,
    endTime: party.endTime,
    lastPossibleTime: null,
    deletionTime: null,
    saved: false,
    createdAt: split.now,
    updatedAt: split.now,
    attendees: inGroupA(moved),
    groups: [{ id: 'A', ...(label === undefined ? {} : { label }) }],
    defaultGroupId: 'A',
    prompts: NO_PROMPTS,
    timed: {
      name: splitName(party.timed.name, label ?? split.group),
      startTime: party.timed.startTime,
    },
    train: party.train,
  };
  const placed = withTrain(base, {
    conductorId: splitConductor(party, moved, split.by, split.anonymous),
    splitFrom: postId === null ? null : { partyId: party.id, postId, pending: true },
    splitOff: [],
  });
  return settled(placed, split.now);
}

/** These records, every one in group A. */
function inGroupA(records: Readonly<Record<string, Attendee>>): Record<string, Attendee> {
  return Object.fromEntries(
    Object.entries(records).map(([memberId, attendee]) => [memberId, { ...attendee, group: 'A' }]),
  );
}

/** The old train at the moment of a split, as the new one goes on from it (`carriedSplit`). */
export interface SplitMoment {
  train: TrainDetails;
  startTime: number | null;
  endTime: number | null;
}

/**
 * The train after a group was split off it into the train `link` names: without that group and
 * its members (`moved`, their records as they were then), its other groups keeping their letters
 * (renaming them would confuse who is where); when the group new sign-ups land in went, the
 * newest group left takes over. Its conductor stays, but for one who went with the group. It
 * keeps its route, stop, mode and times, and remembers the split, newest first (at most
 * `MAX_SPLITS_KEPT`). `conductor` is who leads the new train, as the group is now
 * (`splitConductor`, `anonymous` saying whether the member asked not to be named), `group` the
 * group as it was, and `was` where the train is and its times then, for the new one to go on
 * from.
 *
 * Refused as `mayNotSplit` says; and with `drawn`, the mark of the group as the dialog showed
 * it (`groupMark`), when the group is gone or another group has its letter now (opened since:
 * `no-such-group`, plan 8X-1B), or it is called otherwise now or another group was split off
 * since (`group-changed`).
 */
export function splitOffGroup(
  party: TrainParty,
  memberId: string,
  staff: boolean,
  groupId: GroupId,
  link: TrainLink,
  drawn?: string,
  anonymous = false,
): Change<
  TrainParty,
  {
    moved: Record<string, Attendee>;
    group: PartyGroup;
    conductor: string | null;
    was: SplitMoment;
  }
> {
  if (drawn !== undefined) {
    if (!stampedGroup(party, groupId, markStamp(drawn))) return refused('no-such-group');
    if (groupMark(party, groupId) !== drawn) return refused('group-changed');
  }
  const problem = mayNotSplit(party, memberId, staff, groupId);
  if (problem) return refused(problem);
  const group = groupOf(party, groupId);
  if (!group) return refused('no-such-group');
  const moved = groupMembers(party, groupId);
  const attendees = Object.fromEntries(
    Object.entries(party.attendees).filter(([memberId]) => !Object.hasOwn(moved, memberId)),
  );
  const groups = party.groups.filter((other) => other.id !== groupId);
  const defaultGroupId =
    party.defaultGroupId === groupId
      ? (newestFirst({ ...party, groups })[0]?.id ?? 'A')
      : party.defaultGroupId;
  const { conductorId } = party.train;
  const entry: SplitOff = {
    ...link,
    group: groupId,
    ...(group.label === undefined ? {} : { label: group.label }),
    ...(group.opened === undefined ? {} : { opened: group.opened }),
  };
  const after = withTrain(
    { ...party, attendees, groups, defaultGroupId },
    {
      conductorId: conductorId !== null && Object.hasOwn(moved, conductorId) ? null : conductorId,
      splitOff: [entry, ...party.train.splitOff].slice(0, MAX_SPLITS_KEPT),
    },
  );
  return {
    ok: true,
    party: after,
    moved,
    group,
    conductor: splitConductor(party, moved, memberId, anonymous),
    was: { train: party.train, startTime: party.timed.startTime, endTime: party.endTime },
  };
}

/** Whether two attendee records say the same, over their own keys. */
function sameAttendee(a: Attendee, b: Attendee): boolean {
  const left = Object.entries(a);
  return (
    left.length === Object.keys(b).length &&
    left.every(([key, value]) => b[key as keyof Attendee] === value)
  );
}

/**
 * Whether two trains are at the same place of the same route, in the same mode and of the same
 * kind, after one boss.
 */
function samePlace(a: TrainDetails, b: TrainDetails): boolean {
  return (
    a.route.length === b.route.length &&
    a.route.every((ref, n) => sameStop(b.route[n], ref)) &&
    a.stop === b.stop &&
    sameStop(a.finishedFrom, b.finishedFrom) &&
    a.atEnd === b.atEnd &&
    a.kind === b.kind &&
    sameBoss(a.boss, b.boss)
  );
}

/** Whether two records of attendees say the same of the same members, in the same order. */
function sameAttendees(
  a: Readonly<Record<string, Attendee>>,
  b: Readonly<Record<string, Attendee>>,
): boolean {
  const left = Object.entries(a);
  const right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(([memberId, attendee], n) => {
      const other = b[memberId];
      return right[n] === memberId && other !== undefined && sameAttendee(attendee, other);
    })
  );
}

/**
 * `target`, the new train of a split, with the members the split moved (`moved`: the group as it
 * was at the moment of the split, a moment after the new train was made as `start`): what members
 * did meanwhile counts. Who was in the group then is on the new train, in group A, as they were
 * on the old one; who left the group of the old train meanwhile is not (unless they acted on the
 * new one). A member whose record on the new train differs from `start` acted on it and keeps
 * that record, who joined it keeps theirs, and who left it stays out. The conductor is
 * `conductor` (who leads it as the group was at the split) unless somebody changed the conductor
 * of the new train meanwhile; a conductor who is not on it leads nothing. With `was` (the old
 * train at the split, `splitOffGroup`), the new train is where the old one was then (its route,
 * stop, mode, boss) and has its start and end, unless somebody changed those on the new train
 * meanwhile; `now` is when, for what follows from the times (`settled`). The very same `target`
 * when that changes nothing.
 */
export function carriedSplit(
  target: TrainParty,
  start: TrainParty,
  moved: Readonly<Record<string, Attendee>>,
  conductor: string | null,
  was?: SplitMoment,
  now: number = target.updatedAt,
): TrainParty {
  const attendees: Record<string, Attendee> = {};
  const acted = (memberId: string): Attendee | undefined => {
    const now = attendeeOf(target, memberId);
    const was = attendeeOf(start, memberId);
    return now !== undefined && (was === undefined || !sameAttendee(now, was)) ? now : undefined;
  };
  for (const [memberId, now] of Object.entries(target.attendees)) {
    const record = Object.hasOwn(moved, memberId) ? moved[memberId] : undefined;
    const own = acted(memberId);
    if (own) attendees[memberId] = own;
    else if (record) attendees[memberId] = { ...record, group: 'A' };
    // Otherwise: in the group when the new train was made, and no longer at the split.
    else if (!attendeeOf(start, memberId)) attendees[memberId] = now;
  }
  for (const [memberId, record] of Object.entries(moved)) {
    if (Object.hasOwn(attendees, memberId)) continue;
    // In the new train from the start and no longer: they left it there.
    if (attendeeOf(start, memberId)) continue;
    attendees[memberId] = { ...record, group: 'A' };
  }
  const changed = target.train.conductorId !== start.train.conductorId;
  const leads = changed ? target.train.conductorId : conductor;
  const conductorId = leads !== null && Object.hasOwn(attendees, leads) ? leads : null;
  // Where the old train was at the split, unless the new one was moved or edited meanwhile.
  const place =
    was === undefined || !samePlace(target.train, start.train) || samePlace(target.train, was.train)
      ? undefined
      : {
          route: was.train.route,
          stop: was.train.stop,
          finishedFrom: was.train.finishedFrom,
          atEnd: was.train.atEnd,
          kind: was.train.kind,
          boss: was.train.boss,
        };
  const ownTimes =
    target.timed.startTime !== start.timed.startTime || target.endTime !== start.endTime;
  const times =
    was === undefined ||
    ownTimes ||
    (target.timed.startTime === was.startTime && target.endTime === was.endTime)
      ? undefined
      : was;
  if (
    place === undefined &&
    times === undefined &&
    conductorId === target.train.conductorId &&
    sameAttendees(attendees, target.attendees)
  ) {
    return target;
  }
  const carried = withTrain(
    {
      ...target,
      attendees,
      ...(times
        ? { endTime: times.endTime, timed: { ...target.timed, startTime: times.startTime } }
        : {}),
    },
    { ...place, conductorId },
  );
  return times ? settled(carried, now) : carried;
}

/**
 * The new train of a split once the split is settled: `splitFrom` no longer `pending`. The very
 * same train when it is not pending.
 */
export function splitSettled(party: TrainParty): TrainParty {
  const from = party.train.splitFrom;
  if (from?.pending !== true) return party;
  return withTrain(party, { splitFrom: { partyId: from.partyId, postId: from.postId } });
}
