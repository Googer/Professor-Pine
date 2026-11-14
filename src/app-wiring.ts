import type { DeletedServerData } from './db/repositories/server-data-repository.js';
import type { ShardStart } from './discord/shard-readiness.js';
import { publicMapOn } from './domain/servers/standing.js';
import { taskPictureSources } from './domain/stops/pictures.js';
import type { Logger } from './log.js';
import type { PartyService } from './services/party-service.js';
import type { PartyStore } from './services/party-store.js';
import type { PictureMaking } from './services/research-task-service.js';
import type { ServerAdmission } from './services/server-admission.js';
import type { ServerFill } from './services/server-fill.js';
import type { ServerSettings, ServerSettingsLookup } from './services/server-settings.js';
import type { ServerSetup } from './services/server-setup.js';
import type { ServerStart } from './discord/server-start.js';
import type { QuietServers } from './services/quiet-servers.js';
import type { ServerStandings } from './services/server-standings.js';
import type { SpawnService } from './services/spawn-service.js';
import type { StopReportListener } from './services/stop-reports.js';
import type { ShutdownStep } from './shutdown.js';
import type { LiveSignals } from './web/live-signals.js';
import {
  joinedServers,
  mapServers,
  type CachedServer,
  type MapServers,
  type MapServerSources,
} from './web/map-servers.js';
import type { WebDeps } from './web/server.js';

/*
 * Parts of `startApp`'s wiring kept apart so that a test can reach them (plan 8R-6, review W5):
 * who is told that the web server listens, and the order in which the reports at stops close.
 */

/**
 * What tells the map's live streams that a list changed: every change of a party, every draw of a
 * post, every word of the reports at stops, every wild spawn recorded. Each listener decides and
 * returns; the hub never throws.
 */
export function liveSources(
  live: Pick<LiveSignals, 'partyChanged' | 'postShown' | 'reportsChanged' | 'spawnsChanged'>,
  sources: {
    parties: Pick<PartyStore, 'onChange'>;
    posts: Pick<PartyService, 'onPostShown'>;
    reports: { listen(listener: StopReportListener): void };
    spawns: Pick<SpawnService, 'onReported'>;
  },
): void {
  sources.spawns.onReported((guildId) => {
    live.spawnsChanged(guildId);
  });
  sources.parties.onChange((_before, after) => {
    live.partyChanged(after);
  });
  sources.posts.onPostShown((partyId, row, changed) => {
    live.postShown(partyId, row, changed);
  });
  sources.reports.listen({
    listChanged: (serverId) => {
      live.reportsChanged(serverId);
    },
  });
}

/** A service that names its pictures at the web server's address once it listens. */
export interface ServedPictures {
  serving(): void;
}

/**
 * Has the pictures of reported research made square (plan 8M-9B, B1): a typed task's reward is
 * on no list that `ResearchTaskService` makes square when it reads it, so the map's view would
 * name the feed's address all day. Every other picture of a report is a list's (the tasks', the
 * lineups' with the portraits), made when the list is read; asked again it is passed over.
 */
export function reportPictures(pictures: PictureMaking): StopReportListener {
  return {
    reported: (news) => {
      void pictures.prepare(taskPictureSources(news.reports.map((report) => report.research)));
    },
  };
}

/** The start-up work for the servers of a shard (`shardStartWork`); each never throws. */
export interface ShardStartWork {
  /** Makes sure every server has its `Guild` row (`syncGuilds`); never rejects. */
  syncServers(servers: readonly string[]): Promise<void>;
  /** Says in the log where meetup safety cannot work (`MeetupSafety.warnAtStart`). */
  warnAtStart(servers: readonly string[]): void;
  /** The square pictures of the spawns that stood through the restart (`SpawnService`). */
  prepareStanding(servers: readonly string[]): void;
}

