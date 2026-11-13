import type { SavedRoute, SavedRouteStorage } from '../db/repositories/saved-route-repository.js';
import type { UserSettingsReader } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { noteMember } from '../domain/party/attendance.js';
import {
  isTrain,
  MAX_ROUTE_STOPS,
  memberOf,
  membersWhere,
  refused,
  type Change,
  type GroupId,
  type PartyProblem,
  type RaidBossRef,
  type StopRef,
  type TrainAtEnd,
  type TrainKind,
  type TrainParty,
} from '../domain/party/party.js';
import {
  addStop,
  clearConductor,
  clearRoute,
  conductorDrawn,
  currentStop,
  moveStop,
  moveTrain,
  placeOf,
  removeStop,
  replaceRoute,
  reverseRoute,
  routeDrawn,
  routeFinished,
  setAtEnd,
  setConductor,
  setTrainBoss,
  setTrainKind,
  type ConductorSeen,
  type TrainMove,
  type TrainMoved,
} from '../domain/party/train.js';
import { tidyName } from '../domain/party/timed.js';
import { gymStop, hasStop, sameStop, stopIndexOf } from '../domain/party/stops.js';
import type { Logger } from '../log.js';
import type { PostGym } from '../render/raid-post.js';
import { stopInWords, stopsFrom } from '../render/train-stops.js';
import { doer } from '../render/activity.js';
import { groupWords } from '../render/party-controls.js';
import { count, endSentence, memberText, plain } from '../render/text.js';
import {
  atEndSentence,
  atEndSetWords,
  movementText,
  TRAIN_KIND_WORDS,
  type Movement,
} from '../render/train-words.js';
import type { Member } from './attendance-service.js';
import { Gathered } from './gathered.js';
import { byMember, pingInMessages, settingsOf, storedChange } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PartyService, SplitOutcome } from './party-service.js';
import type { PartyStore } from './party-store.js';
import { stopRegionsInGuild, type RegionProvider } from './region-directory.js';
import type { GymView } from './gym-directory.js';
import type { WayspotProvider } from './wayspot-directory.js';

/**
 * What came of a change to a train. `gone`: there is no such active train (a raid or a meetup
 * is none). `refused`: the train stays as it was. `ok`: the train as it is stored now;
 * `changed` is false when it already was so.
 */
export type TrainChangeOutcome<Extra = unknown> =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem }
  | ({ kind: 'ok'; party: TrainParty; changed: boolean } & Extra);

/** What Manage… asks of a train (plan 8X-G): each part only where it changes something. */
export interface TrainManage {
  kind?: TrainKind;
  /** Reverse the route, or finish it at the stop the train is at. */
  route?: 'reverse' | 'finish';
  atEnd?: TrainAtEnd;
}

/** What Manage… changed: the kind, the route (and whether a reversal restarted it), the mode. */
export interface TrainManaged {
  kindSet: boolean;
  route?: 'reversed' | 'finished';
  restarted: boolean;
  atEndSet: boolean;
}

/** The line of a kind set: `<doer> made this a Gigantamax Train.` */
function kindLine(party: TrainParty, member: Member, kind: TrainKind): string {
  const who = doer(party, member);
  const what = TRAIN_KIND_WORDS[kind];
  return who ? `${who} made this a ${what}.` : `This train was made a ${what}.`;
}

/** The line of a mode set: `<doer> set the train to loop.` */
function atEndLine(party: TrainParty, member: Member, atEnd: TrainAtEnd): string {
  const who = doer(party, member);
  return who
    ? `${who} set the train ${atEndSetWords(atEnd)}.`
    : `The train was set ${atEndSetWords(atEnd)}.`;
}

export interface TrainServiceOptions {
  store: PartyStore;
  gateway: Pick<PartyGateway, 'sendMessage'>;
  /** Told after every stored change, to bring the post and the summary up to date. */
  posts: { changed(partyId: string): void };
  /** Where the lines go that ping nobody. */
  lines: Pick<PartyLines, 'say'>;
  /**
   * Where every line of a train's own change goes when given (`apply`: the kind, route and mode,
   * a stop moved, the route cleared, the conductor, the boss; `TimedPartyService.line`, review
   * SF1-6): held while Manage… makes its changes `together`, and after a waiting start in its
   * message, as `/end`'s and `/name`'s are; else `lines`. The movement announcement and a split's
   * message keep their own paths.
   */
  timedLines?: { line(partyId: string, postId: string, text: string): void };
  /** The members' settings: who lets the bot ping them when the train moves. */
  users: UserSettingsReader;
  /**
   * The gyms per server (plan 19B-2): a stop is named as the train's server stored it (`stored`);
   * whether it is still a stop, and where it lies, is read in that server's view (`of`), so that
   * a gym the server deleted is gone for its trains though another server keeps it. `size`, how
   * many gyms the list knows, for the sweep of stops whose gym is gone (`removeUnknownStops`).
   */
  gyms: {
    of(guildId: number | undefined): Pick<GymView, 'get' | 'regionsOf'>;
    stored(id: number): PostGym | undefined;
    readonly size?: number;
  };
  /**
   * The kept Wayspots (plan 8X-4), to name a power spot of a route as it is now; without them every
   * power spot is unknown.
   */
  wayspots?: Pick<WayspotProvider, 'of' | 'stored' | 'addressOf' | 'size'>;
  /** The regions, to tell the gyms of the server of a train from those of another. */
  regions: Pick<RegionProvider, 'byChannel'>;
  /** The routes members saved (the table `SavedRoutes`). */
  routes: SavedRouteStorage;
  /** What makes the train a group becomes, with its post (`PartyService.splitTrain`). */
  splits: Pick<PartyService, 'splitTrain'>;
  log: Logger;
  now?: () => number;
  /**
   * How long after the last move of a train the members are told. Default five seconds: Next
   * pressed twice is one message, with one ping, that says where the train is then.
   */
  announceDelayMs?: number;
}

