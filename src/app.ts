import { Events, type Client } from 'discord.js';
import { sql } from 'kysely';
import type { AppContext } from './app-context.js';
import {
  commands as allCommands,
  messageCommands as allMessageCommands,
} from './commands/index.js';
import { wildExceptionsOf } from './commands/notifications/wild.js';
import { components } from './components/index.js';
import { ScreenshotTrigger } from './commands/screenshots/mention.js';
import { loadConfig } from './config/index.js';
import { channelNamesOf } from './config/settings.js';
import { configWarnings } from './config/warnings.js';
import { dbConfigFrom } from './db/db-config.js';
import { createDb } from './db/kysely.js';
import { runMigrations } from './db/migrator.js';
import { AccessGrantRepository } from './db/repositories/access-grant-repository.js';
import { PartyAuditRepository } from './db/repositories/party-audit-repository.js';
import { GuildRepository } from './db/repositories/guild-repository.js';
import { GymNotificationRepository } from './db/repositories/gym-notification-repository.js';
import { GymRemovalRepository } from './db/repositories/gym-removal-repository.js';
import { NewTrainRepository } from './db/repositories/new-train-repository.js';
import { GymRepository } from './db/repositories/gym-repository.js';
import { ActivityRepository } from './db/repositories/activity-repository.js';
import { HistoryDays } from './services/history-days.js';
import { HistoryRepository } from './db/repositories/history-repository.js';
import { PartyRepository } from './db/repositories/party-repository.js';
import { PokemonNotificationRepository } from './db/repositories/pokemon-notification-repository.js';
import { TargetWantRepository } from './db/repositories/target-want-repository.js';
import { WantBoxRepository } from './db/repositories/want-box-repository.js';
import { PokemonRepository } from './db/repositories/pokemon-repository.js';
import { MaxBossRepository, RaidBossRepository } from './db/repositories/raid-boss-repository.js';
import { RegionRepository } from './db/repositories/region-repository.js';
import { RowIds } from './db/repositories/row-ids.js';
import { SavedRouteRepository } from './db/repositories/saved-route-repository.js';
import { SelfRoleRepository } from './db/repositories/self-role-repository.js';
import { SpawnReportRepository } from './db/repositories/spawn-report-repository.js';
import { UnownGiftRepository } from './db/repositories/unown-gift-repository.js';
import { UserRepository } from './db/repositories/user-repository.js';
import { WayfarerRepository } from './db/repositories/wayfarer-repository.js';
import { WayspotRepository } from './db/repositories/wayspot-repository.js';
import { WebSessionRepository } from './db/repositories/web-session-repository.js';
import { ScriptAccessRepository } from './db/repositories/script-access-repository.js';
import { MeetupSafetyRepository } from './db/repositories/meetup-safety-repository.js';
import type { DB } from './db/types.js';
import { ClickAnswers } from './discord/click-answers.js';
import { createClient, loginWithFallback } from './discord/client.js';
import { enabledCommands, enabledMessageCommands } from './discord/command.js';
import { DiscordDmGateway } from './discord/dm-gateway.js';
import { attachGatewayHandlers, GatewayWatch } from './discord/gateway-events.js';
import { DiscordMemberDirectory } from './discord/member-directory.js';
import { managementRoleIdsOf } from './discord/guards.js';
import { DiscordRegionStaff } from './discord/web-staff.js';
import { DiscordWebMembers } from './discord/web-members.js';
import { MAP_WRITES_PER_MINUTE } from './web/acting.js';
import { RateLimiter } from './web/rate-limit.js';
import { Throttles } from './discord/throttle.js';
import { DiscordRoleGateway } from './discord/role-gateway.js';
import { postedMessage } from './discord/screenshot-message.js';
import { postedBoardMessage } from './discord/board-message.js';
import { BoardKeeper } from './services/board-keeper.js';
import { DiscordApplicationEmoji } from './discord/application-emoji.js';
import { DiscordPartyGateway } from './discord/party-gateway.js';
import { syncGuilds } from './discord/guild-sync.js';
import { InteractionRouter } from './discord/router.js';
import { lobbySize } from './domain/party/lobby.js';
import { screenshotIdOf } from './domain/party/party.js';
import { formReader } from './domain/pogo/wants.js';
import { trainMapLinkOf } from './domain/web/train-history-data.js';
import { createLogger, type Logger } from './log.js';
import { AccessService } from './services/access-service.js';
import { auditNamesOf, PartyAudit } from './services/party-audit.js';
import { AdminLock } from './services/admin-lock.js';
import { FetchAttachments } from './services/attachment-gateway.js';
import { AttendanceService } from './services/attendance-service.js';
import { QueuedDmSender } from './services/dm-sender.js';
import { GameDataService } from './services/game-data-service.js';
import { GoogleGeo } from './services/geo-gateway.js';
import { GitHubIssues } from './services/issue-gateway.js';
import { PokebattlerFight } from './services/pokebattler-gateway.js';
import { NominatimSearch } from './services/place-search.js';
import { GymAdminService } from './services/gym-admin-service.js';
import { GymDirectory } from './services/gym-directory.js';
import { WayspotDirectory } from './services/wayspot-directory.js';
import { PlaceFinder } from './services/place-finder.js';
import { PineStopService } from './services/pine-stops.js';
import { ResearchTaskService } from './services/research-task-service.js';
import { EventPageService, startAfterFeed } from './services/event-page-service.js';
import { ResearchTaskRepository } from './db/repositories/research-task-repository.js';
import { RocketLineupService } from './services/rocket-lineup-service.js';
import { RocketLineupRepository } from './db/repositories/rocket-lineup-repository.js';
import { GruntMessageRepository } from './db/repositories/grunt-message-repository.js';
import { GruntMessageService } from './services/grunt-messages.js';
import { RocketService } from './services/rocket-reports.js';
import { ResearchEventRepository } from './db/repositories/research-event-repository.js';
import { MaxEventRepository } from './db/repositories/max-event-repository.js';
import { EventWindowRepository } from './db/repositories/event-window-repository.js';
import { EventWindowService } from './services/event-window-service.js';
import { ListedEventRepository } from './db/repositories/listed-event-repository.js';
import { EventForumRepository } from './db/repositories/event-forum-repository.js';
import { eventForumWanted, EventForumService } from './services/event-forum.js';
import { StopReportRepository } from './db/repositories/stop-report-repository.js';
import { StopReportService } from './services/stop-reports.js';
import { rewardHash } from './domain/research/versions.js';
import { StopPostService } from './services/stop-posts.js';
import { StopLineService } from './services/stop-lines.js';
import { StopPostRepository } from './db/repositories/stop-post-repository.js';
import { StopLineRepository } from './db/repositories/stop-line-repository.js';
import { PineStopRepository } from './db/repositories/pine-stop-repository.js';
import { GymUpkeep } from './services/gym-upkeep.js';
import { GymLookupRepository } from './db/repositories/gym-lookup-repository.js';
import { GoogleUseRepository } from './db/repositories/google-use-repository.js';
import { WayspotAddressRepository } from './db/repositories/wayspot-address-repository.js';
import { WayspotAddresses } from './services/wayspot-addresses.js';
import { GoogleRanks } from './services/google-ranks.js';
import { KeptActivity } from './services/kept-activity.js';
import { MapBudget } from './services/map-budget.js';
import { WayspotLookupRepository } from './db/repositories/wayspot-lookup-repository.js';
import { WayspotPlaces } from './services/wayspot-places.js';
import { ImageCache } from './services/image-cache.js';
import { EmojiPictures, PlacePictures, prunePlacePictures } from './services/post-pictures.js';
import { NotifyService } from './services/notify-service.js';
import { ReachRecords } from './services/reach.js';
import { WantCountService } from './services/want-counts.js';
import { WantCountRepository } from './db/repositories/want-count-repository.js';
import { LegacyFillInRepository } from './db/repositories/legacy-fill-in-repository.js';
import { LegacyFillInService } from './services/legacy-fill-in.js';
import { MemberDataRepository } from './db/repositories/member-data-repository.js';
import { MemberRemoval } from './services/member-removal.js';
import { memberIndexServers } from './ops/legacy-index.js';
import { OcrAssets } from './services/ocr-assets.js';
import { OcrService } from './services/ocr-service.js';
import { ScreenshotService } from './services/screenshot-service.js';
import { ScreenshotStore } from './services/screenshot-store.js';
import { PartyLines } from './services/party-lines.js';
import { ApplicationEmoji, emojiFinder } from './services/application-emoji.js';
import { PartyHistory } from './services/party-history.js';
import { PartyScheduler } from './services/party-scheduler.js';
import { CatchUp, type CatchUpOutcome } from './services/catch-up.js';
import { PartyService } from './services/party-service.js';
import { PartyStore } from './services/party-store.js';
import { PokemonSearchService } from './services/pokemon-search-service.js';
import { RaidBossAnnouncer } from './services/raid-boss-announcer.js';
import { MaxBossService } from './services/max-boss-service.js';
import { MaxChangeService } from './services/max-change-service.js';
import { BossTierMoves } from './services/boss-tier-moves.js';
import { ListTierWatch } from './services/list-tier-watch.js';
import { RaidBossService } from './services/raid-boss-service.js';
import { RaidChangeService } from './services/raid-change-service.js';
import { TimedPartyService } from './services/timed-party-service.js';
import { TrainService } from './services/train-service.js';
import { UnownWantService } from './services/unown-want-service.js';
import { RaidEventService } from './services/raid-event-service.js';
import type { RaidEvent } from './domain/time/raid-events.js';
import type { MaxEvent } from './domain/time/max-events.js';
import { RegionAdminService } from './services/region-admin-service.js';
import { WayfarerImportService } from './services/wayfarer-import-service.js';
import { WayfarerReviewService } from './services/wayfarer-review-service.js';
import { RegionTallies } from './services/region-tallies.js';
import { MemberNames } from './services/member-names.js';
import { Boards } from './services/boards.js';
import { MemberStatsService } from './services/member-stats.js';
import { BoardRepository } from './db/repositories/board-repository.js';
import { RegionDirectory, stopRegionsInGuild } from './services/region-directory.js';
import { SelfRoleService } from './services/self-role-service.js';
import { SpawnService } from './services/spawn-service.js';
import { MeetupSafety } from './services/meetup-safety.js';
import { ModerationReports } from './services/moderation-reports.js';
import { ReportRepository } from './db/repositories/report-repository.js';
import { StaticMaps } from './services/static-maps.js';
import { LegacyCleanup } from './services/legacy-cleanup.js';
import {
  RehearsalDms,
  rehearsalGateway,
  rehearsalModeratorsGateway,
  rehearsalOf,
  rehearsalPosts,
  servedSettings,
} from './services/rehearsal.js';
import { healthFiles } from './ops/health.js';
import { gatewayConnected, Heartbeat } from './ops/heartbeat.js';
import { startCheckpoint } from './ops/start-stop.js';
import {
  eventsFeedStep,
  liveSources,
  picturesServed,
  reportPictures,
  stopReportSteps,
} from './app-wiring.js';
import { createShutdown } from './shutdown.js';
import { maxLook } from './render/max-post.js';
import { pictureOrigins } from './web/headers.js';
import { buildWebServer } from './web/server.js';
import { DiscordOAuth } from './web/discord-oauth.js';
import { SaveCheckWorker } from './web/save-check.js';
import { EditorCache } from './web/editor-cache.js';
import { GeoCache } from './web/geo-cache.js';
import { LIVE_ON_THE_CLOCK, LiveSignals } from './web/live-signals.js';
import { joinedServers, mapServers } from './web/map-servers.js';
import { MEMBER_LOOKUPS_PER_SECOND } from './web/paced-members.js';
import { readAssets } from './web/page.js';
import { WayspotToolFiles } from './services/wayspot-tool.js';
import { ScriptAccessService } from './services/script-access-service.js';
import { LoginLinks } from './web/login-links.js';
import { Sessions } from './web/sessions.js';
import { startWebServer } from './web/start.js';
import { EggPictures } from './services/egg-pictures.js';
import { PICTURE_FOLDER, StopPictures } from './services/stop-pictures.js';