/**
 * What a shard's ready does for its servers (plan 19D; `ShardReadiness.onShardReady`), so that a
 * server on a late shard is not missed. At every ready the servers are recorded: one that added
 * the bot while its shard was away comes in the new session's READY, and discord.js then says
 * `GuildAvailable` of it, never `GuildCreate`, so nothing else would record it. Only at the
 * shard's first ready (the start): the warnings of meetup safety (lines of the log at the start,
 * which a new session, several a day, would only repeat; a server Discord said unavailable, whose
 * channels are not known yet, is only named there as such, fix round 2, G5) and the pictures of
 * the spawns that stood through the restart (after a new session nothing restarted, and later
 * spawns had theirs made when reported).
 * Servers a new session's READY no longer names (`ShardStart.gone`) are not recorded; nothing
 * acts on them yet (plan C marks them left).
 *
 * `clientReady`, at `ClientReady` (19D fix round 1, F1; round 2, R2: the very moment discord.js
 * begins to say `GuildCreate`, which an every-shard-ready after a resume is not): discord.js says
 * `GuildCreate` only once the client is ready, so a server that adds the bot on a shard already
 * ready while later shards still identify lands in the cache without an event; the cached servers
 * the shards' readies did not cover are recorded then. Only the first time: afterwards
 * `GuildCreate` is said, and the servers recorded are forgotten.
 *
 * The first ready's work reads the servers' values (plan 19A-1): it waits for the shard's
 * servers' rows (`filled`, `wireServerStart`) and their `Guild` rows. Each resolves once its
 * work is done (the start waits for the first readies' and `clientReady`'s, fix round 3, H1).
 */
export function shardStartWork(work: ShardStartWork): {
  shardReady(start: ShardStart, filled?: Promise<unknown>): Promise<void>;
  clientReady(cached: readonly string[]): Promise<void>;
} {
  let recorded: Set<string> | undefined = new Set();
  return {
    shardReady: async ({ servers, first }, filled) => {
      const synced = work.syncServers(servers);
      for (const server of servers) recorded?.add(server);
      await Promise.all([synced, filled]);
      if (!first) return;
      // Every server: meetup safety passes over those Discord says are unavailable (the READY's
      // `unavailable`, which the cache marks so) and names them (fix round 2, G5).
      work.warnAtStart(servers);
      work.prepareStanding(servers);
    },
    clientReady: async (cached) => {
      if (recorded === undefined) return;
      const covered = recorded;
      recorded = undefined;
      const missed = cached.filter((server) => !covered.has(server));
      if (missed.length > 0) await work.syncServers(missed);
    },
  };
}

/**
 * A server adding or removing Pine (plan 19C-1; `GuildCreate`, `GuildDelete`, after
 * `wireServerStart`'s refusal): one that may have this Pine gets its `Guild` row and, were it
 * marked left, is so no more, its return queued in its server's turn at the event itself, so that
 * a removal while its row is written comes after it (back within 30 days, it picks up where it
 * was: same row id,
 * everything on it kept); one that removes it is marked left, its row and everything on it kept
 * (plan 19C-3 deletes them after 30 days), which only a server Pine was in (a `Guild` row) can be:
 * one it refused on joining is neither written nor marked. Either way the zones in use are read
 * again (a zone of its own may come or go, fix round 1, N5). Each resolves once written; neither
 * rejects: what fails is logged.
 *
 * A server added back while its data is being deleted, or whose deletion began and did not end
 * (plan 19C-3, `ServerStandings.pending`), has no `Guild` row written here: its return is taken in
 * its own turn once the deletion is over (`cameBack`, an unfinished deletion finished first), and
 * then its row is written and its fill begun (`backAfterDeletion`), before a removal asked after
 * it; a deletion that could not be finished writes none (the server stays left, and the next
 * ready or sweep tries again).
 */
