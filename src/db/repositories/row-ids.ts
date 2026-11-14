import { BoundedMap } from '../../bounded-map.js';

/** As many servers as are remembered: far more than the bot is in. */
const MAX_GUILDS = 1_000;
/** As many members as are remembered; the one met longest ago goes first. */
const MAX_USERS = 20_000;

/**
 * The row ids of `Guild` and `User` rows this process has made or seen, by snowflake, so that
 * they are not asked for again before every statement that needs one (plan 4F: a want cost two
 * such reads before its transaction, a list three round trips for one read).
 *
 * A row id never changes while its row exists, and only a row that exists is remembered: a
 * missing one is asked for every time, so a row that somebody else makes is found at once.
 * But a remembered row can go:
 *
 * - a `Guild` row is deleted by this bot through `GuildRepository.remove`, which forgets it
 *   here, and by the legacy bot on the same database when it leaves a server (its
 *   `guildDelete`), which this process does not hear of. The row that is made when the server
 *   comes back has another id. So what is remembered of a server is corrected wherever the
 *   truth shows: `GuildRepository.ensure` (run for every server at each start and whenever the
 *   bot joins one) always writes, reads and overwrites it, and a write that hangs a row on a
 *   server id that is gone fails the foreign key, on which `withMemberLocked` forgets the
 *   server and makes the change once more. Until one of the two happens, a read by the old id
 *   finds nothing, which is what is there: the member's rows went with the server's;
 * - a `User` row is deleted only by `UserRepository.forget` (plan 8G, the owner's `/admin
 *   forget`), which forgets it here once it has committed. Should one be gone otherwise, a
 *   write notices (`withMemberLocked` locks the row by its snowflake), forgets it and makes
 *   the change as for a new member; a read finds nothing until then.
 *
 * One of these is shared by the repositories of a process (`src/app.ts`). A repository that is
 * given none remembers nothing, as before: `RowIds.none`.
 */
export class RowIds {
  /** Remembers nothing and knows nothing: every id is asked for. The default of a repository. */
  static readonly none: RowIds = new RowIds(false);

  private readonly guilds = new BoundedMap<string, number>(MAX_GUILDS);
  private readonly guildSnowflakes = new BoundedMap<number, string>(MAX_GUILDS);
  private readonly users = new BoundedMap<string, number>(MAX_USERS);
  /**
   * The server of every `Guild` row known (fix round 1, K1): read whole at start
   * (`GuildRepository.loadRows`, before the parties), added to by every row made or read. Never
   * bounded and never forgotten: rows are servers, and a row id is never another server's. A
   * party's zone is its server's, so it must never miss because a memory dropped the row.
   */
  private readonly serversOfRows = new Map<number, string>();
  /**
   * The `Guild` row of every server known, the other way (plan 19B-5, fix round 4): as complete
   * and as unbounded as `serversOfRows`, the newer row of a server whose row was made again. The
   * servers' floors of Google's lookups by hand and maps are counted by it (`app.ts`'s
   * `serverRows`): a bounded memory that dropped a server would take its floor away.
   */
  private readonly rowsOfServers = new Map<string, number>();

  constructor(private readonly remembering = true) {}

  /** The row id of a server that was seen; undefined for one that was not. */
  guild(snowflake: string): number | undefined {
    return this.guilds.get(snowflake);
  }

  /** The snowflake of the server with a row id that was seen. */
  guildSnowflake(id: number): string | undefined {
    return this.guildSnowflakes.get(id);
  }

  /**
   * The server of a `Guild` row, from every row known since the start (`knowGuildRow`), however
   * many: undefined only for a row this process never read or made.
   */
  serverOfRow(id: number): string | undefined {
    return this.serversOfRows.get(id);
  }

  /**
   * A `Guild` row is (or was) this server's: what the start reads of the table and every row made
   * or read, also inside a transaction (a row rolled back is no party's).
   */
  knowGuildRow(snowflake: string, id: number): void {
    if (!this.remembering) return;
    this.serversOfRows.set(id, snowflake);
    this.rowsOfServers.set(snowflake, id);
  }

  /**
   * The `Guild` row of a server, from every row known since the start (`knowGuildRow`), however
   * many servers: undefined only for a server this process never read or made a row of.
   */
  rowOfServer(snowflake: string): number | undefined {
    return this.rowsOfServers.get(snowflake);
  }

  /** The row id of a member that was seen; undefined for one that was not. */
  user(snowflake: string): number | undefined {
    return this.users.get(snowflake);
  }

  /** A server's row exists with this id: it was read, or made and read back. */
  sawGuild(snowflake: string, id: number): void {
    if (!this.remembering) return;
    // The row was made anew: its old id is no server's any more.
    const before = this.guilds.get(snowflake);
    if (before !== undefined && before !== id) this.guildSnowflakes.delete(before);
    this.guilds.set(snowflake, id);
    this.guildSnowflakes.set(id, snowflake);
    this.serversOfRows.set(id, snowflake);
    this.rowsOfServers.set(snowflake, id);
  }

  /**
   * A member's row exists with this id. Never for a row made inside a transaction that has not
   * committed yet: one that is rolled back would be remembered all the same.
   */
  sawUser(snowflake: string, id: number): void {
    if (this.remembering) this.users.set(snowflake, id);
  }

  /** The server's row was deleted, or is no longer sure. */
  forgetGuild(snowflake: string): void {
    const id = this.guilds.get(snowflake);
    this.guilds.delete(snowflake);
    if (id !== undefined) this.guildSnowflakes.delete(id);
  }

  /**
   * The server's data was deleted, its `Guild` row with it (plan 19C-3): neither way is it known
   * any more, so that a server added back is given its new row. The server of the old row is
   * still known (`serverOfRow`): a row id is never another server's.
   */
  forgetServer(snowflake: string): void {
    this.forgetGuild(snowflake);
    this.rowsOfServers.delete(snowflake);
  }

  /** The member's row turned out to be gone. */
  forgetUser(snowflake: string): void {
    this.users.delete(snowflake);
  }
}