/** Parsed game data is kept here between runs, so the bot can start while offline. */
const GAME_DATA_CACHE = 'var/game-data-cache.json';
/** Downloaded map pictures are kept here; deleting the folder only costs new downloads. */
const IMAGE_CACHE = 'var/images';
/** The files of the screenshot reader (models, the tier head), downloaded on first use. */
const OCR_DIR = 'var/ocr';
const MINUTE_MS = 60_000;
/** How long the party clock waits at start for the first read of the raid events. */
const EVENTS_WAIT_MS = 15_000;
const HOUR_MS = 60 * MINUTE_MS;
/** After this long without a read of the max boss feed, a warning is logged once (no setting). */
const MAX_BOSSES_STALE_AFTER_HOURS = 48;
/** How long direct messages that wait at shutdown are still sent. */
const DM_DRAIN_MS = 10_000;

export interface StartOptions {
  /**
   * Called when the gateway closes for good; receives the shutdown to run before exiting, and a
   * line that says why.
   */
  onFatal?: (shutdown: () => Promise<void>, reason: string) => void;
  /**
   * Whether a stop was asked for while the bot starts: the start then ends between two of its
   * steps (`StartStopped`), never in the middle of one (the migrations above all).
   */
  stopRequested?: () => boolean;
  /** Awaited just before the login (the wait of a bot that keeps crashing); then a checkpoint. */
  beforeLogin?: () => Promise<void>;
  /** The folder of the health files; `var/health` by default (tests give another). */
  healthDir?: string;
}

