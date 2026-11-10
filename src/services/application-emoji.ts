import type { Logger } from '../log.js';

function sameEmoji(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [name, text] of a) if (b.get(name) !== text) return false;
  return true;
}

/** Where the emoji of the bot's own application come from: by name, as message text. */
export interface ApplicationEmojiSource {
  /** Every emoji of the application, by name (`<:rock:123>`, `<a:name:id>` when animated). */
  list(): Promise<ReadonlyMap<string, string>>;
}

/** A refused emoji has the list read anew at most once in this time (`ApplicationEmoji.refused`). */
export const REFUSED_REREAD_GAP_MS = 60_000;

/**
 * The emoji of the bot's own application (Discord lets an application have up to 2,000 that it
 * may use in every server), kept in memory: read after the connection and again with the hourly
 * upkeep, and at once when Discord refuses one on a button (`refused`). A read that fails is
 * logged and the last good list stays; before the first good read there is none, and the posts
 * fall back to the server's emoji or to words. The first good read, whatever it found, and any
 * read that finds other emoji than were known (an upload, one deleted) tell the listener, so that
 * the posts are shown anew with them.
 */
export class ApplicationEmoji {
  private known: ReadonlyMap<string, string> = new Map();
  /** The ids of `known` (plan 8M-8A: the only emoji pictures Pine's web server serves). */
  private ids: ReadonlySet<string> = new Set();
  private reading: Promise<void> | undefined;
  /** Whether a read went through yet. */
  private readOnce = false;
  private listener: (() => void) | undefined;
  /** When a refusal last had the list read anew. */
  private rereadAt: number | undefined;

  constructor(
    private readonly source: ApplicationEmojiSource,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Discord refused an emoji of the application on a button (deleted while the bot runs, or not
   * known yet): the list is read anew at once, so that the posts stop sending it and show the
   * emoji that are still there (the listener), at most once in `REFUSED_REREAD_GAP_MS` however
   * many posts are refused meanwhile. Never throws.
   */
  refused(): void {
    const now = this.now();
    if (this.rereadAt !== undefined && now - this.rereadAt < REFUSED_REREAD_GAP_MS) return;
    this.rereadAt = now;
    this.log.info('Discord refused an emoji of the application; reading them anew');
    void this.refresh();
  }

  /** Who is told when the emoji change (the party posts, `PartyService.emojiChanged`). */
  onChange(listener: () => void): void {
    this.listener = listener;
  }

  /** Reads the list anew; a read already under way is shared. Never throws. */
  refresh(): Promise<void> {
    this.reading ??= this.source
      .list()
      .then((found) => {
        // The first good read always tells (plan 8M-8A, review 8A-4): the posts are shown anew
        // after a start also when the application has no emoji or the first read failed, so that
        // the live map has the layout of every post (`PartyService.layoutOf`).
        const changed = !this.readOnce || !sameEmoji(this.known, found);
        this.readOnce = true;
        this.known = found;
        this.ids = new Set(
          [...found.values()].flatMap((text) => /^<a?:\w+:(\d+)>$/u.exec(text)?.slice(1) ?? []),
        );
        // So that a read can be seen to have run (plan 8X-H: after an outage).
        this.log.debug({ emoji: found.size }, 'read the emoji of the application');
        if (changed) this.listener?.();
      })
      .catch((err: unknown) => {
        this.log.warn(
          { err },
          'could not read the emoji of the application; keeping the last list',
        );
      })
      .finally(() => {
        this.reading = undefined;
      });
    return this.reading;
  }

  /**
   * Whether an emoji of this id is the application's, by the last good read (plan 8M-8A): the web
   * server serves the pictures of these alone (`EmojiPictures`).
   */
  hasId(id: string): boolean {
    return this.ids.has(id);
  }

  /** The emoji of that name as message text, or undefined when the application has none. */
  get(name: string): string | undefined {
    return this.known.get(name);
  }
}

/**
 * The emoji of a name, as the posts find them (`PartyService.emoji`): the bot's application's
 * first, then those of a server, by its id (none in a DM). For answers that are no posts
 * (`/counters`).
 */
export interface EmojiFinder {
  find(name: string, guildId: string | null): string | undefined;
  /**
   * Says that Discord refused an emoji found here on a button (`/rank`'s leagues), so that the
   * application's emoji are read anew (`ApplicationEmoji.refused`); absent where nothing is read.
   */
  refused?(): void;
}

/** The finder over the application's emoji and the servers' (`DiscordApplicationEmoji`). */
export function emojiFinder(
  app: { get(name: string): string | undefined; refused?(): void },
  servers: { inServer(guildId: string, name: string): string | undefined },
): EmojiFinder {
  return {
    find: (name, guildId) =>
      app.get(name) ?? (guildId === null ? undefined : servers.inServer(guildId, name)),
    refused: () => app.refused?.(),
  };
}
