import { randomBytes } from 'node:crypto';
import { copyFile, link, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BoundedMap } from '../bounded-map.js';
import { imageFormat, type Box } from '../domain/ocr/image.js';
import type { PaneSide } from '../domain/ocr/panes.js';
import {
  memberLabel,
  type Feedback,
  type FeedbackRecord,
  type MemberLabel,
  type ScreenshotUse,
  type StoredDecision,
  type StoredMaxBoss,
  type StoredMaxReport,
  type StoredReport,
  type StoredMaxTyped,
  type StoredTyped,
} from '../domain/ocr/screenshot-record.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import type { ScreenReading } from '../ocr/screen-reader.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';
import { moveIntoPlace } from './image-cache.js';

const DAY_MS = 24 * 3_600_000;
const MB = 1024 * 1024;

/**
 * What is kept beside a screenshot as `<id>.json`, in `held/` and, for review, in `review/`.
 * Version 1. For staff and development only: it holds the snowflakes of the member who sent
 * the screenshot and of those who said something about it (Matt, 2026-10-14), which never go
 * into a commit or a printout.
 */
export interface ScreenshotRecord {
  v: 1;
  id: string;
  /**
   * The screenshot's file beside it (`<id>.png`, `.jpg` or `.webp`); null when only the record
   * is kept (a picture that is no raid screen: a member's ordinary picture).
   */
  file: string | null;
  readAt: number;
  /** The server it was sent in. */
  guildId: string;
  use: ScreenshotUse;
  /** The member who sent it. */
  senderId: string;
  /**
   * The member who posted the picture, where another sent it to be read ("Read screenshot" on
   * somebody's message, plan 7M, review F7): they keep the view of their own picture
   * (`mayLookAt`). Absent: the sender posted it, and in records before it.
   */
  posterId?: string;
  /** When the message or interaction that brought it was made. */
  uploadedAt: number;
  /** When it was taken by the name of its file, when that was read (`takenAtFromFileName`). */
  fileTakenAt: number | null;
  /** What the report's time was taken from. */
  timeFrom: 'file' | 'clock' | 'upload';
  /**
   * What the reader saw: the lines with their boxes, the heads, the purple; of the status bar
   * only the lines that look like a clock or are short (notification previews are left out).
   */
  reading: ScreenReading;
  /**
   * What the reader made of it by itself as a raid's screen (of a max battle's screen too: that
   * it is none, `not-a-raid-screen`).
   */
  report: StoredReport;
  /**
   * What the reader made of a max battle's screen by itself (plan 8X-S, review R5); absent on
   * any other, and in records read before it. A record that has it is judged by it.
   */
  max?: StoredMaxReport;
  /** What the member typed beside it (`/raid`), which the decision put in its place. */
  typed: StoredTyped | null;
  /**
   * What the member typed beside a max battle's screen (`/max screenshot:`, review S-5), which
   * the decision put in its place; absent when nothing was, and in records read before it.
   */
  maxTyped?: StoredMaxTyped;
  /** What was decided, from the report with what was typed. */
  decision: StoredDecision;
  /** The gym the member chose when they were asked. */
  pickedGymId: number | null;
  /** The Power Spot (its Wayfarer id) the member chose when they were asked (plan 8X-S). */
  pickedSpotId?: string;
  /** The raid bosses in effect at the read, which the boss was decided among (`ocr:check`). */
  bosses: { key: string; name: string; tier: RaidTier }[];
  /** The max bosses in effect at the read of a max battle's screen, its boss decided among. */
  maxBosses?: StoredMaxBoss[];
  /** When the files go; null while a raid made from it is active (its post shows it). */
  keepUntil: number | null;
  feedback: FeedbackRecord[];
  /** The answer key `ocr:check` scores it by, once a member said the reading was right. */
  label?: MemberLabel;
  /**
   * The pane of a split screenshot this record is of (plan 7P): 1 the top or left one, of how
   * many, where in the picture (its pixels). Its file is the whole picture, a hard link of the
   * first pane's; `reading` is the pane's own. Absent on a screenshot of one screen.
   */
  pane?: { index: number; of: number; box: Box; side: PaneSide };
}

