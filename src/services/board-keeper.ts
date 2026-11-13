import type { Logger } from 'pino';
import { BoundedMap } from '../bounded-map.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { BoardMessage, PartyGateway } from '../discord/party-gateway.js';
import { boardDeletedDm } from '../render/board-words.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import type { RegionProvider } from './region-directory.js';
import { isoDate } from '../domain/time/zoned.js';

/** As many messages of a board as the catch-up reads (Discord's most at once; B6). */
export const BOARD_READ_LIMIT = 100;
/** Discord's bulk delete takes messages younger than 14 days; a minute is kept in hand. */
const BULK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;
/** As many members as are remembered as told today (Q2); a restart may repeat one DM. */
const TOLD_MEMBERS = 10_000;
/** How long the DM waits in line before it is not worth sending. */
const DM_EXPIRES_MS = 60 * 60 * 1000;

/** A message as `MessageCreate` gives it (plan 8R-9F): where, by whom, and when. */
export interface PostedBoardMessage extends BoardMessage {
  channelId: string;
  guildId: string | null;
}

/**
 * What `BoardKeeper.posted` makes of a message: `elsewhere`, not in a board; `kept`, the bot's
 * own or Discord's; `taken`, the keeper deletes it unless its author may manage messages there.
 */
export type BoardOutcome = 'elsewhere' | 'kept' | 'taken';

/**
 * What `BoardKeeper.take` made of a message (review F1): `deleted` (or gone already), `kept` (a
 * moderator's, Q1), `failed` (the delete refused or failed, or who wrote it not known).
 */
export type TakeOutcome = 'deleted' | 'kept' | 'failed';

export interface BoardKeeperOptions {
  regions: Pick<RegionProvider, 'all'>;
  gateway: Pick<
    PartyGateway,
    'deleteReported' | 'boardMessages' | 'bulkDelete' | 'managesMessages' | 'clearReactions'
  >;
  dms: DmSender;
  /**
   * The zone of the server of a region's `Guild` row (`PartyService.zoneOfRow`, plan 19A-2): a
   * member is told once per local day of that server (Q2).
   */
  zoneOfRow: (row: number | null) => string;
  /** The server of a `Guild` row (`RowIds.serverOfRow`): the server its DMs are of (plan 19B-5). */
  serverOfRow: (row: number) => string | undefined;
  log: Logger;
  /**
   * Told of every message in a region's board that is neither the bot's own nor Discord's, as it
   * comes (review W6), and after the catch-up's deletes (B7: such a message reopens an archived
   * board unpinned; `PartyService.summaryChanged(region, true)` checks the pin).
   */
  changed: (regionId: number) => void;
  now?: () => number;
  /**
   * Rehearsal mode (review W2): the keeper is off, as the screenshot trigger is. A board's
   * message is `kept` and goes no further; nothing is deleted, read by the catch-up or told.
   */
  inRehearsal?: boolean;
}

/**
 * Keeps the region's board for the bot's lists (plan 8R-9F; design
 * `2026-10-27-region-board-commands-design.md`): the board is open to members, so that they can
 * use commands there, and what anybody but the bot writes in it is deleted at once (B3: other
 * applications and webhooks too; Discord's own messages are left, as they cannot be deleted).
 * A member with Manage Messages in it keeps their message (Q1). A member whose message went is
 * told by DM once a local day (Q2). At start and in the catch-up on reconnect `sweep` deletes
 * what was written while the bot was away (B6), and removes the reactions on the bot's own
 * messages there (plan 8R-9G; without a reaction intent, a reaction lasts until the message's
 * next edit or the next sweep).
 */
export class BoardKeeper {
  private readonly now: () => number;
  /** Each member's last day told, by `<server>:<member>`. */
  private readonly told = new BoundedMap<string, string>(TOLD_MEMBERS);
  /**
   * The boards where a delete (`delete:<board>`) or a removal of reactions (`reactions:<board>`)
   * failed, each said once until one works again.
   */
  private readonly failedIn = new Set<string>();
  private readonly working = new Set<Promise<void>>();