/** Who removes a stop when the bot itself does (`removeUnknownStops`): nobody's snowflake. */
const SWEEPER = '0';

/**
 * What the value of a choice of the list of saved routes looks like (`id:` and the id of a
 * row): a route cannot be called so, and whatever else is typed for a route is a name.
 */
export const SAVED_ROUTE_CHOICE = /^id:\d+$/i;

/**
 * The refusal of an edit drawn from a route that is no longer the train's (`routeDrawn`), or
 * undefined to go on with it.
 */
function stale(party: TrainParty, drawn: readonly string[] | undefined) {
  const edited = routeDrawn(party, drawn);
  return edited ? refused(edited) : undefined;
}

/** The refusal of a button drawn when the conductor role was another's, or undefined to go on. */
function refusedFor(problem: 'conductor-changed' | undefined) {
  return problem ? refused(problem) : undefined;
}

function placeNow(party: TrainParty): Place {
  return { at: currentStop(party), finished: routeFinished(party), route: party.train.route };
}

/**
 * Movements of a train whose announcement is waiting: where the train was before the first of
 * them, by its stop and not by the number of its stop (an edit of the route changes the numbers
 * while the train stays where it is), and what the steps were.
 */
interface PendingMove {
  /** The stop the train was at before the first step; undefined when it was at none. */
  fromStop: StopRef | undefined;
  /** Whether it had finished its route then, and the route it had. */
  fromFinished: boolean;
  fromRoute: readonly StopRef[];
  /** How many steps are gathered: moves, and edits of the route that moved the train. */
  count: number;
  /**
   * Every one of the steps was Previous or finished the route: no other move, and no edit that
   * moved the train.
   */
  onlyBack: boolean;
  /** The last step when it was a move; undefined when it was an edit of the route. */
  last: TrainMoved | undefined;
  /** The stop the train was at before the last step: where it turned, when it turned back. */
  lastFrom: StopRef | undefined;
  /** Who moved the train last. */
  by: Member;
}

/** Where a train is, taken inside a change, to tell afterwards whether the change moved it. */
interface Place {
  at: StopRef | undefined;
  finished: boolean;
  route: readonly StopRef[];
}

/**
 * What members change about a raid train as such: its route, where it is on it, its conductor
 * and the boss it is after. It is to a train what `RaidChangeService` is to a raid (its name
 * and its times are `TimedPartyService`'s, its members `AttendanceService`'s): every method
 * decides inside the store, has the post shown anew and says in the post who changed what, in
 * a line that pings nobody; the caller tells the member privately.
 *
 * A movement of the train is the one thing that pings: everybody else who is signed up and
 * allows it (`mentions` and `mentionsTrainStops`) is told where the train is going, in a message
 * of its own. A movement is a move (`move`) and every edit of the route after which the train is
 * somewhere else (the stop it was at was removed, a stop was added to a finished route, a route
 * was loaded). That message is gathered (`Gathered`): it goes out a few seconds after the last
 * movement and says where the train is then. Earlier ones stay in the post: it is a feed.
 *
 * It also keeps the routes members save (`saveRoute`, `loadRoute`, `forgetRoute`): a saved
 * route belongs to the member and to the region the train was made in.
 */
export class TrainService {
  private readonly now: () => number;
  private readonly moves: Gathered<PendingMove>;

  constructor(private readonly options: TrainServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.moves = new Gathered({
      delayMs: options.announceDelayMs ?? 5_000,
      send: (partyId, pending) => this.announceMove(partyId, pending),
      // Two announcements made one: from where the older began, by all the steps of both.
      fold: (older, newer) => ({
        ...newer,
        fromStop: older.fromStop,
        fromFinished: older.fromFinished,
        fromRoute: older.fromRoute,
        count: older.count + newer.count,
        onlyBack: older.onlyBack && newer.onlyBack,
      }),
      onError: (err, party) => {
        options.log.warn({ err, party }, 'could not announce where a train is going');
      },
    });
  }

  /**
   * A stop of a train's route as a line names it, as it is now (gyms from the gym list, power
   * spots from the train's server's Wayspots): `**The Stacks**`, `**Gazebo** (Power Spot)`.
   */
  private named(party: TrainParty, ref: StopRef): string {
    return stopInWords(stopsFrom(this.options.gyms, this.options.wayspots, party.guildId)(ref));
  }

  /**
   * Whether a stop can be a stop of this train: it lies in a region of the server of the train,
   * as every gym and power spot does that the list of `/route add` offers (plan 8X-4: a power
   * spot while it is kept as one, `stopRegionsInGuild`). A stop of another server, or one that
   * lies in no region, is none: to the members of this train there is no such stop.
   */
  reaches(party: TrainParty, ref: StopRef): boolean {
    const { gyms, wayspots, regions } = this.options;
    const places = { gyms, ...(wayspots === undefined ? {} : { wayspots }) };
    return stopRegionsInGuild(places, regions, ref, party.guildId).length > 0;
  }