/** What a caller gives to keep a screenshot; the store adds the id, the file and the times. */
export type NewScreenshot = Omit<
  ScreenshotRecord,
  'v' | 'id' | 'file' | 'readAt' | 'keepUntil' | 'feedback' | 'label' | 'pickedGymId'
>;

/** A screenshot that is kept: its record and where its file is (none for a record alone). */
export interface KeptScreenshot {
  record: ScreenshotRecord;
  path: string | undefined;
}

/** What the rest of the bot asks of the store (`ScreenshotStore`; tests use it over a folder). */
export interface ScreenshotKeeping {
  /**
   * `image: false` keeps the record alone. `alongside`: the id of a screenshot kept of the same
   * picture (another pane of it, plan 7P), whose file this one's is a hard link of (a copy where
   * the file system refuses links).
   */
  keep(
    bytes: Uint8Array,
    screenshot: NewScreenshot,
    image?: boolean,
    alongside?: string,
  ): Promise<string | undefined>;
  get(id: string): Promise<KeptScreenshot | 'gone' | undefined>;
  /** The screenshot is shown by an active raid's post: kept while that lasts. */
  inUse(id: string): Promise<void>;
  /** The gym the member chose when asked. */
  picked(id: string, gymId: number): Promise<void>;
  /** The Power Spot (its Wayfarer id) the member chose when asked. */
  pickedSpot(id: string, spotId: string): Promise<void>;
  feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'>;
  sweep(): Promise<void>;
}

export interface ScreenshotStoreOptions {
  /** The folder under which `held/` and `review/` are kept: `var/ocr`. */
  dir: string;
  /** How long a screenshot kept for review stays (`settings.ocr.reviewDays`). */
  reviewDays: number;
  /** How many megabytes both folders may hold together (`settings.ocr.keepMegabytes`). */
  keepMegabytes: number;
  /** How many screenshots of one server go to review a day (`settings.ocr.reviewPerDay`). */
  reviewPerDay: number;
  /** The ids of the screenshots active parties show (their raids' `screenshot.id`). */
  shown: () => ReadonlySet<string>;
  /** The own name of a gym (what the game shows, not a nickname), for a sample's answer key. */
  gymName: (gymId: number) => string | undefined;
  log: Logger;
  now?: () => number;
  /** How a review copy is linked to its held file (`fs.link`; tests make it fail). */
  link?: (from: string, to: string) => Promise<void>;
  /** Puts a written record in its place. Default `rename` of `node:fs/promises`; for tests. */
  rename?: (from: string, to: string) => Promise<void>;
  /** The pause before a refused rename is tried again. Default 50 ms. */
  renamePauseMs?: number;
}

const ID = /^[A-Za-z0-9_-]{12}$/;
/** Whose the bytes of a file without a readable record are: no server's (no snowflake is empty). */
const NO_SERVER = '';

/**
 * The reader's own doubts of a record: a max battle's screen by its max report (its raid report
 * always says it is no raid screen), any other by its raid report.
 */
function ownDoubts(record: Pick<ScreenshotRecord, 'report' | 'max'>): readonly string[] {
  return record.max ? record.max.doubts : record.report.doubts;
}

/**
 * A screenshot worth keeping longest (Matt, 2026-10-14): one that was not reported unasked,
 * raised a doubt of the reader's own (`ownDoubts`), or that somebody said was read wrong. "All
 * right" is no issue.
 */
export function hasIssue(
  record: Pick<ScreenshotRecord, 'decision' | 'report' | 'max' | 'feedback'>,
): boolean {
  return (
    record.decision.kind !== 'report' ||
    ownDoubts(record).length > 0 ||
    record.feedback.some((f) => f.verdict === 'wrong')
  );
}

/**
 * Whether a record is a member's own for their removal (plan 8G): they sent it, or posted the
 * picture another member had read (plan 7M, `posterId`). Either way record and picture go.
 */
