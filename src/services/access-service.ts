import type {
  AccessGrant,
  AccessGrantStorage,
} from '../db/repositories/access-grant-repository.js';
import {
  isMissingPermission,
  isOverwriteLimit,
  type PartyGateway,
} from '../discord/party-gateway.js';
import { attendeeOf, type Party } from '../domain/party/party.js';
import type { Logger } from '../log.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyListener } from './party-store.js';
import type { QuietServers } from './quiet-servers.js';

/** A forum that refused the bot for lack of a permission is left alone for this long. */
const REFUSED_FOR_MS = 10 * 60_000;

export interface AccessServiceOptions {
  /** The active parties, and the word about every change of one. */
  store: { active(): Party[]; onChange(listener: PartyListener): void };
  gateway: Pick<PartyGateway, 'memberAccess' | 'admitMember' | 'dismissMember'>;
  /** The row of a server (`Guild.id`) by its snowflake: for `memberChanged`. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  storage: AccessGrantStorage;
  log: Logger;
  now?: () => number;
  /**
   * The quiet servers (`QuietServers`, plans 19C-1 and 19C-2), by the server of a grant's row
   * (`serverOfRow`): their grants are not swept, kept as they are until the server is back.
   */
  quiet?: QuietServers;
  serverOfRow?: (row: number) => string | undefined;
}

/**
 * Whether the member is signed up for the party, in whatever status: also somebody who has
 * completed the raid, who keeps the post in sight until it ends (Matt, 2026-10-11).
 */
function takesPart(party: Party, memberId: string): boolean {
  return attendeeOf(party, memberId) !== undefined;
}

function takingPart(party: Party): string[] {
  return Object.keys(party.attendees).filter((memberId) => takesPart(party, memberId));
}

/**
 * Access for members of other regions (spec 5.4). A member can sign up for a raid whose post
 * they cannot see: through a copy of it in the server's channel for remote raids or for elite raid gyms,
 * by reporting a raid at a gym of another region, or because the raid they are in moved there.
 * Such a member is let into the forum of that region, with a permission overwrite of their own,
 * for as long as they are signed up for a party there, done or not: until they leave and are
 * in no other party of that forum, or the party ends.
 *
 * It listens to the party store, so it does not matter who changed a party. Every overwrite it
 * makes is recorded (`PartyAccessGrant`) before it is made, and only recorded ones are ever
 * taken back, and only while they are still what it made: an overwrite a moderator set or
 * changed for a member is none of its business, and a member somebody keeps out on purpose (by
 * an overwrite of their own, or of a role of theirs) stays out. To keep a member out of a forum
 * for good, moderators set such an overwrite; taking the region's role away is not enough. What happens for one member and forum happens one
 * after the other. Nothing here is awaited by whoever changed the party; `flush` waits for it.
 *
 * The overwrite is on the forum alone, never on the region's text channel.
 */
export class AccessService {
  private readonly now: () => number;
  private readonly grants = new Map<string, AccessGrant>();
  private readonly locks = new KeyedLock<string>();
  /** How many settlements are running or waiting, by member and forum. */
  private readonly waiting = new Map<string, number>();
  /** By forum: until when it is left alone after it refused the bot. */
  private readonly refused = new Map<string, number>();
  /** What `memberChanged` started and has not ended: the look up of the server's row. */
  private readonly resolving = new Set<Promise<void>>();

  constructor(private readonly options: AccessServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    options.store.onChange((before, after) => {
      this.partyChanged(before, after);
    });
  }

  private static key(forumId: string, memberId: string): string {
    return `${forumId}:${memberId}`;
  }

  /** Reads the recorded grants. Once, at start, before parties can change. */
  async load(): Promise<void> {
    for (const grant of await this.options.storage.list()) {
      this.grants.set(AccessService.key(grant.forumChannelId, grant.memberId), grant);
    }
    this.options.log.info({ grants: this.grants.size }, 'access grants loaded');
  }

  /**
   * Forgets the grants of a server's `Guild` row whose data was deleted (plan 19C-3): their rows
   * went with it, and Pine is no longer in the server, so nothing is asked of Discord. How many.
   */
  forgetServer(guildId: number): number {
    let forgotten = 0;
    for (const [key, grant] of this.grants) {
      if (grant.guildId !== guildId) continue;
      this.grants.delete(key);
      forgotten += 1;
    }
    return forgotten;
  }

