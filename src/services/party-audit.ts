import type { AuditRow, PartyAuditStore } from '../db/repositories/party-audit-repository.js';
import { auditEntries, type AuditNames, type LoggedMember } from '../domain/party/audit.js';
import type { Party } from '../domain/party/party.js';
import { titleCase } from '../domain/pogo/names.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { Logger } from '../log.js';
import type { ChangeNote, PartyListener } from './party-store.js';

/** How long the log keeps an entry (Matt, 2026-11-07): 30 days. */
export const AUDIT_KEEP_MS = 30 * 24 * 3_600_000;

/** The longest name of an actor the log keeps (`PartyAudit.actorName`). */
const MAX_ACTOR_NAME = 100;

export interface PartyAuditOptions {
  store: { onChange(listener: PartyListener): void; get(id: string): Party | undefined };
  storage: Pick<PartyAuditStore, 'insert' | 'attachPost' | 'deleteBefore'>;
  /** A server's snowflake by its row id (parties name their server by its row). */
  guilds: { snowflakeOf(id: number): Promise<string | undefined> };
  names: AuditNames;
  log: Logger;
  now?: () => number;
}

/**
 * What the log names by id, named as the bot knows it now: a gym by its nickname or name, a
 * Power Spot by its Wayfarer title, a boss and a move by the catalogue, a region by its channel.
 */
export function auditNamesOf(deps: {
  gyms: { get(id: number): { name: string; nickname: string | null } | undefined };
  wayspots?: { byId(id: string): { title: string } | undefined };
  regions: { byId(id: number): { channelId: string } | undefined };
  gameData: { readonly catalogue: Pick<PokemonCatalogue, 'byKey' | 'move'> };
}): AuditNames {
  return {
    gym: (id) => {
      const gym = deps.gyms.get(id);
      // `||`: a nickname cleared to an empty text names nothing.
      return gym === undefined ? undefined : gym.nickname || gym.name;
    },
    spot: (id) => deps.wayspots?.byId(id)?.title,
    boss: (ref) =>
      'name' in ref
        ? ref.name
        : (deps.gameData.catalogue.byKey(ref.key)?.name ?? titleCase(ref.key)),
    move: (id) => deps.gameData.catalogue.move(id)?.name,
    channel: (regionId) => deps.regions.byId(regionId)?.channelId,
  };
}

/**
 * The staff audit log's writer (Matt, 2026-11-07): it listens to the party store, so whoever
 * changes a party (a command, a control, the map, the clock) is logged without code of its own.
 * What a change means for the log (`auditEntries`) is decided as the store tells of it, with the
 * names of now; the writing is done on the side, one write after the other (`flush` waits). A
 * write that fails is a warning: the log never fails a change. A party's entries made before it
 * had a post get that post once it has one. A hard stop may lose what was still waiting.
 */
export class PartyAudit {
  private readonly now: () => number;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly options: PartyAuditOptions) {
    this.now = options.now ?? (() => Date.now());
    options.store.onChange((before, after, note) => {
      this.changed(before, after, note);
    });
  }

  private changed(before: Party | undefined, after: Party, note: ChangeNote | undefined): void {
    const { store, names } = this.options;
    const { ended } = note ?? {};
    const entries = auditEntries(before, after, names, {
      ended,
      removal: note?.removal,
      movedFrom: note?.movedFrom === undefined ? undefined : store.get(note.movedFrom),
      movedTo: ended?.how === 'moved' ? store.get(ended.to) : undefined,
    });
    const postId = after.forumPostId ?? before?.forumPostId ?? null;
    const posted = before !== undefined && before.forumPostId === null ? after.forumPostId : null;
    if (entries.length === 0 && posted === null) return;
    const at = this.now();
    const by = note?.by;
    const actor: LoggedMember | null =
      by === undefined
        ? null
        : by.name === undefined
          ? { id: by.id }
          : { id: by.id, name: by.name.slice(0, MAX_ACTOR_NAME) };
    this.queue(after.id, async () => {
      const { storage, guilds } = this.options;
      if (posted !== null) await storage.attachPost(after.id, posted);
      if (entries.length === 0) return;
      const serverId = await guilds.snowflakeOf(after.guildId);
      if (serverId === undefined) throw new Error(`no server has the row ${String(after.guildId)}`);
      const rows: AuditRow[] = entries.map((entry) => ({
        serverId,
        partyId: after.id,
        postId,
        at,
        actor,
        entry,
      }));
      await storage.insert(rows);
    });
  }

  private queue(partyId: string, work: () => Promise<void>): void {
    this.tail = this.tail.then(work).catch((err: unknown) => {
      this.options.log.warn({ err, party: partyId }, 'could not write to the audit log');
    });
  }

  /** Deletes the entries older than `AUDIT_KEEP_MS` (the hourly upkeep); gives how many. */
  async sweep(): Promise<number> {
    const gone = await this.options.storage.deleteBefore(this.now() - AUDIT_KEEP_MS);
    if (gone > 0) this.options.log.info({ entries: gone }, 'old audit entries deleted');
    return gone;
  }

  /** Waits for every write that is waiting or under way. For shutdown and for tests. */
  async flush(): Promise<void> {
    let seen: Promise<void> | undefined;
    while (seen !== this.tail) {
      seen = this.tail;
      await seen;
    }
  }
}