export function followServers(deps: {
  admission: Pick<ServerAdmission, 'admits'>;
  standings: Pick<ServerStandings, 'markLeft' | 'cameBack' | 'pending'>;
  guilds: { ensure(serverId: string): Promise<unknown> };
  presenceChanged: () => void;
  log: Logger;
}): { joined(serverId: string): Promise<void>; removed(serverId: string): Promise<void> } {
  const { admission, standings, guilds, presenceChanged, log } = deps;
  return {
    joined: async (serverId) => {
      if (admission.admits(serverId)) {
        // Being deleted (plan 19C-3): its row once the deletion is over, by its return.
        const pending = standings.pending(serverId);
        // Its return is queued at the event, before its row is written: a removal that comes
        // meanwhile is queued after it and stays.
        const back = standings.cameBack([serverId]).catch((err: unknown) => {
          log.error({ err, guild: serverId }, 'could not take back that a server left');
        });
        if (!pending) {
          try {
            await guilds.ensure(serverId);
          } catch (err) {
            log.error({ err, guild: serverId }, 'could not record guild');
          }
        }
        await back;
      }
      presenceChanged();
    },
    removed: async (serverId) => {
      // Marked only where Pine was in it (its `Guild` row): never a server it refused, but one
      // it left at a ready because it may no longer have it (dropped from `servers`) is.
      try {
        await standings.markLeft([serverId]);
      } catch (err) {
        log.error({ err, guild: serverId }, 'could not mark a server left');
      }
      presenceChanged();
    },
  };
}

/**
 * What follows a server Pine left or that came back (plan 19C-1; `ServerStandings.whenLeftChanged`,
 * whichever way it was marked: its `GuildDelete`, a refusal, an operator's removal, a ready): the
 * direct messages queued for one left are dropped (`QueuedDmSender.dropServer`; the instance's are
 * no server's), and Google's line is told of both by their `Guild` rows (`GymUpkeep.servingChanged`:
 * the shares are worked out anew, a left server's rows are held out of the line's range at
 * `OUT_OF_SHARE_RANK`, one back has its rows ranked anew by its regions, the raids read first, and
 * the line hurried; a server without a row known has none in the line). So is a server an operator
 * allowed, blocked or unblocked (`whenStandingChanged`), whose being served may change without its
 * leaving or coming back (a block whose leave failed, an unblock of a server Pine is still in): the
 * line serves it, or not, at once rather than at its next turn.
 */
export function followLeaving(
  standings: Pick<ServerStandings, 'whenLeftChanged' | 'whenStandingChanged'>,
  deps: {
    dms: { dropServer(serverId: string): void };
    line: { servingChanged(guildRows: readonly number[]): void };
    rowOf: (serverId: string) => number | undefined;
  },
): void {
  const { dms, line, rowOf } = deps;
  standings.whenLeftChanged(({ left, back }) => {
    for (const serverId of left) dms.dropServer(serverId);
    const rows = [...left, ...back].flatMap((serverId) => rowOf(serverId) ?? []);
    if (rows.length > 0) line.servingChanged(rows);
  });
  standings.whenStandingChanged((serverId) => {
    const row = rowOf(serverId);
    if (row !== undefined) line.servingChanged([row]);
  });
}

/**
 * Nothing is begun of a server while its data's deletion is pending (plan 19C-3;
 * `ServerStandings.pending`; fix round 1, 3b and 4): neither its row of settings (`fill.begin`)
 * nor its `Guild` row at a ready (`syncServers`), and nothing waits for it (`whenFilled` resolves
 * at once: a shard's start and the client's are not held, and its interactions are answered with
 * one line, `BEING_READIED`), so that nothing of a server added back is written before the
 * deletion deleted what it would find, and nothing tries its deletion but its return. Its return
 * begins both once the deletion is over (`backAfterDeletion`), and the server starts anew. A
 * server whose deletion is not pending goes on at once, as before.
 */
export function afterDeletions(standings: Pick<ServerStandings, 'pending'>): {
  fill(fill: Pick<ServerFill, 'begin' | 'whenFilled'>): Pick<ServerFill, 'begin' | 'whenFilled'>;
  syncServers(
    sync: (servers: readonly string[]) => Promise<void>,
  ): (servers: readonly string[]) => Promise<void>;
} {
  return {
    fill: (fill) => ({
      begin: (names, how) => {
        if (!standings.pending(names.serverId)) fill.begin(names, how);
      },
      whenFilled: (serverId) =>
        serverId !== null && standings.pending(serverId)
          ? Promise.resolve()
          : fill.whenFilled(serverId),
    }),
    syncServers: (sync) => async (servers) => {
      const now = servers.filter((serverId) => !standings.pending(serverId));
      if (now.length > 0 || servers.length === 0) await sync(now);
    },
  };
}

