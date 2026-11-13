import type { TargetWantStorage } from './db/repositories/target-want-repository.js';
import type { WantBoxStorage } from './db/repositories/want-box-repository.js';
import type { Kysely } from 'kysely';
import type { ScreenshotTrigger } from './commands/screenshots/mention.js';
import type { Config } from './config/index.js';
import type { GymTargetStorage } from './db/repositories/gym-notification-repository.js';
import type { HistoryOptIns } from './db/repositories/history-repository.js';
import type { PartyAuditReader } from './db/repositories/party-audit-repository.js';
import type { ServerSettingsAuditReader } from './db/repositories/server-settings-audit-repository.js';
import type { LegacyFillIns } from './db/repositories/legacy-fill-in-repository.js';
import type { LegacyIndex } from './services/legacy-fill-in.js';
import type { NewTrainStorage } from './db/repositories/new-train-repository.js';
import type { WantStorage } from './db/repositories/pokemon-notification-repository.js';
import type { UserSettingsStore } from './db/repositories/user-repository.js';
import type { DB } from './db/types.js';
import type { ClickAnswers } from './discord/click-answers.js';
import type { CommandModule, MessageCommand } from './discord/command.js';
import type { IntentFlags } from './discord/intents.js';
import type { MemberDirectory } from './discord/member-directory.js';
import type { MemberNames } from './services/member-names.js';
import type { Throttles } from './discord/throttle.js';
import type { Logger } from './log.js';
import type { EmojiFinder } from './services/application-emoji.js';
import type { AttachmentGateway } from './services/attachment-gateway.js';
import type { AttendanceService } from './services/attendance-service.js';
import type { DmSender } from './services/dm-sender.js';
import type { GameDataProvider } from './services/game-data-service.js';
import type { GymAdminService } from './services/gym-admin-service.js';
import type { GymProvider } from './services/gym-directory.js';
import type { IssueGateway } from './services/issue-gateway.js';
import type { PartyService } from './services/party-service.js';
import type { PineStopService } from './services/pine-stops.js';
import type { ResearchTaskProvider } from './services/research-task-service.js';
import type { RocketLineupProvider } from './services/rocket-lineup-service.js';
import type { StopReportService } from './services/stop-reports.js';
import type { PostLink } from './services/stop-posts.js';
import type { RocketService } from './services/rocket-reports.js';
import type { PlaceFinder } from './services/place-finder.js';
import type { PlaceSearch } from './services/place-search.js';
import type { PokebattlerGateway } from './services/pokebattler-gateway.js';
import type { PartyProvider } from './services/party-store.js';
import type { PokemonFinders, PokemonNicknames } from './services/pokemon-search-service.js';
import type { MaxBossAdmin, MaxBossProvider } from './services/max-boss-service.js';
import type { RaidBossAdmin, RaidBossProvider } from './services/raid-boss-service.js';
import type { RaidChangeService } from './services/raid-change-service.js';
import type { MaxChangeService } from './services/max-change-service.js';
import type { BossTierMoves } from './services/boss-tier-moves.js';
import type {
  MaxEventProvider,
  RaidEventProvider,
  ResearchEventProvider,
} from './services/raid-event-service.js';
import type { RegionAdminService } from './services/region-admin-service.js';
import type { RegionProvider } from './services/region-directory.js';
import type { SelfRoleService } from './services/self-role-service.js';
import type { SpawnService } from './services/spawn-service.js';
import type { ScreenshotReader } from './services/ocr-service.js';
import type { Screenshots } from './services/screenshot-service.js';
import type { MapBudget } from './services/map-budget.js';
import type { MapProvider } from './services/static-maps.js';
import type { TimedPartyService } from './services/timed-party-service.js';
import type { TrainService } from './services/train-service.js';
import type { WayfarerImportService } from './services/wayfarer-import-service.js';
import type { WayfarerReviewService } from './services/wayfarer-review-service.js';
import type { WayspotAddresses } from './services/wayspot-addresses.js';
import type { WayspotProvider } from './services/wayspot-directory.js';
import type { Rehearsal } from './services/rehearsal.js';
import type { EventForumService } from './services/event-forum.js';
import type { LegacyCleanup } from './services/legacy-cleanup.js';
import type { LoginLinks } from './web/login-links.js';
import type { MeetupSafety } from './services/meetup-safety.js';
import type { MemberRemoval } from './services/member-removal.js';
import type { ModerationReports } from './services/moderation-reports.js';
import type { ScriptAccessService } from './services/script-access-service.js';
import type { EventSpawnProvider } from './services/event-page-service.js';
import type { RegionTallies } from './services/region-tallies.js';
import type { Boards } from './services/boards.js';
import type { MemberStatsService } from './services/member-stats.js';
import type { EventWindows } from './services/event-window-service.js';
import type { ServerSettingsService } from './services/server-settings.js';

