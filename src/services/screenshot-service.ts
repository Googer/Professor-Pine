import type { AppContext } from '../app-context.js';
import {
  decideMax,
  withMaxTyped,
  withSpot,
  TYPED_BOSS_REFUSED,
  type MaxDecision,
  type MaxTyped,
} from '../domain/ocr/max-decision.js';
import {
  maxTierObservation,
  momentTooOld,
  raidTierObservation,
  type ListTierSighting,
} from '../domain/ocr/list-tier-doubt.js';
import { maxScreenshotReport, type MaxScreenshotReport } from '../domain/ocr/max-report.js';
import {
  decide,
  withTyped,
  type ScreenshotDecision,
  type TypedValues,
} from '../domain/ocr/screenshot-decision.js';
import {
  storedMaxTyped,
  storedReport,
  type Feedback,
  type StoredDecision,
  type StoredReport,
  type ScreenshotUse,
  type StoredTyped,
} from '../domain/ocr/screenshot-record.js';
import { raidDurationKind, type RaidTier } from '../domain/pogo/raid-tier.js';
import { raidDurationRules, raidDurationsAt } from '../domain/time/raid-durations.js';
import type { Box, TextLine } from '../domain/ocr/image.js';
import { paneSide, type PaneSide } from '../domain/ocr/panes.js';
import type { ScreenReading } from '../ocr/screen-reader.js';
import { screenshotReport, type ScreenshotReport } from '../domain/ocr/screenshot-report.js';
import { TWO_SCREENS } from '../render/screenshot-reading.js';
import type { AttachmentGateway } from './attachment-gateway.js';
import { MAX_SCREENSHOT_BYTES, type ScreenshotReader } from './ocr-service.js';
import { maxReportContext, reportContext } from './screenshot-context.js';
import type { KeptScreenshot, NewScreenshot, ScreenshotKeeping } from './screenshot-store.js';
import type { ListTierWatch } from './list-tier-watch.js';

/** The images of one message that are read, in order: as many as Discord allows a message. */
export const MAX_IMAGES_PER_MESSAGE = 10;
/** How long the download of one screenshot from Discord may take. */
const DOWNLOAD_MS = 30_000;
const IMAGE_NAME = /\.(?:png|jpe?g|webp)$/i;

/** An attachment of a message or an interaction, as discord.js has it. */
export interface ScreenshotSource {
  url: string;
  name: string;
  contentType: string | null;
  size: number;
}

/** Whether an attachment is a picture: by its content type, or by its name when it has none. */
export function isImageAttachment(source: Pick<ScreenshotSource, 'name' | 'contentType'>): boolean {
  return source.contentType
    ? source.contentType.startsWith('image/')
    : IMAGE_NAME.test(source.name);
}

/** The pictures of a message that are read: the first `MAX_IMAGES_PER_MESSAGE`, in order. */
export function screenshotsOf<T extends ScreenshotSource>(attachments: Iterable<T>): T[] {
  return [...attachments].filter(isImageAttachment).slice(0, MAX_IMAGES_PER_MESSAGE);
}