/**
 * What a server added back while its data's deletion was pending begins once it is over and the
 * server is taken back (plan 19C-3, fix round 1; `ServerStandings.whenBackAfterDeletion`, in the
 * server's turn): what its joining would have begun and `afterDeletions` held, its fill as one
 * that joins (`ServerStart.admitted`: in setup, plan 19C-2; nothing where the client is not there
 * yet, or the server not available) and its `Guild` row. Each step that fails is logged.
 */
export function backAfterDeletion(deps: {
  late: Pick<SetupLate, 'serverStart'>;
  guilds: { ensure(serverId: string): Promise<unknown> };
  log: Logger;
}): (serverId: string) => Promise<void> {
  const { late, guilds, log } = deps;
  return async (serverId) => {
    try {
      late.serverStart?.admitted(serverId);
    } catch (err) {
      log.error({ err, guild: serverId }, 'could not begin the fill of a server added back');
    }
    try {
      await guilds.ensure(serverId);
    } catch (err) {
      log.error({ err, guild: serverId }, 'could not record guild');
    }
  };
}

/**
 * Whether the web serves a server the bot's client has (plan 19C-1; fix round 1, 3b): not one
 * Pine left, nor one whose data is being deleted (`pending`): either is answered as a server Pine
 * is not in.
 */
export function servedOnWeb(
  standings: Pick<ServerStandings, 'isLeft' | 'pending'>,
): (serverId: string) => boolean {
  return (serverId) => !standings.isLeft(serverId) && !standings.pending(serverId);
}

/**
 * The servers of the web pages (`WebDeps.servers`), which `hiddenFrom` reads as one rule: a server
 * the client has (`has`) and the web serves (`servedOnWeb`: not left, plan 19C-1, nor being
 * deleted, plan 19C-3), else answered as a server Pine is not in, to everybody; whether it is in
 * setup (plan 19C-2); whether its map is open to visitors who are not logged in (plan 19C-4,
 * `publicMapOn`, by the instance's `servers` being `"open"`). `listed`: served and not in setup,
 * the servers the top page may name (`topPageServers`) and whose regions' outlines another
 * server's region editor shows (`EditorCache`; fix round 3, R1).
 */
export function webServers(deps: {
  has: (serverId: string) => boolean;
  standings: Pick<ServerStandings, 'isLeft' | 'pending'>;
  servers: {
    inSetup(serverId: string): boolean;
    of(serverId: string): { publicMap?: boolean };
  };
  open: boolean;
}): WebServers {
  const served = servedOnWeb(deps.standings);
  const has = (serverId: string) => deps.has(serverId) && served(serverId);
  const inSetup = (serverId: string) => deps.servers.inSetup(serverId);
  return {
    has,
    inSetup,
    openToVisitors: (serverId) => publicMapOn(deps.servers.of(serverId), { open: deps.open }),
    listed: (serverId) => has(serverId) && !inSetup(serverId),
  };
}

/** The servers of the web pages (`webServers`), and those the web lists to other servers. */
export type WebServers = WebDeps['servers'] & { listed(serverId: string): boolean };

/**
 * The top page's servers with a map (plan 8M-14, `mapServers`): of those the bot's client has,
 * only those the web lists (`WebServers.listed`): not one Pine left (plan 19C-1) or is deleting
 * (plan 19C-3), nor one in setup (plan 19C-2), whose maps are not there.
 */
export function topPageServers(deps: {
  cached: () => Iterable<CachedServer>;
  web: Pick<WebServers, 'listed'>;
  guilds: MapServerSources['guilds'];
  regions: MapServerSources['regions'];
}): () => Promise<MapServers> {
  return mapServers({
    joined: () => joinedServers([...deps.cached()].filter((guild) => deps.web.listed(guild.id))),
    guilds: deps.guilds,
    regions: deps.regions,
  });
}