  /**
   * Whether a stop of this train is gone: a gym its server's list no longer has (plan 19B-2: one
   * the server deleted is gone, though another server keeps it), a power spot no longer kept as
   * one.
   */
  private gone(party: TrainParty, ref: StopRef): boolean {
    if (ref.kind === 'gym') return this.options.gyms.of(party.guildId).get(ref.id) === undefined;
    return this.options.wayspots?.of(party.guildId).byId(ref.id)?.kind !== 'powerspot';
  }

  /**
   * Adds a stop, a gym or a power spot, to the end of the route (`addStop`): for a member who is
   * signed up; refused for a stop that is on the route already. `number` is the number of the new stop. A stop added
   * to a finished route is where the train then goes (`moved`): that takes the right to move
   * the train (`staff` says whether the member is staff), and the others are told. The first
   * stop of a route is an ordinary edit: a line, and no announcement. A gym that is no longer in
   * the gym list is refused (`gym-gone`), a power spot no longer kept as one (`spot-gone`), which
   * is asked inside the store: the member picked it a moment ago, and it may have gone since.
   *
   * `drawn` (here and for the other edits of the route) is the route a control was drawn from
   * (the live map's route editor): the edit is refused (`route-edited`) when the route is
   * another by now. A command gives none.
   */
  addStop(
    partyId: string,
    member: Member,
    added: StopRef,
    staff = false,
    drawn?: readonly string[],
  ): Promise<TrainChangeOutcome<{ number: number; moved: boolean }>> {
    return this.movable(
      partyId,
      member,
      (party) =>
        stale(party, drawn) ??
        (this.gone(party, added)
          ? refused(added.kind === 'gym' ? 'gym-gone' : 'spot-gone')
          : addStop(party, member.id, added, staff)),
      (party, result) => {
        const who = doer(party, member);
        return endSentence(
          who
            ? `${who} added stop ${result.number} to the route: ${this.named(party, added)}`
            : `Stop ${result.number} was added to the route: ${this.named(party, added)}`,
        );
      },
    );
  }

  /**
   * Takes the stop with this number off the route (`removeStop`); `stop` is the stop it was.
   * Removing the stop the train is at moves the train (`moved`), as for `addStop`.
   */
  removeStop(
    partyId: string,
    member: Member,
    number: number,
    staff = false,
    drawn?: readonly string[],
  ): Promise<TrainChangeOutcome<{ stop: StopRef; moved: boolean }>> {
    return this.movable(
      partyId,
      member,
      (party) => stale(party, drawn) ?? removeStop(party, member.id, number, staff),
      (party, removed) => {
        const who = doer(party, member);
        return who
          ? `${who} took ${this.named(party, removed.stop)} off the route.`
          : `${this.named(party, removed.stop)} was taken off the route.`;
      },
    );
  }

  /**
   * Takes a gym that was deleted from the gym list off the route of every active train that
   * has it as a stop, as the act of the staff member who deleted it: where it was the stop a
   * train is at, the train moves on like after any removal of its current stop (who is here is
   * coming again, and the others are told where it goes). Each post is told why, by the name
   * the gym had (`name`, made plain by the caller).
   *
   * Every active train is asked, through its own turn in the store, whether it has the gym: not
   * only those that have it in memory. A stop that was decided while the gym still existed and
   * whose row is on its way is not in memory yet, and only a change that waits behind it sees
   * it. For a train without the gym the change does nothing and writes nothing.
   *
   * Each train by itself: `changed` are the trains it was taken off, `failed` those for which
   * the removal was refused or could not be stored, which is logged. It never rejects for one
   * train's sake: the gym is gone already, and the other trains are still to do.
   */
  async gymRemoved(
    gymId: number,
    member: Member,
    name: string,
    guildId?: number,
  ): Promise<{ changed: TrainParty[]; failed: TrainParty[] }> {
    const changed: TrainParty[] = [];
    const failed: TrainParty[] = [];
    // Only the trains of the server that removed it (its `Guild` row) when the gym stays other
    // servers' (plan 19B-2); every train when it went.
    const trains = this.options.store
      .active()
      .filter(isTrain)
      .filter((train) => guildId === undefined || train.guildId === guildId);
    for (const train of trains) {
      try {
        const outcome = await this.movable(
          train.id,
          member,
          (party) => {
            const number = stopIndexOf(party.train.route, gymStop(gymId)) + 1;
            // Not on its route (any more): nothing to do, and nothing to say.
            if (number === 0) return { ok: true, party, stop: gymStop(gymId), moved: false };
            return removeStop(party, member.id, number, true);
          },
          () => `**${name}** was removed from Pine's gym list.`,
        );
        if (outcome.kind === 'refused') {
          throw new Error(`The removal of a deleted gym was refused: ${outcome.reason}`);
        }
        if (outcome.kind === 'ok' && outcome.changed) changed.push(outcome.party);
      } catch (err) {
        this.options.log.warn(
          { err, party: train.id, gym: gymId },
          'could not take a deleted gym off the route of a train',
        );
        failed.push(train);
      }
    }
    return { changed, failed };
  }

