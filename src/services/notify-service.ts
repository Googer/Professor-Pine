import { maxSpotName } from '../domain/party/max.js';
import type { Settings } from '../config/settings.js';
import type { GymTargetStorage } from '../db/repositories/gym-notification-repository.js';
import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
import type { TargetWantStorage } from '../db/repositories/target-want-repository.js';
import { isCostumedTarget, type TargetWant } from '../domain/notify/target-wants.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { pokemonTarget, type Want } from '../domain/pogo/notification-target.js';
import { raidTierLabel, sameRaidTier } from '../domain/pogo/raid-tier.js';
import { changeSubject } from '../domain/pogo/species-answer.js';
import { targetReasonLabel, targetWantLabel, type BoxSubject } from '../domain/pogo/want-boxes.js';
import type { NewTrainStorage } from '../db/repositories/new-train-repository.js';
import type { UserSettingsReader } from '../db/repositories/user-repository.js';
import type { MemberDirectory } from '../discord/member-directory.js';
import { MEMBERS_PER_LOOKUP } from '../discord/member-viewers.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import {
  bossId,
  maxTargets,
  maxWantsFiring,
  raidNumbers,
  raidWantsFiring,
  reasonKey,
  researchTargets,
  shownReasonKey,
  researchWantsFiring,
  rocketShadowFiring,
  rocketShadowNumbers,
  rocketTargets,
  rocketWantsFiring,
  spawnNumbers,
  spawnWantsFiring,
  type NotifyReason,
  type RaidSighting,
  wantReason,
} from '../domain/notify/reasons.js';
import {
  groupOf,
  headCount,
  isBattle,
  isMax,
  isMeetup,
  type MaxParty,
  type MaxSpot,
  type MeetupParty,
  type MeetupPlace,
  isRaid,
  memberOf,
  membersWhere,
  sameBoss,
  type GroupId,
  type Party,
  type RaidParty,
  type TimedParty,
  type TrainParty,
} from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import { startTimeOf } from '../domain/party/timed.js';
import { battleKindOf, maxBossTitle } from '../domain/pogo/max-tier.js';
import { BoundedMap } from '../bounded-map.js';
import { pokemonWantName, wantTargetLabel } from '../domain/pogo/wants.js';
import type { Logger } from '../log.js';
import {
  bossSetSentence,
  changeButtonId,
  rocketChangeButtonId,
  mapLink,
  maxDmSentence,
  maxHourNote,
  meetingDmSentence,
  notifyDm,
  postButton,
  postLink,
  raidDmSentence,
  reportButton,
  stopButtonId,
  trainDmSentence,
  type RaidDmView,
  type ShownReason,
} from '../render/notify-dm.js';
import type { PartyBrief } from '../render/party-post.js';
import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
import {
  periodEndWords,
  researchConfirmBrief,
  researchConfirmSentence,
  researchDmBrief,
  researchDmSentence,
} from '../render/research.js';
import { spawnBrief, spawnSentence } from '../render/spawn.js';
import { placeSummary } from '../render/place.js';
import { clockOrDate, clockOrDay, plain, plainNoLinks, type NamedMember } from '../render/text.js';
import { DM_PRIORITY, type DmPriority, type DmSender } from './dm-sender.js';
import type { GameDataProvider } from './game-data-service.js';
import { Gathered } from './gathered.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyStore } from './party-store.js';
import type { RaidBossProvider } from './raid-boss-service.js';
import { regionsAtPoint, type RegionProvider } from './region-directory.js';
import type { SpawnNews } from './spawn-service.js';
import { isLeaderOrGiovanni, typeKeyOf } from '../domain/rocket/lineups.js';
import type { PictureMaker } from './stop-pictures.js';
import { isHideoutReport, type ResearchNews } from './stop-reports.js';
import type { RocketNews } from './rocket-reports.js';
import { gruntHourNote, rocketDmBrief, rocketDmSentence } from '../render/rocket.js';
import { researchPicture, rocketPicture, type PictureLookup } from '../domain/stops/pictures.js';
import type { StopReport } from '../domain/stops/report.js';
import { isOneOf, researchSubjectOf, taskOfSubject } from '../domain/research/reports.js';
import type { TaskReward } from '../domain/research/task.js';
import type { PostLink } from './stop-posts.js';

/**
 * Manage… of a reason (plan 8R-4, design 4): a want of a Pokémon in raids, spawns or as a shadow
 * (`p`, `ps`), a Pokémon's box of `TargetWant` (`rp`, `dx`, `gx`) and a tier's want (`t`, `ts`)
 * open the dialog of the species (a form beyond the Which field, an Unown letter, its own) or of
 * the tier, a Team GO Rocket target the one Rocket dialog; IV wants, items, Mega Energy, gym
 * targets and the settings keep Stop (undefined). The name says the want (`Costumed Pikachu`, made plain), the
 * box what fired.
 */
export function changeOf(
  catalogue: PokemonCatalogue,
  guildId: string,
  reason: NotifyReason,
  plainBox: 'Raids' | 'Spawns',
): ShownReason['change'] {
  const pokemon = (
    dex: number,
    form: string | undefined,
    costumed: boolean,
    box: string,
  ): ShownReason['change'] => {
    const subject = changeSubject(
      form === undefined ? { kind: 'pokemon', dex } : { kind: 'pokemon', dex, form },
      catalogue.byDex(dex).length,
    );
    const name = plain(pokemonWantName(catalogue, pokemonTarget(dex, form), { costumed }));
    const group = plain(
      pokemonWantName(
        catalogue,
        subject.kind === 'pokemon' ? pokemonTarget(dex, subject.form) : pokemonTarget(dex),
      ),
    );
    return { customId: changeButtonId(guildId, subject), name, box, group };
  };
  if (reason.kind === 'want') {
    const { target } = reason;
    if (target.kind === 'iv') return undefined;
    if (target.kind === 'tier') {
      const name = raidTierLabel({ level: target.tier.level, shadow: false });
      const subject: BoxSubject = { kind: 'tier', level: target.tier.level };
      const box = target.tier.shadow ? 'Shadow raids' : 'Raids';
      return { customId: changeButtonId(guildId, subject), name, box };
    }
    const box = target.shadow === true ? 'Shadow' : plainBox;
    return pokemon(target.dex, target.form, reason.costumed === true, box);
  }
  if (reason.kind === 'target') {
    const { want } = reason;
    if (want.kind === 'rocket') {
      // Team GO Rocket's one dialog (design 4b); the reason named as plan 8R-2 named it.
      const name = plain(targetWantLabel(catalogue, want));
      return { customId: rocketChangeButtonId(guildId), name };
    }
    const boxes = { 'research-pokemon': 'Research', dynamax: 'Dynamax', gigantamax: 'Gigantamax' };
    if (want.kind !== 'research-pokemon' && want.kind !== 'dynamax' && want.kind !== 'gigantamax') {
      return undefined;
    }
    return pokemon(want.dex, want.form, isCostumedTarget(want), boxes[want.kind]);
  }
  return undefined;
}

/**
 * What the services that change parties tell the notifier, each from the one place that knows
 * who acted (`actorId`; null for the clock): explicit calls, because only the caller knows the
 * actor, and a move to another region is several changes of two parties that only its caller
 * can tell from a new report. Every method returns at once and never throws (`NotifyService`
 * catches and logs whatever goes wrong in it): what follows (reading who wants it, asking who
 * can see it, putting the messages in line) happens on the side. A caller still tells the
 * notifier last, after everything the change itself calls for.
 */