/** What the bot keeps in memory of a server, which `forgetServerMemory` forgets. */
export interface ServerMemory {
  rowIds: { forgetServer(serverId: string): void };
  servers: { forget(serverId: string): Promise<void> };
  notices: { forget(serverId: string): void };
  neighbors: { forgetServer(serverId: string): Promise<void> };
  parties: { forgetServer(guildRow: number): unknown };
  access: { forgetServer(guildRow: number): unknown };
  regions: { load(): Promise<void> };
  gyms: { forget(id: number): unknown; unlink(id: number, guildRow: number): unknown };
  wayspots: { load(guildRow: number): Promise<void> };
  pineStops: { load(): Promise<void> };
  nicknames: { load(serverIds: readonly string[]): Promise<void> };
  line: {
    serverGone(removed: readonly number[], unlinked: readonly number[]): Promise<void>;
    servingChanged(guildRows: readonly number[]): void;
  };
  log: Logger;
}

/**
 * What the bot forgets of a server whose data was deleted (plan 19C-3, `ServerDeletion`'s
 * `forget`), each step by itself (one that fails is logged with `what`, and the rest go on): its
 * row ids (`RowIds.forgetServer`: a server added back gets its new `Guild` row; the old row id
 * still names it, and is never another server's), its row of settings (`ServerSettings.forget`:
 * a fill gives it a first one, as to a server that joins), the notices said to its staff
 * (`ServerNotices.forget`: added back, it hears them again), its neighbors and requests
 * (`ServerNeighbors.forgetServer`: the deletion took their rows; added back, it has none), and
 * where it still had its `Guild` row its parties and forum grants (`forgetServer`: nothing
 * written, nothing asked of Discord), its regions (read again), its gyms (`GymDirectory.forget` for those deleted, `unlink` for those
 * others keep, as a gym's deletion does), its Wayspots (`WayspotDirectory.load` of its row: none
 * left), its stops of Pine's own (read again), its Pokémon nicknames (read again: none), and
 * Google's line (`GymUpkeep.serverGone`: what a gym's deletion tells it of each gym, the nearest
 * gyms worked out once for all of the server's, then `servingChanged` of its row: the shares
 * worked out without it). What else is kept of it ages
 * out by itself, keyed by ids no other server has: the boards' and the names' answers (a minute),
 * the board keeper's members told and channels a delete failed in (bounded), the queued DMs
 * (dropped when it was marked left). Never rejects.
 */
export function forgetServerMemory(
  memory: ServerMemory,
): (serverId: string, deleted: DeletedServerData) => Promise<void> {
  const { log } = memory;
  return async (serverId, deleted) => {
    const row = deleted.guildRow;
    const ofRow = (steps: (row: number) => [string, () => unknown][]): [string, () => unknown][] =>
      row === undefined ? [] : steps(row);
    const steps: [string, () => unknown][] = [
      ['row ids', () => memory.rowIds.forgetServer(serverId)],
      ['settings', () => memory.servers.forget(serverId)],
      ['notices', () => memory.notices.forget(serverId)],
      ['neighbors', () => memory.neighbors.forgetServer(serverId)],
      ...ofRow((guildRow) => [
        ['parties', () => memory.parties.forgetServer(guildRow)],
        ['forum grants', () => memory.access.forgetServer(guildRow)],
      ]),
      ['regions', () => memory.regions.load()],
      ...ofRow((guildRow) => [
        [
          'gyms',
          () => {
            for (const id of deleted.gyms.deleted) memory.gyms.forget(id);
            for (const id of deleted.gyms.unlinked) memory.gyms.unlink(id, guildRow);
          },
        ],
        ['Wayspots', () => memory.wayspots.load(guildRow)],
      ]),
      ['stops of Pine’s own', () => memory.pineStops.load()],
      ['Pokémon nicknames', () => memory.nicknames.load([serverId])],
      ...ofRow((guildRow) => [
        [
          'Google’s line',
          async () => {
            await memory.line.serverGone(deleted.gyms.deleted, deleted.gyms.unlinked);
            memory.line.servingChanged([guildRow]);
          },
        ],
      ]),
    ];
    for (const [what, step] of steps) {
      try {
        await step();
      } catch (err) {
        log.error(
          { err, server: serverId, what },
          'could not forget what was kept of a server whose data was deleted',
        );
      }
    }
  };
}