export async function startApp(
  rawEnv: Record<string, string | undefined>,
  options: StartOptions = {},
): Promise<{ log: Logger; shutdown: () => Promise<void>; rehearsal: boolean }> {
  const loaded = loadConfig(rawEnv);
  // In rehearsal mode without the web pages (`servedSettings`), which the warnings say.
  const config = { ...loaded, settings: servedSettings(loaded.settings) };
  const log = createLogger({
    level: config.env.LOG_LEVEL,
    pretty: config.env.NODE_ENV === 'development',
  });
  for (const warning of configWarnings(rawEnv, loaded.settings)) log.warn(warning);
  // Rehearsal mode (settings.rehearsal): said loudly, so that it is never left on by accident.
  const rehearsal = rehearsalOf(config.settings);
  if (rehearsal) {
    log.warn(
      { allowlist: rehearsal.settings.allowlist.length, regions: rehearsal.settings.regions },
      'REHEARSAL MODE IS ON: direct messages only to the allowlist, no announcements, only staff and the allowlist answered, forums only for the rehearsed regions',
    );
  }
  const db = createDb<DB>(dbConfigFrom(config.env));
  // The bot's health for the Docker stack's check (`var/health/status.json`), from here on, so
  // that a slow start (migrations, the game data's first download) shows as alive.
  const heartbeat = new Heartbeat({
    file: healthFiles(options.healthDir).status,
    database: async () => {
      await sql`select 1`.execute(db);
    },
    log,
    rehearsal: rehearsal !== undefined,
  });
  heartbeat.start();

  const gameData = new GameDataService({
    gameMasterUrl: config.settings.gameData.gameMasterUrl,
    textUrl: config.settings.gameData.textUrl,
    iconsUrl: config.settings.gameData.iconsUrl,
    megaPortraitsUrl: config.settings.gameData.megaPortraitsUrl,
    cachePath: GAME_DATA_CACHE,
    maxAgeMs: config.settings.gameData.refreshHours * HOUR_MS,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  const raidBosses = new RaidBossService({
    url: config.settings.raidBosses.url,
    // Leek Duck's rotations first, ScrapedDuck's feed as the fallback (plan 8B-L).
    manifest: { url: config.settings.raidBosses.manifestUrl, zone: config.settings.timezone },
    refreshMs: config.settings.raidBosses.refreshMinutes * MINUTE_MS,
    staleAfterMs: config.settings.raidBosses.staleAfterHours * HOUR_MS,
    store: new RaidBossRepository(db, (override) => {
      log.warn(
        { override: override.id, level: override.level },
        'a raid boss override has a tier Pine does not know and is ignored',
      );
    }),
    gameData,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  // The max bosses (plan 8X-2; always on, Matt 2026-10-21): Pokebattler's feed, beside the
  // raid bosses in the same tables. Its changes are announced nowhere (the announcer listens to
  // the raid bosses), and the warning of a list out of date is only logged.
  const maxSettings = config.settings.maxBattles;
  const maxBosses = new MaxBossService({
    url: maxSettings.url,
    refreshMs: maxSettings.refreshMinutes * MINUTE_MS,
    staleAfterMs: MAX_BOSSES_STALE_AFTER_HOURS * HOUR_MS,
    zone: config.settings.timezone,
    store: new MaxBossRepository(db),
    gameData,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  // The event window staff set (`/admin event-window`, 2026-11-09), kept in the database.
  const eventWindows = new EventWindowService({ store: new EventWindowRepository(db), log });
  const raidEvents = new RaidEventService({
    url: config.settings.raidEvents.url,
    refreshMs: config.settings.raidEvents.refreshHours * HOUR_MS,
    zone: config.settings.timezone,
    fetch: (url, init) => fetch(url, init),
    // The events with field research of their own, kept as seen (plan 8R-1).
    research: new ResearchEventRepository(db),
    // The max events and the big events, kept as last merged (plan 8X-F).
    maxEvents: new MaxEventRepository(db, log),
    // The events forum's listed events, kept as last merged (plan 8V-1).
    listed: new ListedEventRepository(db, log),
    // The Raid Hours of the events' Leek Duck pages (2026-11-07), with the feed's for every
    // reader of `events()`; `eventPages` is made just below, and asked only once running.
    pageRaidHours: (): readonly RaidEvent[] => eventPages.raidHours(),
    // Their Max Battle hours, with the feed's max events for every reader of `maxEvents()`.
    pageMaxHours: (): readonly MaxEvent[] => eventPages.maxHours(),
    // A Raid Hour and a Max Battle Day to every reader while staff's event window is on.
    eventWindow: () => eventWindows.current(),
    log,
  });
  // The events' Leek Duck pages: the spawns of the events on (plan 8R-4: a community day's from
  // the feed, any other event's from its page, read while it is on; costumed spawn reports), and
  // the Raid Hours of the events from eight days ago to eight days ahead.
  const eventPages = new EventPageService({
    events: raidEvents,
    gameData,
    fetch: (url, init) => fetch(url, init),
    zone: config.settings.timezone,
    weeklyRaidHour: config.settings.raidEvents.weeklyRaidHour,
    // The events forum lists the pages' hours: it draws again when a read changed them.
    onHoursChange: () => {
      raidEvents.pagesChanged();
    },
    log,
  });
  // The square pictures of the reports at stops (plan 8R-6): kept in var/pictures/, named at the
  // web server's address once it listens, the feeds' addresses till then. The task list and the
  // lineups have theirs made as they are read (plan 8M-9B), for the map's views and pick lists.
  const stopPictures = new StopPictures({
    settings: config.settings,
    folder: PICTURE_FOLDER,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  void stopPictures.start();
  // The field research task list (plan 8R-1): Leek Duck's page, the last good list kept.
  const researchTasks = new ResearchTaskService({
    pictures: stopPictures,
    url: config.settings.research.url,
    zone: config.settings.timezone,
    refreshMs: config.settings.research.refreshHours * HOUR_MS,
    staleAfterMs: config.settings.research.staleAfterHours * HOUR_MS,
    store: new ResearchTaskRepository(db, log),
    gameData,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  // Team GO Rocket's lineups (plan 8R-2): ScrapedDuck's feed, the last good list kept.
  const rocketLineups = new RocketLineupService({
    pictures: stopPictures,
    url: config.settings.rocket.url,
    refreshMs: config.settings.rocket.refreshHours * HOUR_MS,
    staleAfterMs: config.settings.rocket.staleAfterHours * HOUR_MS,
    store: new RocketLineupRepository(db, log),
    gameData,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  // One memory of the `Guild` and `User` rows this process has seen, for the repositories that
  // would otherwise ask for a row id before every statement (plan 4F).
  const rowIds = new RowIds();
  const guilds = new GuildRepository(db, rowIds);
  const regionRepository = new RegionRepository(db);
  const regions = new RegionDirectory({ regions: regionRepository, log });
  // Reports at stops (plan 8R-1), each in the research period of the stored events.
  const stopReportStore = new StopReportRepository(db, log);
  const stopReports = new StopReportService({
    store: stopReportStore,
    events: raidEvents,
    zone: config.settings.timezone,
    // A grunt's report (plan 8R-2) stands as long as its message.
    gruntMs: config.settings.rocket.gruntMinutes * 60_000,
    // A costume is told by the game data (plan 8R-5): a costumed reward's version is its own.
    rewardHash: (reward) => rewardHash(reward, gameData.catalogue),
    // The regions whose outlines hold a stop, kept with a report when it is made (plan 8H-2), as
    // the directory holds them: as the grunts' channels, the notifier and the map find them.
    guilds,
    regions,
    log,
  });
  // A typed task's reward, on no list, made square once reported (plan 8M-9B).
  stopReports.listen(reportPictures(stopPictures));
  const gymRepository = new GymRepository(db);
  const gyms = new GymDirectory({
    gyms: gymRepository,
    regions: new RegionRepository(db),
    ignoredWords: config.settings.blacklistWords,
    log,
  });
  // The kept Wayspots of the Wayfarer imports, placed in the regions by their outlines.
  const wayspotRepository = new WayspotRepository(db);
  // Google, asked about the place of a gym and a Power Spot's address; without a key nothing is
  // asked. Every question counts in one monthly count of each kind (`GoogleUse`).
  const geo = new GoogleGeo({
    apiKey: config.env.GOOGLE_API_KEY,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  const googleUse = new GoogleUseRepository(db);
  const googleBudget = {
    places: config.settings.googleLookupsPerMonth,
    reserve: config.settings.googleLookupsReserve,
    geocodes: config.settings.googleGeocodesPerMonth,
    geocodesReserve: config.settings.googleGeocodesReserve,
  };
  // The addresses of Power Spots the map asked for, which every reader of the kept Wayspots shows.
  const wayspotAddresses = new WayspotAddresses({
    storage: new WayspotAddressRepository(db),
    geo,
    use: googleUse,
    budget: googleBudget,
    log,
  });
  const wayspots = new WayspotDirectory({
    wayspots: wayspotRepository,
    regions,
    log,
    addresses: wayspotAddresses,
  });
  const history = new HistoryRepository(db);
  // The activity heatmap's buckets (plan 8H-4): derived from the history, added hourly by the
  // upkeep after its sweep, read by the map's /api/activity and the region tally (plan 8H-5).
  const activity = new ActivityRepository(db, {
    zone: config.settings.timezone,
    settings: config.settings,
    log,
  });
  // What the map's heatmap and the region tally read of them, each read of a server and window
  // kept a minute for everybody (plan 8Z-2): what a member may see is decided on the rows after.
  const activityReads = new KeptActivity(activity);
  // Raids per day and big days (plan 8H-8): the history page and the events forum's "On this
  // day" read them through one service, a server's days kept a few minutes.
  const historyDays = new HistoryDays({
    reader: activity,
    zone: config.settings.timezone,
    bossName: (key) => gameData.catalogue.byKey(key)?.name,
  });
  // Every party that ends is kept in the party history (plan 8H), with what the store writes;
  // in rehearsal mode too (only Discord is narrowed then, not the store).
  // A party left without its record (its tries failed, the bot stopped first, or it ended
  // before the history) is recorded by the forums' upkeep, at start and hourly, after the login
  // and the game data, from its row (the scheduler's `history`).
  const partyHistory = new PartyHistory({
    storage: history,
    gameData,
    raidBosses,
    maxBosses,
    log,
    // Where a train's stops lie when it ends (plan 8H-7A), as its copies find their regions.
    stopRegions: (guildId, stop) =>
      stopRegionsInGuild({ gyms, wayspots }, regions, stop, guildId).map((region) => region.id),
    readParty: async (partyId) => {
      const stored = await partyRepository.findById(partyId);
      return stored === undefined ? undefined : stored.ok ? stored.party : 'unreadable';
    },
  });
  const partyRepository = new PartyRepository(db, {
    historyFailed: (note, err) => {
      partyHistory.failed(note, err);
    },
  });
  const parties = new PartyStore({ storage: partyRepository, log, history: partyHistory });
  const discordGateway = new DiscordPartyGateway(log);
  // In rehearsal mode nothing is posted but into the posts of parties in the rehearsed forums
  // (and meetup safety's own posts into the moderators' channel: its gateway, below).
  const partyGateway = rehearsal
    ? rehearsalGateway(
        discordGateway,
        rehearsalPosts({
          rehearsal,
          byPost: (postId) => parties.byPost(postId),
          regions: () => regions.all(),
          channelName: (channelId) => discordGateway.channelName(channelId),
        }),
        log,
      )
    : discordGateway;
  // The bot's own emoji (types, weather, teams, the posts' buttons), looked for before a server's.
  const appEmojiSource = new DiscordApplicationEmoji();
  const appEmoji = new ApplicationEmoji(appEmojiSource, log);
  // The servers of the client that ended up connected, once it is ready.
  let botServers: () => readonly string[] = () => [];
  // Changes of the boss list and a list that is out of date, told to the servers once the client
  // is ready (what comes earlier waits). Listening from here on: before the first sync.
  const bossAnnouncer = new RaidBossAnnouncer({
    gateway: partyGateway,
    servers: () => botServers(),
    settings: config.settings,
    log,
  });
  bossAnnouncer.attach(raidBosses);
  const members = new DiscordMemberDirectory({ log });
  const memberNames = new MemberNames({ members });
  // What the boards and a member's own stats read of the history (plan 8H-6).
  const boardReader = new BoardRepository(db);
  const roleGateway = new DiscordRoleGateway();
  const selfRoles = new SelfRoleService({
    storage: new SelfRoleRepository(db),
    gateway: roleGateway,
    log,
  });
  const dmGateway = new DiscordDmGateway();
  const dms = new QueuedDmSender({ gateway: dmGateway, log });
  // In rehearsal mode only the allowlist is written to; the queue itself is drained at shutdown.
  const memberDms = rehearsal ? new RehearsalDms(dms, rehearsal, log) : dms;
  // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
  const access = new AccessService({
    store: parties,
    gateway: partyGateway,
    guilds,
    storage: new AccessGrantRepository(db),
    log,
  });
  // The staff audit log (`/audit`): listens to the store, so every change is logged whoever made
  // it; entries older than 30 days go with the scheduler's upkeep.
  const partyAuditStore = new PartyAuditRepository(db, log);
  const partyAudit = new PartyAudit({
    store: parties,
    storage: partyAuditStore,
    guilds,
    names: auditNamesOf({ gyms, wayspots, regions, gameData }),
    log,
  });
  // A self-assigned role taken away (`/iamnot`, the role menus, the web map) may have been what
  // showed the member the forum of a party they are in: the access to those forums is settled
  // again from a fresh look at them (plan 8M-20, W2).
  selfRoles.onRolesTaken((guild, member) => {
    access.memberChanged(guild, member);
  });
  // The PokéStops of Pine's own (plan 8R-1), held by the directory beside the kept Wayspots.
  const pineStops = new PineStopService({
    storage: new PineStopRepository(db),
    wayspots,
    guilds,
    log,
  });
  const users = new UserRepository(db, rowIds);
  const savedRoutes = new SavedRouteRepository(db);
  // Eggs' pictures from the web server only once it listens (`startWebServer`), files till then.
  const eggPictures = new EggPictures(config.settings);
  const partyService = new PartyService({
    eggPictures,
    wayspots,
    // The raids along an ended train's way, for its card (plan 8H-7A).
    raidsAlong: history,
    // What ended parties left on Discord, written with their end, swept with the upkeep.
    leftovers: partyRepository,
    // "Route on the map" on an ended train's post (plan 8H-7B, review G4): only where the web is
    // on and logs in with Discord (with the links of /maps alone the map could not be opened).
    ...(config.settings.web && config.env.DISCORD_CLIENT_SECRET
      ? { trainMapLink: trainMapLinkOf(config.settings.web.publicUrl) }
      : {}),
    store: parties,
    gateway: partyGateway,
    regions,
    regionStore: regionRepository,
    guilds,
    gyms,
    raidBosses,
    maxBosses,
    gameData,
    raidEvents,
    users,
    appEmoji,
    settings: config.settings,
    log,
    ...(rehearsal ? { rehearsal } : {}),
  });
  // The posts are shown anew with the application's emoji once they are read, or change.
  appEmoji.onChange(() => {
    partyService.emojiChanged();
  });
  const wants = new PokemonNotificationRepository(
    db,
    formReader(() => gameData.catalogue),
    rowIds,
  );
  // The wants of TargetWant (plan 8R-1), and the boxes of /want's dialog over both tables.
  const targetWants = new TargetWantRepository(db, rowIds);
  const wantBoxes = new WantBoxRepository(
    db,
    formReader(() => gameData.catalogue),
    rowIds,
  );
  const gymTargets = new GymNotificationRepository(db, rowIds);
  const newTrains = new NewTrainRepository(db);
  // The wants of every server counted each local midnight, and at start for the day before
  // (plan 8H-3, `WantCountDay`); in rehearsal mode too, as everything rehearsal writes.
  const wantCounts = new WantCountService({
    storage: new WantCountRepository(
      db,
      formReader(() => gameData.catalogue),
    ),
    zone: config.settings.timezone,
    log,
  });
  // The legacy fill-ins members ask for in /settings (plan 8H-10): only where the installation
  // has the member index (LEGACY_INDEX_DIR, written by the history import); run one at a time in
  // the background, started by the clock's upkeep and by a press.
  const legacyFillInStore = new LegacyFillInRepository(db);
  const legacyIndexDir = config.env.LEGACY_INDEX_DIR;
  const legacyFillIns =
    legacyIndexDir === undefined
      ? undefined
      : new LegacyFillInService({ storage: legacyFillInStore, indexDir: legacyIndexDir, log });
  // Said once at start where the bot's user may not read the index (B2): nobody is offered it.
  void legacyFillIns?.checkReadable();
  // The posts of the stops, for the links of research DMs: set once they are made below.
  const researchPostLinks: { posts?: StopPostService | undefined } = {};
  // Made after the party service, whose briefs of parties it sends, and told by it from here on.
  const notify = new NotifyService({
    store: parties,
    posts: partyService,
    pictures: stopPictures,
    wants,
    targetWants,
    gymTargets,
    newTrains,
    users,
    members,
    dms: memberDms,
    guilds,
    regions,
    gyms,
    gameData,
    raidBosses,
    settings: config.settings,
    log,
    // The posts of the stops are made once Discord is there (below); a DM asks them only then.
    researchPosts: {
      messageOf: (channelId, subjectKey) =>
        researchPostLinks.posts?.messageOf(channelId, subjectKey) ?? Promise.resolve(undefined),
    },
    // A "one of" leaves out the stops narrowed before its turn (plan 8R-5, R6).
    stopReports,
    // How many members the news reached (plan 8H-3): kept in the party history and with the
    // reports at stops; in rehearsal mode too, as everything rehearsal writes.
    reach: new ReachRecords({ history, stopReports: stopReportStore, log }),
  });
  partyService.announceTo(notify);
  // Who wants a reward of reported field research hears of it (plan 8R-1, design 7).
  stopReports.listen({
    reported: (news) => {
      notify.researchReported(news);
    },
    // Who was told of a report taken back hears so in a second DM (Matt, 2026-11-07).
    takenBack: (serverId, reports, by) => {
      notify.stopReportsTakenBack(serverId, reports, by);
    },
  });
  // Holders of the old Unown role get a want for Unown when the bot first meets them.
  const unownWants = new UnownWantService({
    wants,
    gifts: new UnownGiftRepository(db),
    gameData,
    settings: config.settings,
    log,
  });
  const spawns = new SpawnService({
    gateway: partyGateway,
    raidBosses,
    gameData,
    costumes: eventPages,
    pictures: stopPictures,
    notify,
    store: new SpawnReportRepository(db),
    settings: config.settings,
    log,
  });
  // The grunts' messages (plan 8R-2), deleted after their half hour; none in rehearsal mode,
  // which posts nothing outside party posts (design 6, 9.14): the reports are still kept.
  const gruntMessages = rehearsal
    ? undefined
    : new GruntMessageService({
        gateway: partyGateway,
        store: new GruntMessageRepository(db),
        reports: stopReports,
        pictures: stopPictures,
        log,
      });
  // The events forum (plan 8V-1): only where the settings name one, never in rehearsal mode (R8:
  // the rehearsal's gateway would drop and log its posts at every draw).
  // "On this day" (plan 8H-8) through the history page's own big days.
  const eventForum = !eventForumWanted(config.settings)
    ? undefined
    : new EventForumService({
        gateway: partyGateway,
        store: new EventForumRepository(db),
        events: raidEvents,
        settings: config.settings,
        log,
        days: historyDays,
        // The trains and meetups planned during the events (Matt, 2026-11-07).
        planned: { parties, guilds },
      });
  // Who wants a Rocket report hears of it once its messages are posted (plan 8R-2, design 7).
  const rocket = new RocketService({
    reports: stopReports,
    messages: gruntMessages,
    regions,
    guilds,
    notify,
    log,
  });
  const lines = new PartyLines({
    gateway: partyGateway,
    whileOpen: (postId, work) => partyService.whileOpenPost(postId, work),
    log,
  });
  const attendance = new AttendanceService({
    store: parties,
    gateway: partyGateway,
    posts: partyService,
    lines,
    users,
    notify,
    settings: config.settings,
    log,
  });
  const raids = new RaidChangeService({
    store: parties,
    posts: partyService,
    lines,
    questions: attendance,
    gyms,
    regions,
    gameData,
    notify,
    settings: config.settings,
    log,
  });
  const maxBattles = new MaxChangeService({
    store: parties,
    posts: partyService,
    lines,
    notify,
    lobbySize: (party) => lobbySize(party, config.settings.lobbies),
    log,
  });
  const bossMoves = new BossTierMoves({ store: parties, posts: partyService, raids, lines, log });
  const timedParties = new TimedPartyService({
    store: parties,
    gateway: partyGateway,
    posts: partyService,
    lines,
    users,
    notify,
    log,
    zone: config.settings.timezone,
  });
  const trains = new TrainService({
    store: parties,
    gateway: partyGateway,
    posts: partyService,
    lines,
    // Manage…'s changes say theirs as one message with the times' (review SF1-6).
    timedLines: timedParties,
    users,
    gyms,
    wayspots,
    regions,
    routes: savedRoutes,
    splits: partyService,
    log,
  });
  // The PokéStops and Power Spots that wait for Google, and the places it gave around them
  // (plan 8W-6), which the search reads.
  const wayspotLookups = new WayspotLookupRepository(db);
  const wayspotPlaces = new WayspotPlaces({ storage: wayspotLookups, log });
  const gymUpkeep = new GymUpkeep({
    gyms: gymRepository,
    directory: gyms,
    geo,
    parties,
    posts: partyService,
    log,
    lookups: new GymLookupRepository(db),
    use: googleUse,
    budget: googleBudget,
    byHandPerMonth: config.settings.googleByHandPerMonth,
    // The line goes by the raids of each place's best region (plan 8W-6), from the history.
    ranks: new GoogleRanks({
      regions,
      gymRegions: (id) => gyms.regionsOf(id),
      wayspotRegions: (id) => wayspots.regionsOf(id),
      // The servers by their rows: the first reading comes before the login (plan 8Z-2).
      servers: () => guilds.snowflakes(),
      activity: history,
    }),
    wayspots,
    // A region added or saved queues the PokéStops and Power Spots it newly covers at once.
    outlineChanges: regions,
    wayspotLookups,
    places: wayspotPlaces,
  });
  // Map pictures from Google Static Maps, through the image cache (also for gym announcements).
  const mapCache = new ImageCache({
    dir: IMAGE_CACHE,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  const maps = new StaticMaps(config.env.GOOGLE_API_KEY, mapCache);
  // Gym administration and region administration exclude each other: one lock for both.
  const adminLock = new AdminLock();
  const gymAdmin = new GymAdminService({
    lock: adminLock,
    gyms: gymRepository,
    removal: new GymRemovalRepository(db),
    directory: gyms,
    regions,
    store: parties,
    trains,
    routes: savedRoutes,
    targets: gymTargets,
    upkeep: gymUpkeep,
    geo,
    gateway: partyGateway,
    maps,
    settings: config.settings,
    log,
  });
  // The Wayfarer import writes gyms through gym administration, under its lock.
  const wayfarerStorage = new WayfarerRepository(db, (row) => {
    log.warn(
      { table: row.table, row: row.id, problem: row.problem },
      'a row of the Wayfarer import cannot be read and is left alone',
    );
  });
  const wayfarer = new WayfarerImportService({
    storage: wayfarerStorage,
    wayspots: wayspotRepository,
    kept: wayspots,
    admin: gymAdmin,
    directory: gyms,
    regions,
    pineStops,
    log,
  });
  const wayfarerReview = new WayfarerReviewService({
    storage: wayfarerStorage,
    wayspots: wayspotRepository,
    kept: wayspots,
    importer: wayfarer,
    admin: gymAdmin,
    directory: gyms,
    log,
  });
  const regionAdmin = new RegionAdminService({
    lock: adminLock,
    storage: regionRepository,
    regions,
    gyms,
    store: parties,
    posts: partyService,
    routes: savedRoutes,
    gateway: partyGateway,
    settings: config.settings,
    log,
  });
  // Files that members attach to a command, downloaded from Discord's own hosts only.
  const attachments = new FetchAttachments({ fetch: (url, init) => fetch(url, init), log });
  // The screenshots that were read, kept for a while and for review (`var/ocr/held`, `review`).
  const screenshotStore = new ScreenshotStore({
    dir: OCR_DIR,
    reviewDays: config.settings.ocr.reviewDays,
    keepMegabytes: config.settings.ocr.keepMegabytes,
    reviewPerDay: config.settings.ocr.reviewPerDay,
    gymName: (id) => gyms.get(id)?.name,
    // A raid's screenshot is kept while the raid is active, for its "Screenshot feedback" button;
    // a max battle's while it lasts (plan 8X-S, review R4), or the sweep would undo `inUse`.
    shown: () =>
      new Set(
        parties.active().flatMap((party) => {
          const id = screenshotIdOf(party);
          return id === undefined ? [] : [id];
        }),
      ),
    log,
  });
  // The login links `/maps` gives and the web pages redeem, in memory.
  const loginLinks = new LoginLinks();
  // The sessions of the web pages, kept in the database; swept hourly with the upkeep.
  const webSessions =
    config.settings.web &&
    new Sessions({
      store: new WebSessionRepository(db),
      secure: config.settings.web.publicUrl.startsWith('https:'),
    });
  // Who may have the Wayfarer export tool (plan 8W-P): asked for and decided on /userscript.
  const scriptAccess = new ScriptAccessService({
    store: new ScriptAccessRepository(db),
    ownerId: config.env.OWNER_ID,
    // A new request is told to the owner by DM (through the members' queue, as every DM).
    dms: memberDms,
    log,
  });
  // Meetup safety (plan 8S-1): off without settings.channels.moderation. Its requests expire
  // with the clock. In rehearsal mode its requests and appeals go into the moderators' channel
  // (Matt, 2026-10-17): through a gateway of its own, so that nothing else of the bot does.
  const moderation = config.settings.channels.moderation;
  const moderatorsGateway =
    rehearsal && moderation !== undefined
      ? rehearsalModeratorsGateway(partyGateway, discordGateway, moderation, log)
      : partyGateway;
  const meetupSafety = new MeetupSafety({
    storage: new MeetupSafetyRepository(db, log),
    gateway: moderatorsGateway,
    gyms,
    wayspots,
    parties: partyService,
    regions,
    dms: memberDms,
    store: parties,
    guilds,
    settings: config.settings,
    log,
  });
  // Reports to the moderators (plan 8S-2): their posts go into meetup safety's channel, through
  // its gateway (also in rehearsal mode); a reported party's report ends with the party.
  const reports = new ModerationReports({
    storage: new ReportRepository(db, log),
    gateway: moderatorsGateway,
    parties: partyService,
    safety: meetupSafety,
    store: parties,
    regions,
    gyms,
    wayspots,
    settings: config.settings,
    log,
  });
  reports.watch(parties);
  const scheduler = new PartyScheduler({
    store: parties,
    history: partyHistory,
    // The history's new records into the activity heatmap and the raids per day, with a line
    // when there were any, each table's apart (A5: they differ while the days catch up).
    activity: {
      addNew: async (options) => {
        const added = await activity.addNew(options);
        if (added.buckets > 0 || added.days > 0) {
          log.info(
            { buckets: added.buckets, days: added.days },
            'added records of the history to the activity heatmap and the raids per day',
          );
        }
      },
    },
    // The expiry of meetup safety and, with it, the sweep of the reports (plan 8S-2).
    requests: {
      expire: async () => {
        const expired = await meetupSafety.expire();
        await reports.sweep();
        return expired;
      },
    },
    posts: partyService,
    attendance,
    access,
    audit: partyAudit,
    routes: trains,
    spawns,
    stops: stopReports,
    ...(gruntMessages ? { grunts: gruntMessages } : {}),
    pictures: maps,
    // The places' pictures of the web map's posts, in the same folder of pictures (plan 8Z-2).
    placePictures: { prune: () => prunePlacePictures(mapCache) },
    screenshots: screenshotStore,
    emoji: appEmoji,
    webSessions,
    // The events forum, drawn hourly (plan 8V-1).
    ...(eventForum ? { eventForum } : {}),
    ...(legacyFillIns ? { legacyFillIns } : {}),
    splits: partyService,
    lines,
    gateway: partyGateway,
    raidBosses,
    users,
    notify,
    settings: config.settings,
    log,
  });
  // The screenshot reader: its files are checked (and downloaded) before its process starts.
  const ocrAssets = new OcrAssets({
    dir: OCR_DIR,
    modelsUrl: config.settings.ocr.modelsUrl,
    headIconUrl: config.settings.ocr.headIconUrl,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  const screenshotReader = new OcrService({
    assets: ocrAssets,
    device: config.settings.ocr.device,
    threads: config.settings.ocr.threads,
    priority: config.settings.ocr.priority,
    queue: config.settings.ocr.queue,
    timeoutMs: config.settings.ocr.timeoutSeconds * 1000,
    log,
  });
  const clickAnswers = new ClickAnswers({ log });
  // The client that ended up connected, for what talks to Discord's REST API through it.
  let liveClient: Client | undefined;
  // The catch-up on reconnect (plan 8X-H), made once the services of the stops are there.
  const reconnect: { catchUp?: CatchUp } = {};
  const legacyCleanup = new LegacyCleanup({
    rest: () => liveClient?.rest,
    botId: () => liveClient?.user?.id,
    partiesDir: config.env.LEGACY_PARTIES_DIR,
    settingsChannelNames: channelNamesOf(config.settings),
    log,
  });
  const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
  const checkpoint = startCheckpoint(options.stopRequested);
  try {
    await runMigrations(db, log);
    checkpoint();
    await gameData.load();
    checkpoint();
    // Reads the list of the last run from the database; the feed is read after the login.
    await raidBosses.load();
    await maxBosses.load();
    await researchTasks.load();
    await rocketLineups.load();
    await raidEvents.loadResearch();
    // Before the first read of the feed: the week's featured boss, a max battle's default end.
    await raidEvents.loadMax();
    await eventWindows.load();
    // Before the first read too: the events forum's listing survives a restart (plan 8V-1).
    await raidEvents.loadListed();
    await gyms.load();
    await regions.load();
    await wayspotAddresses.load();
    await wayspots.load();
    await pineStops.load();
    await wayspotPlaces.load();
    // The gyms that waited for Google before a restart, and those that lack what it gives;
    // after the regions and the Wayspots, which its ranks read, and the Wayspots' places,
    // which say which were asked (plan 8W-6).
    await gymUpkeep.resume();
    await parties.load();
    await access.load();
    // What a stop between storing a raid and creating its post left behind: only the store is
    // needed, and reports can arrive as soon as the bot has logged in.
    await partyService.endPartiesWithoutPost();
    await pokemon.reloadNicknames();
    checkpoint();
  } catch (err) {
    await heartbeat.stop();
    // The line for Google may be asking already: its writes end before the pool closes.
    await gymUpkeep.stop();
    wayspotPlaces.stop();
    await db.destroy();
    throw err;
  }
  gameData.startAutoRefresh();

  const requested = {
    ocrPassive: config.settings.ocr.passive,
    autoAssignRole: config.settings.autoAssignRole,
  };
  const commands = enabledCommands(allCommands, config);
  const messageCommands = enabledMessageCommands(allMessageCommands, config);
  const throttles = new Throttles();
  // The screenshot trigger, for "Read screenshot" in a message's Apps menu (plan 7M): set once
  // it is made below, since it takes the context itself.
  const shotTrigger: { is?: ScreenshotTrigger } = {};
  // Removing a member's data on request (plan 8G, the owner's `/admin forget`): the database in
  // one transaction, then the kept screenshots and the live streams of the web logins it
  // deleted, which the hub of the live map ends once it is made (below).
  const liveSessions: { end?: (sessionId: string) => void } = {};
  const memberRemoval = new MemberRemoval({
    data: new MemberDataRepository(db, rowIds),
    screenshots: screenshotStore,
    parties,
    ...(legacyIndexDir === undefined
      ? {}
      : { legacyFiles: (memberId: string) => memberIndexServers(legacyIndexDir, memberId) }),
    endSession: (sessionId) => liveSessions.end?.(sessionId),
    heldReports: reports,
    log,
  });
  const ctx: AppContext = {
    throttles,
    memberRemoval,
    config,
    log,
    db,
    commands,
    messageCommands,
    gameData,
    raidBosses,
    raidBossAdmin: raidBosses,
    maxBosses,
    maxBossAdmin: maxBosses,
    raidEvents,
    eventWindows,
    researchTasks,
    eventSpawns: eventPages,
    rocketLineups,
    stopReports,
    // The posts of the stops made below (none in rehearsal mode), as last drawn.
    stopPostLinks: {
      linkOf: (channelId, subjectKey) => researchPostLinks.posts?.linkOf(channelId, subjectKey),
    },
    rocket,
    gyms,
    gymAdmin,
    wayfarer,
    wayfarerReview,
    wayspots,
    wayspotAddresses,
    pineStops,
    placeFinder: new PlaceFinder({ gyms, wayspots, places: wayspotPlaces, regions, log }),
    regions,
    regionAdmin,
    legacyCleanup,
    attachments,
    guilds,
    parties,
    partyService,
    attendance,
    raids,
    maxBattles,
    bossMoves,
    timedParties,
    meetupSafety,
    reports,
    trains,
    clickAnswers,
    users,
    wants,
    targetWants,
    wantBoxes,
    gymTargets,
    newTrains,
    historyOptIns: history,
    partyAudit: partyAuditStore,
    legacyFillIns: legacyFillInStore,
    legacyIndex: legacyFillIns,
    // The region tally (plan 8H-5): the heatmap's buckets summed per region, for /stats.
    regionTallies: new RegionTallies({
      reader: activityReads,
      regions,
      guilds,
      gateway: partyGateway,
      zone: config.settings.timezone,
    }),
    members,
    // The names the boards show (plan 8H-6), for Discord and the web alike.
    memberNames,
    // The boards (plan 8H-6): /stats boards and the history page's.
    boards: new Boards({
      reader: boardReader,
      names: memberNames,
      // The catalogue of the game data now (it is replaced on a refresh).
      catalogue: {
        species: (dex) => gameData.catalogue.species(dex),
        byKey: (key) => gameData.catalogue.byKey(key),
      },
      tasks: researchTasks,
      gateway: partyGateway,
      zone: config.settings.timezone,
    }),
    memberStats: new MemberStatsService({
      reader: boardReader,
      optIns: history,
      zone: config.settings.timezone,
    }),
    selfRoles,
    spawns,
    dms: memberDms,
    pokemon,
    nicknames: pokemon,
    maps,
    // The maps `/find-region` downloads: a monthly cap of their own, of the by-hand number.
    mapBudget: new MapBudget({
      use: googleUse,
      perMonth: config.settings.googleByHandPerMonth,
      log,
    }),
    loginLinks,
    scriptAccess,
    // Gym requests; without GITHUB_TOKEN and GITHUB_REPO `/request` is not offered.
    issues: new GitHubIssues({
      token: config.env.GITHUB_TOKEN,
      repo: config.env.GITHUB_REPO,
      fetch: (url, init) => fetch(url, init),
      log,
    }),
    // Raid simulations for `/counters`, with ten minutes of memory of each answer.
    pokebattler: new PokebattlerFight({ fetch: (url, init) => fetch(url, init), log }),
    // Places by name for `/find-region`; without settings.findRegion the command is not offered.
    places: new NominatimSearch({
      server: config.settings.findRegion,
      fetch: (url, init) => fetch(url, init),
      log,
    }),
    screenshotReader,
    // Screenshots from Discord: downloaded, read, decided on and kept.
    screenshots: new ScreenshotService({
      attachments,
      reader: screenshotReader,
      store: screenshotStore,
      context: {
        raidBosses,
        raidEvents,
        gyms,
        regions,
        config,
        maxBosses,
        wayspots,
        pokemon,
        gameData,
      },
      // Screenshots that keep disagreeing with the boss lists tell the moderators (plan 8X-J).
      tierWatch: new ListTierWatch({
        raidBossAdmin: raidBosses,
        maxBossAdmin: maxBosses,
        gameData,
        reports,
      }),
    }),
    // A message read because a member asked: by the one trigger that reads the mentions. (No
    // interaction is handled before it is made; until then, as while it closes.)
    messageShots: {
      readFor: (message, asker) =>
        shotTrigger.is?.readFor(message, asker) ?? Promise.resolve('closing'),
    },
    emoji: emojiFinder(appEmoji, appEmojiSource),
    features: requested,
    ...(rehearsal ? { rehearsal } : {}),
    ...(eventForum ? { eventForum } : {}),
  };
  // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
  // said in the log of the start, and the help of `/wild` names the ones it does.
  wildExceptionsOf(ctx);
  // The uses of commands and controls, counted by the router and by the live map, whose presses
  // of a party's buttons count as clicks on the post (plan 8M-3).
  const router = new InteractionRouter(ctx, [...commands, ...messageCommands], components);
  // The region's board is open to members' commands, and what they write there is deleted
  // (plan 8R-9F); after any message there the summary checks its pin (B7, review W6).
  const boardKeeper = new BoardKeeper({
    regions,
    gateway: partyGateway,
    dms: memberDms,
    zone: config.settings.timezone,
    log,
    changed: (regionId) => {
      partyService.summaryChanged(regionId, true);
    },
    // Off in rehearsal mode, as the screenshot trigger is (review W2): no member's message of
    // production is deleted, and nobody is told.
    inRehearsal: rehearsal !== undefined,
  });
  // Screenshots posted in a region channel with a mention of the bot (or, passive, without),
  // and in a region's board (plan 8R-9F), which the keeper deletes once they are downloaded.
  const screenshotTrigger = new ScreenshotTrigger({ ctx, board: boardKeeper });
  shotTrigger.is = screenshotTrigger;
  // Resolved by the client that ends up connected (the login may try several).
  let markConnected: () => void = () => undefined;
  const connected = new Promise<void>((resolve) => {
    markConnected = resolve;
  });

  try {
    await options.beforeLogin?.();
    checkpoint();
  } catch (err) {
    await heartbeat.stop();
    await gymUpkeep.stop();
    wayspotPlaces.stop();
    await db.destroy();
    throw err;
  }
  const { client, features } = await loginWithFallback(requested, {
    token: config.env.DISCORD_TOKEN,
    log,
    create: createClient,
    configure(client) {
      heartbeat.loggingIn(() => gatewayConnected(client.ws.shards, Date.now()));
      // Whether the gateway is back after a real disconnect, and its shard errors said once per
      // kind (plan 8X-H); attached before the login, whose ready arms it. Back for real, what
      // failed meanwhile is caught up (`catchUp`, made once the services are there).
      new GatewayWatch({
        log,
        lastAck: (shard) => client.ws.shards.get(shard)?.lastPingTimestamp,
      })
        .attach(client)
        .onBack(() => {
          reconnect.catchUp?.request();
        });
      discordGateway.use(client);
      liveClient = client;
      appEmojiSource.use(client);
      members.use(client);
      roleGateway.use(client);
      dmGateway.use(client);
      client.once(Events.ClientReady, (ready) => {
        log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
        void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
        botServers = () => [...ready.guilds.cache.keys()];
        bossAnnouncer.ready();
        // Where meetup safety cannot work: once per server, in the log of the start.
        meetupSafety.warnAtStart([...ready.guilds.cache.keys()]);
        // Before the first posts are shown; `refresh` logs what fails and never throws.
        void appEmoji.refresh();
        markConnected();
        // The reader's files (about 15 MB the first time) are had now, so that the first
        // screenshot does not wait for them; never awaited, and `ensure` logs what fails.
        if (config.settings.ocr.enabled) void ocrAssets.ensure();
        // The square pictures of the spawns that stood through the restart (review SF1-4); never
        // awaited, and it logs what fails.
        void spawns.prepareStanding([...ready.guilds.cache.keys()]);
      });
      client.on(Events.GuildCreate, (guild) => {
        guilds
          .ensure(guild.id)
          .catch((err: unknown) => log.error({ err, guild: guild.id }, 'could not record guild'));
      });
      client.on(Events.GuildDelete, (guild) => {
        guilds
          .remove(guild.id)
          .catch((err: unknown) => log.error({ err, guild: guild.id }, 'could not remove guild'));
      });
      // A party's post deleted by hand ends its party at once (the `Guilds` intent delivers it;
      // discord.js emits it only for a thread in its cache, otherwise the next render notices);
      // the bot's own deletions find no active party there.
      client.on(Events.ThreadDelete, (thread) => {
        void partyService.postDeleted(thread.id);
      });
      client.on(Events.InteractionCreate, (interaction) => {
        // What the interaction shows of the member's roles; never in the way of the interaction.
        // (`noticed` catches what it does itself; this is for what reading the interaction
        // may throw, which must not keep the interaction from being handled.)
        try {
          if (interaction.inCachedGuild()) {
            const { member } = interaction;
            unownWants.noticed(interaction.guildId, interaction.user.id, () =>
              member.roles.cache.map((role) => role.name),
            );
          }
        } catch (err) {
          log.warn({ err }, 'could not look at a member for an Unown want');
        }
        void router.handle(interaction);
      });
      // Only that a member wrote, and where: the archive warning of a busy post is said again.
      // Bots (this one, others, webhooks) do not count.
      client.on(Events.MessageCreate, (message) => {
        // The board first, before the bot filter (plan 8R-9F, B3): other applications' and
        // webhooks' messages go too. Nothing of a board's message goes further; one with
        // attachments is the screenshot trigger's first, which downloads before the delete (B2).
        try {
          const shots =
            message.attachments.size > 0
              ? () => screenshotTrigger.handle(postedMessage(message))
              : undefined;
          if (boardKeeper.posted(postedBoardMessage(message), shots) !== 'elsewhere') return;
        } catch (err) {
          log.error({ err }, 'could not look at a message in the board');
        }
        if (message.author.bot) return;
        scheduler.activity(message.channelId);
        // Only a message with an attachment can be a screenshot; the trigger decides the rest.
        if (message.attachments.size === 0) return;
        try {
          void screenshotTrigger.handle(postedMessage(message));
        } catch (err) {
          log.error({ err }, 'could not read the screenshots of a message');
        }
      });
      client.on(Events.Error, (err) => log.error({ err }, 'discord client error'));
      client.on(Events.Warn, (message) => log.warn(message));
    },
  });
  ctx.features = features;
  // The listeners of the boss list (`bossAnnouncer`) were attached before this call.
  raidBosses.startAutoSync();
  maxBosses.startAutoSync();
  raidEvents.start();
  // The events' pages once the feed has said which events are on (a read that fails too), and
  // again after each good read of the feed (review ER-1).
  void startAfterFeed(raidEvents, eventPages);
  researchTasks.start();
  rocketLineups.start();
  // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
  // would be taken for deleted. Then for the first read of the raid events (a raid that hatched
  // during a Raid Hour is otherwise given the usual length) and of the events' pages started
  // after it (an event's own Raid Hours), but for those not for ever.
  void scheduler.start(
    connected.then(() =>
      Promise.race([
        raidEvents.refresh().then(() => eventPages.whenIdle()),
        new Promise((resolve) => setTimeout(resolve, EVENTS_WAIT_MS).unref()),
      ]),
    ),
  );
  log.info({ features }, 'optional features');
  // The posts "Today’s Stops" (plan 8R-1), once Discord is there: those of a day
  // that ended deleted, today's drawn anew. None in rehearsal mode (nothing is posted outside
  // party posts there; design 6).
  const stopPosts = rehearsal
    ? undefined
    : new StopPostService({
        storage: new StopPostRepository(db),
        reports: stopReports,
        events: raidEvents,
        regions,
        guilds,
        gateway: partyGateway,
        zone: config.settings.timezone,
        log,
        // The region's summary links the post with its counts (plan 8X-G); a draw in the board
        // may have opened it, so its pin is checked too (plan 8R-9, B4).
        changed: (channelId) => {
          const region = regions.byChannel(channelId);
          if (region) partyService.summaryChanged(region.id, true);
        },
        pictures: stopPictures,
      });
  researchPostLinks.posts = stopPosts;
  if (stopPosts) partyService.setStopPosts(stopPosts);
  // The lines of new tasks and leaders in the region channels (plan 8R-9, B9), linking the
  // board's messages; none in rehearsal mode, which makes no posts of the stops.
  const stopLines = stopPosts
    ? new StopLineService({
        storage: new StopLineRepository(db),
        reports: stopReports,
        posts: stopPosts,
        regions,
        guilds,
        gateway: partyGateway,
        zone: config.settings.timezone,
        log,
      })
    : undefined;
  // The catch-up on reconnect (plan 8X-H; Matt, 2026-10-23: catch up, not restart): when the
  // gateway is back after a real disconnect, what failed meanwhile runs at once, one job after
  // another; first what waits an hour or for good (review R1), then the feeds, each only when its
  // last read failed (they retry by themselves within 5 to 30 minutes). The closings the network
  // failed are the upkeep's first step (review r0 B4: hourly as well, as a request can fail
  // without the gateway going away); the posts' redraw only queues them, paced.
  const done = (): Promise<CatchUpOutcome> => Promise.resolve('done');
  reconnect.catchUp = new CatchUp({
    log,
    jobs: [
      {
        name: 'posts',
        run: () => {
          partyService.redrawPosts();
          return done();
        },
      },
      // Not run before the clock starts or after it stopped: not owed then (review F6).
      {
        name: 'upkeep',
        run: () => scheduler.catchUp().then((ran) => (ran ? 'done' : 'not-owed')),
      },
      ...(stopPosts ? [{ name: 'stop posts', run: () => stopPosts.catchUp().then(done) }] : []),
      // The lines of ended days whose delete failed meanwhile (plan 8R-9, review P1).
      ...(stopLines ? [{ name: 'stop lines', run: () => stopLines.sweep().then(done) }] : []),
      // What members wrote in the boards while the gateway was away (plan 8R-9F, B6).
      { name: 'boards', run: () => boardKeeper.sweep().then(done) },
      { name: 'raid bosses', run: () => raidBosses.catchUp() },
      { name: 'max bosses', run: () => maxBosses.catchUp() },
      { name: 'events', run: () => raidEvents.catchUp() },
      // The events forum drawn anew: a start, an end or a midnight may have passed (plan 8V-1).
      ...(eventForum ? [{ name: 'events forum', run: () => eventForum.catchUp() }] : []),
      { name: 'research tasks', run: () => researchTasks.catchUp() },
      { name: 'rocket lineups', run: () => rocketLineups.catchUp() },
      { name: 'game data', run: () => gameData.catchUp() },
    ],
  });
  // Every summary drawn anew at local midnight (plan 8R-9, B7: Coming up turns into today), in
  // rehearsal mode too.
  void connected.then(() => {
    partyService.watchMidnight();
  });
  // The events forum (plan 8V-1): drawn after each read of the feed, at its next change, a second
  // after local midnight, and now.
  void connected.then(() => {
    eventForum?.start();
  });
  // The want counts (plan 8H-3), once the game data reads the forms of the wants.
  void connected.then(() => {
    wantCounts.start();
  });
  void connected.then(() =>
    stopPosts
      ?.start()
      .catch((err: unknown) => log.error({ err }, 'could not start the posts of the stops')),
  );
  // What members wrote in the boards while the bot was stopped (plan 8R-9F, B6).
  void connected.then(() =>
    boardKeeper.sweep().catch((err: unknown) => log.error({ err }, 'could not tidy the boards')),
  );
  void connected.then(() =>
    stopLines
      ?.start()
      .catch((err: unknown) => log.error({ err }, 'could not start the lines of new reports')),
  );
  // The new trains of splits that a stop left pending (plan 8T: their post made, the split's
  // write never committed): taken back once Discord is there, for taking one back deletes its
  // post (one left pending in the process goes with the clock's upkeep).
  void connected.then(() =>
    partyService
      .settlePendingSplits()
      .catch((err: unknown) => log.error({ err }, 'could not settle the splits left pending')),
  );

  // The web pages (`settings.web`), served once the client is ready: a port it cannot take is
  // logged and the bot runs on without them.
  const webSettings = config.settings.web;
  let webClosed = false;
  const webAssets = webSettings && (await readAssets());
  if (webAssets && !webAssets.manifest) {
    log.warn('the map page is not built (npm run web:build): its address answers that it is not');
  }
  // The pictures the map's posts show by Pine's address (plan 8M-8A): the application's emoji
  // and the places' pictures from Wayfarer, each fetched once into the image cache.
  const webPictureCache = new ImageCache({
    dir: IMAGE_CACHE,
    fetch: (url, init) => fetch(url, init),
    log,
  });
  // Who has the map open, told of what changed (`/api/live`); without a stream it does nothing.
  const live = new LiveSignals(LIVE_ON_THE_CLOCK);
  liveSources(live, { parties, posts: partyService, reports: stopReports, spawns });
  // A removal of a member's data ends the streams of the web logins it deleted (plan 8G).
  liveSessions.end = (sessionId) => {
    live.endSession(sessionId);
  };
  const web =
    webSettings &&
    webSessions &&
    webAssets &&
    buildWebServer({
      settings: webSettings,
      pictureOrigins: pictureOrigins(webSettings.publicUrl),
      googleKey: config.env.GOOGLE_MAPS_BROWSER_KEY,
      distanceUnits: config.settings.distanceUnits,
      servers: { has: (guildId) => client.guilds.cache.has(guildId) },
      // The top page's servers (plan 8M-14): those the bot is in with a region that has an outline.
      serversWithMap: mapServers({
        joined: () => joinedServers(client.guilds.cache.values()),
        guilds,
        regions,
      }),
      members,
      memberPace: {
        perSecond: MEMBER_LOOKUPS_PER_SECOND,
        setTimer: (run, ms) => LIVE_ON_THE_CLOCK.setTimer(run, ms),
      },
      mapWrites: new RateLimiter({ uses: MAP_WRITES_PER_MINUTE, perMs: 60_000 }),
      sessions: webSessions,
      // "Log in with Discord" only with the client secret; the links of /maps work without it.
      oauth: config.env.DISCORD_CLIENT_SECRET
        ? {
            appId: config.env.DISCORD_APP_ID,
            gateway: new DiscordOAuth({
              appId: config.env.DISCORD_APP_ID,
              secret: config.env.DISCORD_CLIENT_SECRET,
              fetch: (url, init) => fetch(url, init),
            }),
          }
        : undefined,
      loginLinks,
      // The public view holds the regions a self-assignable role opens too (F-B10): "Your
      // regions"' roster, none where self-assigned roles are off.
      geo: new GeoCache(
        {
          guilds,
          regions,
          gyms,
          channels: partyGateway,
          roles: config.settings.features.roles ? ctx.selfRoles : undefined,
          forumSuffix: config.settings.regionForumSuffix,
        },
        { log },
      ),
      assets: webAssets,
      editor: {
        staff: new DiscordRegionStaff({ client, guilds, ownerId: config.env.OWNER_ID, log }),
        view: new EditorCache({
          guilds,
          regions,
          gyms,
          wayspots,
          servers: {
            serverChannels: (guildId) => partyGateway.serverChannels(guildId),
            serverName: (guildId) => client.guilds.cache.get(guildId)?.name,
          },
        }),
        editing: {
          regions,
          admin: regionAdmin,
          checker: new SaveCheckWorker({ log }),
          selfRoles: config.settings.features.roles,
          log,
        },
        // The first step of the shutdown: from then on no save of the editor is started.
        closing: () => webClosed,
      },
      // The live map's parties: the store, how a post shows a raid, who may see which forum; a
      // press goes through the attendance service as the post's button does, in its throttle.
      parties: {
        guilds,
        store: parties,
        look: (raid) => partyService.raidLookOf(raid),
        // The stops of trains' routes as they are now: a train's Move… names them (plan 8M-8C).
        stops: partyService.stops,
        // How a max battle's post shows it (plan 8X-5): its boss, picture and spot as they are now.
        maxLook: (party) => maxLook(partyService.maxView(party)),
        // The layout each post was last shown with, the popup's (plan 8M-8A), and posts' titles.
        layoutOf: (partyId) => partyService.layoutOf(partyId),
        // A change on the map answers once its post shows it (plan 8M-11A, S1).
        drawn: partyService,
        titleOf: (party) => partyService.postTitle(party),
        // A place's picture beside Where (plan 8M-8A), by its gym or Wayspot, from the image cache.
        places: new PlacePictures({ gyms, wayspots, cache: webPictureCache }),
        // A power spot of a train's route (plan 8X-4), as the kept Wayspots have it now.
        spotOf: (id) => {
          const kept = wayspots.byId(id);
          return kept?.kind === 'powerspot'
            ? { name: kept.title, lat: kept.lat, lon: kept.lon }
            : undefined;
        },
        forums: partyGateway,
        zone: config.settings.timezone,
        attendance,
        acting: new DiscordWebMembers(client),
        throttles,
        ownerId: config.env.OWNER_ID,
        // Staff's Delete… (plan 8M-8B): whether the bot may delete a post, a forum's name.
        closing: {
          mayDeletePost: (partyId) => partyService.mayDeletePost(partyId),
          channelName: (channelId) => partyGateway.channelName(channelId),
        },
      },
      // Staff's Delete… and reports to the moderators on the map (plan 8M-8B): what /delete's
      // dialog and /report's form call, and the staff roles a report pings without the
      // moderators' channel, as /report pings them.
      posts: {
        ctx,
        staffRoles: (guildId) => {
          const guild = client.guilds.cache.get(guildId);
          return guild ? managementRoleIdsOf(guild) : [];
        },
      },
      // Reporting and changing raids on the map: what the raid commands read and call.
      raids: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
      spawns: {
        ctx,
        channelName: (channelId) => partyGateway.channelName(channelId),
      },
      // Starting, arranging and moving trains on the map: what the train commands read and call.
      trains: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
      // Making and changing meetups on the map: what /meetup, /name, /info, /meet and /end read
      // and call.
      meetups: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
      // Max battles on the map (plan 8X-5): what /max reads and calls.
      maxes: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
      // Reports at stops on the map (plan 8R-3): what /research and /rocket read and call, the
      // messages of the posts of the stops as last drawn, and the grunts' messages (none in rehearsal mode,
      // which leaves the web server off anyway).
      stops: {
        ctx,
        channelName: (channelId) => partyGateway.channelName(channelId),
        posts: stopPosts,
        grunts: gruntMessages,
      },
      // The activity heatmap (plan 8H-4): the buckets, placed at the gyms and Power Spots kept now.
      // The region tally of the history page (plan 8H-5): /stats regions' own RegionTallies.
      activity: {
        reader: activityReads,
        regions,
        gyms,
        wayspots,
        zone: config.settings.timezone,
        durations: config.settings,
        tallies: ctx.regionTallies,
        channelName: (channelId) => partyGateway.channelName(channelId),
        // The boards and "Your history" (plan 8H-6): /stats boards' and /stats me's own paths.
        boards: ctx.boards,
        memberStats: ctx.memberStats,
        bossName: (key) => gameData.catalogue.byKey(key)?.name,
        // The ended trains of the map's History (plan 8H-7B): read as the post's card reads them,
        // gated by every region of the server (review A2).
        trains: history,
        guilds,
        // Raids by day, big days and a boss's trend (plan 8H-8).
        days: historyDays,
      },
      // "Your regions" on the map (plan 8M-20): the member and the regions' gates looked at once,
      // joined and left through /iam's own service (none where self-assigned roles are off).
      regions: {
        guilds,
        regions,
        gates: partyGateway,
        selfRoles: config.settings.features.roles ? ctx.selfRoles : undefined,
      },
      // The Wayfarer export tool (plan 8W-P): served from wayspot-tool/ to the admins the owner
      // approved, on an instance that has the file (the owner's).
      tool: {
        files: new WayspotToolFiles({ log }),
        access: scriptAccess,
        zone: config.settings.timezone,
      },
      pictures: stopPictures,
      // The application's emoji for the map's posts (plan 8M-8A), fetched once from Discord's CDN.
      emoji: new EmojiPictures({ emoji: appEmoji, cache: webPictureCache }),
      live,
      now: () => Date.now(),
      log,
    });
  if (web && webSettings) {
    void connected.then(async () => {
      if (!webClosed && (await startWebServer(web, webSettings, log))) {
        picturesServed({ eggs: eggPictures, stops: stopPictures });
      }
    });
  }

  const shutdown = createShutdown(
    [
      // Before anything else: no page may start a change while the bot is going.
      ...(web
        ? [
            {
              name: 'web server',
              timeoutMs: 3_000,
              run: async () => {
                webClosed = true;
                await web.close();
              },
            },
          ]
        : []),
      // First: nothing may start changing parties while the rest is being flushed.
      // The catch-up starts no job more (plan 8X-H); the clock's stop waits for the upkeep it may
      // have started, which starts no step more and whose closings end between parties. A job of
      // the catch-up's under way that reads a feed ends with that feed's stop below, one that
      // draws the posts of the stops with theirs (review r0 B6). The steps add up to 145 s, 5 s
      // within the stop's 2m30s (review r1 C4: 6 s here and 12 s for the direct messages; plan
      // 8R-6: the reports at stops' ten, `stopReportSteps`, the pictures' second taken from the
      // grunts' messages).
      {
        name: 'party clock',
        timeoutMs: 6_000,
        run: async () => {
          reconnect.catchUp?.close();
          // The events forum first (BR-2): the clock's upkeep then draws nothing of it.
          eventForum?.stop();
          wantCounts.stop();
          legacyFillIns?.stop();
          await scheduler.stop();
        },
      },
      // No screenshot is read from here on: the trigger first (it stops between images and sends
      // nothing more; its replies go while Discord is there), then the reader. A report on its
      // way finishes before the posts are flushed.
      { name: 'screenshot replies', timeoutMs: 3_000, run: () => screenshotTrigger.close() },
      { name: 'screenshot reader', timeoutMs: 5_000, run: () => screenshotReader.close() },
      {
        name: 'game data refresh',
        timeoutMs: 1_000,
        run: async () => {
          gameData.stop();
          await gameData.whenIdle();
        },
      },
      {
        name: 'raid boss sync',
        // A sync in flight may be writing the list; give it time to finish before the pool closes.
        timeoutMs: 5_000,
        run: async () => {
          raidBosses.stop();
          await raidBosses.whenIdle();
        },
      },
      {
        name: 'max boss sync',
        timeoutMs: 5_000,
        run: async () => {
          maxBosses.stop();
          await maxBosses.whenIdle();
        },
      },
      // The events feed and the events forum in one second (branch review BR-2).
      eventsFeedStep({ events: raidEvents, forum: eventForum }),
      {
        name: 'event pages',
        timeoutMs: 1_000,
        run: async () => {
          eventPages.stop();
          await eventPages.whenIdle();
        },
      },
      {
        name: 'research tasks',
        timeoutMs: 1_000,
        run: async () => {
          researchTasks.stop();
          await researchTasks.whenIdle();
        },
      },
      {
        name: 'Rocket lineups',
        timeoutMs: 1_000,
        run: async () => {
          rocketLineups.stop();
          await rocketLineups.whenIdle();
        },
      },
      // Answers, lines and edits that are still waiting go out while Discord is connected.
      { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
      { name: 'start times', timeoutMs: 5_000, run: () => timedParties.flush() },
      // The line of gyms that wait for their places is forgotten; what is being written finishes.
      {
        name: 'gym upkeep',
        timeoutMs: 5_000,
        run: async () => {
          await gymUpkeep.stop();
          wayspotPlaces.stop();
        },
      },
      { name: 'gym announcements', timeoutMs: 3_000, run: () => gymAdmin.flush() },
      { name: 'raid boss announcements', timeoutMs: 3_000, run: () => bossAnnouncer.close() },
      // A change of gyms or regions that has begun is finished while the database is open.
      { name: 'gym and region changes', timeoutMs: 5_000, run: () => adminLock.whenIdle() },
      { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
      { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
      { name: 'reports', timeoutMs: 5_000, run: () => reports.flush() },
      { name: 'party posts', timeoutMs: 5_000, run: () => partyService.close() },
      { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
      { name: 'audit log', timeoutMs: 3_000, run: () => partyAudit.flush() },
      // A member's roles are changed one request after the other: a change that has begun is
      // finished while Discord is connected and the database is open.
      { name: 'self-assigned roles', timeoutMs: 5_000, run: () => selfRoles.idle() },
      // The spawn reports that wait for their half hour are deleted now: they would stay for good.
      { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
      // The pictures of the stops (no more fetched), the grunts' messages (they stand on), then
      // what waits to be drawn in the posts of the stops: in this order, ten seconds.
      ...stopReportSteps({
        pictures: stopPictures,
        grunts: gruntMessages,
        lines: stopLines,
        posts: stopPosts,
      }),
      // The catch-up's job under way (plan 8X-H): a feed's read ended by the feeds' steps above,
      // the posts of the stops drawn by the step before this one (review r1 C3).
      {
        name: 'catch-up',
        timeoutMs: 2_000,
        run: () => reconnect.catchUp?.whenIdle() ?? Promise.resolve(),
      },
      // Whoever is still being looked up for an event is put in line before the line is drained.
      { name: 'notifications', timeoutMs: 5_000, run: () => notify.close() },
      // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
      { name: 'direct messages', timeoutMs: 12_000, run: () => dms.drain(DM_DRAIN_MS) },
      { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
      // The last count of what the rehearsal dropped, once the client is down and nothing more
      // can be sent.
      ...(memberDms instanceof RehearsalDms
        ? [
            {
              name: 'rehearsal count',
              timeoutMs: 1_000,
              run: () => Promise.resolve(memberDms.flush()),
            },
          ]
        : []),
      // The want counts' second is the Unown wants' (plan 8H-3): the limits still add up to 145 s.
      { name: 'unown wants', timeoutMs: 4_000, run: () => unownWants.flush() },
      // A day's count under way writes its server's day, or none of it, before the pool closes
      // (review P3); one cut short is counted again at the next start.
      // A legacy fill-in's batch under way (plan 8H-10) shares that second: one cut short is
      // rolled back whole and done again. Its claim is given back within the second, so that the
      // next start takes it up at once; else the claim lapses after ten minutes
      // (`FILL_IN_LEASE_MS`) and the request waits that long.
      {
        name: 'want counts and fill-ins',
        timeoutMs: 1_000,
        run: async () => {
          await Promise.all([wantCounts.idle(), legacyFillIns?.idle()]);
        },
      },
      // A write in flight must finish before the pool closes.
      { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
      // A record of the party history that waits for another try gets it now, while the
      // database is open; what still fails is logged and given up.
      {
        name: 'party history',
        timeoutMs: 3_000,
        run: async () => {
          await partyHistory.flush();
          partyHistory.close();
        },
      },
      // The heartbeat asks the database: it stops first. A clean exit leaves no crash marker.
      { name: 'heartbeat', timeoutMs: 1_000, run: () => heartbeat.stop() },
      { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
    ],
    log,
  );
  // Attached only after login: during the intent fallback a rejected login also closes the shard.
  attachGatewayHandlers(client, log, (reason) => options.onFatal?.(shutdown, reason));
  return { log, shutdown, rehearsal: rehearsal !== undefined };
}