  /**
   * Takes every stop off the routes of the active trains that is gone: a gym the gym list does not
   * know, what a deletion could not mend (a train that could not be stored then, or the bot
   * stopped between the end of the gym and the trains); a power spot that is no longer kept as
   * one (plan 8X-4; design 6.2: an import found it gone, or made it a PokéStop or a gym: a
   * train's spot never becomes a stop of another kind). It is the bot's own act: the post is told
   * in a line, and nobody is pinged, also when the train was at that stop (who was here is coming
   * again, as after any removal of the current stop). Gives how many trains were changed.
   *
   * No gym is taken off while the gym list knows no gym at all, and no power spot while no
   * Wayspot is kept, each kind on its own: against a list that is empty, a sweep would empty every
   * route. (A list that could not be read keeps what it had.)
   */
  async removeUnknownStops(): Promise<number> {
    const { store, gyms, posts, lines, log } = this.options;
    // Each kind on its own: an empty gym list leaves the gyms alone, not the power spots.
    const gymsKnown = gyms.size !== 0;
    const spotsKnown = (this.options.wayspots?.size ?? 0) > 0;
    if (!gymsKnown && !spotsKnown) return 0;
    let mended = 0;
    for (const train of store.active().filter(isTrain)) {
      try {
        const stored = await storedChange<TrainParty, { gyms: number; spots: number }>(
          store,
          train.id,
          isTrain,
          (party) => {
            let current = party;
            const removed = { gyms: 0, spots: 0 };
            for (;;) {
              const index = current.train.route.findIndex(
                (ref) => (ref.kind === 'gym' ? gymsKnown : spotsKnown) && this.gone(current, ref),
              );
              const gone = current.train.route[index];
              if (gone === undefined) break;
              const without = removeStop(current, SWEEPER, index + 1, true);
              if (!without.ok) return without;
              current = without.party;
              if (gone.kind === 'gym') removed.gyms += 1;
              else removed.spots += 1;
            }
            return { ok: true, party: current, ...removed };
          },
        );
        if (stored.kind !== 'ok' || !stored.written) continue;
        mended += 1;
        posts.changed(train.id);
        const postId = stored.party.forumPostId;
        if (postId !== null) lines.say(postId, unknownStopsLine(stored.extra));
      } catch (err) {
        log.warn({ err, party: train.id }, 'could not take unknown stops off the route of a train');
      }
    }
    return mended;
  }

  /** Moves the stop with the number `from` to the number `to` (`moveStop`). */
  moveStop(
    partyId: string,
    member: Member,
    from: number,
    to: number,
    staff = false,
    drawn?: readonly string[],
  ): Promise<TrainChangeOutcome<{ stop: StopRef }>> {
    return this.apply(
      partyId,
      member,
      (party) => stale(party, drawn) ?? moveStop(party, member.id, from, to, staff),
      (party, moved) => {
        const who = doer(party, member);
        return who
          ? `${who} moved ${this.named(party, moved.stop)} to stop ${to} of the route.`
          : `${this.named(party, moved.stop)} was moved to stop ${to} of the route.`;
      },
    );
  }

  /** Empties the route (`clearRoute`): for the conductor, and for staff (`staff`). */
  clearRoute(
    partyId: string,
    member: Member,
    staff: boolean,
    drawn?: readonly string[],
  ): Promise<TrainChangeOutcome<{ moved: boolean }>> {
    return this.movable(
      partyId,
      member,
      (party) => stale(party, drawn) ?? clearRoute(party, member.id, staff),
      (party) => {
        const who = doer(party, member);
        return who ? `${who} cleared the route.` : 'The route was cleared.';
      },
    );
  }

  /**
   * Moves the train along its route (`moveTrain`): for the conductor and for staff, or without
   * a conductor for anybody who is signed up. Everybody who was here is coming again, unless the
   * route is finished by it. The others are told a moment later where the train is going.
   *
   * `from` is for a control that was drawn while the train was at some place (`placeOf`): the
   * move is refused (`train-moved-on`) when the train is no longer there. `target` is where
   * that control said the move leads (`targetOf`): refused (`route-changed`) when it no longer
   * does.
   */
  async move(
    partyId: string,
    member: Member,
    move: TrainMove,
    staff: boolean,
    from?: string,
    target?: string,
    where?: string,
  ): Promise<TrainChangeOutcome<TrainMoved>> {
    let start: Place | undefined;
    const outcome = await this.apply(partyId, member, (party) => {
      start = placeNow(party);
      return moveTrain(party, member.id, move, staff, from, target, where);
    });
    if (outcome.kind === 'ok' && outcome.changed && start) {
      const { party: _party, kind: _kind, changed: _changed, ...last } = outcome;
      this.movedFrom(partyId, start, member, last);
    }
    return outcome;
  }

  /** The line of a reversed route: `The route was reversed by X: it now runs from A to B.` */
  private reversedLine(party: TrainParty, member: Member, restarted: boolean): string {
    const { route } = party.train;
    const [start, end] = [route[0], route.at(-1)];
    const again =
      restarted && start !== undefined ? `, and starts again at ${this.named(party, start)}` : '';
    const runs =
      start === undefined || end === undefined
        ? ''
        : `: it now runs from ${this.named(party, start)} to ${this.named(party, end)}${again}`;
    const who = doer(party, member);
    return endSentence(
      who ? `The route was reversed by ${who}${runs}` : `The route was reversed${runs}`,
    );
  }