/**
 * The servers Pine is in by their `Guild` rows (`GuildRepository.snowflakes`), for what must know
 * them before the login (the Google line's ranks, plan 8Z-2): since plan 19C-1 a server Pine left
 * keeps its row, so the quiet ones are left out (those left, and those in setup, plan 19C-2:
 * `QuietServers`, read at each call).
 */
export function serversNotQuiet(
  snowflakes: () => Promise<readonly string[]>,
  quiet: QuietServers,
): () => Promise<string[]> {
  return async () => (await snowflakes()).filter((serverId) => !quiet.isQuiet(serverId));
}

/**
 * Whether Google's line serves the rows of a server, by its `Guild` row (`GymUpkeepOptions.serves`):
 * one that may have this Pine and is not quiet (plan 19C-1: Pine left it; plan 19C-2: it is in
 * setup, as anything else that works for a server outside its interactions): the rows of a quiet
 * one are held out of the line's range and count for no share, until it is back or set up (the
 * line's next turn notices it, `servingChanged` at once). A row of no server known is served, as
 * the line served every row before. Asked at each call.
 */
export function servesRow(deps: {
  serverOfRow: (guildRow: number) => string | undefined;
  admits: (serverId: string) => boolean;
  quiet: QuietServers;
}): (guildRow: number) => boolean {
  return (guildRow) => {
    const server = deps.serverOfRow(guildRow);
    return server === undefined || (deps.admits(server) && !deps.quiet.isQuiet(server));
  };
}

/**
 * A listener of the messages posted (`MessageCreate`) that passes over those of a quiet server
 * (plan 19C-2, S1: Pine left it, or it is in setup) before anything looks at them: the region's
 * board keeps nothing of it, the screenshot trigger reads nothing, no post counts as active. A
 * direct message is of no server, and goes on.
 */
export function notOfQuietServers<M extends { guildId: string | null }>(
  quiet: QuietServers,
  listener: (message: M) => void,
): (message: M) => void {
  return (message) => {
    if (message.guildId !== null && quiet.isQuiet(message.guildId)) return;
    listener(message);
  };
}

/**
 * What a server's setup reaches that `startApp` makes after it (plan 19C-2, fix round 1, S5),
 * set where each is made: the events forum and the posts of the stops (made later; none in
 * rehearsal mode), and what the live client's `configure` makes (the start of its servers, Pine
 * joining a server). Read at each call, never kept: a client the login dropped (its intents
 * refused) leaves nothing behind.
 */
export interface SetupLate {
  eventForum?: { zonesChanged(): void };
  stopPosts?: { zonesChanged(): void };
  serverStart?: Pick<ServerStart, 'admitted'>;
  joined?: (serverId: string) => Promise<void>;
}

/**
 * What begins for a server once it leaves setup (`ServerSetup`'s `setUp`, plan 19C-2): what was
 * held for a quiet server. The zones in use are read again (its zone is in use now), its
 * summaries made, the events forums and the posts of the stops follow the zones, meetup safety's
 * warnings of the start are said of it alone (S10), and Google's line serves its rows from now on
 * at once (`servingChanged` by its `Guild` row: the shares worked out anew, its rows ranked anew
 * by its regions, the raids read first, and the line hurried; a server without a row known has
 * none in the line). Each step that throws is logged and the rest still run.
 */
