import type {
  MemberDirectory,
  MemberStanding,
  ServerMember,
} from '../../src/discord/member-directory.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { Tally } from './tally.js';

/**
 * The members of servers, for tests: nobody is a member of anything until `add` says so.
 * `asked` records every look-up as `<guild>:<user>`. Set `failing` to make every look-up reject,
 * as Discord being away would.
 *
 * A member sees every channel of their server unless `hide` says otherwise, or `sees` (when a
 * test sets it, for instance to the fake gateway's `canSee`) answers false. `batches` records
 * every call of `viewers`; like Discord it answers in a later turn of the event loop, and it
 * refuses more ids in one call than a test allows with `batchLimit`.
 */
export class FakeMemberDirectory implements MemberDirectory {
  failing: Error | undefined;
  readonly asked: string[] = [];
  readonly batches: { guildId: string; channelId: string; userIds: string[] }[] = [];
  /** The batches asked about, as a count a test can wait for. */
  readonly asks = new Tally('the questions of who can see a channel');
  /** A call of `viewers` with more ids than this rejects. Unlimited by default. */
  batchLimit = Number.POSITIVE_INFINITY;
  /** While set, `viewers` answers only once this has resolved: for what happens meanwhile. */
  holding: Promise<void> | undefined;
  /** Everybody is a member of every server, without `add`: for tests about what they can see. */
  everybody = false;
  /** Asked besides `hide` when set: whether a member can see a channel. */
  sees: ((channelId: string, userId: string) => boolean) | undefined;
  private readonly members = new Map<string, ServerMember>();
  private readonly hidden = new Map<string, Set<string>>();

  /** These members cannot see the channel. */
  hide(channelId: string, ...userIds: string[]): this {
    const hidden = this.hidden.get(channelId) ?? new Set<string>();
    for (const id of userIds) hidden.add(id);
    this.hidden.set(channelId, hidden);
    return this;
  }

  /** Makes somebody a member of a server (default: the server of the fake interactions). */
  add(userId: string, name: string, guildId = FAKE_GUILD_ID): this {
    this.members.set(`${guildId}:${userId}`, { id: userId, name });
    return this;
  }

  /** Somebody leaves a server. */
  remove(userId: string, guildId = FAKE_GUILD_ID): void {
    this.members.delete(`${guildId}:${userId}`);
  }

  /**
   * A member's roles by name and whether they are an administrator (`add` them first); by
   * default the directory does not say.
   */
  standing(userId: string, standing: MemberStanding, guildId = FAKE_GUILD_ID): this {
    const member = this.members.get(`${guildId}:${userId}`);
    if (!member) throw new Error(`${userId} is no member of ${guildId}: add them first`);
    this.members.set(`${guildId}:${userId}`, { ...member, standing });
    return this;
  }

  /** Everything is at hand: no ask waits in the map's paced queue (`PacedMembers`). */
  holds(): boolean {
    return true;
  }

  find(guildId: string, userId: string): Promise<ServerMember | undefined> {
    this.asked.push(`${guildId}:${userId}`);
    if (this.failing) return Promise.reject(this.failing);
    const member = this.members.get(`${guildId}:${userId}`);
    return Promise.resolve(member && { ...member });
  }

  /** The ids of every `named` ask, in order (plan 8H-6). */
  readonly namedAsks: string[][] = [];

  named(guildId: string, userIds: readonly string[]): Promise<ServerMember[]> {
    this.namedAsks.push([...userIds]);
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        if (this.failing) {
          reject(this.failing);
          return;
        }
        resolve(
          userIds.flatMap((id) => {
            const member = this.members.get(`${guildId}:${id}`);
            return member ? [{ ...member }] : [];
          }),
        );
      });
    });
  }

  viewers(guildId: string, channelId: string, userIds: readonly string[]): Promise<Set<string>> {
    this.batches.push({ guildId, channelId, userIds: [...userIds] });
    this.asks.add();
    const held = this.holding ?? Promise.resolve();
    return new Promise((resolve, reject) => {
      const answer = (): void => {
        if (this.failing) reject(this.failing);
        else if (userIds.length > this.batchLimit) {
          reject(new Error(`${String(userIds.length)} members were asked for at once`));
        } else {
          resolve(
            new Set(
              userIds.filter(
                (id) =>
                  (this.everybody || this.members.has(`${guildId}:${id}`)) &&
                  !this.hidden.get(channelId)?.has(id) &&
                  (this.sees?.(channelId, id) ?? true),
              ),
            ),
          );
        }
      };
      void held.then(() => setImmediate(answer));
    });
  }
}