  /**
   * What Manage… of a train's post asks (plan 8X-G; review R6), as one change: the kind
   * (`setTrainKind`), then the route (`reverseRoute` or Finish, `moveTrain`), then the mode at the
   * end (`setAtEnd`), each only where asked. The route is judged before the mode (Reverse is
   * refused on a turn-back route whatever mode comes with it), and a refusal of any part refuses
   * all of it: one write, one line in the post of what changed, in that order. Who may: as
   * each part alone (the kind and the route who may move the train and staff, the mode who may
   * arrange it). `guards` are where the train was when the dialog opened (`from`, `placeOf`) and
   * the stop the route began with then (`first`, `stopHandle`): the route is changed only from
   * there. The kind and the mode ask nothing of where the train is (review r0 B1: a kind and a
   * mode picked in a dialog drawn before somebody moved the train are applied), the mode only
   * after a change of the route in the same Submit, where that change left it. A Finish is
   * announced as a move is.
   */
  async manage(
    partyId: string,
    member: Member,
    staff: boolean,
    asked: TrainManage,
    guards: { from: string; first: string },
  ): Promise<TrainChangeOutcome<TrainManaged>> {
    let start: Place | undefined;
    let finished: TrainMoved | undefined;
    const outcome = await this.apply<TrainManaged>(
      partyId,
      member,
      (party) => {
        start = placeNow(party);
        let current = party;
        const done: TrainManaged = { kindSet: false, restarted: false, atEndSet: false };
        if (asked.kind !== undefined) {
          const kind = setTrainKind(current, member.id, staff, asked.kind);
          if (!kind.ok) return kind;
          done.kindSet = kind.party !== current;
          current = kind.party;
        }
        // The place guards the route; the mode asks it only after a change of the route, which
        // the mode then follows (review r0 B1).
        let modeFrom: string | undefined;
        const from = guards.from;
        if (asked.route === 'reverse') {
          const reversed = reverseRoute(current, member.id, staff, from, guards.first);
          if (!reversed.ok) return reversed;
          done.route = 'reversed';
          done.restarted = reversed.restarted;
          current = reversed.party;
          modeFrom = placeOf(current);
        } else if (asked.route === 'finish') {
          const moved = moveTrain(current, member.id, 'finish', staff, from);
          if (!moved.ok) return moved;
          const { ok: _ok, party: after, ...last } = moved;
          if (after !== current) {
            done.route = 'finished';
            finished = last;
          }
          current = after;
          modeFrom = placeOf(current);
        }
        if (asked.atEnd !== undefined) {
          const mode = setAtEnd(current, member.id, staff, asked.atEnd, modeFrom);
          if (!mode.ok) return mode;
          done.atEndSet = mode.party !== current;
          current = mode.party;
        }
        return { ok: true, party: current, ...done };
      },
      (party, done) => {
        const said = [
          done.kindSet ? kindLine(party, member, party.train.kind) : undefined,
          done.route === 'reversed' ? this.reversedLine(party, member, done.restarted) : undefined,
          done.atEndSet ? atEndLine(party, member, party.train.atEnd) : undefined,
        ].filter((line) => line !== undefined);
        return said.length === 0 ? undefined : said.join(' ');
      },
    );
    if (outcome.kind === 'ok' && outcome.changed && start && finished) {
      this.movedFrom(partyId, start, member, finished);
    }
    return outcome;
  }

  /**
   * Splits a group off the train into a train of its own (plan 8T; `PartyService.splitTrain`):
   * for the conductor and staff any group, for a member of the group their own unless the
   * conductor is in it (`mayNotSplit`). `drawn` is the group's mark as the dialog showed it
   * (`groupMark`): refused (`group-changed`) when the group is called otherwise or gone by now;
   * `anonymous` the member's privacy, for the new train's maker.
   *
   * Then each post says who did it, in a line without a link (the links are in the posts' small
   * print): the old one `<doer> split group B (Fast) off into a train of its own.`, the new one
   * `<doer> split this train off with group B (Fast).`, which pings the members who moved and
   * allow it (`mentions`), never the member who split it, once. The doer is named through
   * `doer`; a maker who asked not to be named is not.
   */
  async split(
    partyId: string,
    member: Member,
    staff: boolean,
    group: GroupId,
    options: { anonymous?: boolean; drawn?: string } = {},
  ): Promise<SplitOutcome> {
    const { splits, lines, store, gateway, users, log } = this.options;
    const outcome = await splits.splitTrain({
      partyId,
      by: member,
      staff,
      group,
      anonymous: options.anonymous ?? false,
      ...(options.drawn === undefined ? {} : { drawn: options.drawn }),
    });
    if (outcome.kind !== 'split') return outcome;
    const { party, from } = outcome;
    const words = groupWords(outcome.group);
    const oldWho = doer(from, member);
    if (from.forumPostId !== null) {
      lines.say(
        from.forumPostId,
        oldWho
          ? `${oldWho} split ${words} off into a train of its own.`
          : `${capitalised(words)} was split off into a train of its own.`,
      );
    }
    const newWho = doer(party, member);
    const text = newWho
      ? `${newWho} split this train off with ${words}.`
      : `This train was split off with ${words}.`;
    const postId = party.forumPostId;
    try {
      const others = outcome.moved.filter(
        (id) => id !== member.id && store.get(party.id)?.attendees[id] !== undefined,
      );
      const settings = await settingsOf(users, others, log);
      const pingable = others.filter((id) => settings.get(id)?.mentions === true);
      // A message into the post of a party that has ended would open an archived post again
      // (`pingInMessages` asks before each); a group of a Gigantamax train is pinged whole.
      if (postId !== null)
        await pingInMessages({ store, gateway }, party.id, postId, text, pingable);
    } catch (err) {
      log.warn({ err, party: party.id }, 'could not say in its post that a train was split off');
    }
    return outcome;
  }

