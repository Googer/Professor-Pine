import type { PartyForum, PartySave, PartyStorage } from '../db/repositories/party-repository.js';
import type {
  HistoryNote,
  WrittenRecord,
  PartyEnd,
  PartyWrite,
} from '../domain/history/party-history.js';
import { pruneGroups } from '../domain/party/attendance.js';
import { blocksNewMax, sameSpot, spotKey } from '../domain/party/max.js';
import {
  isMax,
  isRaid,
  type MaxParty,
  type MaxSpot,
  type Party,
  type RaidParty,
} from '../domain/party/party.js';
import { raidStandingAt } from '../domain/party/raid.js';
import type { PostRemoval } from '../domain/moderation/reports.js';
import type { Logger } from '../log.js';
import { KeyedLock } from './keyed-lock.js';

const NOT_LOADED = 'Parties have not been loaded yet';

/**
 * When a change is written: now, never before the party's last write, and never before a stamp
 * of one of its groups (plan 8X-1B: a group opened later is stamped after the party's last
 * write, `openedGroup`, so stamps strictly increase, also across a prune and a reopening of a
 * letter within one millisecond).
 */
function writtenAt(changed: Party, before: Party, now: number): number {
  return Math.max(now, before.updatedAt, ...changed.groups.map((group) => group.opened ?? 0));
}

/** What handlers and guards read: the parties that have not ended, from memory. */
export interface PartyProvider {
  get(id: string): Party | undefined;
  /** The party whose forum post this is. */
  byPost(forumPostId: string): Party | undefined;
  /** Every active party, oldest first. */
  active(): Party[];
  /** The active parties of a region, oldest first. */
  inRegion(regionId: number): Party[];
  /**
   * The raid at this gym that stands in the way of a new report there, of any kind (plan 8E,
   * `raidStandingAt`): one of the same server (`guildId`, its row: the gym's id is the same in
   * every server that has it, as `maxAt`), that has not ended by the clock; the oldest of two
   * stored before.
   */
  raidAt(guildId: number, gymId: number, now: number): RaidParty | undefined;
  /**
   * The max battle at this spot that stands in the way of a new report there (plan 8X-3; design
   * 3.1): one whose end has not come, at the same power spot, or at a pin within 50 metres of
   * this pin (`sameSpot`), of the same server (`guildId`, its row: a power spot's Wayfarer id is the
   * same in every server that has it).
   */
  maxAt(guildId: number, spot: MaxSpot, now: number): MaxParty | undefined;
}

export interface PartyStoreOptions {
  storage: PartyStorage;
  log: Logger;
  now?: () => number;
  /**
   * The party history (`PartyHistory`): asked for what each write adds to it, which the storage
   * writes with the party. Without it nothing is recorded.
   */
  history?: { noteOf(write: PartyWrite): HistoryNote | undefined };
}

/**
 * What a change of two parties at once returns (`PartyStore.updateBoth`): the parties as
 * changed, in the order of the ids, undefined (or the very party it was given) for one it
 * leaves alone; and for one it ends, why (`ended`, as a change of `update` says it).
 */
export interface PairChange {
  parties?: readonly [Party | undefined, Party | undefined];
  ended?: readonly [PartyEnd | undefined, PartyEnd | undefined];
}

/** What the listeners are told of a change: its cause and why the party ended, if it did. */
function noteOf(
  cause: ChangeCause | undefined,
  ended: PartyEnd | undefined,
): ChangeNote | undefined {
  if (cause === undefined && ended === undefined) return undefined;
  return { ...cause, ...(ended === undefined ? {} : { ended }) };
}

/** Why `add` refused a party: its region is being removed, or is gone (`closeRegion`). */
export class RegionClosedError extends Error {
  constructor(readonly regionId: number) {
    super(`Region ${regionId} takes no new parties`);
    this.name = 'RegionClosedError';
  }
}

/**
 * Who made a change, as its caller says (the staff audit log, `PartyAudit`): `by` the member
 * (left out: Pine itself, the clock or a feed), `removal` what staff or the moderators chose for
 * the post of a party they closed. Optional everywhere: a caller that says nothing changes
 * nothing but the log's actor.
 */