  /** Whether the member was let into the forum by this service. */
  has(forumId: string, memberId: string): boolean {
    return this.grants.has(AccessService.key(forumId, memberId));
  }

  /** How many members are let into forums by this service now. */
  get size(): number {
    return this.grants.size;
  }

  /** Whether the member takes part in an active party whose post is in this forum. */
  private wanted(forumId: string, memberId: string): boolean {
    return this.options.store
      .active()
      .some((party) => party.forumChannelId === forumId && takesPart(party, memberId));
  }

  /** What a stored change means for who should be let into which forum. */
  private partyChanged(before: Party | undefined, after: Party): void {
    const now = after.status === 'active' ? after : undefined;
    const forumBefore = before?.forumChannelId ?? null;
    const forumNow = now?.forumChannelId ?? null;
    if (forumBefore !== forumNow) {
      // The post was made, the party ended, or it is somewhere else now: everybody in it.
      if (before && forumBefore !== null) {
        for (const id of takingPart(before)) this.settle(forumBefore, id, before.guildId);
      }
      if (now && forumNow !== null) {
        for (const id of takingPart(now)) this.settle(forumNow, id, now.guildId);
      }
      return;
    }
    if (!before || !now || forumNow === null || before.attendees === now.attendees) return;
    const members = new Set([...Object.keys(before.attendees), ...Object.keys(now.attendees)]);
    for (const id of members) {
      // Whoever comes or goes; and whoever does anything while they take part, so that a
      // member who could not be let in when they signed up is tried again with their next step.
      const acted = takesPart(now, id) && before.attendees[id] !== now.attendees[id];
      if (acted || takesPart(before, id) !== takesPart(now, id)) {
        this.settle(forumNow, id, now.guildId);
      }
    }
  }

  /**
   * A member's roles changed (plan 8M-20, B5, W2: a self-assigned role taken away, by `/iamnot`,
   * the role menus or the web map; `SelfRoleService.onRolesTaken`): every forum of an active
   * party of the server (by its snowflake) they take part in is settled again, from a forced
   * fetch of the member (the cache may still hold the role), so that one they no longer see by
   * their roles lets them in, as a sign-up would. On the side, as every settlement.
   */
  memberChanged(guildId: string, memberId: string): void {
    const settling = (async (): Promise<void> => {
      const row = await this.options.guilds.idFor(guildId);
      if (row === undefined) return;
      for (const party of this.options.store.active()) {
        if (party.guildId !== row || party.forumChannelId === null) continue;
        if (takesPart(party, memberId)) {
          this.settle(party.forumChannelId, memberId, party.guildId, false, true);
        }
      }
    })()
      .catch((err: unknown) => {
        this.options.log.warn(
          { err, guild: guildId, member: memberId },
          'could not settle the access of a member whose roles changed',
        );
      })
      .finally(() => this.resolving.delete(settling));
    this.resolving.add(settling);
  }

  /**
   * Brings one member's access to one forum in line with the parties, on the side: let in when
   * they take part in a party there and cannot see it, the grant taken back when they no longer
   * take part in any. `verify` also looks whether a member who was let in really can see the
   * forum, and lets them in again when not (for the sweep); `fresh` looks at the member fetched
   * afresh (`memberChanged`). Never throws; what fails is logged.
   */
  private settle(
    forumId: string,
    memberId: string,
    guildId: number,
    verify = false,
    fresh = false,
  ): void {
    const key = AccessService.key(forumId, memberId);
    // Most changes end here: somebody who was never let in is no longer in a party.
    if (!this.grants.has(key) && !this.waiting.has(key) && !this.wanted(forumId, memberId)) return;
    this.waiting.set(key, (this.waiting.get(key) ?? 0) + 1);
    void this.locks
      .run(key, () => this.settleNow(forumId, memberId, guildId, verify, fresh))
      .catch((err: unknown) => {
        this.options.log.warn(
          { err, forum: forumId, member: memberId },
          'could not settle the access of a member to a forum',
        );
      })
      .finally(() => {
        const left = (this.waiting.get(key) ?? 1) - 1;
        if (left > 0) this.waiting.set(key, left);
        else this.waiting.delete(key);
      });
  }

