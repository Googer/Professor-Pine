import { BoundedMap } from '../bounded-map.js';
import type { MemberDirectory } from '../discord/member-directory.js';

/** How long an answer is used for, "not in the server" too (as `SHARE_MEMBER_FRESH_MS`). */
export const MEMBER_NAMES_FRESH_MS = 60_000;
/** As many answers as are kept at once; the oldest goes first. */
const MEMBER_NAMES_KEPT = 5_000;

export interface MemberNamesOptions {
  /** Discord's members by id (`MemberDirectory.named`: the cache, then one request for many). */
  members: Pick<MemberDirectory, 'named'>;
  now?: () => number;
}

/**
 * The names of the members a board shows (plan 8H-6, B4), for Discord and the web alike: the
 * history keeps no name. At most about fifty a board (its top ten of each board and the viewer),
 * asked of Discord in one go (`MemberDirectory.named`), each answer kept a minute in a
 * `BoundedMap`, a member Discord says is not in the server too; a failure is not kept. A member
 * not in the server, or with no name, has none here, so that a board leaves them out and its
 * ranks close up (Matt): never a mention in their place.
 */
export class MemberNames {
  private readonly known = new BoundedMap<string, { name: string | null; until: number }>(
    MEMBER_NAMES_KEPT,
  );
  /** The names on their way, by `<server>:<member>`: a second caller waits for the first ask. */
  private readonly asking = new Map<string, Promise<string | null>>();
  private readonly now: () => number;

  constructor(private readonly options: MemberNamesOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * The names of those of `memberIds` who are members of the server and have one. `given`: names
   * the caller knows already (the member of an interaction), used as they are and asked of
   * nobody. Rejects when Discord could not say.
   */
  async names(
    guildId: string,
    memberIds: readonly string[],
    given: ReadonlyMap<string, string> = new Map(),
  ): Promise<Map<string, string>> {
    const now = this.now();
    const found = new Map<string, string | null>();
    const ask: string[] = [];
    const waiting: Promise<void>[] = [];
    for (const id of new Set(memberIds)) {
      const key = `${guildId}:${id}`;
      const known = given.get(id);
      const kept = this.known.get(key);
      const asking = this.asking.get(key);
      if (known !== undefined) found.set(id, known);
      else if (kept !== undefined && kept.until > now) found.set(id, kept.name);
      // Asked by another caller a moment ago: its answer is this one's too (B4).
      else if (asking !== undefined) waiting.push(asking.then((name) => void found.set(id, name)));
      else ask.push(id);
    }
    if (ask.length > 0) {
      const asked = this.options.members
        .named(guildId, ask)
        .then((members) => new Map(members.map((member) => [member.id, member.name])));
      for (const id of ask) {
        const key = `${guildId}:${id}`;
        const name = asked.then((members) => members.get(id) ?? null);
        this.asking.set(key, name);
        void name
          .then((one) => {
            this.known.set(key, { name: one, until: now + MEMBER_NAMES_FRESH_MS });
          })
          .catch(() => undefined)
          .finally(() => this.asking.delete(key));
        waiting.push(name.then((one) => void found.set(id, one)));
      }
    }
    await Promise.all(waiting);
    const named = new Map<string, string>();
    for (const id of memberIds) {
      const name = found.get(id);
      if (name !== null && name !== undefined && name.trim() !== '') named.set(id, name);
    }
    return named;
  }
}
