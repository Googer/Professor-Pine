import { randomBytes } from 'node:crypto';
import {
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
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
}

const ID = /^[A-Za-z0-9_-]{12}$/;

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
 * `keepMegabytes` together: beyond it, held screenshots without an issue (`hasIssue`) go
 * first, the oldest first and never one an active raid shows, then the oldest review copies
 * that free bytes (not one linked to its held screenshot);
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
  /** Held screenshots without an issue, by id, with when they were read: the first to go. */
  private readonly plain = new Map<string, number>();
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
        this.grow(bytes.byteLength);
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
        if (info && now - info.mtimeMs > DAY_MS) await this.remove(file);
      }
    }
    if (deleted > 0) this.options.log.info({ deleted }, 'deleted kept screenshots');
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
          this.grow(size);
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
    if (record.file && !hasIssue(record)) this.plain.set(record.id, record.readAt);
    else this.plain.delete(record.id);
  }

  /**
   * Whether `bytes` more fit the budget; the folders are counted the first time (a linked pair
   * once), which also builds the index. Over it, held screenshots of the index make room, the
   * oldest first, each read again under its turn and left when it is gone, has an issue by now
   * or an active raid shows it; then the oldest review copies that free something (not one
   * linked to its held screenshot); then nothing is kept.
   */
  private async room(bytes: number): Promise<boolean> {
    if (this.used === undefined) await this.count();
    const budget = this.options.keepMegabytes * MB;
    const fits = () => (this.used ?? 0) + bytes <= budget;
    if (bytes === 0 || fits()) return true;
    const oldest = [...this.plain.entries()].sort(([, a], [, b]) => a - b).map(([id]) => id);
    for (const id of oldest) {
      if (fits()) break;
      await this.serially(this.key(this.held, id), async () => {
        const record = await this.read(this.held, id);
        this.plain.delete(id);
        if (!record || hasIssue(record) || this.options.shown().has(id)) return;
        await this.removeRecord(this.held, record);
      });
    }
    if (!fits()) {
      const copies: ScreenshotRecord[] = [];
      for (const name of await readdir(this.review).catch(() => [] as string[])) {
        if (!name.endsWith('.json')) continue;
        const record = await this.read(this.review, name.slice(0, -5));
        if (record) copies.push(record);
      }
      copies.sort((a, b) => a.readAt - b.readAt);
      for (const record of copies) {
        if (fits()) break;
        // A copy linked to its held screenshot would free nothing: it stays.
        if (record.file) {
          const info = await stat(path.join(this.review, record.file)).catch(() => undefined);
          if (info && info.nlink > 1) continue;
        }
        await this.serially(this.key(this.review, record.id), () =>
          this.removeRecord(this.review, record),
        );
      }
    }
    if (fits()) return true;
    this.options.log.warn(
      { usedMb: Math.round((this.used ?? 0) / MB) },
      'the kept screenshots fill their space; this one is not kept',
    );
    return false;
  }

  /** Counts both folders, a file with two links once, and indexes the held records. */
  private async count(): Promise<void> {
    let total = 0;
    const seen = new Set<string>();
    for (const folder of [this.held, this.review]) {
      for (const name of await readdir(folder).catch(() => [] as string[])) {
        const info = await stat(path.join(folder, name)).catch(() => undefined);
        if (!info) continue;
        const inode = `${info.dev}:${info.ino}`;
        if (info.nlink > 1 && seen.has(inode)) continue;
        seen.add(inode);
        total += info.size;
        if (folder === this.held && name.endsWith('.json')) {
          const record = await this.read(folder, name.slice(0, -5));
          if (record) this.index(record);
        }
      }
    }
    this.used = total;
  }

  private async removeRecord(folder: string, record: ScreenshotRecord): Promise<void> {
    if (record.file) await this.remove(path.join(folder, record.file));
    await this.remove(path.join(folder, `${record.id}.json`));
    if (folder === this.held) this.plain.delete(record.id);
  }

  private grow(bytes: number): void {
    if (this.used !== undefined) this.used = Math.max(0, this.used + bytes);
  }

  /** Removes a file; its bytes count as freed only when no other link holds them. */
  private async remove(file: string): Promise<void> {
    const info = await stat(file).catch(() => undefined);
    await rm(file, { force: true });
    if (info && info.nlink <= 1) this.grow(-info.size);
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
      await rename(temporary, target);
      this.grow(Buffer.byteLength(text) - before);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