  constructor(private readonly options: BoardKeeperOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** The region whose board a channel is, if any. */
  regionOfBoard(channelId: string): Region | undefined {
    return this.options.regions.all().find((region) => region.summaryMessageId === channelId);
  }

  /**
   * A message was written (`MessageCreate`, before its bot filter, B3). One in a board that is
   * neither the bot's own nor Discord's is deleted in the background (`flush` waits for it).
   */
  posted(message: PostedBoardMessage, readShots?: () => Promise<boolean>): BoardOutcome {
    const region = this.regionOfBoard(message.channelId);
    if (!region) return 'elsewhere';
    if (message.by === 'me' || message.system || this.options.inRehearsal === true) return 'kept';
    // Any such message reopens an archived board unpinned (B7), whatever becomes of it (review
    // W6: a moderator's kept message, a failed delete, one gone already): the pin is checked.
    this.options.changed(region.id);
    // A message of pictures goes to the screenshot reader first (B2): one it takes, it downloads
    // and has deleted (`take`) before it reads; one it does not is deleted here.
    this.track(
      (async () => {
        if (readShots && (await readShots().catch(() => false))) return;
        await this.take(region, message);
      })(),
    );
    return 'taken';
  }

  /**
   * Deletes a message of the board unless a moderator wrote it (Q1), and tells its member once a
   * day where `tell`; the screenshot flow (B2) calls it once the pictures are downloaded, without
   * `tell`, as its own DM says what became of them. Never throws.
   */
  async take(region: Region, message: BoardMessage, tell = true): Promise<TakeOutcome> {
    // Off in rehearsal mode (review W2): left as it is.
    if (this.options.inRehearsal === true) return 'kept';
    const boardId = region.summaryMessageId;
    if (boardId === null) return 'failed';
    try {
      // From the cache: the message just put its member there.
      if (
        message.by === 'member' &&
        (await this.options.gateway.managesMessages(boardId, message.authorId, false))
      ) {
        return 'kept';
      }
    } catch (err) {
      this.options.log.warn({ err, region: region.id }, 'could not tell who wrote in the board');
      return 'failed';
    }
    const answer = await this.deleteOne(region, message.id);
    if (answer === 'deleted') this.deletedFrom(region, tell ? [message] : []);
    // A message gone already is out of the board as well (review F1).
    return answer === 'failed' ? 'failed' : 'deleted';
  }

  /**
   * Deletes what was written in every board while the bot was away (B6): the newest
   * `BOARD_READ_LIMIT` messages of each, each author asked for afresh once (a message read over
   * REST carries no member, Q1), in one request where two or more are younger than 14 days.
   * Removes the reactions on the bot's own messages among them (plan 8R-9G); a moderator's kept
   * message and another application's are left as they are.
   */
  async sweep(): Promise<void> {
    if (this.options.inRehearsal === true) return;
    for (const region of this.options.regions.all()) {
      if (region.summaryMessageId === null) continue;
      try {
        await this.sweepBoard(region, region.summaryMessageId);
      } catch (err) {
        this.options.log.warn({ err, region: region.id }, 'could not read the board');
      }
    }
  }

  /** Waits for the deletes on their way. */
  async flush(): Promise<void> {
    while (this.working.size > 0) await Promise.all([...this.working]);
  }

  private async sweepBoard(region: Region, boardId: string): Promise<void> {
    const { gateway } = this.options;
    const read = await gateway.boardMessages(boardId, BOARD_READ_LIMIT);
    if (!read) return;
    const keeps = new Map<string, boolean>();
    const taken: BoardMessage[] = [];
    let cleared = false;
    for (const message of read) {
      // The bot's own messages, not Discord's (review R-F5: a title's change by the bot).
      if (message.by === 'me' && !message.system && message.reacted === true) {
        const answer = await this.attempt(region, 'reactions', async () => {
          const done = await gateway.clearReactions(boardId, message.id);
          return done === 'cleared' ? 'deleted' : done;
        });
        if (answer === 'deleted') cleared = true;
      }
      if (message.by === 'me' || message.system) continue;
      if (message.by === 'member') {
        let keep = keeps.get(message.authorId);
        if (keep === undefined) {
          keep = await gateway.managesMessages(boardId, message.authorId, true);
          keeps.set(message.authorId, keep);
        }
        if (keep) continue;
      }
      taken.push(message);
    }
    // A removal opens an archived board and leaves it open, unpinned (review R-F1): the pin is
    // checked, as after the deletes.
    if (taken.length === 0) {
      if (cleared) this.options.changed(region.id);
      return;
    }
    const youngAfter = this.now() - BULK_MAX_AGE_MS;
    const young = taken.filter((message) => message.createdAt > youngAfter);
    const old = taken.filter((message) => message.createdAt <= youngAfter);
    const deleted: BoardMessage[] = [];
    if (young.length >= 2) {
      // Opened where archived, and left open (review W3): Discord refuses it there (50083).
      const answer = await this.attempt(region, 'delete', () =>
        gateway.bulkDelete(
          boardId,
          young.map((message) => message.id),
          { reopen: true },
        ),
      );
      if (answer === 'deleted') deleted.push(...young);
    } else {
      old.unshift(...young);
    }
    for (const message of old) {
      if ((await this.deleteOne(region, message.id)) === 'deleted') deleted.push(message);
    }
    if (deleted.length === 0) {
      if (cleared) this.options.changed(region.id);
      return;
    }
    // The messages written while the bot was away may have opened an archived board (B7).
    this.options.changed(region.id);
    this.deletedFrom(region, deleted);
  }

  /**
   * Deletes one message of the board: whether it was there and is deleted now. An archived board
   * is opened for it and left open (review W3): members' commands need it open.
   */
  private async deleteOne(
    region: Region,
    messageId: string,
  ): Promise<'deleted' | 'gone' | 'failed'> {
    const boardId = region.summaryMessageId;
    if (boardId === null) return 'failed';
    return this.attempt(region, 'delete', () =>
      this.options.gateway.deleteReported(boardId, messageId, { leaveOpen: true }),
    );
  }

  /**
   * Runs a delete, or a removal of reactions (`what`, plan 8R-9G: its answer `cleared` given as
   * `deleted`); a refusal or a failure is said once per board and kind until one works again (a
   * message gone already counts as working).
   */
  private async attempt(
    region: Region,
    what: 'delete' | 'reactions',
    work: () => Promise<'deleted' | 'gone' | 'not-allowed'>,
  ): Promise<'deleted' | 'gone' | 'failed'> {
    const boardId = region.summaryMessageId ?? '';
    const key = `${what}:${boardId}`;
    let answer: 'deleted' | 'gone' | 'not-allowed';
    let err: unknown;
    try {
      answer = await work();
    } catch (failure) {
      answer = 'not-allowed';
      err = failure;
    }
    if (answer !== 'not-allowed') {
      this.failedIn.delete(key);
      return answer;
    }
    if (!this.failedIn.has(key)) {
      this.failedIn.add(key);
      this.options.log.warn(
        { ...(err === undefined ? {} : { err }), region: region.id, board: boardId },
        // The gateway's own words for a removal after an edit (review R-F4): one line to look for.
        what === 'delete'
          ? 'could not delete a message in the board'
          : 'could not remove the reactions on a message in the board',
      );
    }
    return 'failed';
  }

  /**
   * After a delete each member is told once a day (the pin is checked by `posted` for a message
   * as it comes, and by the sweep after its deletes).
   */
  private deletedFrom(region: Region, messages: readonly BoardMessage[]): void {
    const boardId = region.summaryMessageId ?? '';
    const day = isoDate(this.now(), this.options.zoneOfRow(region.guildId));
    // Every row's server is known once the rows were read at the start (`RowIds`); one that is
    // not would be sent as the instance's, uncapped, rather than not at all.
    const serverId =
      region.guildId === null ? null : (this.options.serverOfRow(region.guildId) ?? null);
    for (const message of messages) {
      if (message.by !== 'member') continue;
      const key = `${String(region.guildId)}:${message.authorId}`;
      if (this.told.get(key) === day) continue;
      this.told.set(key, day);
      const now = this.now();
      this.options.dms.send({
        userId: message.authorId,
        serverId,
        message: { content: boardDeletedDm(boardId, region.channelId) },
        priority: DM_PRIORITY.normal,
        eventAt: now,
        expiresAt: now + DM_EXPIRES_MS,
      });
    }
  }

  private track(work: Promise<void>): void {
    const running = work.finally(() => this.working.delete(running));
    this.working.add(running);
  }
}