function theirs(record: Pick<ScreenshotRecord, 'senderId' | 'posterId'>, memberId: string) {
  return record.senderId === memberId || record.posterId === memberId;
}

/** Twelve URL-safe characters: the id of a screenshot, in file names and custom ids. */
export function newScreenshotId(): string {
  return randomBytes(9).toString('base64url');
}

/**
 * The screenshots Pine read, kept on disk (`var/ocr/`): every one in `held/` with its record,
 * for a day (a raid's for a day after the raid ended); a copy in `review/` of every one that
 * was refused or asked about, that the reader itself had a doubt about (its own report's
 * `doubts`, not what was typed), or that a member said something about, kept `reviewDays`, at
 * most `reviewPerDay` of one server a day. A copy is a hard link where the file system allows
 * one, so a screenshot in both folders takes its bytes once. Both folders hold at most
 * `keepMegabytes` together: beyond it, the server keeping the most gives way first (plan
 * 19B-5; each file counts for the server of its record), with its held screenshots without an
 * issue (`hasIssue`), the oldest first and never one an active raid shows, then its oldest review
 * copies that free bytes (not one linked to its held screenshot), then the next server;
 * when that is not enough a screenshot is read and answered but not kept. The review folder is
 * what a later session improves the reader from (`ocr:review`, `ocr:check`). Writes of one
 * record go one after the other; nothing about what a screenshot shows is logged. Every method
 * answers rather than throws: a screenshot that could not be kept is logged and the bot goes on.
 */
export class ScreenshotStore implements ScreenshotKeeping {
  private readonly held: string;
  private readonly review: string;
  private readonly now: () => number;
  private readonly writing = new Map<string, Promise<unknown>>();
  /** Bytes in both folders (a linked pair once); undefined until they were counted. */
  private used: number | undefined;
  /**
   * Of `used`, each server's (plan 19B-5), by the record a file belongs to; a file without a
   * readable record is `NO_SERVER`'s. Counted with `used`.
   */
  private readonly usedOf = new Map<string, number>();
  /** The count of the folders on its way: keeps that come meanwhile wait for the same one. */
  private counting: Promise<void> | undefined;
  /**
   * Held screenshots without an issue, by id, with when they were read and their server: the
   * first to go.
   */
  private readonly plain = new Map<string, { readAt: number; server: string }>();
  /** Review copies made per server and day. */
  private readonly reviewed = new BoundedMap<string, number>(1_000);

  constructor(private readonly options: ScreenshotStoreOptions) {
    this.held = path.join(options.dir, 'held');
    this.review = path.join(options.dir, 'review');
    this.now = options.now ?? Date.now;
  }

  /**
   * Keeps a screenshot that was read, for a day (`image: false`: its record alone); a copy goes
   * to review at once when it was not reported unasked or the reader's own report has a doubt.
   * Answers its id, or undefined when it was not kept.
   */
  async keep(
    bytes: Uint8Array,
    screenshot: NewScreenshot,
    image = true,
    alongside?: string,
  ): Promise<string | undefined> {
    const format = imageFormat(bytes);
    if (!format) return undefined;
    const id = newScreenshotId();
    const now = this.now();
    const record: ScreenshotRecord = {
      v: 1,
      id,
      file: image ? `${id}.${format}` : null,
      readAt: now,
      ...screenshot,
      pickedGymId: null,
      keepUntil: now + DAY_MS,
      feedback: [],
    };
    try {
      // Another pane of the same picture: its file, linked, costs no bytes again.
      const sibling =
        record.file && alongside && ID.test(alongside)
          ? path.join(this.held, `${alongside}.${format}`)
          : undefined;
      let linked = false;
      if (sibling && record.file) {
        await mkdir(this.held, { recursive: true });
        linked = await (this.options.link ?? link)(sibling, path.join(this.held, record.file)).then(
          () => true,
          () => false,
        );
      }
      // The record takes its bytes too: a record kept alone is not free either.
      const recordBytes = Buffer.byteLength(`${JSON.stringify(record, null, 2)}
`);
      const fileBytes = image && !linked ? bytes.byteLength : 0;
      if (!(await this.room(fileBytes + recordBytes))) {
        if (linked && record.file) await rm(path.join(this.held, record.file), { force: true });
        return undefined;
      }
      await mkdir(this.held, { recursive: true });
      if (record.file && !linked) {
        await writeFile(path.join(this.held, record.file), bytes);
        this.grow(bytes.byteLength, record.guildId);
      }
      await this.serially(this.key(this.held, id), async () => {
        await this.write(this.held, record);
        this.index(record);
        if (record.decision.kind !== 'report' || ownDoubts(record).length > 0) {
          await this.toReview(record);
        }
      });
      return id;
    } catch (err) {
      this.options.log.error({ reason: failureReason(err) }, 'could not keep a screenshot');
      return undefined;
    }
  }