/** Where a screenshot came from and who sent it. */
export interface ScreenshotWhere {
  /** The server's snowflake and its row (`ctx.guilds.idFor`). */
  guildId: string;
  guildRow: number;
  /** The region channel it was sent in (the gym search is that region's); null outside one. */
  channelId: string | null;
  /** When the message or interaction that brought it was made. */
  uploadedAt: number;
  /**
   * When it is read, where that is later than `uploadedAt` (plan 7M: a message read from its
   * Apps menu a while after it was posted): the screenshot's moment is told from the upload as
   * ever, and what is over is over by this time (the report's `time-past`, the decision's
   * `now`). Absent: the upload's time, as for a mention, read as it is posted.
   */
  readAt?: number;
  use: ScreenshotUse;
  senderId: string;
  /**
   * The member who posted the picture, where another sent it to be read (plan 7M: "Read
   * screenshot" on somebody's message; review F1): a sighting against the boss lists is theirs,
   * so that one picture read for several members counts once. Absent: the sender posted it.
   */
  postedBy?: string;
  /**
   * What the member typed beside it (`/raid`), in the place of what is read; a function of the
   * report for what can only be read once the report is known (a typed time is a hatch or an end
   * by the stage).
   */
  typed?: TypedValues | ((report: ScreenshotReport) => TypedValues);
  /**
   * What the member typed beside a max battle's screenshot (`/max screenshot:`, review S-5), in
   * the place of what is read, as a function of the max report (a boss typed without a tier takes
   * the screen's); `null` when nothing could be read (two screens it could not tell apart, plan
   * 7P), so what was typed stands alone.
   */
  maxTyped?: (report: MaxScreenshotReport | null) => MaxTypedUse;
  /** Told once when the screenshot has to wait, with how many are ahead. */
  onQueued?: (ahead: number) => void;
  /**
   * A screenshot whose turn in the reader comes after this time is answered `busy` (its
   * interaction could no longer be answered).
   */
  startBy?: number;
  /**
   * The kind of screen the caller reports (`/raid` a raid's, `/max` a max battle's): a pane of
   * the other kind is decided but not kept (plan 7P). Absent: both kinds (a mention).
   */
  screen?: 'raid' | 'max';
  /**
   * Asked once for every pane after the first that shows a screen (plan 7P), after the read:
   * whether it may be read (a mention's throttle takes a use of its own for it). False: nothing
   * of that pane is decided or kept, and `PanesOutcome.held` counts it.
   */
  anotherPane?: () => boolean;
}

/** Where a pane stands in a split screenshot (plan 7P): 1 the top or left one, of how many. */
export interface PanePlace {
  index: number;
  of: number;
  box: Box;
  /** Where it stands: the top or bottom one of a split above and below, else left or right. */
  side: PaneSide;
}

/**
 * What was typed beside a max battle's screenshot, as the screen lets it be used
 * (`ScreenshotWhere.maxTyped`). `typed`: what stands in the place of what was read (none when
 * absent). `refused`: a typed boss the screen cannot take, so the use fails (the caller says why):
 * `tier` when the screen does not tell the tier of a boss on no list (kept as asked about the
 * tier), `boss` when the boss cannot battle as the screen shows (kept as refused,
 * `TYPED_BOSS_REFUSED`); either way the record goes to review (review F-3).
 */
export interface MaxTypedUse {
  typed?: MaxTyped;
  refused?: 'tier' | 'boss';
}

/**
 * What came of a screenshot. One that was read says which kind of screen it was (`screen`, plan
 * 8X-S): a raid's with the raid report and decision and `withGym`, a max battle's with the max
 * report and decision and `withSpot`. What a caller expects is the caller's: it refuses the
 * other kind itself.
 */