  /**
   * Runs an edit of the route that can move the train (its change answers `moved`), and has the
   * others told where the train is when it did.
   */
  private async movable<Extra extends { moved: boolean }>(
    partyId: string,
    member: Member,
    change: (party: TrainParty) => Change<TrainParty, Extra>,
    line: (party: TrainParty, result: Extra) => string | undefined,
  ): Promise<TrainChangeOutcome<Extra>> {
    let start: Place | undefined;
    const outcome = await this.apply(
      partyId,
      member,
      (party) => {
        start = placeNow(party);
        return change(party);
      },
      line,
    );
    if (outcome.kind === 'ok' && outcome.changed) {
      // A train without a route is nowhere: what was to be said of where it went is void, and
      // the first stop it gets afterwards is no movement.
      if (outcome.party.train.route.length === 0) this.moves.drop(partyId);
      else if (outcome.moved && start) this.movedFrom(partyId, start, member, undefined);
    }
    return outcome;
  }

  /** Notes a movement of a train for the announcement that is gathered. */
  private movedFrom(partyId: string, start: Place, by: Member, last: TrainMoved | undefined): void {
    this.moves.later(partyId, (earlier) => ({
      fromStop: earlier ? earlier.fromStop : start.at,
      fromFinished: earlier ? earlier.fromFinished : start.finished,
      fromRoute: earlier ? earlier.fromRoute : start.route,
      count: (earlier?.count ?? 0) + 1,
      // A step that finishes the route goes nowhere: only Previous leaves the end again, back to
      // where the route was finished, so Previous, Finish, Previous is going back (follow-ups,
      // From Phase 3C).
      onlyBack:
        (earlier?.onlyBack ?? true) && (last?.move === 'previous' || last?.finished === true),
      last,
      lastFrom: start.at,
      by,
    }));
  }

  /**
   * Makes the member the conductor (`setConductor`): they must be signed up, and may take it
   * over from another conductor, which the post says by name. `previous` is who it was before.
   *
   * `seen` (here and for `clearConductor`) is whose the role was when a button was drawn (the
   * live map): the change is refused (`conductor-changed`) when it is somebody else's by now. A
   * command gives none.
   */
  setConductor(
    partyId: string,
    member: Member,
    seen?: ConductorSeen,
  ): Promise<TrainChangeOutcome<{ previous: string | null }>> {
    return this.apply(
      partyId,
      member,
      (party) =>
        refusedFor(conductorDrawn(party, member.id, seen)) ?? setConductor(party, member.id),
      (party, set) =>
        set.previous === null
          ? `${memberText(member)} is the conductor of this train now.`
          : `${memberText(member)} is the conductor of this train now, in the place of ${memberText(memberOf(party, set.previous))}.`,
    );
  }

  /**
   * Leaves the train without a conductor (`clearConductor`): for the conductor themself, and
   * for staff. `previous` is who it was.
   */
  clearConductor(
    partyId: string,
    member: Member,
    staff: boolean,
    seen?: ConductorSeen,
  ): Promise<TrainChangeOutcome<{ previous: string | null }>> {
    return this.apply(
      partyId,
      member,
      (party) =>
        refusedFor(conductorDrawn(party, member.id, seen)) ??
        clearConductor(party, member.id, staff),
      (party, cleared) =>
        cleared.previous === member.id || cleared.previous === null
          ? `${memberText(member)} is no longer the conductor of this train.`
          : `${memberText(member)} took ${memberText(memberOf(party, cleared.previous))} off as the conductor of this train.`,
    );
  }