  /**
   * The kept screenshot: undefined for one that is not kept, `gone` for one whose file has
   * vanished (a record alone, kept so, comes without a path).
   */
  async get(id: string): Promise<KeptScreenshot | 'gone' | undefined> {
    if (!ID.test(id)) return undefined;
    const record = await this.read(this.held, id);
    if (!record) return undefined;
    if (record.file === null) return { record, path: undefined };
    const file = path.join(this.held, record.file);
    const there = await stat(file).catch(() => undefined);
    return there ? { record, path: file } : 'gone';
  }

  inUse(id: string): Promise<void> {
    return this.change(id, (record) => ({ ...record, keepUntil: null }));
  }

  picked(id: string, gymId: number): Promise<void> {
    return this.change(id, (record) => ({ ...record, pickedGymId: gymId }), true);
  }

  pickedSpot(id: string, spotId: string): Promise<void> {
    return this.change(id, (record) => ({ ...record, pickedSpotId: spotId }), true);
  }

  /**
   * Records a member's feedback (their earlier one is replaced) and copies the screenshot to
   * review. "All right" makes the reading the screenshot's answer key, for what the reader
   * read itself; anybody's "Something is wrong" takes the key away (listed, not scored).
   */
  async feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'> {
    if (!ID.test(id)) return 'gone';
    let found = false;
    await this.change(
      id,
      (record) => {
        found = true;
        const entry: FeedbackRecord = {
          ...feedback,
          memberId,
          by: memberId === record.senderId ? 'reporter' : 'other',
          at: this.now(),
        };
        const others = record.feedback.filter((f) => f.memberId !== memberId);
        const all = [...others, entry];
        const { label: _old, ...rest } = record;
        const disputed = all.some((f) => f.verdict === 'wrong');
        // A max battle's screen has no answer key `ocr:check` scores (plan 8X-S, review R5).
        const label =
          disputed || record.max
            ? undefined
            : memberLabel(record.report, record.typed, this.options.gymName, record.pickedGymId);
        return { ...rest, feedback: all, ...(label ? { label } : {}) };
      },
      true,
    );
    return found ? 'ok' : 'gone';
  }

  /**
   * Deletes what is due: in `held/`, a screenshot whose time has come (one shown by a raid that
   * is no longer active gets a day from now; one an active raid shows at that moment never
   * goes); in `review/`, one older than `reviewDays`; in both, a file without a record it
   * belongs to, and a record that cannot be read, a day after they were written. The index of
   * held screenshots without an issue is built anew.
   */
  async sweep(): Promise<void> {
    const now = this.now();
    await this.room(0);
    let deleted = 0;
    this.plain.clear();
    for (const folder of [this.held, this.review]) {
      const names = await readdir(folder).catch(() => [] as string[]);
      const readable = new Set<string>();
      for (const name of names.filter((n) => n.endsWith('.json'))) {
        const id = name.slice(0, -5);
        if (!ID.test(id)) continue;
        await this.serially(this.key(folder, id), async () => {
          const record = await this.read(folder, id);
          if (!record) return;
          readable.add(id);
          if (folder === this.held && record.keepUntil === null) {
            if (!this.options.shown().has(id)) {
              await this.write(folder, { ...record, keepUntil: now + DAY_MS });
            }
            this.index(record);
            return;
          }
          const due = record.keepUntil !== null && record.keepUntil <= now;
          // Asked again at the moment of deletion: a raid made meanwhile shows it.
          if (!due || (folder === this.held && this.options.shown().has(id))) {
            if (folder === this.held) this.index(record);
            return;
          }
          await this.removeRecord(folder, record);
          readable.delete(id);
          deleted++;
        });
      }
      for (const name of names) {
        const owner = name.replace(/\..*$/, '');
        if (readable.has(owner)) continue;
        const file = path.join(folder, name);
        const info = await stat(file).catch(() => undefined);
        if (info && now - info.mtimeMs > DAY_MS) await this.remove(file, NO_SERVER);
      }
    }
    if (deleted > 0) this.options.log.info({ deleted }, 'deleted kept screenshots');
  }

  /**
   * What is kept of a member (plan 8G: the look of `/operator forget`): the screenshots they sent
   * or whose picture they posted (`theirs`; one kept and copied to review counts once) and, apart, the other members' screenshots that
   * hold feedback of theirs.
   */
  async heldOf(memberId: string): Promise<{ sent: number; feedback: number }> {
    const sent = new Set<string>();
    const feedback = new Set<string>();
    for (const folder of [this.held, this.review]) {
      for (const id of await this.recordIds(folder)) {
        const record = await this.read(folder, id);
        if (!record) continue;
        if (theirs(record, memberId)) sent.add(id);
        else if (record.feedback.some((f) => f.memberId === memberId)) feedback.add(id);
      }
    }
    return { sent: sent.size, feedback: feedback.size };
  }

  /**
   * Removes what is kept of a member, from both folders (plan 8G, `/operator forget`): every
   * screenshot they sent or whose picture they posted (`theirs`), the picture and its record, also one a raid that is going on shows
   * (its "Screenshot feedback" then says it is no longer kept); and from other members'
   * screenshots their feedback, their id and what they typed, the rest of the record as it was
   * (an answer key their "All right" made stays: it says what the screenshot shows, not who
   * said so). Each record under its turn, read again there. `removed` and `feedback` count
   * screenshots (one in both folders once); `failed` those of which something could not be
   * removed, said in the log without what it shows: run it again for them. Never throws.
   */
  async forget(memberId: string): Promise<{ removed: number; feedback: number; failed: number }> {
    const removed = new Set<string>();
    const feedback = new Set<string>();
    const failed = new Set<string>();
    for (const folder of [this.held, this.review]) {
      for (const id of await this.recordIds(folder)) {
        try {
          await this.serially(this.key(folder, id), async () => {
            const record = await this.read(folder, id);
            if (!record) return;
            if (theirs(record, memberId)) {
              await this.removeRecord(folder, record);
              removed.add(id);
              return;
            }
            if (!record.feedback.some((f) => f.memberId === memberId)) return;
            const changed = {
              ...record,
              feedback: record.feedback.filter((f) => f.memberId !== memberId),
            };
            await this.write(folder, changed);
            if (folder === this.held) this.index(changed);
            feedback.add(id);
          });
        } catch (err) {
          failed.add(id);
          this.options.log.error(
            { reason: failureReason(err) },
            'could not remove a member’s kept screenshot',
          );
        }
      }
    }
    // One of which a part went and a part did not is not removed yet.
    for (const id of failed) {
      removed.delete(id);
      feedback.delete(id);
    }
    return { removed: removed.size, feedback: feedback.size, failed: failed.size };
  }

  /**
   * Removes what is kept of a server, from both folders (plan 19C-3: a server Pine left more than
   * 30 days ago is deleted): every screenshot whose record names it (`guildId`) and that was read
   * up to `upTo` (the end of the deletion's database part: what was read after it is the server's
   * added back since, which starts anew), the picture and its record, also one a raid shows (the
   * server's parties go with it). Each record under its turn, read again there. Found by reading
   * every record of both folders, once per deletion and once per sweep while some are left (the
   * store keeps no index by server; a deletion is rare, and the daily sweep reads them all as
   * well). `removed` counts screenshots (one in both folders once); `failed` those of which
   * something could not be removed, said in the log without what it shows (the deletion notes
   * them left, and each sweep tries them again). Never throws.
   */
  async forgetServer(serverId: string, upTo: number): Promise<{ removed: number; failed: number }> {
    const removed = new Set<string>();
    const failed = new Set<string>();
    for (const folder of [this.held, this.review]) {
      for (const id of await this.recordIds(folder)) {
        try {
          await this.serially(this.key(folder, id), async () => {
            const record = await this.read(folder, id);
            if (record?.guildId !== serverId || record.readAt > upTo) return;
            await this.removeRecord(folder, record);
            removed.add(id);
          });
        } catch (err) {
          failed.add(id);
          this.options.log.error(
            { reason: failureReason(err), server: serverId },
            'could not remove a kept screenshot of a server',
          );
        }
      }
    }
    for (const id of failed) removed.delete(id);
    return { removed: removed.size, failed: failed.size };
  }

  /** The ids of the records of a folder, by their files' names; none for a folder not there. */
  private async recordIds(folder: string): Promise<string[]> {
    const names = await readdir(folder).catch(() => [] as string[]);
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5))
      .filter((id) => ID.test(id));
  }

  /**
   * Copies the record (and the screenshot, as a hard link where it can) to review, kept
   * `reviewDays` from now. Runs under the held record's turn, with the record just written
   * there. A new copy takes one of the server's review places of the day once it is made.
   */
  private async toReview(record: ScreenshotRecord): Promise<void> {
    const target = path.join(this.review, `${record.id}.json`);
    const fresh = !(await stat(target).catch(() => undefined));
    const day = `${record.guildId}:${new Date(this.now()).toISOString().slice(0, 10)}`;
    const count = this.reviewed.get(day) ?? 0;
    if (fresh && count >= this.options.reviewPerDay) {
      if (count === this.options.reviewPerDay) {
        this.options.log.warn(
          { guild: record.guildId },
          'a server reached its screenshots for review today; no more are kept for review',
        );
        this.reviewed.set(day, count + 1);
      }
      return;
    }
    await mkdir(this.review, { recursive: true });
    if (record.file) {
      const image = path.join(this.review, record.file);
      if (!(await stat(image).catch(() => undefined))) {
        const source = path.join(this.held, record.file);
        try {
          await (this.options.link ?? link)(source, image);
        } catch {
          // No hard links here: a copy, which takes its bytes again.
          const size = (await stat(source)).size;
          if (!(await this.room(size))) return;
          await copyFile(source, image);
          this.grow(size, record.guildId);
        }
      }
    }
    await this.serially(this.key(this.review, record.id), () =>
      this.write(this.review, {
        ...record,
        keepUntil: this.now() + this.options.reviewDays * DAY_MS,
      }),
    );
    if (fresh) this.reviewed.set(day, count + 1);
  }

  /**
   * Changes the held record of `id`, one change at a time (`review`: and its copy in review);
   * nothing when it is gone.
   */
  private async change(
    id: string,
    how: (record: ScreenshotRecord) => ScreenshotRecord,
    review = false,
  ): Promise<void> {
    if (!ID.test(id)) return;
    await this.serially(this.key(this.held, id), async () => {
      const record = await this.read(this.held, id);
      if (!record) return;
      const changed = how(record);
      await this.write(this.held, changed);
      this.index(changed);
      if (review) await this.toReview(changed);
    }).catch((err: unknown) => {
      this.options.log.error({ reason: failureReason(err) }, 'could not change a kept screenshot');
    });
  }

  /** Notes in the index whether a held record is one of the first to go. */
  private index(record: ScreenshotRecord): void {
    if (record.file && !hasIssue(record))
      this.plain.set(record.id, { readAt: record.readAt, server: record.guildId });
    else this.plain.delete(record.id);
  }

  /**
   * Whether `bytes` more fit the budget; the folders are counted the first time (a linked pair
   * once), which also builds the index. Over it, the server keeping the most gives way first
   * (plan 19B-5), one screenshot at a time, the server keeping the most chosen again after each:
   * its held screenshots of the index, the oldest first, each read again under its turn and left
   * when it is gone, has an issue by now or an active raid shows it; then its oldest review
   * copies that free something (not one linked to its held screenshot). A server with nothing
   * of that left is passed over for the next; when none has any, nothing is kept.
   */
  private async room(bytes: number): Promise<boolean> {
    if (this.used === undefined) {
      // Once counted, `used` is set; a count that failed is tried again by the next keep.
      await (this.counting ??= this.count().finally(() => {
        this.counting = undefined;
      }));
    }
    const budget = this.options.keepMegabytes * MB;
    const fits = () => (this.used ?? 0) + bytes <= budget;
    if (bytes === 0 || fits()) return true;
    let copies: Map<string, ScreenshotRecord[]> | undefined;
    const reviewCopies = async () => (copies ??= await this.reviewCopies());
    const givenAll = new Set<string>();
    while (!fits()) {
      const server = this.keepingMost(givenAll);
      if (server === undefined) break;
      const gave =
        (await this.givePlain(server)) || (await this.giveCopy((await reviewCopies()).get(server)));
      if (!gave) givenAll.add(server);
    }
    if (fits()) return true;
    this.options.log.warn(
      { usedMb: Math.round((this.used ?? 0) / MB) },
      'the kept screenshots fill their space; this one is not kept',
    );
    return false;
  }

  /** The server keeping the most bytes, of those not in `passed`. */
  private keepingMost(passed: ReadonlySet<string>): string | undefined {
    let most: string | undefined;
    let bytes = 0;
    for (const [server, used] of this.usedOf) {
      if (used > bytes && !passed.has(server)) {
        most = server;
        bytes = used;
      }
    }
    return most;
  }

  /** Deletes the oldest held screenshot of the index of `server` that may go; whether it did. */
  private async givePlain(server: string): Promise<boolean> {
    const oldest = [...this.plain.entries()]
      .filter(([, entry]) => entry.server === server)
      .sort(([, a], [, b]) => a.readAt - b.readAt)
      .map(([id]) => id);
    for (const id of oldest) {
      const gone = await this.serially(this.key(this.held, id), async () => {
        const record = await this.read(this.held, id);
        this.plain.delete(id);
        if (!record || hasIssue(record) || this.options.shown().has(id)) return false;
        await this.removeRecord(this.held, record);
        return true;
      });
      if (gone) return true;
    }
    return false;
  }

  /**
   * Deletes the oldest of a server's review copies (`copies`, oldest first; taken from it) that
   * frees something; whether it did.
   */
  private async giveCopy(copies: ScreenshotRecord[] | undefined): Promise<boolean> {
    for (let record = copies?.shift(); record !== undefined; record = copies?.shift()) {
      // A copy linked to its held screenshot would free nothing: it stays.
      if (record.file) {
        const info = await stat(path.join(this.review, record.file)).catch(() => undefined);
        if (info && info.nlink > 1) continue;
      }
      const copy = record;
      await this.serially(this.key(this.review, copy.id), () =>
        this.removeRecord(this.review, copy),
      );
      return true;
    }
    return false;
  }

  /** The review copies by server, each server's oldest first. */
  private async reviewCopies(): Promise<Map<string, ScreenshotRecord[]>> {
    const byServer = new Map<string, ScreenshotRecord[]>();
    for (const id of await this.recordIds(this.review)) {
      const record = await this.read(this.review, id);
      if (!record) continue;
      const copies = byServer.get(record.guildId);
      if (copies) copies.push(record);
      else byServer.set(record.guildId, [record]);
    }
    for (const copies of byServer.values()) copies.sort((a, b) => a.readAt - b.readAt);
    return byServer;
  }

  /**
   * Counts both folders, a file with two links once, each file for the server of the record it
   * belongs to (plan 19B-5), and indexes the held records. One count at a time (`counting`): the
   * totals are built here and set together at the end.
   */
  private async count(): Promise<void> {
    let total = 0;
    const byServer = new Map<string, number>();
    const seen = new Set<string>();
    const serverOf = new Map<string, string>();
    for (const folder of [this.held, this.review]) {
      const names = await readdir(folder).catch(() => [] as string[]);
      for (const name of names.filter((n) => n.endsWith('.json'))) {
        const record = await this.read(folder, name.slice(0, -5));
        if (!record) continue;
        serverOf.set(record.id, record.guildId);
        if (folder === this.held) this.index(record);
      }
      for (const name of names) {
        const info = await stat(path.join(folder, name)).catch(() => undefined);
        if (!info) continue;
        const inode = `${info.dev}:${info.ino}`;
        if (info.nlink > 1 && seen.has(inode)) continue;
        seen.add(inode);
        total += info.size;
        const server = serverOf.get(name.replace(/\..*$/, '')) ?? NO_SERVER;
        byServer.set(server, (byServer.get(server) ?? 0) + info.size);
      }
    }
    this.used = total;
    this.usedOf.clear();
    for (const [server, bytes] of byServer) this.usedOf.set(server, bytes);
  }

  private async removeRecord(folder: string, record: ScreenshotRecord): Promise<void> {
    if (record.file) await this.remove(path.join(folder, record.file), record.guildId);
    await this.remove(path.join(folder, `${record.id}.json`), record.guildId);
    if (folder === this.held) this.plain.delete(record.id);
  }

  /** Counts bytes more (or fewer) in the folders, and of `server`, once they were counted. */
  private grow(bytes: number, server: string): void {
    if (this.used === undefined) return;
    this.used = Math.max(0, this.used + bytes);
    const left = Math.max(0, (this.usedOf.get(server) ?? 0) + bytes);
    if (left > 0) this.usedOf.set(server, left);
    else this.usedOf.delete(server);
  }

  /**
   * Removes a file of `server`; its bytes count as freed only when no other link holds them.
   */
  private async remove(file: string, server: string): Promise<void> {
    const info = await stat(file).catch(() => undefined);
    await rm(file, { force: true });
    if (info && info.nlink <= 1) this.grow(-info.size, server);
  }

  private key(folder: string, id: string): string {
    return `${folder}\n${id}`;
  }

  private serially<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.writing.get(key) ?? Promise.resolve();
    const result = before.then(work, work);
    const settled = result.catch(() => undefined);
    this.writing.set(key, settled);
    void settled.then(() => {
      if (this.writing.get(key) === settled) this.writing.delete(key);
    });
    return result;
  }

  private async read(folder: string, id: string): Promise<ScreenshotRecord | undefined> {
    const text = await readFile(path.join(folder, `${id}.json`), 'utf8').catch(() => undefined);
    if (text === undefined) return undefined;
    try {
      const record = JSON.parse(text) as ScreenshotRecord;
      return record.v === 1 && record.id === id ? record : undefined;
    } catch {
      return undefined;
    }
  }

  /** Writes a record whole or not at all: to a file beside it, then renamed over it. */
  private async write(folder: string, record: ScreenshotRecord): Promise<void> {
    const target = path.join(folder, `${record.id}.json`);
    const temporary = `${target}.${process.pid}.writing`;
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const before = (await stat(target).catch(() => undefined))?.size ?? 0;
    try {
      await writeFile(temporary, text);
      // Tried again when Windows refuses it while another program holds the record a moment.
      await moveIntoPlace(temporary, target, this.options.rename, this.options.renamePauseMs);
      this.grow(Buffer.byteLength(text) - before, record.guildId);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