export type ScreenshotOutcome =
  | {
      kind: 'read';
      screen: 'raid';
      /** The kept screenshot's id; undefined when it was not kept. */
      id: string | undefined;
      /** The pane of a split screenshot it was read from (plan 7P); absent for one screen. */
      pane?: PanePlace;
      report: ScreenshotReport;
      decision: ScreenshotDecision;
      /**
       * The decision had the member named this gym (a question about the gym answered, or a
       * gym typed beside the screenshot): what the raid would be.
       */
      withGym: (gymId: number) => ScreenshotDecision;
    }
  | {
      kind: 'read';
      screen: 'max';
      /** The kept screenshot's id; undefined when it was not kept. */
      id: string | undefined;
      /** The pane of a split screenshot it was read from (plan 7P); absent for one screen. */
      pane?: PanePlace;
      /** The max report with what was typed put in (`maxTyped`), which was decided. */
      report: MaxScreenshotReport;
      /** The reader's own max report, without what was typed (what it read). */
      read: MaxScreenshotReport;
      decision: MaxDecision;
      /**
       * The decision had the member chosen this Power Spot (its Wayfarer id; the spot question
       * answered): one the server does not have decides as nothing chosen.
       */
      withSpot: (spotId: string) => MaxDecision;
    }
  /** Larger than a screenshot can be. */
  | { kind: 'too-large' }
  /** The download from Discord failed. */
  | { kind: 'download-failed' }
  | { kind: 'not-an-image' }
  | { kind: 'busy' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  /**
   * The picture shows two screens that could not be told apart (plan 7P, `twoScreens` without
   * a kept cut): refused rather than read as one, raids and max battles alike.
   */
  | { kind: 'two-screens' };

/** A screenshot read: one screen's outcome, or a pane's. */
export type ReadOutcome = Extract<ScreenshotOutcome, { kind: 'read' }>;

/**
 * What came of a screenshot that may show two screens (plan 7P): an outcome per pane that shows
 * one (a screenshot of one screen is one), top or left first; `held` panes were not read for
 * want of a use (`ScreenshotWhere.anotherPane`). Or why nothing was read.
 */
export type PanesOutcome =
  | { kind: 'panes'; panes: ReadOutcome[]; held: number }
  | Exclude<ScreenshotOutcome, { kind: 'read' }>;

/**
 * A screenshot downloaded ahead of its reading (plan 8R-9F, B2: a picture posted in the region's
 * board is downloaded, its message deleted, then read from these bytes).
 */
export interface FetchedScreenshot extends ScreenshotSource {
  bytes: Uint8Array;
}

/** What `Screenshots.fetch` had of a screenshot. */
export type FetchOutcome =
  | { kind: 'fetched'; screenshot: FetchedScreenshot }
  | { kind: 'too-large' }
  | { kind: 'download-failed' };

/** Screenshots on Discord: read, reported on, kept, and what members say of them. */
export interface Screenshots {
  /**
   * A screenshot read: each pane of a split one (plan 7P) decided and kept as a screenshot of
   * its own; one screen is one pane. Downloaded now, or ahead by `fetch`.
   */
  readPanes(
    source: ScreenshotSource | FetchedScreenshot,
    where: ScreenshotWhere,
  ): Promise<PanesOutcome>;
  /** Downloads a screenshot to be read later (plan 8R-9F, B2), within `MAX_SCREENSHOT_BYTES`. */
  fetch(source: ScreenshotSource): Promise<FetchOutcome>;
  /**
   * Whether the reader has no room just now (`ScreenshotReader.full`): a screenshot would be
   * answered `busy`. Asked before pictures are downloaded ahead of their reading (plan 8Z-2).
   */
  full(): boolean;
  /** The kept screenshot; `gone` when its file vanished. */
  get(id: string): Promise<KeptScreenshot | 'gone' | undefined>;
  /** A raid's post shows the screenshot: it is kept while the raid lasts. */
  inUse(id: string): Promise<void>;
  /** The gym the member chose when they were asked. */
  picked(id: string, gymId: number): Promise<void>;
  /** The Power Spot (its Wayfarer id) the member chose when they were asked. */
  pickedSpot(id: string, spotId: string): Promise<void>;
  feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'>;
}

export interface ScreenshotServiceOptions {
  attachments: AttachmentGateway;
  reader: ScreenshotReader;
  store: ScreenshotKeeping;
  /**
   * What the reports need of the bot: the raid and max bosses, the events, the gyms, the Power
   * Spots, the regions, the Pokémon search and catalogue, the settings.
   */
  context: ScreenshotContext;
  /**
   * Told what each screenshot's own reading says against the boss lists (plan 8X-J,
   * `ListTierWatch`): every read, the passive ones refused included, at its upload time.
   */
  tierWatch?: Pick<ListTierWatch, 'observe'>;
}

/** What `ScreenshotService` reads of the bot (`ScreenshotServiceOptions.context`). */
export type ScreenshotContext = Pick<
  AppContext,
  | 'raidBosses'
  | 'raidEvents'
  | 'gyms'
  | 'regions'
  | 'config'
  | 'maxBosses'
  | 'wayspots'
  | 'pokemon'
  | 'gameData'
>;

/**
 * A screenshot from Discord to what Pine makes of it: downloaded (`AttachmentGateway`, at most
 * `MAX_SCREENSHOT_BYTES`, and only when the reader's queue has room: `busy` otherwise), read (`ScreenshotReader`), reported on (`screenshotReport` in the
 * channel's region, the time also from the file's name), what the member typed put in, decided
 * (`decide`) and kept (`ScreenshotStore`). A passive read that was refused is not kept: it is a
 * member's ordinary picture. Nothing about what a screenshot shows is logged.
 */
export class ScreenshotService implements Screenshots {
  constructor(private readonly options: ScreenshotServiceOptions) {}

  async fetch(source: ScreenshotSource): Promise<FetchOutcome> {
    if (source.size > MAX_SCREENSHOT_BYTES) return { kind: 'too-large' };
    const download = await this.options.attachments.download(source.url, {
      maxBytes: MAX_SCREENSHOT_BYTES,
      timeoutMs: DOWNLOAD_MS,
    });
    if (!download.ok) {
      return download.reason === 'too-large' ? { kind: 'too-large' } : { kind: 'download-failed' };
    }
    return { kind: 'fetched', screenshot: { ...source, bytes: download.bytes } };
  }

  full(): boolean {
    return this.options.reader.full();
  }

  async readPanes(
    source: ScreenshotSource | FetchedScreenshot,
    where: ScreenshotWhere,
  ): Promise<PanesOutcome> {
    const { reader, store, context } = this.options;
    if (source.size > MAX_SCREENSHOT_BYTES) return { kind: 'too-large' };
    // Nothing is downloaded that the reader would turn away.
    if (reader.full()) return { kind: 'busy' };
    let download: { bytes: Uint8Array };
    if ('bytes' in source) {
      download = source;
    } else {
      const fetched = await this.fetch(source);
      if (fetched.kind !== 'fetched') return fetched;
      download = fetched.screenshot;
    }
    const outcome = await reader.read(download.bytes, {
      ...(where.onQueued ? { onQueued: where.onQueued } : {}),
      ...(where.startBy === undefined ? {} : { startBy: where.startBy }),
    });
    if (outcome.kind !== 'read') return outcome;
    if (!outcome.panes && outcome.twoScreens) {
      // Two screens that could not be told apart (plan 7P): refused, never read as one. Kept
      // for review as any refusal is, but read passively (a member's ordinary picture).
      if (where.use !== 'passive') {
        const reportFrom = reportContext(
          context,
          where,
          where.uploadedAt,
          source.name,
          where.readAt,
        );
        const read = screenshotReport(outcome.reading, reportFrom);
        // What was typed beside it, kept as a single screen's is.
        const typed = typeof where.typed === 'function' ? where.typed(read) : where.typed;
        // Nothing of the reading reaches what was typed (review S1): it stands alone.
        const maxTyped = where.maxTyped?.(null).typed;
        await store.keep(download.bytes, {
          guildId: where.guildId,
          use: where.use,
          senderId: where.senderId,
          uploadedAt: where.uploadedAt,
          fileTakenAt: reportFrom.fileTakenAt ?? null,
          timeFrom: read.timeFrom,
          reading: keptReading(outcome.reading),
          report: storedReport(read),
          typed: typed ? storedTyped(typed) : null,
          ...(maxTyped ? { maxTyped: storedMaxTyped(maxTyped) } : {}),
          decision: { kind: 'refuse', reason: 'two-screens' },
          bosses: this.bossSnapshot(),
        });
      }
      return { kind: 'two-screens' };
    }
    // A pane with no screen (a map, a chat) is left out; one screenshot is one pane.
    const all = outcome.panes;
    const screens = all
      ? all
          .filter((pane) => pane.shows === 'raid' || pane.shows === 'max')
          .map((pane) => ({
            reading: pane.reading,
            place: { index: pane.index, of: pane.of, box: pane.box, side: paneSide(pane, all) },
          }))
      : [{ reading: outcome.reading, place: undefined }];
    const panes: ReadOutcome[] = [];
    let held = 0;
    let first: string | undefined;
    // A pane the caller does not report is not kept, when one it reports is beside it.
    const kindOf = (reading: ScreenReading) => (reading.text.max ? 'max' : 'raid');
    const callerHas = screens.some((screen) => kindOf(screen.reading) === where.screen);
    const several = screens.filter((screen) => kindOf(screen.reading) === where.screen).length > 1;
    for (const [i, screen] of screens.entries()) {
      if (i > 0 && where.anotherPane && !where.anotherPane()) {
        held++;
        continue;
      }
      const one = await this.readScreen(download.bytes, screen.reading, screen.place, where, {
        fileName: source.name,
        alongside: first,
        keep: !callerHas || kindOf(screen.reading) === where.screen,
        several,
      });
      first ??= one.id;
      panes.push(one);
    }
    return { kind: 'panes', panes, held };
  }

  /** The raid bosses of the moment, as a record keeps them. */
  private bossSnapshot(): { key: string; name: string; tier: RaidTier }[] {
    return this.options.context.raidBosses
      .bosses()
      .map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier }));
  }

  /**
   * One screen of a screenshot (a pane of a split one, plan 7P, at `place`): reported on,
   * decided and kept (`file.keep`: not a pane of the kind the caller does not report beside one
   * it does), and another pane's file is a link of the first's (`alongside`).
   */
  private async readScreen(
    bytes: Uint8Array,
    reading: ScreenReading,
    place: PanePlace | undefined,
    where: ScreenshotWhere,
    file: { fileName: string; alongside: string | undefined; keep: boolean; several: boolean },
  ): Promise<ReadOutcome> {
    const { store, context } = this.options;
    const reportFrom = reportContext(
      context,
      { channelId: where.channelId, guildRow: where.guildRow },
      where.uploadedAt,
      file.fileName,
      where.readAt,
    );
    const read = screenshotReport(reading, reportFrom);
    const keep = (record: NewScreenshot, image?: boolean) =>
      store.keep(
        bytes,
        {
          ...record,
          ...(place ? { pane: place } : {}),
          // Two panes of the caller's one kind: the caller refuses both (Matt's Q1).
          ...(file.several ? { decision: { kind: 'refuse' as const, reason: 'several' } } : {}),
        },
        image,
        file.alongside,
      );
    if (reading.text.max) {
      const max = await this.readMax(reading, read, where, file.fileName, (record) =>
        file.keep ? keep(record) : Promise.resolve(undefined),
      );
      return place ? { ...max, pane: place } : max;
    }
    // The reader's own reading against the raid boss list (review B1), never what was typed.
    const sighting = raidTierObservation(read, reportFrom);
    if (sighting) {
      const { gymId } = read.gym;
      this.observe(
        where,
        read,
        gymId === null ? (read.gym.read ?? '') : `g${String(gymId)}`,
        sighting,
      );
    }
    const typed = typeof where.typed === 'function' ? where.typed(read) : where.typed;
    const report = typed ? withTyped(read, typed) : read;
    const { settings } = context.config;
    const deciding = {
      now: where.readAt ?? where.uploadedAt,
      uploadedAt: where.uploadedAt,
      hatchedMinutes: (tier: RaidTier, hatchTime: number) =>
        raidDurationsAt(
          raidDurationKind(tier),
          hatchTime,
          raidDurationRules(settings, context.raidEvents.events()),
        ).hatched,
      autoset: (tier: RaidTier) => context.raidBosses.autoset(tier),
    };
    const decision = decide(report, deciding);
    const withGym = (gymId: number) => decide(withTyped(report, { gymId }), deciding);
    // A passive read that was refused is a member's ordinary picture: nothing is kept. A
    // picture that is no raid screen keeps its record alone.
    const passiveRefusal = where.use === 'passive' && decision.kind === 'refuse';
    const image = !(decision.kind === 'refuse' && decision.reason === 'not-a-raid-screen');
    const id =
      passiveRefusal || !file.keep
        ? undefined
        : await keep(
            {
              guildId: where.guildId,
              use: where.use,
              senderId: where.senderId,
              uploadedAt: where.uploadedAt,
              fileTakenAt: reportFrom.fileTakenAt ?? null,
              timeFrom: read.timeFrom,
              reading: keptReading(reading, image),
              // The reader's own report: it is judged by what it read, never by what was typed.
              report: image ? storedReport(read) : withoutText(storedReport(read)),
              typed: typed ? storedTyped(typed) : null,
              decision: decision.kind === 'report' ? { kind: 'report' } : storedDecision(decision),
              bosses: this.bossSnapshot(),
            },
            image,
          );
    return {
      kind: 'read',
      screen: 'raid',
      id,
      report,
      decision,
      withGym,
      ...(place ? { pane: place } : {}),
    };
  }

  /**
   * A max battle's screen (plan 8X-S): the max report (`maxScreenshotReport`) over the server's
   * Power Spots and the max bosses, decided (`decideMax`) and kept (`keep`) beside the raid
   * report of it (review R5), picture and text, as a raid's; a passive refusal keeps nothing.
   */
  private async readMax(
    reading: ScreenReading,
    raidRead: ScreenshotReport,
    where: ScreenshotWhere,
    fileName: string,
    keep: (record: NewScreenshot) => Promise<string | undefined>,
  ): Promise<Extract<ScreenshotOutcome, { kind: 'read'; screen: 'max' }>> {
    const { context } = this.options;
    const maxFrom = maxReportContext(
      context,
      { channelId: where.channelId, guildRow: where.guildRow },
      where.uploadedAt,
      fileName,
    );
    const read = maxScreenshotReport(reading, maxFrom);
    // The reader's own reading against the max boss list, never what was typed (review I4).
    const sighting = maxTierObservation(read, maxFrom.bosses, context.gameData.catalogue);
    if (sighting) {
      const { match } = read.spot;
      this.observe(
        where,
        read,
        match.kind === 'clear' ? match.spot.id : (read.spot.read ?? ''),
        sighting,
      );
    }
    // What was typed stands in the place of what was read, and is kept apart (review S-5).
    const use = where.maxTyped?.(read) ?? {};
    const { typed } = use;
    const report = typed ? withMaxTyped(read, typed) : read;
    const deciding = { now: where.readAt ?? where.uploadedAt, uploadedAt: where.uploadedAt };
    const decision = decideMax(report, deciding);
    // A typed boss the screen could not take failed the use: kept as such, so it goes to review.
    const stored: StoredDecision =
      use.refused === 'boss'
        ? { kind: 'refuse', reason: TYPED_BOSS_REFUSED }
        : use.refused === 'tier'
          ? { kind: 'ask', doubts: ['tier-unknown'] }
          : decision.kind === 'report'
            ? { kind: 'report' }
            : storedDecision(decision);
    const withSpotOf = (spotId: string): MaxDecision => {
      const spot = maxFrom.spots.find((one) => one.id === spotId);
      return spot ? decideMax(withSpot(report, spot), deciding) : decision;
    };
    // Read passively, a refusal, or a screen without a countdown (which passive reading leaves
    // alone: an event's picture of a boss, review S-1), is a member's ordinary picture.
    const id =
      where.use === 'passive' && (decision.kind === 'refuse' || read.countdown === null)
        ? undefined
        : await keep({
            guildId: where.guildId,
            use: where.use,
            senderId: where.senderId,
            uploadedAt: where.uploadedAt,
            fileTakenAt: maxFrom.fileTakenAt ?? null,
            timeFrom: read.timeFrom,
            reading: keptReading(reading),
            report: storedReport(raidRead),
            // The reader's own report: it is judged by what it read, never by what was typed.
            max: read,
            typed: null,
            ...(typed ? { maxTyped: storedMaxTyped(typed) } : {}),
            decision: stored,
            bosses: this.bossSnapshot(),
            maxBosses: maxFrom.bosses.map((boss) => ({
              key: boss.key,
              name: boss.name,
              tier: boss.tier,
            })),
          });
    return { kind: 'read', screen: 'max', id, report, read, decision, withSpot: withSpotOf };
  }

  get(id: string): Promise<KeptScreenshot | 'gone' | undefined> {
    return this.options.store.get(id);
  }

  /**
   * Tells the watch what a screenshot says against a boss list (plan 8X-J): who posted it (the
   * picture's poster, `postedBy`, where another member had it read: plan 7M, review F1), the
   * gym or Power Spot it showed (`place`, so that one file posted twice counts once), where and
   * when it was uploaded.
   */
  private observe(
    where: ScreenshotWhere,
    moment: { takenAt: number; timeFrom: 'file' | 'clock' | 'upload' },
    place: string,
    sighting: ListTierSighting,
  ): void {
    if (momentTooOld(moment, where.uploadedAt)) return;
    this.options.tierWatch?.observe(
      {
        serverId: where.guildId,
        channelId: where.channelId,
        memberId: where.postedBy ?? where.senderId,
        place,
        at: where.uploadedAt,
      },
      sighting,
    );
  }

  picked(id: string, gymId: number): Promise<void> {
    return this.options.store.picked(id, gymId);
  }

  pickedSpot(id: string, spotId: string): Promise<void> {
    return this.options.store.pickedSpot(id, spotId);
  }

  inUse(id: string): Promise<void> {
    return this.options.store.inUse(id);
  }

  feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'> {
    return this.options.store.feedback(id, memberId, feedback);
  }
}