  /**
   * The Pokémon the train is after, or none with null (`setTrainBoss`). Anybody in the post
   * may, as in a raid. `label` is how the line names the boss, made plain by the caller.
   */
  setBoss(
    partyId: string,
    member: Member,
    change: { boss: RaidBossRef | null; label: string },
  ): Promise<TrainChangeOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => setTrainBoss(party, change.boss),
      (party) => {
        const who = doer(party, member);
        if (change.boss === null) {
          return who
            ? `${who} removed the boss of this train.`
            : 'The boss of this train was removed.';
        }
        return who
          ? `${who} set the boss this train is after: **${change.label}**.`
          : `The boss this train is after was set: **${change.label}**.`;
      },
    );
  }

  /**
   * Saves the route the train has now for the member, under a name, for the region the train
   * was made in (`SavedRouteStorage.save`), in the order it has now and with what the train
   * does at its end: a route of theirs with that name is replaced, and
   * a new one beyond what a member may keep is `full`. Anybody in the post may: it changes
   * nothing about the train. Refused for a text that is no name (`bad-name`, tidied like the
   * name of a party) and for a train without a route (`empty-route`).
   */
  async saveRoute(
    partyId: string,
    member: Member,
    text: string,
    drawn?: readonly string[],
  ): Promise<
    | { kind: 'gone' }
    | {
        kind: 'refused';
        reason: 'bad-name' | 'empty-route' | 'name-like-choice' | 'route-edited';
      }
    | { kind: 'full' }
    | { kind: 'saved' | 'replaced'; route: SavedRoute }
  > {
    const { store, routes } = this.options;
    const party = store.get(partyId);
    if (!party || !isTrain(party) || party.regionId === null) return { kind: 'gone' };
    // The route the member saw is the one saved, or none.
    const edited = routeDrawn(party, drawn);
    if (edited) return { kind: 'refused', reason: edited };
    const name = tidyName(text);
    if (name === undefined) return { kind: 'refused', reason: 'bad-name' };
    // The list of saved routes names its choices so: such a name could not be told from one.
    if (SAVED_ROUTE_CHOICE.test(name)) return { kind: 'refused', reason: 'name-like-choice' };
    const { route } = party.train;
    if (route.length === 0) return { kind: 'refused', reason: 'empty-route' };
    return routes.save(member.id, party.regionId, name, route, party.train.atEnd);
  }

  /** The routes the member saved for the region of this train, by name; none where there is no train. */
  async savedRoutes(partyId: string, memberId: string): Promise<SavedRoute[]> {
    const { store, routes } = this.options;
    const party = store.get(partyId);
    if (!party || !isTrain(party) || party.regionId === null) return [];
    return routes.list(memberId, party.regionId);
  }

  /**
   * Replaces the route of the train by one the member saved for its region, with what the train
   * does at its end, and puts the train at its first stop (`replaceRoute`): for who may move
   * the train (`staff` says whether the
   * member is staff). `none` when the member has no such route there. Gyms that no longer exist
   * are left out (`missing` says how many), also those that lie in no region of the server of
   * the train any more (`reaches`), and so is what a route does not hold (`cut`); a route of
   * which nothing is left is refused (`empty-route`), and one that was saved without any gym (a
   * row of the legacy bot may be so) is `no-stops`, for who may load a route at all. The others
   * are told where the train is when that is somewhere else than before (`moved`).
   */
  async loadRoute(
    partyId: string,
    member: Member,
    routeId: number,
    staff = false,
    drawn?: readonly string[],
  ): Promise<
    | TrainChangeOutcome<{ route: SavedRoute; missing: number; cut: number; moved: boolean }>
    | { kind: 'none' }
    | { kind: 'no-stops' }
  > {
    const { store, routes } = this.options;
    const before = store.get(partyId);
    if (!before || !isTrain(before) || before.regionId === null) return { kind: 'gone' };
    const route = await routes.get(member.id, before.regionId, routeId);
    if (!route) return { kind: 'none' };
    const loaded = await this.movable(
      partyId,
      member,
      (party) => {
        const edited = stale(party, drawn);
        if (edited) return edited;
        // Decided here, inside the store: a gym that was deleted while the load waited for the
        // train's turn is left out like one that was gone before.
        const distinct = route.stops.filter(
          (stop, index) => stopIndexOf(route.stops, stop) === index,
        );
        const existing = distinct.filter(
          (ref) => !this.gone(party, ref) && this.reaches(party, ref),
        );
        const missing = distinct.length - existing.length;
        const cut = Math.max(0, existing.length - MAX_ROUTE_STOPS);
        const replaced = replaceRoute(party, member.id, existing, staff, route.atEnd);
        return replaced.ok ? { ...replaced, route, missing, cut } : replaced;
      },
      (party, { cut }) =>
        // A route of the legacy bot may have no name.
        loadedWords(
          doer(party, member),
          route.name === '' ? 'a saved route without a name' : `the route **${plain(route.name)}**`,
        ) +
        ': ' +
        `${count(party.train.route.length, 'stop')}. The train is at the first.` +
        // Finishing is what a train does unless told otherwise: the post says only the others.
        (party.train.atEnd === 'finish' ? '' : ` ${atEndSentence(party.train.atEnd)}`) +
        (cut === 0
          ? ''
          : ` ${count(cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`),
    );
    // Nothing was left out of it: it never had a stop.
    if (loaded.kind === 'refused' && loaded.reason === 'empty-route' && route.stops.length === 0) {
      return { kind: 'no-stops' };
    }
    return loaded;
  }

  /**
   * Deletes one of the routes the member saved for the region of this train, and gives it;
   * undefined when they have no such route there, or there is no such train.
   */
  async forgetRoute(
    partyId: string,
    memberId: string,
    routeId: number,
  ): Promise<SavedRoute | undefined> {
    const { store, routes } = this.options;
    const party = store.get(partyId);
    if (!party || !isTrain(party) || party.regionId === null) return undefined;
    return routes.remove(memberId, party.regionId, routeId);
  }

  /**
   * How the train got from where it was before the movements that were gathered to where it is
   * now; undefined when there is nothing to tell. It goes by gyms: the numbers of the stops
   * change with every edit of the route.
   *
   * Nothing on an empty route, and nothing when the train is where it was (a move that was
   * taken back). A finished route is said unless it was finished before. "Back" is said of a
   * train that had finished and is at a gym of the route it had then, and otherwise only when
   * every step was Previous: after a Next, a Skip or an edit that moved the train, it is
   * "moving to" wherever it is. "Skipping" is said only of one Skip whose target is where the
   * train is. A last step that went round the end of the route (a loop) or turned back is said
   * as such when the train is where that step took it; otherwise the other words apply.
   */
  private movement(party: TrainParty, pending: PendingMove): Movement | undefined {
    const stops = stopsFrom(this.options.gyms, this.options.wayspots, party.guildId);
    const { route } = party.train;
    const { last, by } = pending;
    if (route.length === 0) return undefined;
    if (routeFinished(party)) return pending.fromFinished ? undefined : { kind: 'finished', by };
    const here = currentStop(party);
    if (here === undefined) return undefined;
    if (!pending.fromFinished && sameStop(here, pending.fromStop)) return undefined;
    const at = stops(here);
    if (last?.turn !== undefined && sameStop(last.at, here)) {
      const skipped =
        last.move === 'skip' && last.skipped !== undefined ? stops(last.skipped) : undefined;
      const passed = last.move === 'skip' ? { skipped } : {};
      if (last.turn === 'round') return { kind: 'round', at, ...passed, by };
      const turnedAt = pending.lastFrom === undefined ? undefined : stops(pending.lastFrom);
      return { kind: 'turn', at, turnedAt, ...passed, by };
    }
    if (pending.count === 1 && last?.move === 'skip' && sameStop(last.at, here)) {
      const skipped = last.skipped === undefined ? undefined : stops(last.skipped);
      return { kind: 'skip', at, skipped, by };
    }
    const back = pending.fromFinished ? hasStop(pending.fromRoute, here) : pending.onlyBack;
    return { kind: back ? 'back' : 'to', at, by };
  }

  /**
   * Says where a train is going to everybody else who is signed up; those who allow it are
   * pinged. It is said also when nobody else is signed up: the post is the record of the train.
   */
  private async announceMove(partyId: string, pending: PendingMove): Promise<void> {
    const { store, gateway, users } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || !isTrain(party) || postId === null) return;
    const movement = this.movement(party, pending);
    if (!movement) return;
    const others = membersWhere(party, (_attendee, id) => id !== pending.by.id);
    const settings = await settingsOf(users, others, this.options.log);
    const pingable = others.filter((id) => {
      const found = settings.get(id);
      return found !== undefined && found.mentions && found.mentionsTrainStops;
    });
    // Everybody, in as many messages as it takes (plan 8X-4: a Gigantamax train holds a hundred);
    // none into the post of a party that has ended, which would open an archived post again.
    await pingInMessages({ store, gateway }, partyId, postId, movementText(movement), pingable);
  }

  /**
   * Runs one change of a train, decided inside the store; a party that is no train is `gone`.
   * The member's name and team are noted with it when they are signed up. `line` is said in the
   * post, pinging nobody, when the change was stored.
   */
  private async apply<Extra>(
    partyId: string,
    member: Member,
    change: (party: TrainParty, now: number) => Change<TrainParty, Extra>,
    line?: (party: TrainParty, result: Extra) => string | undefined,
  ): Promise<TrainChangeOutcome<Extra>> {
    const { store, posts, lines, timedLines } = this.options;
    const stored = await storedChange<TrainParty, Extra>(
      store,
      partyId,
      isTrain,
      (party) => {
        const changed = change(party, this.now());
        if (!changed.ok || changed.party === party) return changed;
        return { ...changed, party: noteMember(changed.party, member.id, member) };
      },
      byMember(member),
    );
    if (stored.kind === 'gone') return { kind: 'gone' };
    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.refusal.reason };
    const { party } = stored;
    if (stored.written) {
      posts.changed(partyId);
      const text = line?.(party, stored.extra);
      if (text !== undefined && party.forumPostId !== null) {
        if (timedLines) timedLines.line(partyId, party.forumPostId, text);
        else lines.say(party.forumPostId, text);
      }
    }
    return { ...stored.extra, kind: 'ok', party, changed: stored.written };
  }

  /**
   * Sends the announcements that are waiting without waiting for their delay, and waits for
   * what is on its way. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    await this.moves.flush();
  }

  /**
   * Whether the movements of this train gathered so far will be told, as the train stands now:
   * not when it is back where it was before them (a Finish taken back at once), so that the
   * mover is not told that the others are (follow-ups, From Phase 3C).
   */
  tells(partyId: string): boolean {
    const pending = this.moves.pending(partyId);
    const party = this.options.store.get(partyId);
    if (!pending || !party || !isTrain(party)) return false;
    return this.movement(party, pending) !== undefined;
  }
}