export function serverSetUpWork(deps: {
  presenceChanged: () => void;
  checkSummaries: () => Promise<unknown>;
  warnAtStart: (servers: readonly string[]) => void;
  line: { servingChanged(guildRows: readonly number[]): void };
  rowOf: (serverId: string) => number | undefined;
  late: Pick<SetupLate, 'eventForum' | 'stopPosts'>;
  log: Logger;
}): (serverId: string) => void {
  const { late, log } = deps;
  return (serverId) => {
    const steps: [string, () => void][] = [
      ['zones in use', deps.presenceChanged],
      [
        'summaries',
        () => {
          void deps.checkSummaries().catch((err: unknown) => {
            log.warn({ err, server: serverId }, 'could not make the summaries of a server set up');
          });
        },
      ],
      ['events forum', () => late.eventForum?.zonesChanged()],
      ['posts of the stops', () => late.stopPosts?.zonesChanged()],
      ['meetup safety', () => deps.warnAtStart([serverId])],
      [
        "Google's line",
        () => {
          const row = deps.rowOf(serverId);
          if (row !== undefined) deps.line.servingChanged([row]);
        },
      ],
    ];
    for (const [what, step] of steps) {
      try {
        step();
      } catch (err) {
        log.error(
          { err, server: serverId, what },
          'could not begin what waited for a server set up',
        );
      }
    }
  };
}

/**
 * The setup of the servers wired (plan 19C-2; fix round 1, S5), before the login: a server
 * leaves setup once its required items are done, whatever did the last (a change of its values,
 * `ServerSettings.onChange`; a region saved or imported, `whenOutlinesChanged`), and at the start
 * for one whose items were done meanwhile; every check waits for `connected` (the first load of
 * the regions, the client ready), so that nothing begins for a server before the bot is there.
 * A server an instance operator allows after it waited, present (`ServerAdmission.onAllowed`,
 * S6), is begun on the live client as its joining would be (`late`): its fill, its `Guild` row,
 * its return. Registered once, whatever client the login keeps.
 */
export function wireServerSetup(deps: {
  setup: Pick<ServerSetup, 'check' | 'checkAll'>;
  servers: Pick<ServerSettings, 'onChange'>;
  regions: { whenOutlinesChanged(listener: () => void): unknown };
  admission: Pick<ServerAdmission, 'onAllowed'>;
  late: Pick<SetupLate, 'serverStart' | 'joined'>;
  connected: Promise<unknown>;
}): void {
  const { setup, late, connected } = deps;
  deps.servers.onChange((serverId) => {
    void connected.then(() => setup.check(serverId));
  });
  deps.regions.whenOutlinesChanged(() => {
    void connected.then(() => setup.checkAll());
  });
  void connected.then(() => setup.checkAll());
  deps.admission.onAllowed((serverId) => {
    late.serverStart?.admitted(serverId);
    void late.joined?.(serverId);
  });
}

/** Something the shutdown closes and waits for. */
interface Closing {
  close(): Promise<void>;
}

/**
 * Tells the picture services that the web server listens (`startWebServer` answered true): the
 * eggs (plan 8M-1) and the pictures at the stops (plan 8R-6, `StopPictures`) are named at its
 * address from then on.
 */
export function picturesServed(pictures: { eggs: ServedPictures; stops: ServedPictures }): void {
  pictures.eggs.serving();
  pictures.stops.serving();
}

/** What the shutdown stops of the events feed (`RaidEventService`) and the events forum. */
export interface Stopping {
  stop(): void;
}

/**
 * The shutdown's step of the raid and the max boss syncs (`BossFeedService`; fix round 3, J1):
 * five seconds, as each had one of its own, so that the stack's limits keep a margin (143 s with
 * every optional step, `operations.md`). Both are stopped first (no read starts; one under way is
 * aborted), then both are waited for at once: a sync in flight may be writing its list, which
 * finishes before the pool closes.
 */
export function bossSyncStep(syncs: {
  raid: Stopping & { whenIdle(): Promise<void> };
  max: Stopping & { whenIdle(): Promise<void> };
}): ShutdownStep {
  return {
    name: 'boss syncs',
    timeoutMs: 5_000,
    run: async () => {
      syncs.raid.stop();
      syncs.max.stop();
      await Promise.all([syncs.raid.whenIdle(), syncs.max.whenIdle()]);
    },
  };
}