export interface PartyNotifier {
  /** A raid was reported and has its post. */
  raidReported(party: RaidParty, actorId: string): void;
  /**
   * A raid was changed and stored: told of every stored change of a raid by a member or the
   * clock; the notifier looks whether the boss, the tier or the gym is another.
   */
  raidChanged(before: RaidParty, after: RaidParty, actorId: string | null): void;
  /**
   * A raid is about to become another party in another region (`PartyService.relocate`): what
   * was told about the old party counts for the new one. Called before the old party ends.
   */
  raidMoving(fromId: string, toId: string): void;
  /** The move is done: `to` is the raid in its new region, with its post. */
  raidMoved(from: RaidParty, to: RaidParty, actorId: string | null): void;
  /** A train was made and has its post. */
  trainCreated(party: TrainParty, actorId: string): void;
  /** A max battle was reported and has its post (plan 8X-3). */
  maxReported(party: MaxParty, actorId: string): void;
  /** A max battle was changed and stored; the notifier looks whether its boss is another. */
  maxChanged(before: MaxParty, after: MaxParty, actorId: string | null): void;
  /**
   * A member set or cancelled the meeting time of their group in a raid or a max battle
   * (`isBattle`); `before` is the time the group had. Not for a time the bot itself moved or
   * cancelled because the raid changed.
   */
  meetingTimeChanged(
    partyId: string,
    groupId: GroupId,
    before: number | undefined,
    by: NamedMember,
  ): void;
  /**
   * The start of a train or meetup is another than it was, and has stood for a moment (the
   * caller has gathered quick corrections into one call).
   */
  startTimeChanged(party: TimedParty, by: NamedMember): void;
}

export interface NotifyServiceOptions {
  /** The parties: an ended one is not announced, and what was told about it is forgotten. */
  store: Pick<PartyStore, 'get' | 'onChange'>;
  /** A party's post in brief as it is now (`PartyService.briefOf`). */
  posts: {
    briefOf(party: Party): PartyBrief;
    /** A meetup's place as its post shows it now (`PartyService.placeOf`); else as it was named. */
    placeOf?(party: MeetupParty): MeetupPlace | null;
    /** A max battle's spot as its post shows it now (`PartyService.spotOf`); else as named. */
    spotOf?(party: MaxParty): MaxSpot;
    /**
     * The application's train emoji as message text (`PartyService.trainMark`, plan 8M-11A), put
     * before the train's name in a new train's DM; none while the application lacks it.
     */
    trainMark?(): string | undefined;
  };
  wants: Pick<WantStorage, 'wanting'>;
  /**
   * The wants of `TargetWant` (plan 8R-1): the Dynamax and Gigantamax boxes of max battles,
   * the research rewards. Without it nobody wants either.
   */
  targetWants?: Pick<TargetWantStorage, 'wanting'>;
  gymTargets: Pick<GymTargetStorage, 'targeting'>;
  /** Who asked to hear of new trains, per server. */
  newTrains: Pick<NewTrainStorage, 'wanting'>;
  /** The members' settings: who asked to hear of the boss of their egg. */
  users: UserSettingsReader;
  members: Pick<MemberDirectory, 'viewers'>;
  dms: DmSender;
  /**
   * The snowflake of a server by its row (`GuildRepository.snowflakeOf`), and its row by its
   * snowflake (`idFor`: the regions of a server's research reports).
   */
  guilds: {
    snowflakeOf(id: number): Promise<string | undefined>;
    idFor(snowflake: string): Promise<number | undefined>;
  };
  regions: Pick<RegionProvider, 'byId' | 'all'>;
  /**
   * The message of a region channel's post "Today’s Stops" that holds a task, in its board post
   * (`StopPostService.messageOf`; plan 8R-9, B1: the thread and the message), for a research DM's
   * link (plan 8R-1); none in rehearsal mode, which makes no posts: the DM has no link then.
   */
  researchPosts?: {
    messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined>;
  };
  /**
   * The research reports as they are kept now (`StopReportService.kept`; plan 8R-5, R6): a "one
   * of" reads its reports again when its turn comes and leaves out the stops replaced since.
   * Without it, it names every stop it was reported at.
   */
  stopReports?: { kept(serverId: string, id: number): Promise<StopReport | undefined> };
  /**
   * The square pictures of the reports at stops (plan 8R-6, `StopPictures`): made before a
   * research or Rocket DM goes, and named by their address. Without it a DM names the feed's.
   */
  pictures?: PictureMaker;
  gyms: { get(id: number): PostGym | undefined };
  gameData: GameDataProvider;
  raidBosses: Pick<RaidBossProvider, 'bosses'>;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /**
   * How long after the last change of a raid group's meeting time its members are told.
   * Default five seconds, as for the start of a train or meetup: a time that is corrected at
   * once is one message.
   */
  meetingDelayMs?: number;
}

/**
 * As many members as are judged, asked about and put in line in one go before the event loop
 * gets its turn: what one request for members asks about.
 */
const BATCH = MEMBERS_PER_LOOKUP;
/** A message about a raid without an end time is not worth sending after this long. */
const RAID_NEWS_MS = 60 * 60_000;

/**
 * A member is told of at most one max battle of a boss in this long (design Q8, Matt 2026-10-20):
 * on a busy event day the same boss is at many spots, and the DM says so.
 */
export const MAX_WANT_QUIET_MS = 60 * 60_000;
/** How many members' last max battle DMs of a boss are remembered (in memory: a restart forgets). */
const MAX_HEARD_KEPT = 20_000;
/** How many members' research DMs of a task at a stop are remembered (in memory, as above). */
const RESEARCH_TOLD_KEPT = 20_000;
/** A message about a new train is not worth sending after this long. */
const TRAIN_NEWS_MS = 60 * 60_000;
/** A message that a time was taken away is not worth sending after this long. */
const CANCELLED_NEWS_MS = 30 * 60_000;

/** A meeting time whose message is waiting: what the group had before, and who changed it last. */
interface PendingMeeting {
  partyId: string;
  groupId: GroupId;
  before: number | undefined;
  by: NamedMember;
}

/** Who may be told about an event, and why each of them would be. */
interface Candidates {
  /** Snowflakes, each once. */
  ids: string[];
  /** The reasons that fire for one of them; judged when their batch comes. */
  reasonsOf: (id: string) => NotifyReason[];
}

/** One event to tell members about. */
interface Announcement {
  /** Events with one key are worked off one after the other: those of a party, in their order. */
  key: string;
  /** The party it is about; undefined for what is about none (a spawn). */
  partyId: string | undefined;
  /** The server: its row id (a party names it so), or its snowflake where that is known. */
  guild: number | string;
  /** The channel a recipient must be able to view. */
  channelId: string;
  /** The member who caused it, who is not told. */
  actorId: string | null;
  /**
   * Set for news that has no reason of the member's own and no opt-out (a meeting time): every
   * candidate is told, whatever was told before, and nothing is remembered. Nobody is asked
   * about either: the candidates are signed up for the party, so they could see it a moment
   * ago, and whoever left the server since cannot be written to, which the send finds out. So
   * these messages never wait in the line of the look-ups.
   */
  toAll?: true;
  eventAt: number;
  expiresAt: number;
  gather(guildId: string): Promise<Candidates>;
  /**
   * What else a member's message depends on than their reasons (research: the stops they were
   * not told of yet); a message is built once per variant and set of reasons.
   */
  variant?(memberId: string): string;
  /** The message for a member these reasons fired for; built once per set of reasons. */
  message(guildId: string, reasons: readonly NotifyReason[], memberId: string): OutgoingMessage;
  priority(reasons: readonly NotifyReason[]): DmPriority;
  /** Told of each member a message was put in line for (a max battle's hour, Q8). */
  sent?(memberId: string): void;
}

