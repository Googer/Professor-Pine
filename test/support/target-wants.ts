import type {
  MemberTargetWants,
  TargetWantList,
  TargetWantStorage,
} from '../../src/db/repositories/target-want-repository.js';
import {
  isCostumedTarget,
  parseTargetWantToken,
  targetWantToken,
  withCostume,
  type TargetWant,
} from '../../src/domain/notify/target-wants.js';

/** Methods a test can make fail (`failing`). */
type Method = keyof TargetWantStorage;

/**
 * The wants of `TargetWant` in memory, for tests: the twin of `TargetWantRepository`, running
 * `targetWantCases` as it does. `rows` holds each member's tokens by server and member
 * (`<server> <member>`), in the order they were made: a test may put a token there that this
 * version cannot read. `failing` makes a method reject with the error given. `costumed` holds
 * the rows that are costumed (plan 8R-4), as `<server> <member> <token>`.
 */
export class MemoryTargetWants implements TargetWantStorage {
  readonly rows = new Map<string, string[]>();
  readonly costumed = new Set<string>();
  readonly failing = new Map<Method, Error>();

  /** A token of a member as the target it is, costumed as its row is. */
  private read(memberId: string, guildId: string, token: string): TargetWant | undefined {
    const want = parseTargetWantToken(token);
    return want && withCostume(want, this.costumed.has(`${guildId} ${memberId} ${token}`));
  }

  private fail(method: Method): void {
    const err = this.failing.get(method);
    if (err) throw err;
  }

  private tokensOf(memberId: string, guildId: string): string[] {
    return this.rows.get(`${guildId} ${memberId}`) ?? [];
  }

  list(memberId: string, guildId: string): Promise<TargetWantList> {
    this.fail('list');
    const tokens = this.tokensOf(memberId, guildId);
    const wants = tokens.flatMap((token) => this.read(memberId, guildId, token) ?? []);
    return Promise.resolve({ wants, unreadable: tokens.length - wants.length });
  }

  of(memberId: string, guildId: string, targets: readonly TargetWant[]): Promise<TargetWant[]> {
    this.fail('of');
    const asked = new Set(targets.map(targetWantToken));
    return Promise.resolve(
      this.tokensOf(memberId, guildId)
        .filter((token) => asked.has(token))
        .flatMap((token) => this.read(memberId, guildId, token) ?? []),
    );
  }

  change(
    memberId: string,
    guildId: string,
    change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
    _at?: number,
  ): Promise<number> {
    this.fail('change');
    const removed = new Set(change.remove.map(targetWantToken));
    const had = this.tokensOf(memberId, guildId);
    const gone = had.filter((token) => removed.has(token)).length;
    const kept = had.filter((token) => !removed.has(token));
    for (const token of removed) this.costumed.delete(`${guildId} ${memberId} ${token}`);
    for (const want of change.add) {
      const token = targetWantToken(want);
      if (!kept.includes(token)) kept.push(token);
      // A target there already takes the costume of its add, as the repository's.
      const row = `${guildId} ${memberId} ${token}`;
      if (isCostumedTarget(want)) this.costumed.add(row);
      else this.costumed.delete(row);
    }
    this.set(memberId, guildId, kept);
    return Promise.resolve(gone);
  }

  private set(memberId: string, guildId: string, tokens: string[]): void {
    if (tokens.length === 0) this.rows.delete(`${guildId} ${memberId}`);
    else this.rows.set(`${guildId} ${memberId}`, tokens);
  }

  remove(memberId: string, guildId: string, want: TargetWant): Promise<boolean> {
    this.fail('remove');
    const token = targetWantToken(want);
    const tokens = this.tokensOf(memberId, guildId);
    if (!tokens.includes(token)) return Promise.resolve(false);
    this.set(
      memberId,
      guildId,
      tokens.filter((one) => one !== token),
    );
    this.costumed.delete(`${guildId} ${memberId} ${token}`);
    return Promise.resolve(true);
  }

  removeAll(memberId: string, guildId: string): Promise<number> {
    this.fail('removeAll');
    const n = this.tokensOf(memberId, guildId).length;
    for (const token of this.tokensOf(memberId, guildId)) {
      this.costumed.delete(`${guildId} ${memberId} ${token}`);
    }
    this.set(memberId, guildId, []);
    return Promise.resolve(n);
  }

  count(memberId: string, guildId: string): Promise<number> {
    this.fail('count');
    return Promise.resolve(this.tokensOf(memberId, guildId).length);
  }

  wanting(guildId: string, targets: readonly TargetWant[]): Promise<MemberTargetWants[]> {
    this.fail('wanting');
    const asked = new Set(targets.map(targetWantToken));
    const found: MemberTargetWants[] = [];
    for (const [key, tokens] of this.rows) {
      const [server, memberId] = key.split(' ');
      if (server !== guildId || memberId === undefined) continue;
      const wants = tokens
        .filter((token) => asked.has(token))
        .flatMap((token) => this.read(memberId, guildId, token) ?? []);
      if (wants.length > 0) found.push({ memberId, wants });
    }
    return Promise.resolve(found);
  }
}