/**
 * What a post is told of the stops the sweep took off its route (`removeUnknownStops`): of gyms
 * as before 8X-4, of power spots that Pine no longer keeps as such, or of both.
 */
function unknownStopsLine(removed: { gyms: number; spots: number }): string {
  const { gyms, spots } = removed;
  if (spots === 0) {
    return gyms === 1
      ? "A stop was removed: its gym is no longer in Pine's gym list."
      : `${count(gyms, 'stop')} were removed: their gyms are no longer in Pine's gym list.`;
  }
  if (gyms === 0) {
    return spots === 1
      ? "A stop was removed: its Power Spot is no longer in Pine's list of Power Spots."
      : `${count(spots, 'stop')} were removed: their Power Spots are no longer in Pine's list of Power Spots.`;
  }
  return (
    `${count(gyms + spots, 'stop')} were removed: their gyms or Power Spots are no longer in ` +
    "Pine's lists."
  );
}

/** A sentence's first word as a sentence begins it: `group B` → `Group B`. */
function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "X loaded the route **N**", or without a name to say: "The route **N** was loaded". */
function loadedWords(who: string | undefined, route: string): string {
  if (who) return `${who} loaded ${route}`;
  return `${route.charAt(0).toUpperCase()}${route.slice(1)} was loaded`;
}
