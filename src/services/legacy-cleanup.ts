import type { Logger } from '../log.js';
import type { DiscordDelete } from '../ops/discord-rest.js';
import {
  cleanupList,
  deleteListed,
  type CleanupEntry,
  type CleanupList,
  type DeleteOutcome,
} from '../ops/legacy-cleanup.js';
import type { LegacyParty } from '../ops/legacy-cleanup.js';
import { readLegacyActive } from '../ops/legacy-parties.js';

/** What came of reading the legacy files: none given, unreadable, or how many were read. */
export type LegacyFiles =
  | { read: 'none' }
  | { read: 'failed'; error: string }
  | { read: 'ok'; files: number; skipped: number };

export interface LegacyCleanupOptions {
  /** Discord's REST API through the bot's client; undefined until it is connected. */
  rest: () => DiscordDelete | undefined;
  /** The bot's own user id, once connected. */
  botId: () => string | undefined;
  /** The channels of a server's settings (plan 19A-1: by id): never listed. */
  settingsChannelIds: (guildId: string) => readonly string[];
  /** The names the settings file gives its channels (`channelNamesOf`): never listed either. */
  settingsChannelNames: readonly string[];
  /** The legacy `parties` folder (`LEGACY_PARTIES_DIR`, mounted read-only), if there is one. */
  partiesDir: string | undefined;
  /** The pause between two deletions. One second. */
  pauseMs?: number;
  /** Waits out the pause; a test passes one that does not. */
  wait?: (ms: number) => Promise<void>;
  log: Logger;
}

/**
 * The cleanup of the legacy bot's party channels on Discord (`/admin cleanup-legacy`): the list
 * from the legacy `active/` files and the server's channels (`cleanupList`), and the deletion of
 * a list a person confirmed, one channel at a time, each logged.
 */
export class LegacyCleanup {
  constructor(private readonly options: LegacyCleanupOptions) {}

  private connected(): { rest: DiscordDelete; botId: string } {
    const rest = this.options.rest();
    const botId = this.options.botId();
    if (!rest || botId === undefined) throw new Error('Discord is not connected yet');
    return { rest, botId };
  }

  /** The parties of the legacy files (undefined without them), and how the reading went. */
  private files(): { parties: LegacyParty[] | undefined; files: LegacyFiles } {
    const dir = this.options.partiesDir;
    if (dir === undefined) return { parties: undefined, files: { read: 'none' } };
    const read = readLegacyActive(dir);
    if (!read.ok) {
      this.options.log.warn({ dir }, 'the legacy parties folder cannot be read');
      return { parties: undefined, files: { read: 'failed', error: read.error } };
    }
    return {
      parties: read.parties,
      files: { read: 'ok', files: read.parties.length, skipped: read.skipped.length },
    };
  }

  /**
   * The list of a server, read only; its region channels, their forums and the channels the
   * settings name are never in it.
   */
  async list(
    guildId: string,
    regions: readonly { channelId: string; forumChannelId: string | null }[],
  ): Promise<{ list: CleanupList; files: LegacyFiles }> {
    const { rest, botId } = this.connected();
    const { parties, files } = this.files();
    const list = await cleanupList(rest, {
      guildId,
      botId,
      regionChannelIds: regions.map((one) => one.channelId),
      regionForumIds: regions.flatMap((one) =>
        one.forumChannelId === null ? [] : [one.forumChannelId],
      ),
      settingsChannelIds: this.options.settingsChannelIds(guildId),
      settingsChannelNames: this.options.settingsChannelNames,
      legacyParties: parties,
    });
    return { list, files };
  }

  /** Deletes what a person confirmed, one channel after the other; logs each. */
  async remove(
    entries: readonly CleanupEntry[],
    by: string,
    progress?: (done: number) => Promise<void> | void,
  ): Promise<DeleteOutcome> {
    const { rest } = this.connected();
    const { log, wait } = this.options;
    const outcome = await deleteListed(rest, entries, {
      pauseMs: this.options.pauseMs ?? 1_000,
      reason: 'A legacy party channel (/admin cleanup-legacy)',
      ...(wait ? { wait } : {}),
      ...(progress ? { progress } : {}),
    });
    for (const entry of outcome.deleted) {
      log.info({ channel: entry.channelId, name: entry.name, by }, 'legacy channel deleted');
    }
    for (const entry of outcome.gone) {
      log.info({ channel: entry.channelId, name: entry.name }, 'legacy channel was gone already');
    }
    for (const { entry, reason } of outcome.failed) {
      log.warn(
        { channel: entry.channelId, name: entry.name, reason },
        'could not delete a legacy channel',
      );
    }
    return outcome;
  }
}