/** A status-bar line kept in a record: one that starts with a clock, or a short one. */
const CLOCK_LIKE = /^\D{0,2}\d{1,2}[:.]\d{2}(?!\d)/;
const SHORT_LINE = 8;

/**
 * The reading as it is kept: of the status bar's lines only those that start with a clock or are
 * short (a notification's preview is somebody's message). Of a picture that is no raid screen
 * (`raidScreen` false: a member's ordinary picture) no text at all: the lines keep their boxes
 * and confidences.
 */
export function keptReading(reading: ScreenReading, raidScreen = true): ScreenReading {
  const status = reading.status.filter(
    (line) => CLOCK_LIKE.test(line.text) || line.text.length <= SHORT_LINE,
  );
  if (raidScreen) return { ...reading, status };
  const blank = (line: TextLine): TextLine => ({ ...line, text: '' });
  return {
    ...reading,
    text: { ...reading.text, gym: null, bossName: null },
    lines: reading.lines.map(blank),
    status: reading.status.map(blank),
  };
}

/** The report of a picture that is no raid screen, without the texts read off it. */
function withoutText(report: StoredReport): StoredReport {
  return { ...report, gym: { ...report.gym, read: null, searched: null }, bossName: null };
}

function storedTyped(typed: TypedValues): StoredTyped {
  return {
    ...(typed.gymId === undefined ? {} : { gymId: typed.gymId }),
    ...(typed.boss
      ? {
          boss: {
            tier: typed.boss.tier,
            key: typed.boss.boss?.key ?? null,
            hatched: typed.boss.hatched,
          },
        }
      : {}),
    ...(typed.time ? { time: typed.time } : {}),
  };
}