/**
 * The shutdown's step of the events feed and the events forum (plan 8V-1, branch review BR-2):
 * one second, as the feed's alone was (the stack's limits add up to 143 s with every optional
 * step, `operations.md`). The forum is stopped first (no draw starts; one under way ends at its
 * next post, re-review RR-3), then the feed (a read under way is aborted); both are waited for.
 * No forum in rehearsal mode.
 */
export function eventsFeedStep(parts: {
  events: Stopping & { whenIdle(): Promise<void> };
  forum: (Stopping & { flush(): Promise<void> }) | undefined;
}): ShutdownStep {
  return {
    name: 'raid events',
    timeoutMs: 1_000,
    run: async () => {
      parts.forum?.stop();
      parts.events.stop();
      await Promise.all([parts.forum?.flush(), parts.events.whenIdle()]);
    },
  };
}

/** How long direct messages that wait at shutdown are still sent (spec 9). */
const DM_DRAIN_MS = 10_000;

/**
 * The shutdown's step of the direct messages (spec 9): the queued DMs go on at their usual rate
 * for ten seconds, the rest is dropped; within the step's twelve. What a server's staff are told
 * on its way (`ServerNotices.flush`, plan 19B-1) is sent beside them while Discord is connected,
 * within the same twelve seconds, so the stack's limits gain no step (fix round 2, G3).
 */
export function directMessagesStep(parts: {
  dms: { drain(ms: number): Promise<void> };
  notices: { flush(): Promise<void> };
}): ShutdownStep {
  return {
    name: 'direct messages',
    timeoutMs: 12_000,
    run: async () => {
      await Promise.all([parts.dms.drain(DM_DRAIN_MS), parts.notices.flush()]);
    },
  };
}

/**
 * The shutdown's steps of the reports at stops, in their order, after the spawn reports: the
 * pictures first, so that no picture is fetched any more (the fetches on their way are aborted,
 * and what is drawn from then on names the pictures made or the feeds' addresses); then the
 * grunts' messages, which stand on with their reports (the next start's sweep deletes them); then
 * the lines of the region channels on their way (plan 8R-9, which wait for the posts' links) and
 * what waits to be drawn in the posts of the stops, in one step. Ten seconds in all (the stack's
 * limits add up to 143 s with every optional step, `operations.md`). The grunts' messages, the
 * lines and the posts are none in rehearsal mode.
 */
export function stopReportSteps(parts: {
  pictures: Closing;
  grunts: Closing | undefined;
  lines: Closing | undefined;
  posts: Closing | undefined;
}): ShutdownStep[] {
  return [
    { name: 'pictures of the stops', timeoutMs: 1_000, run: () => parts.pictures.close() },
    {
      name: 'grunt reports',
      timeoutMs: 4_000,
      run: async () => {
        await parts.grunts?.close();
      },
    },
    {
      name: 'posts of the stops',
      timeoutMs: 5_000,
      run: async () => {
        await parts.lines?.close();
        await parts.posts?.close();
      },
    },
  ];
}

/**
 * What follows the servers' zones (plan 19A-2; fix round 1, N5): a change of a server's zone
 * reaches each of `server` with the server, then each of `zones`; a change of the zones in use
 * that no change of a zone made (a server joining or leaving with a zone of its own) reaches each
 * of `zones`. Every hook runs, one that throws is logged.
 */
export function followZones(
  servers: Pick<ServerSettingsLookup, 'onZoneChange' | 'onZonesInUseChange'>,
  hooks: {
    server?: ReadonlyArray<(serverId: string) => void>;
    zones?: ReadonlyArray<() => void>;
  },
  log: Logger,
): void {
  const run = (hook: () => void): void => {
    try {
      hook();
    } catch (err) {
      log.error({ err }, 'a listener of a change of time zone failed');
    }
  };
  const zones = (): void => {
    for (const hook of hooks.zones ?? []) run(hook);
  };
  servers.onZoneChange((serverId) => {
    for (const hook of hooks.server ?? []) {
      run(() => {
        hook(serverId);
      });
    }
    zones();
  });
  servers.onZonesInUseChange(zones);
}
