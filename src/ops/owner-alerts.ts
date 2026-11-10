import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REST, Routes } from 'discord.js';
import { isSnowflake } from '../db/snowflake.js';
import type { Logger } from '../log.js';

/**
 * What an alert is about. Each kind has its own minimum interval, so that a crash loop sends one
 * "stopped" and one "restarted" now and then, and a backup failure is not held back by a crash.
 */
export type AlertKind =
  | 'fatal'
  | 'restart'
  | 'unhealthy'
  | 'restarting'
  | 'backup'
  | 'backup-missing'
  | 'backup-warning'
  | 'backups-off'
  | 'docker-away'
  | 'rehearsal';

/** What became of an alert: sent, held back by the interval, or failed (logged). */
export type AlertOutcome = 'sent' | 'held' | 'failed';

/** The part of discord.js's `REST` an alert needs. */
export interface AlertRest {
  post(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
}

/** When an alert of each kind was last sent; `undefined` forgets it. */
export interface AlertStamps {
  last(kind: AlertKind): number | undefined;
  set(kind: AlertKind, at: number | undefined): void;
}

/** Stamps for one process (the watchdog, which does not crash-loop). */
export class MemoryStamps implements AlertStamps {
  private readonly stamps = new Map<AlertKind, number>();

  last(kind: AlertKind): number | undefined {
    return this.stamps.get(kind);
  }

  set(kind: AlertKind, at: number | undefined): void {
    if (at === undefined) this.stamps.delete(kind);
    else this.stamps.set(kind, at);
  }
}

/**
 * Stamps in a small JSON file (`var/health/alerts.json`), so that the interval holds across the
 * restarts of a bot that crashes at every start. A file that cannot be read counts as empty; one
 * that cannot be written is logged, and only costs the interval.
 */
export class FileStamps implements AlertStamps {
  constructor(
    private readonly file: string,
    private readonly log: Pick<Logger, 'warn'>,
  ) {}

  last(kind: AlertKind): number | undefined {
    const at = this.read()[kind];
    return typeof at === 'number' ? at : undefined;
  }

  set(kind: AlertKind, at: number | undefined): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const next = `${this.file}.next`;
      writeFileSync(next, JSON.stringify({ ...this.read(), [kind]: at }));
      renameSync(next, this.file);
    } catch (err) {
      // The alert went out; only its interval is not remembered.
      this.log.warn({ err, file: this.file }, 'could not keep when an alert went out');
    }
  }

  private read(): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}

/** Discord's limit on a message's text. */
const CONTENT_LIMIT = 2_000;
/** How much of an error an alert quotes. */
const ERROR_LIMIT = 300;

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/**
 * The first line of an error's message (never its stack), at most 300 characters; a line that
 * ends with a colon ("Invalid environment:") takes the next one along.
 */
export function firstLine(err: unknown): string {
  const text = err instanceof Error ? err.message || err.name : String(err);
  const [first, second] = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const line = first?.endsWith(':') && second ? `${first} ${second}` : first;
  return cut(line ?? 'Error', ERROR_LIMIT);
}

/** A time in an alert: Discord shows it in the reader's own time zone. */
export function alertTime(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:f>`;
}

export interface OwnerAlertsOptions {
  rest: AlertRest;
  ownerId: string;
  log: Logger;
  stamps: AlertStamps;
  /** The least time between two alerts of one kind. Fifteen minutes. */
  minIntervalMs?: number;
  /** How long an alert may take before it is given up. Five seconds. */
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Direct messages to the bot's owner (`OWNER_ID`) about the bot itself: a crash, a restart after
 * one, what the watchdog did, a failed backup. Plain text through Discord's REST API with the
 * bot's token, so that they work without the gateway and without `DmSender` (whose queue a
 * crashing bot does not drain). `send` never throws: a failure is logged.
 */
export class OwnerAlerts {
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly options: OwnerAlertsOptions) {
    this.minIntervalMs = options.minIntervalMs ?? 15 * 60_000;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  async send(kind: AlertKind, text: string): Promise<AlertOutcome> {
    const { log, stamps } = this.options;
    const now = this.now();
    const last = stamps.last(kind);
    if (last !== undefined && now - last < this.minIntervalMs) {
      log.info({ kind }, 'owner alert held back');
      return 'held';
    }
    // Taken before the alert goes, so that a second alert of the kind meanwhile is held back;
    // given back when this one fails.
    stamps.set(kind, now);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer from Discord within ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
      timer.unref();
    });
    try {
      await Promise.race([this.deliver(text), timeout]);
      log.info({ kind }, 'owner alerted');
      return 'sent';
    } catch (err) {
      stamps.set(kind, last);
      log.warn({ err, kind }, 'could not alert the owner');
      return 'failed';
    } finally {
      clearTimeout(timer);
    }
  }

  private async deliver(text: string): Promise<void> {
    const { rest, ownerId } = this.options;
    const channel = (await rest.post(Routes.userChannels(), {
      body: { recipient_id: ownerId },
    })) as { id: string };
    await rest.post(Routes.channelMessages(channel.id), {
      body: { content: cut(text, CONTENT_LIMIT), allowed_mentions: { parse: [] } },
    });
  }
}

/**
 * The owner's alerts from the environment as it is (before or without the bot's config):
 * nothing when the token or the owner is missing, since then there is nobody to tell or no way.
 */
export function ownerAlertsFrom(
  env: Record<string, string | undefined>,
  log: Logger,
  stamps: AlertStamps,
): OwnerAlerts | undefined {
  const token = env.DISCORD_TOKEN?.trim();
  const ownerId = env.OWNER_ID?.trim();
  if (!token || !ownerId || !isSnowflake(ownerId)) return undefined;
  // One try, quickly: the caller is often on its way out.
  const rest = new REST({ retries: 0, timeout: 5_000 }).setToken(token);
  return new OwnerAlerts({ rest, ownerId, log, stamps });
}