export interface ChangeCause {
  by?: { id: string; name?: string | undefined };
  removal?: PostRemoval;
}

/**
 * What a listener is told of a change beyond the parties: its cause (`by` for an add is the
 * party's maker unless the caller said who), why a party ended (`ended`, as the change said), and
 * the party an add goes on as after a move (`movedFrom`).
 */
export interface ChangeNote extends ChangeCause {
  ended?: PartyEnd;
  movedFrom?: string;
}

/**
 * Told about every stored change: the party as it was (undefined for one that was just added)
 * and as it is stored now, which for a party that ended has the status `ended`; and what else is
 * known of the change (`ChangeNote`), which only the audit log reads.
 */
export type PartyListener = (before: Party | undefined, after: Party, note?: ChangeNote) => void;

/**
 * The active parties in memory, with the database behind them. Every change goes through
 * `update` (or `updateBoth`, for two parties at once), which runs one change at a time per
 * party, writes the row first and only then replaces the party in memory: what handlers read
 * is always what is stored.
 */
export class PartyStore implements PartyProvider {
  private readonly parties = new Map<string, Party>();
  private readonly locks = new KeyedLock<string>();
  private readonly gymLocks = new KeyedLock<number>();
  /** By spot (`spotKey`): a power spot's Wayfarer id, one key for every pin. */
  private readonly spotLocks = new KeyedLock<string>();
  private readonly listeners: PartyListener[] = [];
  /** The regions that take no new party (`closeRegion`). */
  private readonly closed = new Set<number>();
  /** By region: the `add`s that are under way. */
  private readonly adding = new Map<number, Set<Promise<void>>>();
  private readonly now: () => number;
  private loaded = false;