/** What one member was already told about one party. */
interface Told {
  /** The reasons (`reasonKey`) that fired, but for "your egg has its boss". */
  reasons: Set<string>;
  /** The boss (`bossId`) of the last "your egg has its boss" they were told or caused. */
  boss: string | undefined;
}

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Tells members by direct message what they asked to be told about (spec 6.4): raids for their
 * wants and at their gyms. Only where `settings.features.notifications` is on.
 *
 * An event is worked off on the side, in steps that give the event loop back: the members
 * with a row that may fit are read (the reads by event of the storages), then ninety-nine at a
 * time they are judged (the pure matching of `src/domain/notify`), asked about (who of them is
 * in the server and can view the party's forum: `MemberDirectory.viewers`) and put in line
 * (`DmSender`). Nothing here sends, and nothing loops over all recipients in one turn.
 *
 * **Never twice for one thing.** Per party it is remembered which reasons already fired for
 * which member; a later event of that party tells a member only when a reason fires that had
 * not fired for them, and names that reason alone. The member who caused an event is not told,
 * and what fired for them counts as told. The memory is not stored: a raid that moves to
 * another region shares it with the party it becomes, it is forgotten when the party ends, and
 * it is empty after a restart, which can repeat a message (accepted). "The egg you are signed
 * up for has its boss" is the exception: a member is told whenever the boss is another than the
 * last one they were told for this raid, so the last message is never wrong (X, Y, X is three
 * messages; X, an egg again, X is one. Matt, 2026-10-13).
 *
 * **One message per member and event**, whatever number of reasons fire; it names them all.
 */
export class NotifyService implements PartyNotifier {
  private readonly now: () => number;
  /** By party, by member: what they were already told. */
  private readonly told = new Map<string, Map<string, Told>>();
  /**
   * When a member was last told of a max battle of a boss (`<server row> <member> <kind> <boss>`),
   * for the hour of Q8; in memory, lost on a restart. Read when the members are gathered and
   * written when each message is put in line, so two reports of the boss moments apart, both
   * gathered before either is sent, may both reach a member.
   */
  private readonly maxHeard = new BoundedMap<string, number>(MAX_HEARD_KEPT);
  /**
   * The research a member was told of, by task and stop in its period
   * (`<server> <member> <period> <subject> <stop>`): never twice for the same task at the same
   * stop in one period (design 7). In memory, lost on a restart.
   */
  private readonly researchTold = new BoundedMap<string, true>(RESEARCH_TOLD_KEPT);
  /**
   * When a member was last told of a grunt of a type (`<server> <member> <grunt key>`), for the
   * hour of Matt's answer 3 (plan 8R-2); in memory, lost on a restart, as `maxHeard`.
   */
  private readonly rocketHeard = new BoundedMap<string, number>(MAX_HEARD_KEPT);
  /**
   * The hideouts a member was told of (`<server> <member> <day> <who> <stop>`): never twice for
   * the same hideout at the same stop in a day (plan 8R-2). In memory, lost on a restart.
   */
  private readonly rocketTold = new BoundedMap<string, true>(RESEARCH_TOLD_KEPT);
  private readonly lines = new KeyedLock<string>();
  /**
   * The address of a picture of a stop's DM (plan 8R-6): `StopPictures.url` (none where the
   * source is gone), or the feed's without it.
   */
  private readonly pictureLookup: PictureLookup = (source) =>
    this.options.pictures ? this.options.pictures.url(source) : source;
  private readonly background = new Set<Promise<void>>();
  private readonly snowflakes = new Map<number, string>();
  /**
   * Set when shutdown begins (`close`), before the times that wait are told: a time that comes
   * from then on is refused at once. It could only be gathered and then lost.
   */
  private closing = false;
  /** Set at shutdown (`close`): nothing new is taken, and nothing in flight begins a batch. */
  private closed = false;
  /** Counts the spawn reports: each is an event of its own, none waits for another. */
  private spawns = 0;
  /** The meeting times of raid groups whose message waits for its delay, by party and group. */
  private readonly meetings: Gathered<PendingMeeting>;

  constructor(private readonly options: NotifyServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.meetings = new Gathered({
      delayMs: options.meetingDelayMs ?? 5_000,
      send: (_key, pending) => {
        this.announceMeeting(pending);
        return Promise.resolve();
      },
      // Two changes made one: the time as it was before the older of them.
      fold: (older, newer) => ({ ...newer, before: older.before }),
      onError: (err, key) => {
        options.log.warn({ err, key }, 'could not tell of a meeting time');
      },
    });
    options.store.onChange((_before, after) => {
      if (after.status !== 'active') this.told.delete(after.id);
    });
  }

  private get enabled(): boolean {
    return this.options.settings.features.notifications;
  }

  /** How many parties something is remembered about. For tests. */
  get remembered(): number {
    return this.told.size;
  }

  /**
   * Runs what a caller told the notifier, and keeps whatever it throws from the caller: the
   * change that is told about is stored and shown by then, and must not fail for this.
   */
  private safely(event: string, work: () => void): void {
    try {
      work();
    } catch (err) {
      this.options.log.error({ err, event }, 'could not tell members of an event');
    }
  }

  raidReported(party: RaidParty, actorId: string): void {
    this.safely('a reported raid', () => {
      if (!this.enabled) return;
      this.announceRaid(party, 'reported', actorId, {
        wants: true,
        gym: true,
        bossSet: false,
        corrected: false,
      });
    });
  }

  maxReported(party: MaxParty, actorId: string): void {
    this.safely('a reported max battle', () => {
      if (!this.enabled) return;
      this.announceMax(party, 'reported', actorId);
    });
  }

  maxChanged(before: MaxParty, after: MaxParty, actorId: string | null): void {
    this.safely('a changed max battle', () => {
      if (!this.enabled || sameBoss(before.max.boss, after.max.boss)) return;
      this.announceMax(after, 'boss', actorId);
    });
  }

  /**
   * Tells who wants a max battle's boss (plan 8X-3; design 3.4; since plan 8R-1 by the boxes of
   * `/want`'s dialog, Matt's answer 9 of the stop reports design): the Dynamax box of a Dynamax
   * battle, the Gigantamax box of a Gigantamax one, of the species or of the boss's entry
   * (`maxWantsFiring`; no tier want, no gym target: a power spot is no gym), at most once an hour
   * per member, kind and boss (Q8: `MAX_WANT_QUIET_MS`, the DM says so), only once it has its post.
   */
  private announceMax(party: MaxParty, event: 'reported' | 'boss', actorId: string | null): void {
    const { forumChannelId, forumPostId } = party;
    if (forumChannelId === null || forumPostId === null) return;
    const { regions, gameData, targetWants, posts, log } = this.options;
    const ref = party.max.boss;
    const entry = 'key' in ref ? gameData.catalogue.byKey(ref.key) : undefined;
    const boss = entry && { dex: entry.dex, key: entry.key };
    if (!boss || !targetWants) return;
    // By boss and kind (review B, B3): a Gigantamax Machamp is told within the hour of a Dynamax
    // one, as the DM's note names the kind.
    const kind = battleKindOf(party.max.tier) === 'gigantamax' ? 'gigantamax' : 'dynamax';
    const heard = (id: string): string => `${String(party.guildId)} ${id} ${kind} ${bossId(ref)}`;
    const eventAt = this.now();
    const title = maxBossTitle(entry.name, party.max.tier);
    let brief: { made?: PartyBrief | undefined } | undefined;
    this.announce({
      key: party.id,
      partyId: party.id,
      guild: party.guildId,
      channelId: forumChannelId,
      actorId,
      eventAt,
      expiresAt: party.endTime ?? party.lastPossibleTime ?? eventAt + RAID_NEWS_MS,
      gather: async (guildId) => {
        const wanting = new Map<string, readonly TargetWant[]>();
        try {
          for (const found of await targetWants.wanting(guildId, maxTargets(boss, kind))) {
            wanting.set(found.memberId, found.wants);
          }
        } catch (err) {
          log.warn({ err, party: party.id }, 'could not read who wants a max battle');
        }
        const now = this.now();
        const quiet = (id: string): boolean => {
          const last = this.maxHeard.get(heard(id));
          return last !== undefined && now - last < MAX_WANT_QUIET_MS;
        };
        return {
          ids: [...wanting.keys()].filter((id) => !quiet(id)),
          reasonsOf: (id) =>
            maxWantsFiring(gameData.catalogue, wanting.get(id) ?? [], boss, kind).map(
              (want): NotifyReason => ({ kind: 'target', want }),
            ),
        };
      },
      message: (guildId, reasons) => {
        brief ??= { made: this.briefOf(posts, party) };
        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
        const map = brief.made?.map;
        return notifyDm(
          {
            sentence: maxDmSentence({
              event,
              title,
              spot: this.spotName(party),
              pin: party.max.spot.kind === 'pin',
              regionChannelId: region?.channelId,
              reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
            }),
            brief: brief.made,
            links: [
              postButton(postLink(guildId, forumPostId)),
              ...(map === undefined ? [] : [mapLink(map)]),
            ],
            note: maxHourNote(title),
          },
          reasons.map((reason) => this.shown(guildId, reason)),
        );
      },
      priority: () => DM_PRIORITY.normal,
      sent: (id) => {
        this.maxHeard.set(heard(id), this.now());
      },
    });
  }

  raidChanged(before: RaidParty, after: RaidParty, actorId: string | null): void {
    this.safely('a changed raid', () => {
      if (!this.enabled) return;
      const was = before.raid.boss;
      const is = after.raid.boss;
      const otherBoss = !sameBoss(was, is);
      // A boss that was taken back leaves an egg again: that is news for nobody (who was told
      // of the boss sees it in the post), whatever else changed with it.
      const boss =
        is === null && was !== null
          ? false
          : otherBoss || !sameRaidTier(before.raid.tier, after.raid.tier);
      const gym = before.gymId !== after.gymId;
      // The raid has a boss it did not have: who is signed up and asked to hear that is told,
      // wanted or not; a boss in the place of another one as the correction it is.
      const bossSet = is !== null && otherBoss;
      const corrected = bossSet && was !== null;
      // A change of both at once is told as the other gym it also is.
      if (gym) {
        this.announceRaid(after, 'gym', actorId, { wants: boss, gym: true, bossSet, corrected });
      } else if (boss) {
        this.announceRaid(after, 'boss', actorId, { wants: true, gym: false, bossSet, corrected });
      }
    });
  }

  raidMoving(fromId: string, toId: string): void {
    this.safely('a raid that moves', () => {
      if (!this.enabled) return;
      // A party that has ended meanwhile has nothing to share, and what was set under its id
      // now would never be forgotten: it is forgotten when the party ends, which it has.
      if (this.options.store.get(fromId) === undefined) return;
      // One memory under both ids, not a copy: an event of the old party that is still being
      // worked off (its members are being asked about) remembers whom it tells for the new
      // party too. When the old party ends only its key goes; when the move is taken back,
      // only the new one.
      const known = this.told.get(fromId) ?? new Map<string, Told>();
      this.told.set(fromId, known);
      this.told.set(toId, known);
    });
  }

  raidMoved(_from: RaidParty, to: RaidParty, actorId: string | null): void {
    this.safely('a moved raid', () => {
      if (!this.enabled) return;
      // In another region other members can see it: the wants are asked again, and whoever was
      // told already is not told a second time.
      this.announceRaid(to, 'gym', actorId, {
        wants: true,
        gym: true,
        bossSet: false,
        corrected: false,
      });
    });
  }

  trainCreated(party: TrainParty, actorId: string): void {
    this.safely('a new train', () => {
      this.announceTrain(party, actorId);
    });
  }

  private announceTrain(party: TrainParty, actorId: string): void {
    if (!this.enabled) return;
    const { forumChannelId, forumPostId } = party;
    if (forumChannelId === null || forumPostId === null) return;
    const { newTrains, regions, posts } = this.options;
    const eventAt = this.now();
    const reason: NotifyReason = { kind: 'new-train' };
    let brief: { made?: PartyBrief | undefined } | undefined;
    this.announce({
      key: party.id,
      partyId: party.id,
      guild: party.guildId,
      channelId: forumChannelId,
      actorId,
      eventAt,
      expiresAt: eventAt + TRAIN_NEWS_MS,
      // Who asked in this server (Matt, 2026-10-12: per server, like the wants).
      gather: async (guildId) => ({
        ids: await newTrains.wanting(guildId),
        reasonsOf: () => [reason],
      }),
      message: (guildId, reasons) => {
        brief ??= { made: markedTrain(this.briefOf(posts, party), posts.trainMark?.()) };
        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
        return notifyDm(
          {
            sentence: trainDmSentence({
              regionChannelId: region?.channelId,
              // As for a raid: an anonymous maker is not named to those who are told of it.
              maker: party.anonymous ? undefined : memberOf(party, party.createdById),
              kind: party.train.kind,
            }),
            brief: brief.made,
            links: [postButton(postLink(guildId, forumPostId))],
          },
          reasons.map((one) => this.shown(guildId, one)),
        );
      },
      priority: () => DM_PRIORITY.normal,
    });
  }

  meetingTimeChanged(
    partyId: string,
    groupId: GroupId,
    before: number | undefined,
    by: NamedMember,
  ): void {
    this.safely('a meeting time', () => {
      if (this.refusedAtShutdown(partyId, 'meeting')) return;
      // Part of parties, not of the notifications a server can switch off: always sent.
      this.meetings.later(`${partyId}:${groupId}`, (earlier) => ({
        partyId,
        groupId,
        before: earlier ? earlier.before : before,
        by,
      }));
    });
  }

  /** Tells the group the meeting time it has now, unless that is the one it had before. */
  private announceMeeting(pending: PendingMeeting): void {
    const { partyId, groupId, by } = pending;
    const party = this.options.store.get(partyId);
    // A raid or a max battle: the kinds whose groups have meeting times of their own.
    if (!party || !isBattle(party)) return;
    const time = groupOf(party, groupId)?.startTime;
    if (time === pending.before) return;
    const others = membersWhere(
      party,
      (attendee, id) =>
        id !== by.id && attendee.group === groupId && attendee.status !== PartyStatus.Complete,
    );
    const now = this.now();
    this.tellAttendees(party, others, by, {
      what: 'meeting',
      time: time === undefined ? null : clockOrDate(time, now),
      heads: headCount(party, groupId),
      expiresAt: time ?? now + CANCELLED_NEWS_MS,
    });
  }

  startTimeChanged(party: TimedParty, by: NamedMember): void {
    this.safely('a start time', () => {
      if (this.refusedAtShutdown(party.id, 'start')) return;
      this.announceStartTime(party, by);
    });
  }

  /**
   * Whether a time that members meet at comes too late to be told: shutdown has begun. Said at
   * debug, so that a time that was never told can be found.
   */
  private refusedAtShutdown(partyId: string, what: 'meeting' | 'start'): boolean {
    if (!this.closing) return false;
    this.options.log.debug(
      { party: partyId, what },
      'a time is not told: the bot is shutting down',
    );
    return true;
  }

  private announceStartTime(party: TimedParty, by: NamedMember): void {
    const start = startTimeOf(party);
    const others = membersWhere(
      party,
      (attendee, id) => id !== by.id && attendee.status !== PartyStatus.Complete,
    );
    const now = this.now();
    this.tellAttendees(party, others, by, {
      what: 'start',
      time: start === null ? null : clockOrDay(start, now, this.options.settings.timezone),
      heads: headCount(party),
      expiresAt: start ?? now + CANCELLED_NEWS_MS,
    });
  }

  /**
   * A wild Pokémon was reported (`SpawnService`): who wants it in the wild, and with perfect
   * or zero IVs who asked for those, is told when they can view the region's text channel;
   * not the reporter. A spawn is no party, and nothing is remembered of who was told: every
   * report is news (how often a member may report is the throttle of `/wild`).
   */
  spawnReported(news: SpawnNews): void {
    this.safely('a spawn', () => {
      this.announceSpawn(news);
    });
  }

  private announceSpawn(news: SpawnNews): void {
    if (!this.enabled) return;
    const { wants, gameData } = this.options;
    const spawn = {
      pokemon: { dex: news.pokemon.dex, key: news.pokemon.key, costumed: news.costumed === true },
      iv: news.iv,
    };
    const brief = spawnBrief(news.view, news.goneAt);
    this.spawns += 1;
    this.announce({
      key: `spawn:${String(this.spawns)}`,
      partyId: undefined,
      guild: news.guildId,
      channelId: news.regionChannelId,
      actorId: news.reporter.id,
      eventAt: news.eventAt,
      // The report itself is gone from the channel by then.
      expiresAt: news.goneAt,
      gather: async (guildId) => {
        const wanting = new Map<string, readonly Want[]>();
        for (const found of await wants.wanting(guildId, spawnNumbers(spawn))) {
          wanting.set(found.memberId, found.wants);
        }
        return {
          ids: [...wanting.keys()],
          reasonsOf: (id) =>
            spawnWantsFiring(gameData.catalogue, wanting.get(id) ?? [], spawn).map(wantReason),
        };
      },
      message: (guildId, reasons) =>
        notifyDm(
          {
            sentence: spawnSentence(news.view, news.regionChannelId),
            brief,
            // The report itself: the place to look, and to answer.
            links: [reportButton(postLink(guildId, news.regionChannelId, news.messageId))],
          },
          reasons.map((reason) => this.shown(guildId, reason, 'Spawns')),
        ),
      priority: () => DM_PRIORITY.spawn,
    });
  }

  /**
   * Field research was reported (`StopReportService`; plan 8R-1, design 7): who wants a reward of
   * its task (`researchWantsFiring`: a Pokémon's Research box, an item, Mega Energy) is told at
   * the normal priority, one DM per report and region channel naming the report's stops in that
   * region, when they can view the channel; not the reporter. A member told of the task at a stop
   * in the period is not told of it there again (`researchTold`): a later report of the task at
   * more stops names only the new ones. The DM ends with the report and links to the message of
   * the post of the stops that holds the task (`researchPosts`; none in rehearsal mode).
   *
   * The task's line (R3) and the DMs' time (`eventAt`, and the start of `periodEndWords`; review
   * F6) are taken here, as the report is made (review R6): what is read before
   * anybody is told (the server's row, the reports as they stand now) is read when its turn
   * comes, so the reports of a task are told in the order they were made.
   */
  researchReported(news: ResearchNews): void {
    this.safely('field research', () => {
      if (!this.enabled || !this.options.targetWants || this.closed) return;
      const [first] = news.reports;
      if (!first) return;
      // The DMs' time is the report's, however late its turn comes (review F6).
      const reportedAt = this.now();
      const work = this.lines
        .run(`research:${news.serverId}:${taskOfSubject(first.subjectKey)}`, async () => {
          for (const event of await this.researchEvents(news, reportedAt)) {
            await this.deliver(event);
          }
        })
        .catch((err: unknown) => {
          this.options.log.error(
            { err, guild: news.serverId },
            'could not tell members of field research',
          );
        })
        .finally(() => this.background.delete(work));
      this.background.add(work);
    });
  }

  /**
   * What research news tells, one event per region channel its stops lie in, read when its turn
   * in the task's line comes. Whether a member's message confirms (R4, R5) is decided once for
   * every channel (review R3): a confirmation where each of the news' stops they were not told of
   * yet, in the channels they view (review F4), was told of the task's "one of", else the usual
   * DM; each channel's DM then names that channel's stops.
   */
  private async researchEvents(news: ResearchNews, reportedAt: number): Promise<Announcement[]> {
    const {
      regions,
      guilds,
      members,
      targetWants,
      gameData,
      researchPosts,
      stopReports,
      pictures,
      log,
    } = this.options;
    const [first] = news.reports;
    if (!first || !targetWants) return [];
    const { research, subjectKey } = first;
    // Every version of a task is told in the task's line (R3), and "told" of its "one of" is told
    // of the task's key alone at a stop: what a narrowing confirms (R5).
    const task = taskOfSubject(subjectKey);
    const oneOf = isOneOf(first);
    const narrows = researchSubjectOf(subjectKey)?.hash !== undefined;
    const toldKey = (memberId: string, report: StopReport, subject = subjectKey): string =>
      `${news.serverId} ${memberId} ${report.periodKey} ${subject} ${report.stop.key}`;
    // The reporter of a "one of" this replaced knows of the task there, as if told (R5).
    for (const replaced of news.replaced) {
      if (replaced.subjectKey === task && isOneOf(replaced)) {
        this.researchTold.set(toldKey(replaced.reporter.id, replaced, task), true);
      }
    }
    const targets = researchTargets(research.rewards);
    if (targets.length === 0) return [];
    const row = await guilds.idFor(news.serverId);
    if (row === undefined) return [];
    // The reports by the region channels their stops lie in; a stop in two regions is in both.
    const byChannel = new Map<string, StopReport[]>();
    for (const report of news.reports) {
      for (const region of regionsAtPoint(regions.all(), row, report.stop)) {
        byChannel.set(region.channelId, [...(byChannel.get(region.channelId) ?? []), report]);
      }
    }
    // The ids of the reports as they stand (R6): a "one of" replaced or taken back since its
    // report is left out. Read once, by the first channel's event once it has read the wants (as
    // late as can be), and the same for every channel, so that the kind of a member's message is
    // decided on one reading.
    let standing: ReadonlySet<number> = new Set(news.reports.map((report) => report.id));
    let reading: Promise<ReadonlySet<number>> | undefined;
    const standingNow = async (): Promise<ReadonlySet<number>> => {
      if (!oneOf || !stopReports) return standing;
      reading ??= Promise.all(
        news.reports.map((report) => stopReports.kept(news.serverId, report.id)),
      ).then(
        (kept) =>
          new Set(
            news.reports
              .filter((report, index) => kept[index]?.madeAt === report.madeAt)
              .map((report) => report.id),
          ),
      );
      return reading;
    };
    /** A report of the news a member was not told of at its stop yet, still standing. */
    const isNews = (memberId: string, report: StopReport): boolean =>
      standing.has(report.id) && !this.researchTold.has(toldKey(memberId, report));
    // Who of the members it may tell views each region channel (review F4): read once, by the
    // first channel's event, for every member with an untold stop in any channel (review P1),
    // where a confirmation can be sent and the stops lie in several channels; a channel whose
    // viewers could not be read counts for everybody (the usual DM).
    let viewing: ReadonlyMap<string, ReadonlySet<string> | undefined> = new Map();
    let readingViewers: Promise<typeof viewing> | undefined;
    const viewersNow = (guildId: string, ids: readonly string[]): Promise<typeof viewing> => {
      if (!narrows || byChannel.size < 2 || ids.length === 0) return Promise.resolve(viewing);
      readingViewers ??= Promise.all(
        [...byChannel.keys()].map(async (channelId) => {
          const seeing = await members.viewers(guildId, channelId, ids).catch((err: unknown) => {
            log.warn({ err, channel: channelId }, 'could not find out who can see a channel');
            return undefined;
          });
          return [channelId, seeing] as const;
        }),
      ).then((entries) => new Map(entries));
      return readingViewers;
    };
    /** Whether the member may be told of a report: they view a channel its stop lies in. */
    const viewed = (memberId: string, report: StopReport): boolean =>
      [...byChannel].some(
        ([channelId, reports]) =>
          reports.includes(report) && (viewing.get(channelId)?.has(memberId) ?? true),
      );
    const inAny = [...new Set([...byChannel.values()].flat())];
    /** Whether a member is sent confirmations, decided at their first message of the news. */
    const confirming = new Map<string, boolean>();
    const confirms = (memberId: string): boolean => {
      let decided = confirming.get(memberId);
      if (decided === undefined) {
        // Only the stops of the channels they view (review F4).
        const untold = inAny.filter(
          (report) => isNews(memberId, report) && viewed(memberId, report),
        );
        decided =
          narrows &&
          untold.length > 0 &&
          untold.every((report) => this.researchTold.has(toldKey(memberId, report, task)));
        confirming.set(memberId, decided);
      }
      return decided;
    };
    return [...byChannel].map(([channelId, reported]): Announcement => {
      const eventAt = reportedAt;
      let link: PostLink | undefined;
      const untold = (memberId: string): StopReport[] =>
        reported.filter((report) => isNews(memberId, report));
      return {
        key: `research:${news.serverId}:${task}`,
        partyId: undefined,
        guild: news.serverId,
        channelId,
        actorId: news.reporter.id,
        eventAt,
        expiresAt: Math.min(...reported.map((report) => report.endsAt)),
        gather: async (guildId) => {
          const wanting = new Map<string, readonly TargetWant[]>();
          for (const found of await targetWants.wanting(guildId, targets)) {
            wanting.set(found.memberId, found.wants);
          }
          standing = await standingNow();
          if (wanting.size > 0 && researchPosts && reported.some(({ id }) => standing.has(id))) {
            link = await researchPosts.messageOf(channelId, subjectKey).catch((err: unknown) => {
              log.warn({ err, channel: channelId }, 'could not find the post of the stops');
              return undefined;
            });
          }
          const ids = [...wanting.keys()].filter((id) => untold(id).length > 0);
          // The DM's picture made first (plan 8R-6): a reward's own, "one of"'s the encounter's.
          const picture = researchPicture(research.rewards);
          if (ids.length > 0 && picture) await pictures?.prepare([picture.source]);
          viewing = await viewersNow(
            guildId,
            [...wanting.keys()].filter((id) => inAny.some((report) => isNews(id, report))),
          );
          return {
            ids,
            reasonsOf: (id) =>
              researchWantsFiring(gameData.catalogue, wanting.get(id) ?? [], research.rewards).map(
                (want): NotifyReason => ({ kind: 'target', want }),
              ),
          };
        },
        // What a member's message names, and whether it confirms (R4).
        variant: (id) =>
          `${confirms(id) ? 'confirm' : 'news'} ${untold(id)
            .map((report) => report.stop.key)
            .join(' ')}`,
        message: (guildId, reasons, memberId) => {
          const stops = untold(memberId).map((report) => report.stop);
          const until = periodEndWords(news.period.end, eventAt, this.options.settings.timezone);
          const links =
            link === undefined
              ? []
              : [postButton(postLink(guildId, link.channelId, link.messageId))];
          const shown = reasons.map((reason) => this.shown(guildId, reason));
          if (confirms(memberId)) {
            return notifyDm(
              {
                sentence: researchConfirmSentence({ stops, rewards: research.rewards }),
                brief: researchConfirmBrief({ research, until }, this.pictureLookup),
                links,
              },
              shown,
            );
          }
          // The member's own rewards first (R12): a "one of" may not be theirs.
          const wants = reasons.flatMap((reason) =>
            reason.kind === 'target' ? [reason.want] : [],
          );
          const theirs = (reward: TaskReward): boolean =>
            researchWantsFiring(gameData.catalogue, wants, [reward]).length > 0;
          const rewards = [
            ...research.rewards.filter(theirs),
            ...research.rewards.filter((reward) => !theirs(reward)),
          ];
          return notifyDm(
            {
              sentence: researchDmSentence({
                research,
                regionChannelId: channelId,
                reporter: news.reporter,
              }),
              brief: researchDmBrief({ research: { rewards }, stops, until }, this.pictureLookup),
              links,
            },
            shown,
          );
        },
        priority: () => DM_PRIORITY.normal,
        sent: (id) => {
          for (const report of untold(id)) {
            this.researchTold.set(toldKey(id, report), true);
          }
        },
      };
    });
  }

  /**
   * Team GO Rocket was reported (`RocketService`; plan 8R-2, design 7): who wants it is told, one
   * DM per region channel that holds its stop, when they can view the channel; not the reporter,
   * nor (plan 8R-4L, review R3) the reporter of the grunt a refine changed (`alsoActors`), and
   * both have heard of a grunt's type for the hour.
   * A report fires a want of its grunt type, its leader (or any leader), Giovanni or the decoy
   * (`rocketWantsFiring`), and a Shadow want of a Pokémon it can give (`rocketShadowFiring`: the
   * shadow row means shadow raids and Rocket catches). A grunt goes at the spawn priority, at
   * most one an hour per member and grunt type (`MAX_WANT_QUIET_MS`, Matt's answer 3; the DM says
   * so), linking to its message in that channel; a hideout at the normal priority, never twice to
   * a member for the same hideout at the same stop in a day (`rocketTold`), linking to the
   * message of the post of the stops that holds it (`researchPosts`). No link in rehearsal mode.
   */
  rocketReported(news: RocketNews): void {
    this.safely('Team GO Rocket', () => {
      if (!this.enabled || this.closed) return;
      this.announceRocket(news);
    });
  }

  private announceRocket(news: RocketNews): void {
    const { targetWants, wants, gameData, researchPosts, pictures, log, settings } = this.options;
    const { report } = news;
    const hideout = isHideoutReport(report);
    const named = isLeaderOrGiovanni(report.subjectKey);
    const targets = rocketTargets(report.subjectKey);
    const numbers = rocketShadowNumbers(report.rocket.catches);
    // Per member and grunt type (a grunt; a lineup's report its type's, plan 8R-4L), or per
    // hideout at the stop in its day (a hideout).
    const type = typeKeyOf(report.subjectKey);
    const quietKey = (id: string): string => `${news.serverId} ${id} ${type}`;
    const toldKey = (id: string): string =>
      `${news.serverId} ${id} ${report.periodKey} ${report.subjectKey} ${report.stop.key}`;
    const actors = [report.reporter.id, ...(news.alsoActors ?? [])];
    for (const { channelId, messageId: posted } of news.channels) {
      const eventAt = this.now();
      // A grunt's message in the channel; a hideout's message of the board (plan 8R-9, B1).
      let link: PostLink | undefined =
        posted === undefined ? undefined : { channelId, messageId: posted };
      this.announce({
        // A grunt's line is its type's (fix B1): reports of one type are worked off in order, so
        // the hour of a type holds for reports made at once; a hideout's line is its report's,
        // so that the second channel's DM knows whom the first one told.
        key: hideout
          ? `rocket:${news.serverId}:${String(report.id)}`
          : `rocket:${news.serverId}:${type}`,
        partyId: undefined,
        guild: news.serverId,
        channelId,
        actorId: report.reporter.id,
        eventAt,
        expiresAt: report.endsAt,
        gather: async (guildId) => {
          const targeted = new Map<string, readonly TargetWant[]>();
          const shadow = new Map<string, readonly Want[]>();
          // Without TargetWant only the Shadow wants fire (fix B8).
          if (targetWants) {
            try {
              for (const found of await targetWants.wanting(guildId, targets)) {
                targeted.set(found.memberId, found.wants);
              }
            } catch (err) {
              log.warn({ err, guild: guildId }, 'could not read who wants Team GO Rocket');
            }
          }
          if (numbers.length > 0) {
            try {
              for (const found of await wants.wanting(guildId, numbers)) {
                shadow.set(found.memberId, found.wants);
              }
            } catch (err) {
              log.warn({ err, guild: guildId }, 'could not read who wants a shadow Pokémon');
            }
          }
          const ids = [...new Set([...targeted.keys(), ...shadow.keys()])];
          // The DM's picture made first (plan 8R-6): the encounter's, a Pokémon's or a portrait.
          const picture = rocketPicture(report.subjectKey, report.rocket.catches);
          if (ids.length > 0 && picture) await pictures?.prepare([picture.source]);
          if (hideout && ids.length > 0 && researchPosts) {
            link = await researchPosts
              .messageOf(channelId, report.subjectKey)
              .catch((err: unknown) => {
                log.warn({ err, channel: channelId }, 'could not find the post of the stops');
                return undefined;
              });
          }
          const now = this.now();
          const quiet = (id: string): boolean => {
            if (hideout) return this.rocketTold.has(toldKey(id));
            const last = this.rocketHeard.get(quietKey(id));
            return last !== undefined && now - last < MAX_WANT_QUIET_MS;
          };
          // Who made the grunt known (review R3): its reporter, and the reporter of what a refine
          // replaced, are not told of it, and have heard of its type for the hour.
          if (!hideout) for (const id of actors) this.rocketHeard.set(quietKey(id), now);
          return {
            ids: ids.filter((id) => !quiet(id) && !actors.includes(id)),
            reasonsOf: (id) => [
              ...rocketWantsFiring(targeted.get(id) ?? [], report.subjectKey).map(
                (want): NotifyReason => ({ kind: 'target', want }),
              ),
              ...rocketShadowFiring(
                gameData.catalogue,
                shadow.get(id) ?? [],
                report.rocket.catches,
              ).map(wantReason),
            ],
          };
        },
        message: (guildId, reasons) =>
          notifyDm(
            {
              sentence: rocketDmSentence({
                name: report.rocket.name,
                named,
                regionChannelId: channelId,
                reporter: report.reporter,
              }),
              brief: rocketDmBrief(
                {
                  key: report.subjectKey,
                  catches: report.rocket.catches,
                  stop: report.stop,
                  ends: hideout
                    ? { until: periodEndWords(report.endsAt, eventAt, settings.timezone) }
                    : { goneAt: report.endsAt },
                },
                this.pictureLookup,
              ),
              links:
                link === undefined
                  ? []
                  : [
                      hideout
                        ? postButton(postLink(guildId, link.channelId, link.messageId))
                        : reportButton(postLink(guildId, link.channelId, link.messageId)),
                    ],
              ...(hideout ? {} : { note: gruntHourNote() }),
            },
            reasons.map((reason) => this.shown(guildId, reason)),
          ),
        priority: () => (hideout ? DM_PRIORITY.normal : DM_PRIORITY.spawn),
        sent: (id) => {
          if (hideout) this.rocketTold.set(toldKey(id), true);
          else this.rocketHeard.set(quietKey(id), this.now());
        },
      });
    }
  }

  /**
   * The direct message about a time to meet at (worded for a phone's notification), to these members of a party: no
   * reasons, no button, no opt-out, and before everything that is only news.
   */
  private tellAttendees(
    party: Party,
    memberIds: readonly string[],
    by: NamedMember,
    news: { what: 'meeting' | 'start'; time: string | null; heads: number; expiresAt: number },
  ): void {
    const { forumChannelId, forumPostId } = party;
    if (forumChannelId === null || forumPostId === null || memberIds.length === 0) return;
    const eventAt = this.now();
    this.announce({
      // A line of their own: these read nothing of what was told and ask about nobody, so they
      // never wait behind an event of their party whose members are still being looked up.
      key: `${party.id}:times`,
      partyId: party.id,
      guild: party.guildId,
      channelId: forumChannelId,
      actorId: by.id,
      toAll: true,
      eventAt,
      // A time that has passed by the time the message would go is not worth a message.
      expiresAt: Math.max(news.expiresAt, eventAt + 60_000),
      gather: () => Promise.resolve({ ids: [...memberIds], reasonsOf: () => [] }),
      // Plain text: it exists for its notification, which a phone shows raw (Matt, 2026-10-15).
      message: (guildId) => ({
        content: meetingDmSentence({
          what: news.what,
          subject: this.meetingSubject(party),
          // The maker of a train who asked not to be named is not named here either.
          by: party.anonymous && party.createdById === by.id ? null : by,
          time: news.time,
          heads: news.heads,
          link: postLink(guildId, forumPostId),
          // Where a meetup is, last, as its post shows it now.
          place: isMeetup(party)
            ? placeSummary(this.options.posts.placeOf?.(party) ?? party.meetup.place, plainNoLinks)
            : undefined,
        }),
      }),
      priority: () => DM_PRIORITY.urgent,
    });
  }

  /** A max battle's spot by name as its post shows it now (`spotOf`), for every DM. */
  private spotName(party: MaxParty): string {
    return maxSpotName(this.options.posts.spotOf?.(party) ?? party.max.spot);
  }

  /** What a time to meet is for, in a direct message: `the raid at The Stacks`, `the train …`. */
  private meetingSubject(party: Party): string {
    if (isRaid(party)) {
      const { gymId } = party;
      return `the raid at ${plainNoLinks(gymName(gymId === null ? undefined : this.options.gyms.get(gymId)))}`;
    }
    if (isMax(party)) {
      // A pin by what it is, in running text (plan 8X-F), never by its label.
      return party.max.spot.kind === 'pin'
        ? 'the max battle at an unlisted power spot'
        : `the max battle at ${plainNoLinks(this.spotName(party))}`;
    }
    return `the ${party.type} ${plainNoLinks(party.timed.name)}`;
  }

  /**
   * What a want is matched against: the raid's tier, and its boss as the game data has it,
   * costumed when the list has it so in the raid's tier (plan 8R-4, worked out when the DM goes
   * out, never stored on the raid).
   */
  private sighting(party: RaidParty): RaidSighting {
    const { gameData, raidBosses } = this.options;
    const shown = shownBoss(party, gameData.catalogue, raidBosses.bosses());
    const entry = shown?.entry;
    return {
      tier: party.raid.tier,
      boss: entry && { dex: entry.dex, key: entry.key, costumed: shown?.costumed === true },
    };
  }

  private announceRaid(
    party: RaidParty,
    event: RaidDmView['event'],
    actorId: string | null,
    include: {
      wants: boolean;
      gym: boolean;
      /** The raid has a boss it did not have: who is signed up and asked to hear it is told. */
      bossSet: boolean;
      /** That boss took the place of another one. */
      corrected: boolean;
    },
  ): void {
    const { forumChannelId, forumPostId, gymId } = party;
    // A raid is announced only once it has its post: the message links to it.
    if (forumChannelId === null || forumPostId === null) return;
    const { gyms, regions, gameData, raidBosses, wants, gymTargets, users, posts, log } =
      this.options;
    const sighting = this.sighting(party);
    const eventAt = this.now();
    const bossNow = party.raid.boss;
    let brief: { made?: PartyBrief | undefined } | undefined;
    this.announce({
      key: party.id,
      partyId: party.id,
      guild: party.guildId,
      channelId: forumChannelId,
      actorId,
      eventAt,
      expiresAt: party.endTime ?? party.lastPossibleTime ?? eventAt + RAID_NEWS_MS,
      gather: async (guildId) => {
        const wanting = new Map<string, readonly Want[]>();
        const targeting = new Set<string>();
        const awaiting = new Set<string>();
        // Each read by itself: one that fails does not keep the other's members from being told.
        if (include.wants) {
          try {
            for (const found of await wants.wanting(guildId, raidNumbers(sighting))) {
              wanting.set(found.memberId, found.wants);
            }
          } catch (err) {
            log.warn({ err, party: party.id }, 'could not read who wants a raid');
          }
        }
        if (include.gym && gymId !== null) {
          try {
            for (const id of await gymTargets.targeting(guildId, gymId)) targeting.add(id);
          } catch (err) {
            log.warn({ err, party: party.id }, 'could not read who targets a gym');
          }
        }
        if (include.bossSet && bossNow !== null) {
          try {
            const signedUp = membersWhere(party, (a) => a.status !== PartyStatus.Complete);
            const settings = await users.getMany(signedUp);
            for (const id of signedUp) {
              if (settings.get(id)?.bossSetNotification === true) awaiting.add(id);
            }
          } catch (err) {
            log.warn({ err, party: party.id }, 'could not read who waits for the boss of an egg');
          }
        }
        return {
          // Who is in the raid first: their message goes before the news for everybody else.
          ids: [...new Set([...awaiting, ...wanting.keys(), ...targeting])],
          reasonsOf: (id) => [
            ...(awaiting.has(id) && bossNow !== null
              ? [{ kind: 'boss-set' as const, boss: bossId(bossNow) }]
              : []),
            ...raidWantsFiring(gameData.catalogue, wanting.get(id) ?? [], sighting).map(wantReason),
            ...(targeting.has(id) && gymId !== null ? [{ kind: 'gym' as const, gymId }] : []),
          ],
        };
      },
      message: (guildId, reasons) => {
        // The post as it is when the first message is made, for all of them.
        brief ??= { made: this.briefOf(posts, party) };
        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
        const boss = shownBoss(party, gameData.catalogue, raidBosses.bosses())?.name;
        const gym = gymName(gymId === null ? undefined : gyms.get(gymId));
        const map = brief.made?.map;
        // Who is signed up is told what became of their egg, whatever else fires for them.
        const theirs = boss !== undefined && reasons.some((reason) => reason.kind === 'boss-set');
        const sentence = theirs
          ? bossSetSentence({
              boss,
              gym,
              regionChannelId: region?.channelId,
              hatched: raidStage(party, eventAt) !== 'egg',
              corrected: include.corrected,
            })
          : raidDmSentence({
              event,
              tier: party.raid.tier,
              boss,
              corrected: include.corrected,
              gym,
              regionChannelId: region?.channelId,
              reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
            });
        return notifyDm(
          {
            sentence,
            brief: brief.made,
            links: [
              postButton(postLink(guildId, forumPostId)),
              ...(map === undefined ? [] : [mapLink(map)]),
            ],
          },
          reasons.map((reason) => this.shown(guildId, reason)),
        );
      },
      priority: (reasons) =>
        reasons.some((reason) => reason.kind === 'boss-set')
          ? DM_PRIORITY.urgent
          : DM_PRIORITY.normal,
    });
  }

  private briefOf(posts: NotifyServiceOptions['posts'], party: Party): PartyBrief | undefined {
    try {
      return posts.briefOf(party);
    } catch (err) {
      this.options.log.warn({ err, party: party.id }, 'could not show a party in a direct message');
      return undefined;
    }
  }

  /**
   * A reason as the message names it, in the names of the member's own lists, with the button
   * that stops it in this server and the command that does the same; a Pokémon's or a tier's
   * with Manage… instead (plan 8R-4: `changeOf`), the box it fired by named after it, where the
   * want of a Pokémon in raids or spawns fired by `plainBox` (a raid's `Raids`, a spawn's
   * `Spawns`).
   */
  private shown(
    guildId: string,
    reason: NotifyReason,
    plainBox: 'Raids' | 'Spawns' = 'Raids',
  ): ShownReason {
    const { gameData, gyms } = this.options;
    const stop = stopButtonId(guildId, reason);
    const change = changeOf(gameData.catalogue, guildId, reason, plainBox);
    // What stops it; the hint of a Manage… without its button names `/want` too (`stopHint`).
    if (change) return { label: change.name, command: '/unwant', change };
    switch (reason.kind) {
      case 'want':
        return {
          label: plain(
            wantTargetLabel(gameData.catalogue, reason.target, reason.costumed === true),
          ),
          stop,
          command: '/unwant',
        };
      case 'gym':
        return {
          label: `raids at ${plain(gymName(gyms.get(reason.gymId)))}`,
          stop,
          command: '/untarget',
        };
      case 'boss-set':
        return { label: 'the boss of your eggs', stop, command: '/settings boss-set' };
      case 'new-train':
        return { label: 'new trains', stop, command: '/settings new-train' };
      case 'target':
        return {
          label: plain(targetReasonLabel(gameData.catalogue, reason.want)),
          stop,
          command: '/unwant',
        };
      case 'subject':
        return { label: 'that want', stop, command: '/unwant' };
    }
  }

  /** Has an event worked off on the side, after the earlier ones of its key. */
  private announce(event: Announcement): void {
    if (this.closed) return;
    const work = this.lines
      .run(event.key, () => this.deliver(event))
      .catch((err: unknown) => {
        this.options.log.error({ err, party: event.partyId }, 'could not tell members of an event');
      })
      .finally(() => this.background.delete(work));
    this.background.add(work);
  }

  private async guildSnowflake(rowId: number): Promise<string | undefined> {
    const known = this.snowflakes.get(rowId);
    if (known !== undefined) return known;
    const found = await this.options.guilds.snowflakeOf(rowId);
    if (found !== undefined) this.snowflakes.set(rowId, found);
    return found;
  }

  /** Whether an event is still worth telling: its party, if it has one, has not ended. */
  private alive(event: Announcement): boolean {
    return event.partyId === undefined || this.options.store.get(event.partyId) !== undefined;
  }

  /**
   * Those of the reasons that have not fired for this member in this party before; "your egg
   * has its boss" whenever its boss is another than the last one they were told.
   */
  private unsaid(
    partyId: string | undefined,
    memberId: string,
    reasons: NotifyReason[],
  ): NotifyReason[] {
    const said = partyId === undefined ? undefined : this.told.get(partyId)?.get(memberId);
    if (!said) return reasons;
    return reasons.filter((reason) =>
      reason.kind === 'boss-set'
        ? said.boss === undefined || said.boss !== reason.boss
        : !said.reasons.has(reasonKey(reason)),
    );
  }

  private remember(
    partyId: string | undefined,
    memberId: string,
    reasons: readonly NotifyReason[],
  ): void {
    if (partyId === undefined) return;
    let ofParty = this.told.get(partyId);
    if (!ofParty) {
      ofParty = new Map();
      this.told.set(partyId, ofParty);
    }
    let said = ofParty.get(memberId);
    if (!said) {
      said = { reasons: new Set(), boss: undefined };
      ofParty.set(memberId, said);
    }
    for (const reason of reasons) {
      if (reason.kind === 'boss-set') said.boss = reason.boss;
      else said.reasons.add(reasonKey(reason));
    }
  }

  private async deliver(event: Announcement): Promise<void> {
    const { members, dms, log } = this.options;
    // It waited behind other events of its party: ended, too late or shut down meanwhile. A
    // time to meet at is told at shutdown too: `close` announces those that waited for their
    // delay, and they ask nobody.
    if ((this.closed && !event.toAll) || !this.alive(event) || this.now() >= event.expiresAt) {
      return;
    }
    const guildId =
      typeof event.guild === 'string' ? event.guild : await this.guildSnowflake(event.guild);
    if (guildId === undefined) return;
    const { ids, reasonsOf } = await event.gather(guildId);
    /** The message per set of reasons; null for a set whose message could not be made. */
    const messages = new Map<string, OutgoingMessage | null>();
    let told = 0;
    for (let start = 0; start < ids.length; start += BATCH) {
      // The party ended meanwhile: nobody else is told, and nothing more is remembered.
      if (!this.alive(event)) return;
      // Looking members up can take minutes (the look-ups have a budget): a message that
      // would be dropped when its turn to be sent comes is not asked about any more.
      if (this.now() >= event.expiresAt) return;
      // Shutting down: the batch that was being asked about was put in line, no other begins,
      // not even the first of an event that was still reading who it is for.
      if (this.closed && !event.toAll) return;
      const firing = new Map<string, NotifyReason[]>();
      for (const id of ids.slice(start, start + BATCH)) {
        if (event.toAll) {
          if (id !== event.actorId) firing.set(id, []);
          continue;
        }
        const reasons = this.unsaid(event.partyId, id, reasonsOf(id));
        if (reasons.length === 0) continue;
        // Whoever caused it knows: not told, now or for these reasons later.
        if (id === event.actorId) this.remember(event.partyId, id, reasons);
        else firing.set(id, reasons);
      }
      if (firing.size > 0) {
        let seeing: ReadonlySet<string> | undefined;
        if (event.toAll) {
          seeing = new Set(firing.keys());
        } else {
          try {
            seeing = await members.viewers(guildId, event.channelId, [...firing.keys()]);
          } catch (err) {
            log.warn(
              { err, party: event.partyId, members: firing.size },
              'could not find out who can see an event; they are not told',
            );
          }
          if (!this.alive(event)) return;
        }
        for (const [id, reasons] of firing) {
          if (!seeing?.has(id)) continue;
          const key = [event.variant?.(id) ?? '', ...reasons.map(shownReasonKey)].join('\n');
          let message = messages.get(key);
          if (message === undefined) {
            // Made before anything is remembered: a member whose message could not be made
            // was not told, and the next event that fires the reason tells them.
            try {
              message = event.message(guildId, reasons, id);
            } catch (err) {
              message = null;
              log.warn(
                { err, party: event.partyId, reasons: reasons.map(reasonKey) },
                'could not make the direct message for an event',
              );
            }
            messages.set(key, message);
          }
          if (message === null) continue;
          if (!event.toAll) this.remember(event.partyId, id, reasons);
          dms.send({
            userId: id,
            message,
            priority: event.priority(reasons),
            eventAt: event.eventAt,
            expiresAt: event.expiresAt,
          });
          event.sent?.(id);
          told += 1;
        }
      }
      // The event loop gets its turn between the batches, whatever the fakes or caches answer.
      await nextTurn();
    }
    // Candidates and nobody told is worth a look when it keeps happening (nobody can see the
    // channel, or the look-ups fail): at info. Everything else is the usual course.
    const numbers = { party: event.partyId, candidates: ids.length, told };
    if (ids.length > 0 && told === 0) {
      log.info(numbers, 'an event had candidates and nobody was told');
    } else {
      log.debug(numbers, 'members were told');
    }
  }

  /** Announces the meeting times that wait for their delay now. For tests and `close`. */
  async flushMeetings(): Promise<void> {
    await this.meetings.flush();
  }

  /** Waits for every event that is being worked off. For tests; shutdown uses `close`. */
  async flush(): Promise<void> {
    await this.meetings.flush();
    while (this.background.size > 0) await Promise.all(this.background);
  }

  /**
   * For shutdown: the meeting times that wait for their delay are told now (they and the start
   * times already announced still go out: they ask nobody), and nothing is taken from then on,
   * a time to meet at from the very beginning (`closing`: one that came while the waiting ones
   * are told would be gathered and never sent);
   * an event that is being worked off puts the members it is asking about in line and begins no
   * other batch, one that has asked about nobody yet asks about nobody, and one that waits
   * behind another does not begin. Waits for that. (Not part of `flush`, which tests call
   * between events to wait for what is on its way.)
   */
  async close(): Promise<void> {
    this.closing = true;
    await this.flushMeetings();
    this.closed = true;
    while (this.background.size > 0) await Promise.all(this.background);
  }
}

/**
 * A new train's brief with the application's train emoji before the train's name, its first line
 * (plan 8M-11A, Matt's answers); as it was where there is no mark.
 */
function markedTrain(
  brief: PartyBrief | undefined,
  mark: string | undefined,
): PartyBrief | undefined {
  if (brief === undefined || mark === undefined) return brief;
  const [name, ...rest] = brief.lines;
  return name === undefined ? brief : { ...brief, lines: [`${mark} ${name}`, ...rest] };
}