/** Everything a handler may use. Later phases add services here. */
export interface AppContext {
  readonly config: Config;
  /**
   * Each server's values (plan 19A-1, `servers.md`): what the settings file held that is a
   * server's, read through `servers.of(serverId)`, never from `config.settings`.
   */
  readonly servers: ServerSettingsService;
  readonly log: Logger;
  readonly db: Kysely<DB>;
  readonly commands: readonly CommandModule[];
  /** The message commands (Discord's Apps menu on a message) this installation offers. */
  readonly messageCommands: readonly MessageCommand[];
  /** Pokémon, moves and type data from the game master. */
  readonly gameData: GameDataProvider;
  /** The raid bosses in effect: the feed's list with the moderators' overrides. */
  readonly raidBosses: RaidBossProvider;
  /** The boss list for staff (`/operator boss`): the feed as stored, the overrides, a sync now. */
  readonly raidBossAdmin: RaidBossAdmin;
  /** The max bosses in effect (plan 8X-2). */
  readonly maxBosses: MaxBossProvider;
  /** The max boss list for staff (`/operator boss`). */
  readonly maxBossAdmin: MaxBossAdmin;
  /**
   * Raid Hours and Raid Days from the events feed (see `raidDurationRules`), and its max events
   * and big events (plan 8X-3: the featured bosses of `/max`, a max battle's default end).
   */
  readonly raidEvents: RaidEventProvider & MaxEventProvider & ResearchEventProvider;
  /**
   * The event window staff set (`/operator event-window`, 2026-11-09), which `raidEvents` gives as a
   * Raid Hour and a Max Battle Day.
   */
  readonly eventWindows: EventWindows;
  /** The field research task list read from Leek Duck (plan 8R-1). */
  readonly researchTasks: ResearchTaskProvider;
  /**
   * The spawns of the events on (plan 8R-4): costumed spawn reports, and Costumes in `/want`'s
   * dialog for a Pokémon an event lists costumed.
   */
  readonly eventSpawns: EventSpawnProvider;
  /** Team GO Rocket's lineups read from ScrapedDuck: `/rocket`'s choices (plan 8R-2). */
  readonly rocketLineups: RocketLineupProvider;
  /** Reports at stops (plan 8R-1): field research, in research periods. */
  readonly stopReports: StopReportService;
  /**
   * The message of a region channel's post "Today’s Stops" that holds a subject, in its board
   * post, as last drawn (`StopPostService.linkOf`; plan 8R-5: "Already reported" links it; plan
   * 8R-9, B1: the thread and the message); none in rehearsal mode, which makes no posts.
   */
  readonly stopPostLinks: {
    linkOf(channelId: string, subjectKey: string): PostLink | undefined;
  };
  /**
   * Reporting Team GO Rocket (plan 8R-2): the report, the grunt's messages (none in rehearsal
   * mode), the notifier.
   */
  readonly rocket: RocketService;
  /** The gyms, and finding them by what members type. */
  readonly gyms: GymProvider;
  /** Gym administration (`/gym`): adding, changing, moving and deleting gyms. */
  readonly gymAdmin: GymAdminService;
  /** The Wayfarer import (`/gym import`). */
  readonly wayfarer: WayfarerImportService;
  /** The review queue of the Wayfarer import (`/gym review`). */
  readonly wayfarerReview: WayfarerReviewService;
  /**
   * The kept Wayspots of the Wayfarer imports (plan 8W-2): PokéStops, power spots and the
   * Wayfarer gyms Pine did not take, by id, region and place.
   */
  readonly wayspots: WayspotProvider;
  /**
   * The addresses of Power Spots, looked up as the map opens their popups within a budget
   * (design `2026-11-04-power-spot-address-design.md`), which `wayspots.addressOf` reads.
   */
  readonly wayspotAddresses: WayspotAddresses;
  /** The PokéStops of Pine's own (plan 8R-1, `/pokestop`), which `wayspots` holds too. */
  readonly pineStops: PineStopService;
  /** Gyms, PokéStops and power spots of a server by what members type (`/wild near:`). */
  readonly placeFinder: PlaceFinder;
  /** The regions: by id, by text channel and by forum. */
  readonly regions: RegionProvider;
  /** Region administration (`/region`): outlines from a file, the list, the export, removal. */
  readonly regionAdmin: RegionAdminService;
  /** The cleanup of the legacy bot's party channels (`/admin cleanup-legacy`). */
  readonly legacyCleanup: LegacyCleanup;
  /** The files members attach to a command, downloaded with a limit. */
  readonly attachments: AttachmentGateway;
  /** The row of a server (`Guild.id`), by which regions and parties say whose they are. */
  readonly guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** The raids, trains and meetups that have not ended. */
  readonly parties: PartyProvider;
  /** Parties on Discord: reporting a raid, making a train or meetup, keeping posts and summaries up to date. */
  readonly partyService: PartyService;
  /** What members do in a party: signing up, completing, groups. Buttons and commands use it. */
  readonly attendance: AttendanceService;
  /** What members change about a raid itself: times, length, boss, moves, gym. */
  readonly raids: RaidChangeService;
  /** What members change about a max battle itself (plan 8X-3): its end and its boss. */
  readonly maxBattles: MaxChangeService;
  /** The running battles moved with an add that moved their boss (plan 8X-J, `/operator boss add`). */
  readonly bossMoves: Pick<BossTierMoves, 'move'>;
  /**
   * Meetup safety (plan 8S-1): the check of a meetup's place, the requests held for the
   * moderators and their decisions, blocks and appeals. Off without the server's moderators' channel.
   */
  readonly meetupSafety: MeetupSafety;
  /**
   * Reports to the moderators (plan 8S-2): of parties and messages, in the moderators' channel of
   * meetup safety; without it a party's report goes into its post.
   */
  readonly reports: ModerationReports;
  /**
   * The uses of commands and controls, the router's and the live map's (plan 8Z: a split is
   * counted in `/train`'s window by the code that makes the train).
   */
  readonly throttles: Throttles;
  /** What members change about a meetup or a train: its name, its times, what a meetup says. */
  readonly timedParties: TimedPartyService;
  /** What members change about a train as such: its route, where it is, its conductor, its boss. */
  readonly trains: TrainService;
  /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
  readonly clickAnswers: ClickAnswers;
  /** Members' settings (the defaults for a member who never changed one), and changing them. */
  readonly users: UserSettingsStore;
  /** What members want to be notified about: Pokémon, raid tiers, IV targets, per server. */
  readonly wants: WantStorage;
  /** The wants of `TargetWant` (plan 8R-1): research rewards, the Dynamax and Gigantamax boxes. */
  readonly targetWants: TargetWantStorage;
  /** The boxes of `/want`'s dialog, over the wants of both tables (plan 8R-1). */
  readonly wantBoxes: WantBoxStorage;
  /** The gyms members want to be notified about, per server. */
  readonly gymTargets: GymTargetStorage;
  /** Who asked to be told of new trains, per server. */
  readonly newTrains: NewTrainStorage;
  /** Who is named in the party history of a server (the history of `/settings`). */
  readonly historyOptIns: HistoryOptIns;
  /** The staff audit log of parties (`/audit`), kept 30 days. */
  readonly partyAudit: PartyAuditReader;
  /**
   * The staff's log of each server's settings (plan 19A-1): the Recent changes of
   * `/admin settings` and the settings lines of `/audit member:`; kept 30 days.
   */
  readonly serverSettingsAudit: ServerSettingsAuditReader;
  /** The requests of members' legacy fill-ins (plan 8H-10, `/settings`), per server. */
  readonly legacyFillIns: LegacyFillIns;
  /**
   * The member index of the legacy history and its worker (plan 8H-10): undefined where the
   * installation has no index (`LEGACY_INDEX_DIR` blank), which then offers no fill-in.
   */
  readonly legacyIndex: LegacyIndex | undefined;
  /**
   * The region tally (plan 8H-5, `/stats regions`): the activity heatmap's sums per region of a
   * period, as a member or the public may see them.
   */
  readonly regionTallies: RegionTallies;
  /** The boards (plan 8H-6, `/stats boards` and the history page), over the history's reads. */
  readonly boards: Boards;
  /** A member's own stats (plan 8H-6, `/stats me` and the web's "Your history"). */
  readonly memberStats: MemberStatsService;
  /** Members of a server other than the one who is acting: one by id, or who of many can see a channel. */
  readonly members: MemberDirectory;
  /** The names of the members a board shows (plan 8H-6): over `members`, kept a minute. */
  readonly memberNames: MemberNames;
  /** The roles members give themselves: what a server offers, and giving and taking them. */
  readonly selfRoles: SelfRoleService;
  /** Reports of wild Pokémon: the message in the region's channel and its removal. */
  readonly spawns: SpawnService;
  /** Direct messages: put in line, and sent at a fixed rate. */
  readonly dms: DmSender;
  /**
   * Pokémon by what members type: names, nicknames, forms; a server's search (`of(serverId)`)
   * with that server's nicknames, `of(null)` the instance's names alone (plan 19B-4).
   */
  readonly pokemon: PokemonFinders;
  /** The nicknames a server's staff add (`/admin nickname`); `pokemon.of` that server finds by them. */
  readonly nicknames: PokemonNicknames;
  /** Map pictures of gyms and regions, as files to attach. */
  readonly maps: MapProvider;
  /** The month's maps of places, which `/find-region` takes one of for each it downloads. */
  readonly mapBudget: MapBudget;
  /** The issues of the GitHub repository that `/request` sends gym requests to. */
  readonly issues: IssueGateway;
  /** Pokebattler's raid simulations, which `/counters` shows. */
  readonly pokebattler: PokebattlerGateway;
  /** Places by name (OpenStreetMap's Nominatim), which `/find-region` looks up. */
  readonly places: PlaceSearch;
  /** The screenshot reader (Phase 7): one screenshot at a time, in a process of its own. */
  readonly screenshotReader: ScreenshotReader;
  /** Screenshots on Discord: read, decided on and kept, and what members say of them. */
  readonly screenshots: Screenshots;
  /**
   * The screenshots of a message read because a member asked ("Read screenshot" in the
   * message's Apps menu, plan 7M): the bot's one `ScreenshotTrigger`, which reads the mentions,
   * so that both go one way and count in one window.
   */
  readonly messageShots: Pick<ScreenshotTrigger, 'readFor'>;
  /** Emoji by name: the application's, then a server's (`/counters` shows types). */
  readonly emoji: EmojiFinder;
  /** The login links of the web pages that `/maps` gives (plan 8M-1), shared with the server. */
  readonly loginLinks: LoginLinks;
  /** Who may have the Wayfarer export tool (plan 8W-P): the owner's DM buttons and `/userscript`. */
  readonly scriptAccess: ScriptAccessService;
  /**
   * A member's data across every server, counted and removed on request (plan 8G: the owner's
   * `/operator forget`).
   */
  readonly memberRemoval: MemberRemoval;
  /** Privileged-intent features actually granted at login (may be fewer than configured). */
  features: IntentFlags;
  /**
   * Rehearsal mode (`settings.rehearsal`), or nothing when it is off: the router answers only
   * its allowlist and staff, `/admin setup-forums` makes only its regions' forums, and the
   * cleanup of legacy channels only lists.
   */
  readonly rehearsal?: Rehearsal;
  /**
   * The events forums (plan 8V-1): only while rehearsal mode is off; each server's is its own
   * (plan 19A-1), and `/admin setup-forums` makes it.
   */
  readonly eventForum?: EventForumService;
}