  private async settleNow(
    forumId: string,
    memberId: string,
    guildId: number,
    verify: boolean,
    fresh: boolean,
  ): Promise<void> {
    const { gateway, storage, log } = this.options;
    const key = AccessService.key(forumId, memberId);
    const wanted = this.wanted(forumId, memberId);
    const recorded = this.grants.has(key);
    if (!wanted) {
      if (!recorded) return;
      // The overwrite first: a record that is left over is tried again, an overwrite that is
      // left over without a record never.
      const gone = await gateway.dismissMember(forumId, memberId);
      await storage.remove(forumId, memberId);
      this.grants.delete(key);
      log.info(
        { forum: forumId, member: memberId },
        gone
          ? 'took back the access of a member to a forum'
          : 'somebody changed the access I gave a member to a forum; left as it is',
      );
      return;
    }
    if (recorded && !verify) return;
    if ((this.refused.get(forumId) ?? 0) > this.now()) return;
    const access = await gateway.memberAccess(forumId, memberId, fresh);
    if (access === 'barred' && !recorded) {
      log.info(
        { forum: forumId, member: memberId },
        'a member who is kept out of a forum signed up for a party there; left as it is',
      );
    }
    // They may have left again while Discord was asked.
    if (access !== 'hidden' || !this.wanted(forumId, memberId)) return;
    if (!recorded) {
      const grant: AccessGrant = {
        forumChannelId: forumId,
        memberId,
        guildId,
        createdAt: this.now(),
      };
      // The record first: an overwrite nobody remembers would stay for good.
      await storage.add(grant);
      this.grants.set(key, grant);
    }
    try {
      if (await gateway.admitMember(forumId, memberId)) {
        log.info({ forum: forumId, member: memberId }, 'let a member into a forum');
        return;
      }
    } catch (err) {
      if (!isMissingPermission(err) && !isOverwriteLimit(err)) {
        log.warn({ err, forum: forumId, member: memberId }, 'could not let a member into a forum');
        // Whether the overwrite was made is not known: it is taken back, and should that fail
        // too, the record stays and the overwrite goes with it later.
        await gateway.dismissMember(forumId, memberId);
        await this.forget(forumId, memberId);
        return;
      }
      this.refused.set(forumId, this.now() + REFUSED_FOR_MS);
      log.warn(
        { err, forum: forumId, member: memberId },
        isOverwriteLimit(err)
          ? 'cannot let members of other regions into a forum: it has as many permission overwrites as Discord allows'
          : 'cannot let members of other regions into a forum: I need Manage Permissions there, ' +
              'and may only give what I have there myself (View Channel, Read Message History, ' +
              'Send Messages in Threads)',
      );
    }
    // Refused, or the forum is gone: nothing was made.
    await this.forget(forumId, memberId);
  }

  private async forget(forumId: string, memberId: string): Promise<void> {
    await this.options.storage.remove(forumId, memberId);
    this.grants.delete(AccessService.key(forumId, memberId));
  }

  /**
   * Looks through every recorded grant: one that nothing calls for any more is taken back (what
   * a failure or a stop of the process left behind, and the grants of a forum that no party is
   * in), and a member who should be in a forum and cannot see it (a record without its
   * overwrite) is let in again. It never lets anybody in who has no record. At start and hourly
   * (spec 5.4 asks for daily). Gives how many grants are gone. Never rejects. The grants of a
   * quiet server are passed over (plans 19C-1, 19C-2): kept for its return, or its deletion.
   */
  async sweep(): Promise<number> {
    const before = new Set(this.grants.keys());
    for (const grant of [...this.grants.values()]) {
      if (this.ofQuietServer(grant.guildId)) continue;
      this.settle(grant.forumChannelId, grant.memberId, grant.guildId, true);
    }
    await this.flush();
    return [...before].filter((key) => !this.grants.has(key)).length;
  }

  /** Whether the server of a `Guild` row is quiet. */
  private ofQuietServer(row: number): boolean {
    const { quiet, serverOfRow } = this.options;
    const server = serverOfRow?.(row);
    return server !== undefined && quiet?.isQuiet(server) === true;
  }

  /** Waits for everything that is under way. For shutdown and for tests. */
  async flush(): Promise<void> {
    while (this.resolving.size > 0) await Promise.all([...this.resolving]);
    await this.locks.whenIdle();
  }
}