  constructor(private readonly options: PartyStoreOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Reads every active party, once, at start (a second call throws without reading anything: a
   * reload during updates could bring back an older snapshot or a party that has ended). A row
   * that cannot be read is logged and left alone.
   */
  async load(): Promise<void> {
    if (this.loaded) throw new Error('Parties were already loaded');
    const { parties, unreadable } = await this.options.storage.listActive();
    this.parties.clear();
    for (const party of parties) this.parties.set(party.id, party);
    for (const row of unreadable) {
      this.options.log.warn(
        {
          party: row.id,
          problem: row.problem,
          forumChannelId: row.forumChannelId,
          forumPostId: row.forumPostId,
        },
        'could not read a party',
      );
    }
    this.loaded = true;
    this.options.log.info(
      { parties: parties.length, unreadable: unreadable.length },
      'parties loaded',
    );
  }

  /** Whether `load` has read the parties: before it, every read of them throws. */
  get isLoaded(): boolean {
    return this.loaded;
  }

  private get all(): Map<string, Party> {
    if (!this.loaded) throw new Error(NOT_LOADED);
    return this.parties;
  }

  /**
   * Has `listener` told about every party that is added and every change that is stored, right
   * after the party in memory was replaced and before the caller of `add` or `update` goes on:
   * for whatever follows from a change no matter who made it (see `AccessService`). A listener
   * decides and returns (it must not be `async`: nobody would see it fail); what takes time it
   * does on the side. What it throws is logged and changes nothing. Not announced: the parties
   * read by `load`, and a party that leaves memory because its row is gone from the database.
   */
  onChange(listener: PartyListener): void {
    this.listeners.push(listener);
  }

  private announce(before: Party | undefined, after: Party, note?: ChangeNote): void {
    for (const listener of this.listeners) {
      try {
        listener(before, after, note);
      } catch (err) {
        this.options.log.error({ err, party: after.id }, 'a listener of the parties failed');
      }
    }
  }

  get(id: string): Party | undefined {
    return this.all.get(id);
  }

  byPost(forumPostId: string): Party | undefined {
    for (const party of this.all.values()) if (party.forumPostId === forumPostId) return party;
    return undefined;
  }

  active(): Party[] {
    return [...this.all.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  }

  inRegion(regionId: number): Party[] {
    return this.active().filter((party) => party.regionId === regionId);
  }

  raidAt(guildId: number, gymId: number, now: number): RaidParty | undefined {
    return raidStandingAt(this.active().filter(isRaid), guildId, gymId, now);
  }

  maxAt(guildId: number, spot: MaxSpot, now: number): MaxParty | undefined {
    return this.active()
      .filter(isMax)
      .find(
        (party) =>
          party.guildId === guildId && sameSpot(party.max.spot, spot) && blocksNewMax(party, now),
      );
  }

  /**
   * Stores a new party. Rejects when the row cannot be written (its id or post already exists),
   * and with a `RegionClosedError`, before anything is written, for a party of a region that
   * is closed (`closeRegion`). `movedFrom`: the raid it goes on as after a move to another
   * region, for the party history. `by`: who added it, for the audit log; left out, its maker.
   */
  async add(
    party: Party,
    options: { movedFrom?: string; by?: ChangeCause['by'] } = {},
  ): Promise<Party> {
    const parties = this.all;
    const { regionId } = party;
    // Decided now, in the same turn in which it is remembered as under way (below): a region
    // is either closed before this add, which is then refused, or its closing waits for it.
    if (regionId !== null && this.closed.has(regionId)) throw new RegionClosedError(regionId);
    const adding = this.locks.run(party.id, async () => {
      const { movedFrom } = options;
      const note = this.noteOf({
        before: undefined,
        after: party,
        ...(movedFrom === undefined ? {} : { movedFrom }),
      });
      await this.options.storage.insert(party, note);
      if (party.status === 'active') parties.set(party.id, party);
      const by = options.by ?? {
        id: party.createdById,
        ...(party.makerName === undefined ? {} : { name: party.makerName }),
      };
      this.announce(undefined, party, { by, ...(movedFrom === undefined ? {} : { movedFrom }) });
      return party;
    });
    if (regionId !== null) {
      // Remembered while it runs: whoever closes the region waits for it.
      const settled = adding.then(
        () => undefined,
        () => undefined,
      );
      const underWay = this.adding.get(regionId) ?? new Set<Promise<void>>();
      underWay.add(settled);
      this.adding.set(regionId, underWay);
      void settled.then(() => {
        underWay.delete(settled);
        if (underWay.size === 0 && this.adding.get(regionId) === underWay) {
          this.adding.delete(regionId);
        }
      });
    }
    return adding;
  }

  /**
   * Closes a region to new parties, for its removal (`RegionAdminService.remove`): from now on
   * `add` refuses a party of that region, and the promise resolves once every `add` for it
   * that was under way has finished. After that the active parties of the region are all there
   * are, and whoever ends them all can delete the region's row: a party stored with the id of
   * a region that is gone could never be written again (the row's foreign key). It stays closed
   * for good unless `reopenRegion` says otherwise, so that whatever held the region across the
   * removal is refused too.
   */
  async closeRegion(regionId: number): Promise<void> {
    this.closed.add(regionId);
    while ((this.adding.get(regionId)?.size ?? 0) > 0) {
      await Promise.all([...(this.adding.get(regionId) ?? [])]);
    }
  }

  /** Whether a region takes no new parties (`closeRegion`). */
  isRegionClosed(regionId: number): boolean {
    return this.closed.has(regionId);
  }

  /** Opens a region again whose removal did not happen after all. */
  reopenRegion(regionId: number): void {
    this.closed.delete(regionId);
  }

  /**
   * Applies a change to an active party: `change` gets the party as it is now and returns what
   * a function of `src/domain/party` returns, an object whose `party` is the changed party (or
   * that has none, when the change was refused). A changed party loses the groups nobody is in
   * (`pruneGroups`, plan 8X-1B: silently, and never for a refusal or a change of nothing), is
   * stamped with the time, written, and then replaces the old one; an ended party leaves memory.
   * The result is what
   * `change` returned, with the party as stored, and `written`: true when the change returned
   * another party object and it was stored, false when it was refused or changed nothing.
   * Handlers post a public line and show the post anew only when `written`. Undefined when there
   * is no such active party.
   *
   * Changes to one party run one at a time, in the order they were asked for. `change` must not
   * wait for anything: it is a pure decision. When the write fails, the party in memory stays as
   * it was and the error is the caller's.
   *
   * A decision must be made inside `change`: a `get(id)` made before `update` may be out of date
   * by the time the change runs. Undefined also means "ended in the meantime", which handlers
   * queued behind the scheduler will meet. Only what can change is written: `guildId`,
   * `createdById` and `createdAt` must not be altered by a change, and one that alters `type`
   * throws: a party is of one kind for good, which `asKindOf` relies on.
   *
   * A change that ends the party says why with `ended` (the party history keeps it: the clock,
   * a person, a move); without it the history says it does not know. Such a change's result
   * has `recorded`, the record of the party history its write committed with it (plan 8H-7A,
   * review F-B1: the card of an ended train is drawn from it); undefined where none was written
   * (the record failed and waits for its later tries, the party moved or never had a post).
   *
   * `cause` says who made the change, for the audit log (`ChangeCause`); it changes nothing else.
   */
  async update<R extends { party?: Party; ended?: PartyEnd }>(
    id: string,
    change: (party: Party) => R,
    cause?: ChangeCause,
  ): Promise<(R & { written: boolean; recorded?: WrittenRecord }) | undefined> {
    const parties = this.all;
    return this.locks.run(id, async () => {
      const current = parties.get(id);
      if (!current) return undefined;
      const result = change(current);
      if (result.party === undefined || result.party === current) {
        return { ...result, written: false };
      }
      // The groups nobody is in go with the change that emptied them (plan 8X-1B), and only
      // with a change: a refusal or a change of nothing leaves them.
      const changed = pruneGroups(result.party);
      if (changed.id !== id)
        throw new Error(`A change of party ${id} returned party ${changed.id}`);
      if (changed.type !== current.type)
        throw new Error(`A change of ${current.type} ${id} returned a ${changed.type}`);
      const stamped: Party = { ...changed, updatedAt: writtenAt(changed, current, this.now()) };
      const note = this.noteOf({
        before: current,
        after: stamped,
        ...(result.ended ? { ended: result.ended } : {}),
      });
      const saved = await this.options.storage.save(stamped, note);
      if (!saved) {
        parties.delete(id);
        throw new Error(`Party ${id} is no longer in the database`);
      }
      if (stamped.status === 'active') parties.set(id, stamped);
      else parties.delete(id);
      this.announce(current, stamped, noteOf(cause, result.ended));
      const { recorded } = saved;
      return { ...result, party: stamped, written: true, ...(recorded ? { recorded } : {}) };
    });
  }

  /**
   * Applies one change to two active parties at once, written in one transaction: both or
   * neither (`PartyStorage.saveBoth`; a train's split, `PartyService.splitTrain`). `change` gets
   * both parties as they are now, in the order of `ids`, undefined for one that is not active
   * (it decides what that means), and returns `parties` in the same order: undefined, or the
   * very party it was given, for one it leaves alone. The rules of `update` hold for each: the
   * same id and kind, its empty groups pruned, stamped with the time, its note for the history (`ended` per party), an
   * ended party out of memory. Memory is replaced only once the write has committed, both
   * parties before the listeners are told of either. When the write fails, both stay in memory
   * as they were and the error is the caller's; a party whose row is gone leaves memory, and
   * neither is written. When only one party changes, it is written as `update` writes it.
   * The result is what `change` returned, with `parties` as stored now (as given for one left
   * alone) and `written`: whether anything was written.
   *
   * Both parties' locks are taken, always in the order of their ids, so two such changes never
   * wait for each other the other way round, and a change of either party waits for this one,
   * as this one waits for those before it. The lock is not re-entrant, and nothing inside takes
   * either lock again: `change` is synchronous (it may read the store, which takes no lock),
   * the storage does not call the store, and the listeners are synchronous too (what they start
   * on the side queues behind and runs once both locks are free).
   */
  async updateBoth<R extends PairChange>(
    ids: readonly [string, string],
    change: (first: Party | undefined, second: Party | undefined) => R,
    cause?: ChangeCause,
  ): Promise<
    Omit<R, 'parties'> & { parties: [Party | undefined, Party | undefined]; written: boolean }
  > {
    const parties = this.all;
    const [one, two] = ids;
    if (one === two) throw new Error(`A change of two parties was given party ${one} twice`);
    const [low, high] = one < two ? [one, two] : [two, one];
    return this.locks.run(low, () =>
      this.locks.run(high, async () => {
        const current: [Party | undefined, Party | undefined] = [
          parties.get(one),
          parties.get(two),
        ];
        const result = change(current[0], current[1]);
        const writes: { index: 0 | 1; before: Party; after: Party; note?: HistoryNote }[] = [];
        for (const index of [0, 1] as const) {
          const id = ids[index];
          const before = current[index];
          const given = result.parties?.[index];
          if (given === undefined || given === before) continue;
          // As in `update`: the groups nobody is in go with the change.
          const changed = pruneGroups(given);
          if (before === undefined)
            throw new Error(`Party ${id} is not active: nothing is written`);
          if (changed.id !== id)
            throw new Error(`A change of party ${id} returned party ${changed.id}`);
          if (changed.type !== before.type)
            throw new Error(`A change of ${before.type} ${id} returned a ${changed.type}`);
          const after: Party = { ...changed, updatedAt: writtenAt(changed, before, this.now()) };
          const ended = result.ended?.[index];
          const note = this.noteOf({ before, after, ...(ended ? { ended } : {}) });
          writes.push({ index, before, after, ...(note ? { note } : {}) });
        }
        const [first, second] = writes;
        if (!first) return { ...result, parties: current, written: false };
        const { storage } = this.options;
        const saved = ({ after, note }: (typeof writes)[number]): PartySave => ({
          party: after,
          ...(note ? { note } : {}),
        });
        const found: readonly boolean[] = second
          ? await storage.saveBoth([saved(first), saved(second)])
          : [(await storage.save(first.after, first.note)) !== false];
        const gone = writes.filter((_write, n) => found[n] !== true).map((write) => write.after.id);
        if (gone.length > 0) {
          for (const id of gone) parties.delete(id);
          throw new Error(`Party ${gone.join(', ')} is no longer in the database`);
        }
        for (const { index, after } of writes) {
          if (after.status === 'active') parties.set(after.id, after);
          else parties.delete(after.id);
          current[index] = after;
        }
        for (const { index, before, after } of writes) {
          this.announce(before, after, noteOf(cause, result.ended?.[index]));
        }
        return { ...result, parties: current, written: true };
      }),
    );
  }

  /**
   * What a write adds to the party history; nothing when there is no history, or when making
   * the note fails (logged: the party's own write goes on).
   */
  private noteOf(write: PartyWrite): HistoryNote | undefined {
    try {
      return this.options.history?.noteOf(write);
    } catch (err) {
      this.options.log.error(
        { err, party: write.after.id },
        'could not note a party for its history',
      );
      return undefined;
    }
  }

  /**
   * Stores a reported raid unless the gym already has a raid of the party's server, of any kind,
   * that has not ended by the clock (`raidAt`), in which case that raid is returned and nothing is
   * stored. The check and the insert happen under the gym's lock (one lock per gym, whatever the
   * server), so two reports cannot both find the gym free (spec 5.2);
   * this is the one way a reported raid is stored. A party without a gym is refused.
   *
   * `gymExists` is asked under the same lock, before anything else: the deletion of a gym
   * (`GymAdminService.delete`) holds that lock from its check for a raid there until the gym is
   * gone, so a report that waited for it finds no gym and stores nothing (`existing` is then
   * undefined), instead of a row that names a gym the database no longer has. With `mayAdd` false
   * only the raid there is returned: a free gym stores nothing (`existing` undefined; a report
   * that may only join, plan 8X-S).
   */
  async addRaidUnlessTaken(
    party: RaidParty,
    now: number,
    gymExists: () => boolean = () => true,
    options: { movedFrom?: string; mayAdd?: boolean; by?: ChangeCause['by'] } = {},
  ): Promise<
    | { added: true; party: RaidParty }
    | { added: false; existing: RaidParty }
    | { added: false; existing: undefined }
  > {
    const { gymId } = party;
    if (gymId === null) throw new Error(`Raid ${party.id} has no gym`);
    return this.withGymLock(gymId, async () => {
      if (!gymExists()) return { added: false, existing: undefined };
      const existing = this.raidAt(party.guildId, gymId, now);
      if (existing) return { added: false, existing };
      if (options.mayAdd === false) return { added: false, existing: undefined };
      await this.add(party, options);
      return { added: true, party };
    });
  }

  /**
   * Runs `work` alone for this gym. `addRaidUnlessTaken` uses it for new reports; other changes
   * that can make a raid block a gym (moving a raid to another gym, changing its kind, moving
   * its end later) need it too, and so does the deletion of the gym itself. Updates of parties inside it are fine: they use another lock,
   * and `add` itself does not take this one. It is not re-entrant: asking for the same gym again
   * from inside `work` and waiting for it never finishes. Hold it only for the check and the
   * write, never across a call to Discord.
   */
  async withGymLock<T>(gymId: number, work: () => Promise<T>): Promise<T> {
    return this.gymLocks.run(gymId, work);
  }

  /**
   * Stores a reported max battle unless its spot has one of its server that has not ended by the
   * clock (`maxAt`), which is then returned and nothing is stored: the one way a max battle is
   * stored (design 3.1). The check and the insert happen under the spot's lock (`withSpotLock`,
   * one lock for the spot in every server), so two reports cannot both find the spot free. With
   * `mayAdd` false only the battle there is returned: a free spot stores nothing (`existing`
   * undefined; a member blocked from meetups at a pin, final review F4).
   */
  async addMaxUnlessTaken(
    party: MaxParty,
    now: number,
    options: { mayAdd?: boolean } = {},
  ): Promise<
    | { added: true; party: MaxParty }
    | { added: false; existing: MaxParty }
    | { added: false; existing: undefined }
  > {
    const { spot } = party.max;
    return this.withSpotLock(spot, async () => {
      const existing = this.maxAt(party.guildId, spot, now);
      if (existing) return { added: false, existing };
      if (options.mayAdd === false) return { added: false, existing: undefined };
      await this.add(party);
      return { added: true, party };
    });
  }

  /**
   * Runs `work` alone for this spot (`spotKey`: a power spot, or every pin at once): what can make
   * a max battle block a spot (a report, an end moved later) checks and writes inside it, as for a
   * gym (`withGymLock`, whose rules hold: not re-entrant, never across a call to Discord).
   */
  async withSpotLock<T>(spot: MaxSpot, work: () => Promise<T>): Promise<T> {
    return this.spotLocks.run(spotKey(spot), work);
  }

  /**
   * Those of these forum posts that are the post of a party that has ended, from the database:
   * ended parties are not kept in memory.
   */
  endedPosts(forumPostIds: readonly string[]): Promise<string[]> {
    return this.options.storage.endedPosts(forumPostIds);
  }

  /**
   * Every forum that a party, active or ended, has or had its post in, from the database: by
   * this a forum is still found when its region is gone. `guildId` (a row id) narrows it to
   * the parties of one server.
   */
  partyForums(guildId?: number): Promise<PartyForum[]> {
    return this.options.storage.partyForums(guildId);
  }

  /** Resolves once every change and add in flight or waiting has finished (for shutdown). */
  async whenIdle(): Promise<void> {
    await Promise.all([this.locks.whenIdle(), this.gymLocks.whenIdle(), this.spotLocks.whenIdle()]);
  }
}