function storedDecision(
  decision:
    Exclude<ScreenshotDecision, { kind: 'report' }> | Exclude<MaxDecision, { kind: 'report' }>,
): { kind: 'ask'; doubts: string[] } | { kind: 'refuse'; reason: string } {
  return decision.kind === 'ask'
    ? { kind: 'ask', doubts: [...decision.doubts] }
    : { kind: 'refuse', reason: decision.reason };
}

/**
 * What a member is told when a screenshot could not be read at all; `what` the command that
 * reports without one (`/max` for a max battle's screenshot, review R14).
 */
export function unreadWords(
  outcome: Exclude<ScreenshotOutcome, { kind: 'read' }>,
  what: 'raid' | 'max' = 'raid',
): string {
  const instead =
    what === 'max'
      ? 'report the max battle with `/max` and its options'
      : 'report the raid with `/raid` and its options';
  switch (outcome.kind) {
    case 'too-large':
      return 'That file is too large to be a screenshot.';
    case 'download-failed':
      return 'I could not download that screenshot from Discord. Try again in a moment.';
    case 'not-an-image':
      return 'That is not a screenshot I can read: send a PNG, JPEG or WebP of a phone’s screen.';
    case 'busy':
      return 'Too many screenshots are waiting to be read just now. Try again shortly.';
    case 'unavailable':
      return `I cannot read screenshots at the moment. ${instead[0]?.toUpperCase() ?? ''}${instead.slice(1)}.`;
    case 'failed':
      return `Reading that screenshot went wrong. Try again, or ${instead}.`;
    case 'two-screens':
      return TWO_SCREENS;
  }
}
