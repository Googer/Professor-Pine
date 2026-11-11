import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APISelectMenuOption,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { Region } from '../../db/repositories/region-repository.js';
import type { BoardMessage } from '../../discord/party-gateway.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';
import type { TakeOutcome } from '../../services/board-keeper.js';
import { BoundedMap } from '../../bounded-map.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { Throttles, waitText, type Throttle } from '../../discord/throttle.js';
import type { MemberInfo } from '../../domain/party/attendance.js';
import { missingSpotName, type MaxDecision } from '../../domain/ocr/max-decision.js';
import type { SpotTitle } from '../../domain/ocr/power-spot-match.js';
import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
import { storedReport } from '../../domain/ocr/screenshot-record.js';
import type { ReportDoubt } from '../../domain/ocr/screenshot-report.js';
import type { PaneSide } from '../../domain/ocr/panes.js';
import { maxSpotName } from '../../domain/party/max.js';
import { raidBossRef } from '../../domain/party/raid.js';
import { RaidPrivacy } from '../../domain/party/status.js';
import {
  MAX_SPOT_UNTOLD,
  MAX_TIER_UNKNOWN,
  maxRefusalWords,
  placeName,
  refusalWords,
  shortMaxReading,
  shortReading,
  STAFF_TOLD,
} from '../../render/screenshot-reading.js';
import { endSentence, plain, truncate } from '../../render/text.js';
import { MAX_SCREENSHOT_BYTES } from '../../services/ocr-service.js';
import type { ReportOutcome } from '../../services/party-service.js';
import { PendingRequests } from '../../services/pending-requests.js';
import {
  screenshotsOf,
  unreadWords,
  type FetchedScreenshot,
  type ReadOutcome,
  type ScreenshotOutcome,
  type ScreenshotSource,
} from '../../services/screenshot-service.js';
import { gymCandidates, gymMenuOptions, gymNamerOf } from './gym-question.js';
import { SHOT_KIND } from './shot-kind.js';
import { noPostWords } from '../../render/activity.js';
import { mayJoinNoting, REPORT_BARRED, reportAccessOf, reportBarred } from '../raids/report.js';
import {
  maxShotGivesBack,
  maxShotMade,
  maxShotRequest,
  maxShotWords,
  reportMaxShot,
  SPOT_GONE,
  type MaxShotRequest,
} from '../max/max-shot.js';

/**
 * A raid screenshot posted in a region channel with a mention of the bot (or, with
 * `settings.ocr.passive` and the Message Content intent, without one): read and reported as the
 * member who posted it, as the legacy bot did. A message that mentions the bot carries its
 * attachments without the privileged intent. Every image of a message is a report of its own
 * (up to Discord's ten), one after the other: the next goes to the reader only once the one
 * before is answered, so one message never holds more than one place in the reader's queue.
 *
 * What is reported unasked makes no answer (the region channel gets the raid's link line); a
 * screenshot of a raid that exists is answered with its post. A gym that is not clear, or one
 * that lies in another region, is asked about in a reply only the author can answer; whatever
 * could not be made a raid, and the posts of the raids that existed, are said in one reply for
 * the whole message. Once every image made or
 * joined a raid the message has done its work: it is deleted when it says nothing but the
 * mention (or, read passively, nothing at all), and marked ✅ otherwise. A mention alone whose
 * images were answered without a question, some refused, goes with its reply. Replies go after a while (a question after two minutes,
 * and as soon as it is answered). Passive reading answers nothing but the raids that exist and
 * a clear gym of another region, which it asks Yes or No about (pinging the author, whose
 * message may be gone): ordinary pictures draw no answer.
 *
 * A message posted without a mention can be read later because a member asks for it ("Read
 * screenshot" in the message's Apps menu, plan 7M; `ScreenshotTrigger.readFor`): the very flow
 * of a mention, the member who asked in the author's place.
 */

/** The emoji the bot reacts with while it reads. */
export const READING = '🤔';
/** The emoji of a message whose screenshots all made raids but that says more than a mention. */
export const DONE = '✅';
/**
 * As often as `/raid`: 20 screenshots a quarter of an hour per member, each image one use. A
 * passive read uses the same: it is the same member posting the same pictures.
 */
export const MENTION_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };
/** How long a question about a gym stays unanswered (Matt, 2026-10-14). */
export const QUESTION_MS = 2 * 60_000;

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

/** What a reply of the bot to the posted message offers. */
export interface ReplyPayload {
  content: string;
  components?: Row[];
  /** The one member this reply may ping (its text names them); nobody otherwise. */
  ping?: string;
}

/** A reply the bot sent: deleted when its time is up, unless it is gone already. */
export interface SentReply {
  delete(): Promise<void>;
}

/** What the trigger needs of a message (`src/discord/screenshot-message.ts` over discord.js). */
export interface PostedMessage {
  id: string;
  channelId: string;
  /** Null in a DM. */
  guildId: string | null;
  /** The message is in a thread or a forum post, not a channel of its own. */
  inThread: boolean;
  authorId: string;
  /** A bot or a webhook. */
  authorBot: boolean;
  /** The member's name and team, from the message's member (`memberInfo` for messages). */
  member: MemberInfo;
  createdAt: number;
  /** The bot is mentioned by name (not by @everyone, @here or a role, nor by a reply alone). */
  mentionsBot: boolean;
  /** The message says nothing but the bot's mention(s), if any: it may go once it has done its work. */
  bare: boolean;
  attachments: readonly ScreenshotSource[];
  /** The name of a channel of the server, for naming a gym's region. */
  channelName(channelId: string): string | undefined;
  react(emoji: string): Promise<void>;
  unreact(emoji: string): Promise<void>;
  reply(payload: ReplyPayload): Promise<SentReply | undefined>;
  delete(): Promise<void>;
}

/**
 * A message a member asks to have read ("Read screenshot" in its Apps menu, plan 7M;
 * `ScreenshotTrigger.readFor`): a posted message less what only a mention has. Its author
 * matters for one thing, whether the message may go (`bare`: only the asker's own does); its
 * `reply` answers the member who asked, however the caller sends it.
 */
export type AskedMessage = Omit<PostedMessage, 'authorBot' | 'member' | 'mentionsBot'>;

/** The member who asks for a message to be read (plan 7M). */
export interface ShotAsker {
  id: string;
  /** Their name and team (`memberInfo`), which their reports note. */
  member: MemberInfo;
  /**
   * The latest a screenshot's turn in the reader may come (`ScreenshotWhere.startBy`): who
   * asked is answered through an interaction, which can be answered for a quarter of an hour.
   */
  startBy: number;
}

/**
 * What a batch read for a member who asked keeps of it (plan 7M): `startBy` (`ShotAsker`), and
 * who posted the message, `postedBy` (review F1: a sighting against the boss lists is the
 * poster's, `ScreenshotWhere.postedBy`).
 */
interface AskedFor {
  startBy: number;
  postedBy: string;
}

/**
 * Why nothing of a message was read. `handle` leaves such a message alone, unsaid; the member
 * who asked for one (`readFor`) is told. `not-for-me`: a bot's or a webhook's, one outside a
 * server, or one without a mention where pictures are not read passively (none of them an asked
 * message's case); `post`: in a thread or a forum's post, the region's board included for a
 * message asked for (its pictures are taken as they are posted); `being-read`: it is read just
 * now, for a mention or for somebody who asked.
 */
export type NotRead =
  | 'closing'
  | 'off'
  | 'not-for-me'
  | 'rehearsal'
  | 'post'
  | 'no-region'
  | 'no-picture'
  | 'no-server'
  | 'being-read';

/** What became of a message: taken out of the region's board, read in its channel, or neither. */
type Handled = 'board' | 'read' | NotRead;

/** The images of one message, and how many of them made or joined a raid by now. */
interface Batch {
  message: PostedMessage;
  images: number;
  made: number;
  /** The message was let go (or marked) already: it is done once only. */
  done: boolean;
  /** Called when one more image made or joined a raid: the message goes when all have. */
  finish: () => Promise<void>;
  /**
   * Read because a member asked (plan 7M, `readFor`): a raid or battle made is said in the
   * reply too (it is all the member is answered with; the channel's link line is everybody's),
   * the message may be old, so each screenshot is decided at the time it is read
   * (`ScreenshotWhere.readAt`), and its turn in the reader must come by `startBy`.
   */
  asker?: AskedFor;
  /**
   * Read from the region's board (plan 8R-9F): nothing is asked; where a mention would ask, the
   * words point to the command that asks privately (R1), and what is made is said too.
   */
  board?: true;
}

/** What came of one image: a raid made or joined, a question asked, why not, or a reader that cannot read. */
type ImageResult =
  /** `exists`: the words that name the raid it joined, said in the message's reply. */
  | { kind: 'made'; exists?: string }
  | { kind: 'asked' }
  | { kind: 'refused'; words: string }
  /** Why it made nothing, said also when read passively (a max battle's Power Spot not told). */
  | { kind: 'told'; words: string }
  /** Read passively and left alone (review S-1): nothing is said of it. */
  | { kind: 'ignored' }
  | { kind: 'stopped'; outcome: Exclude<ScreenshotOutcome, { kind: 'read' }> }
  /** Another pane of a split screenshot, not read for want of a use (plan 7P). */
  | { kind: 'held' };

/** One screen's result, a pane's named by its place ("Top", plan 7P) for the board's DM. */
type PaneResult = ImageResult & { place?: string };

const refused = (words: string): ImageResult => ({ kind: 'refused', words });

/** The side of a split's other pane. */
const OTHER_SIDE: Readonly<Record<PaneSide, PaneSide>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};
const told = (words: string): ImageResult => ({ kind: 'told', words });

/** A screenshot read as a max battle's screen. */
type MaxRead = Extract<ScreenshotOutcome, { kind: 'read'; screen: 'max' }>;

/**
 * A question about a screenshot, kept until its author answers it: which gym of a raid's
 * (`gym`), or which Power Spot of a max battle's (`spot`, plan 8X-S), or whether to report a clear
 * place of another region there (either kind, its one place).
 */
type PendingShot = PendingGym | PendingSpot;

interface PendingGym extends PendingCommon {
  kind: 'gym';
  raid: ScreenshotRaid;
  gymIds: number[];
}

interface PendingSpot extends PendingCommon {
  kind: 'spot';
  /** The Power Spots offered (Wayfarer ids); for Yes, the one. */
  spotIds: string[];
  /** The decision with a Power Spot chosen (`ScreenshotOutcome.withSpot`). */
  decide: (spotId: string) => MaxDecision;
  /** The boss's name as the report has it, which the answer names. */
  bossName: string;
  /** The server's snowflake, which the report is made in. */
  serverId: string;
}

interface PendingCommon {
  screenshotId: string | undefined;
  regionChannelId: string;
  /** The server's row, for the check of the report's forums. */
  guildRow: number;
  member: MemberInfo;
  batch: Batch;
  /** Gives back the image's use in its author's window: its raid was refused for none of their doing. */
  giveBack: () => void;
  /** How long the question stays (set once it is sent): `ReplyKeep`. */
  keep?: ReplyKeep;
  /** What the question says, to be said again above `ASK_AGAIN` (set once it is made). */
  question?: string;
  /**
   * What is said below it then: `ASK_AGAIN` for the gym menu, `ASK_AGAIN_SPOT` for the Power
   * Spot menu, `ASK_AGAIN_YES` for Yes / No.
   */
  again?: string;
}

/**
 * How long the question's text may be: room for `ASK_AGAIN` below it within a message's 2,000
 * characters.
 */
const QUESTION_ROOM = 1_800;

/**
 * Said below the question when Discord could not say whether its author may be put in the
 * forum: nothing was reported, and the question stays to be answered again (plan 8W-3).
 */
const ASK_AGAIN =
  'Discord cannot be reached just now, so nothing was reported. Pick the gym again in a moment.';
/** `ASK_AGAIN` below the question about a max battle's Power Spot. */
const ASK_AGAIN_SPOT =
  'Discord cannot be reached just now, so nothing was reported. Pick the Power Spot again in a moment.';
/** `ASK_AGAIN` below the question whether to report a place in another region. */
const ASK_AGAIN_YES =
  'Discord cannot be reached just now, so nothing was reported. Press Yes again in a moment.';

/**
 * The question of a passive reading whose place (a gym; a Power Spot once max battles are read)
 * is clear but lies in another region (Matt, 2026-10-22).
 */
export function elsewhereQuestion(place: string, regionChannelId: string): string {
  return `${place} is in <#${regionChannelId}>. Report it there?`;
}

/** Yes and No under `elsewhereQuestion`: `shot:<token>:yes`, and No as the gym question's Cancel. */
function yesNoRow(token: string): Row {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'yes' }),
        label: 'Yes',
        style: ButtonStyle.Primary,
      },
      {
        type: ComponentType.Button,
        custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'cancel' }),
        label: 'No',
        style: ButtonStyle.Secondary,
      },
    ],
  };
}

/**
 * How long a reply stays, once sent (`ScreenshotTrigger.say`): `answered` keeps it as long as a
 * reply from now on (a question that was answered); `askAgain` gives it its own time once more
 * (a question to be answered again), and says false when it is gone already.
 */
interface ReplyKeep {
  answered(): void;
  askAgain(): boolean;
}

/**
 * The tokens of questions answered a while ago: a second press (a double click, or one made
 * while the first was being reported) is only acknowledged, never written over the answer.
 */
const answeredShots = new BoundedMap<string, true>(1_000);

/** The questions of the trigger, for the controls of the kind `shot` that answer them. */
export const pendingShots = new PendingRequests<PendingShot>({ ttlMs: QUESTION_MS + 60_000 });

/**
 * The region's board as the trigger needs it (plan 8R-9F; `BoardKeeper`): which region a board
 * post is, and taking a message out of it once its pictures are downloaded (B2).
 */
export interface BoardTaker {
  regionOfBoard(channelId: string): Region | undefined;
  /** What came of the message (review F1): the DM's opening says it. */
  take(region: Region, message: BoardMessage, tell: boolean): Promise<TakeOutcome>;
}

/** A DM holds this many characters. */
const DM_LIMIT = 2_000;

/**
 * The board's DM (plan 8R-9F, review F6): the opening, then as many whole lines as fit in a DM,
 * the rest counted (`…and N more`), so that no channel or link is cut.
 */
export function boardDmText(head: string, lines: readonly string[]): string {
  const all = [head, ...lines].join('\n');
  if (all.length <= DM_LIMIT) return all;
  const kept: string[] = [head];
  let length = head.length;
  for (const [index, line] of lines.entries()) {
    const more = `…and ${String(lines.length - index)} more`;
    if (length + 1 + line.length + 1 + more.length > DM_LIMIT) {
      kept.push(more);
      break;
    }
    kept.push(line);
    length += 1 + line.length;
  }
  return kept.join('\n');
}

/** Said in the board's DM where a raid's gym is not clear (R1): `/raid` asks privately. */
export const RAID_UNSURE_IN_BOARD =
  'I could not tell which gym this is: report it with `/raid screenshot:`, which asks you privately.';
/**
 * Said in the board's DM where the gym is clear but the tier is not (review W4; the channel's
 * own sentence points to `/raid` as well): the boss or egg typed stands in for what was read.
 */
export const RAID_TIER_UNSURE_IN_BOARD =
  'I could not tell the tier of this raid: report it with `/raid screenshot:` and choose the ' +
  'boss or the egg in `boss:`.';

/**
 * What the board's DM says of a raid it asks about (review W4): which gym where that is in
 * doubt, as the channel asks it first, else the tier (a raid screen always has one).
 */
function unsureInBoard(doubts: readonly ReportDoubt[]): string {
  return doubts.includes('no-gym') || doubts.includes('gym-unclear')
    ? RAID_UNSURE_IN_BOARD
    : RAID_TIER_UNSURE_IN_BOARD;
}

/** Said in the board's DM where a max battle's Power Spot is not clear (R1). */
export const MAX_UNSURE_IN_BOARD =
  'I could not tell which Power Spot this is: report it with `/max screenshot:`, which asks you ' +
  'privately.';
/** Said in the board's DM of a max battle's screen read passively without a countdown. */
const MAX_NO_COUNTDOWN_IN_BOARD =
  'That max battle’s screen shows no countdown: report it with `/max screenshot:`.';

/** A clear place of another region, in the board's DM (R1): the command asks whether. */
function elsewhereInBoard(place: string, regionChannelId: string, command: string): string {
  return (
    `${place} is in <#${regionChannelId}>: report it with \`${command}\`, which asks you ` +
    'whether to report it there.'
  );
}

/**
 * What the board's DM says of one screen's result (one the board flow left unsaid, an `asked`,
 * is one it was unsure of: undefined); `heldUntil` when a pane was not read for want of a use.
 */
function boardWords(result: PaneResult, heldUntil: number): string | undefined {
  switch (result.kind) {
    case 'stopped':
      return unreadWords(result.outcome);
    case 'made':
      return result.exists ?? 'Reported it.';
    case 'refused':
    case 'told':
      return result.words;
    case 'ignored':
      return MAX_NO_COUNTDOWN_IN_BOARD;
    case 'held':
      return `You have sent many screenshots just now, so I did not read this screen. Try again in ${waitText(heldUntil)}.`;
    case 'asked':
      return undefined;
  }
}

/** How long the board's DM waits in line before it is not worth sending. */
const BOARD_DM_EXPIRES_MS = 60 * 60_000;

/**
 * The most bytes of one board message's pictures that are downloaded (plan 8Z-2), by the sizes
 * Discord gives them, before any is: they are downloaded at once and all held until the last is
 * read, and ten of `MAX_SCREENSHOT_BYTES` each would be 320 MB. 100 MB: Discord's free upload
 * limit is ten files of 10 MB, so an honest message always fits.
 */
export const MAX_BOARD_MESSAGE_BYTES = 100 * 1024 * 1024;

/**
 * The most bytes the board's messages hold at once, from their downloads until their last picture
 * is read or dropped (plan 8Z-2): the reader's `full()` trips only after about `ocr.queue + 1`
 * messages, as each holds one place in its queue while its pictures are read one at a time, and
 * messages that come while downloads are on their way all pass it. Two messages as large as one
 * may be; one always fits while no other holds any.
 */
export const MAX_BOARD_BYTES_HELD = 2 * MAX_BOARD_MESSAGE_BYTES;

/** What the board's DM says of a picture left out for the others' size. */
const BOARD_TOO_MUCH =
  `The screenshots of one message may be ${String(MAX_BOARD_MESSAGE_BYTES / (1024 * 1024))} MB ` +
  'together, so I did not read this one. Post it again by itself.';

export interface ScreenshotTriggerOptions {
  ctx: AppContext;
  /** The region's boards (plan 8R-9F): without it a picture in any post is left alone. */
  board?: BoardTaker;
  /** How long a reply stays (`settings.messageCleanupDelayError`). */
  replyMs?: number;
  /** How long a question stays unanswered (`QUESTION_MS`). */
  questionMs?: number;
  now?: () => number;
}

/** Reads the screenshots of posted messages; one per bot (`src/app.ts`). */
export class ScreenshotTrigger {
  private readonly throttles = new Throttles();
  private readonly now: () => number;
  private readonly waiting = new Map<NodeJS.Timeout, SentReply>();
  private closed = false;
  /**
   * The bytes the board's messages hold now (`MAX_BOARD_BYTES_HELD`), by the sizes Discord gave
   * their pictures: one trigger per bot, so the whole process's.
   */
  private boardBytesHeld = 0;
  /**
   * The messages read just now, by id (plan 7M): one that a member asks for meanwhile is not
   * read a second time beside it (`being-read`).
   */
  private readonly reading = new Set<string>();

  constructor(private readonly options: ScreenshotTriggerOptions) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Handles one posted message; never throws (what fails is logged). True where it took a
   * message of the region's board (plan 8R-9F): it had it deleted and answers by DM; false
   * leaves a board's message to the keeper.
   */
  async handle(message: PostedMessage): Promise<boolean> {
    this.reading.add(message.id);
    try {
      return (await this.handleNow(message)) === 'board';
    } catch (err) {
      this.options.ctx.log.error({ err }, 'could not read the screenshots of a message');
      return false;
    } finally {
      this.reading.delete(message.id);
    }
  }

  /**
   * Reads a message because a member asked for it ("Read screenshot" in the message's Apps
   * menu, plan 7M), exactly as a mention of the bot in it is read: `handleNow`, in the places a
   * mention is read, with the member who asked standing where the message's author stands. The
   * uses are theirs, in the window of their mentions; they are asked the questions, and only
   * they can answer them; the reports are theirs, and the kept records name them as the sender.
   * The message's author is not asked, pinged or signed up, and their message never goes: only
   * the asker's own message that says nothing does, once every screenshot of it made or joined a
   * raid or battle (never with a refusal, as a mention alone goes then: review F2).
   *
   * Answers why nothing was read, or undefined once the message was: what came of it is said in
   * the message's replies (`AskedMessage.reply`), a raid or battle it made included. Unlike
   * `handle` it throws what fails: its caller answers a member.
   */
  async readFor(message: AskedMessage, asker: ShotAsker): Promise<NotRead | undefined> {
    if (this.reading.has(message.id)) return 'being-read';
    this.reading.add(message.id);
    try {
      const handled = await this.handleNow(
        {
          ...message,
          authorId: asker.id,
          member: asker.member,
          // A member asked, whoever wrote it, and that stands for the mention.
          authorBot: false,
          mentionsBot: true,
          bare: message.bare && message.authorId === asker.id,
        },
        { startBy: asker.startBy, postedBy: message.authorId },
      );
      // (A board's message is never taken for an asker: `handleNow`.)
      return handled === 'read' ? undefined : handled === 'board' ? 'post' : handled;
    } finally {
      this.reading.delete(message.id);
    }
  }

  /**
   * For shutdown, while Discord is there: no further image is read and nothing more is sent,
   * and the replies that wait for their time are deleted now.
   */
  async close(): Promise<void> {
    this.closed = true;
    const replies = [...this.waiting.values()];
    for (const timer of this.waiting.keys()) clearTimeout(timer);
    this.waiting.clear();
    await Promise.all(replies.map((reply) => reply.delete().catch(() => undefined)));
  }

  /**
   * A posted message, or one a member asked for (`asker`, plan 7M: the message as `readFor`
   * makes it, the member in its author's place): read where it is for the bot to read, else
   * why not (`NotRead`).
   */
  private async handleNow(message: PostedMessage, asker?: AskedFor): Promise<Handled> {
    const { ctx } = this.options;
    if (this.closed) return 'closing';
    if (!ctx.config.settings.ocr.enabled) return 'off';
    if (message.authorBot || message.guildId === null) return 'not-for-me';
    // Off in rehearsal mode: it reacts to and answers in a region channel, where every member
    // would see it. The testers report from a screenshot with /raid, answered privately.
    if (ctx.rehearsal) return 'rehearsal';
    const passive = !message.mentionsBot;
    if (passive && !(ctx.config.settings.ocr.passive && ctx.features.ocrPassive)) {
      return 'not-for-me';
    }
    // A post is read only where it is the region's board (plan 8R-9F), and the board only as
    // its messages are posted: none is read there for a member who asks later (plan 7M).
    if (message.inThread) {
      const board = asker ? undefined : this.options.board?.regionOfBoard(message.channelId);
      if (!board) return 'post';
      return (await this.readBoard(message, board, passive)) ? 'board' : 'no-picture';
    }
    const region = ctx.regions.byChannel(message.channelId);
    if (!region) return 'no-region';
    const images = screenshotsOf(message.attachments);
    if (images.length === 0) return 'no-picture';
    const guildRow = await ctx.guilds.idFor(message.guildId);
    if (guildRow === undefined) return 'no-server';
    const batch: Batch = {
      message,
      images: images.length,
      made: 0,
      done: false,
      finish: () => this.finished(batch),
      ...(asker ? { asker } : {}),
    };
    const refusals = new Map<string, number>();
    const existing: string[] = [];
    // Said also when read passively: what a max battle's screenshot could not place.
    const toldAloud: string[] = [];
    let held = 0;
    /** Second panes of split screenshots not read for want of a use (plan 7P). */
    let heldPanes = 0;
    let wait = 0;
    let stopped: Exclude<ScreenshotOutcome, { kind: 'read' }> | undefined;
    let reacted = false;
    /** Questions asked: their answers decide what becomes of the message. */
    let asked = 0;
    try {
      for (const image of images) {
        if (this.closed) return 'closing';
        // The reader cannot read just now: the rest of the message waits for nothing.
        if (stopped) break;
        const countedAt = this.now();
        const until = this.throttles.use(
          'screenshot',
          message.authorId,
          MENTION_THROTTLE,
          countedAt,
        );
        if (until !== undefined) {
          held++;
          wait = until;
          continue;
        }
        if (!reacted) {
          reacted = true;
          await message.react(READING).catch(() => undefined);
        }
        // A raid refused for none of the member's doing (the bot may not post in the forum) gives
        // the image's use back, also once its gym question is answered (plan 8S-3).
        const giveBack = (): void =>
          this.throttles.giveBack(
            'screenshot',
            message.authorId,
            MENTION_THROTTLE,
            this.now(),
            countedAt,
          );
        // Another pane of a split screenshot (plan 7P) takes a use of its own, after the read.
        const anotherUse = (): (() => void) | undefined => {
          const at = this.now();
          const until = this.throttles.use('screenshot', message.authorId, MENTION_THROTTLE, at);
          if (until !== undefined) {
            heldPanes++;
            wait = until;
            return undefined;
          }
          return () =>
            this.throttles.giveBack(
              'screenshot',
              message.authorId,
              MENTION_THROTTLE,
              this.now(),
              at,
            );
        };
        const results = await this.readOne(batch, image, guildRow, passive, giveBack, anotherUse);
        for (const result of results) {
          if (result.kind === 'made') {
            batch.made++;
            if (result.exists) existing.push(result.exists);
          } else if (result.kind === 'told' && passive) {
            if (!toldAloud.includes(result.words)) toldAloud.push(result.words);
          } else if (result.kind === 'refused' || result.kind === 'told') {
            refusals.set(result.words, (refusals.get(result.words) ?? 0) + 1);
          } else if (result.kind === 'stopped') stopped = result.outcome;
          else if (result.kind === 'asked') asked++;
        }
      }
    } finally {
      // After the close nothing more is done to the message.
      if (reacted && !this.closed) await message.unreact(READING).catch(() => undefined);
    }
    if (!passive) {
      const lines: string[] = [];
      if (stopped) lines.push(unreadWords(stopped));
      lines.push(...existing);
      // "n of m" counts the screens: a split screenshot's panes each (plan 7P).
      for (const [words, count] of refusals) {
        lines.push(batch.images === 1 ? words : `${count} of ${batch.images}: ${words}`);
      }
      // A member who asked had somebody's screenshots read, which they did not send (review F6).
      const many = batch.asker
        ? 'You have had many screenshots read just now'
        : 'You have sent many screenshots just now';
      if (held > 0) {
        const which =
          held === images.length ? 'them' : held === 1 ? 'one of them' : `${held} of them`;
        lines.push(`${many}, so I did not read ${which}. Try again in ${waitText(wait)}.`);
      }
      if (heldPanes > 0) {
        const which = heldPanes === 1 ? 'one of them' : `${heldPanes} of them`;
        lines.push(
          `${many}, so I did not read the other screen of ${which}. Try again in ${waitText(wait)}.`,
        );
      }
      // A message of nothing but the mention whose screenshots were all answered, some refused,
      // has nothing left to do: it goes with its reply, read by then (Matt, 2026-11-03). One
      // whose screenshots all made raids goes at once (`finished`); one asked about waits for
      // the answers. A message read for a member who asked never goes so (review F2): posted
      // without a mention, it was posted for the channel, may be old and have replies; it goes
      // only once every screenshot made or joined a raid (`finished`).
      const settled = !batch.asker && message.bare && asked === 0 && batch.made < batch.images;
      if (settled) batch.done = true;
      if (lines.length > 0) {
        await this.say(
          message,
          { content: truncate(lines.join('\n'), 2_000) },
          undefined,
          settled ? () => void this.letGo(message) : undefined,
        );
      }
    } else if (existing.length > 0 || toldAloud.length > 0) {
      // Read passively, only a raid or max battle that exists is said (Matt, 2026-10-15), and a
      // max battle's Power Spot that could not be told (Matt, 2026-10-22): the member is signed
      // up as their auto-status says, and their message may go. The reply names and pings them,
      // as it may be all that is left of what they posted.
      const content = `<@${message.authorId}> ${[...existing, ...toldAloud].join('\n')}`;
      await this.say(message, { content: truncate(content, 2_000), ping: message.authorId });
    }
    await this.finished(batch);
    return 'read';
  }

  /**
   * Screenshots posted in the region's board (plan 8R-9F, design item 4): every picture is
   * downloaded first, then the message is taken out of the board (`BoardTaker.take`, the keeper's
   * delete; B2: reading one after the other would leave it there for minutes), then the bytes
   * are read as a message of the region's channel, decided by the very functions of a mention,
   * passive or not. The answer is a DM of what each picture made or joined, why not, or where it
   * was unsure (a gym or Power Spot not clear, a place of another region) the command that asks
   * privately (R1); nothing is said, asked or marked in the board (B11). A member whose DMs are
   * closed hears nothing (the board shows what was made). False where there is no picture.
   */
  private async readBoard(
    posted: PostedMessage,
    region: Region,
    passive: boolean,
  ): Promise<boolean> {
    const { ctx } = this.options;
    const images = screenshotsOf(posted.attachments);
    if (images.length === 0 || posted.guildId === null) return false;
    const guildRow = await ctx.guilds.idFor(posted.guildId);
    if (guildRow === undefined) return false;
    const said: (string | undefined)[] = [];
    const counted: { index: number; image: ScreenshotSource; countedAt: number }[] = [];
    // What the downloads may cost is settled before any starts (plan 8Z-2). The pictures within
    // the message's bytes, by the sizes Discord gives them, in order: one too large by itself is
    // never downloaded (`fetch` says so) and counts for nothing.
    const sizeOf = (image: ScreenshotSource): number =>
      image.size <= MAX_SCREENSHOT_BYTES ? image.size : 0;
    let wanted = 0;
    const within = images.map((image) => {
      if (wanted + sizeOf(image) > MAX_BOARD_MESSAGE_BYTES) return false;
      wanted += sizeOf(image);
      return true;
    });
    // A reader with no room, or the board's messages holding as much as they may together
    // (`MAX_BOARD_BYTES_HELD`), refuses the message's pictures as a full reader refuses a
    // mention's: the first takes its use, the rest take none, and nothing is downloaded.
    const full = ctx.screenshots.full() || this.boardBytesHeld + wanted > MAX_BOARD_BYTES_HELD;
    let busy = false;
    /** The bytes of the pictures to download, as Discord gives their sizes. */
    let bytes = 0;
    for (const [index, image] of images.entries()) {
      if (busy) {
        said[index] = unreadWords({ kind: 'busy' });
        continue;
      }
      if (!within[index]) {
        // Left out before it costs anything: no use is taken for it.
        said[index] = BOARD_TOO_MUCH;
        continue;
      }
      const countedAt = this.now();
      const until = this.throttles.use('screenshot', posted.authorId, MENTION_THROTTLE, countedAt);
      if (until !== undefined) {
        said[index] =
          `You have sent many screenshots just now, so I did not read this one. Try again in ${waitText(until)}.`;
        continue;
      }
      if (full) {
        busy = true;
        said[index] = unreadWords({ kind: 'busy' });
        continue;
      }
      bytes += sizeOf(image);
      counted.push({ index, image, countedAt });
    }
    // Taken before the first download (no wait since `full` was asked), given back once the
    // last picture is read or dropped, whatever happens meanwhile.
    this.boardBytesHeld += bytes;
    try {
      return await this.readBoardHeld(posted, region, passive, guildRow, images, said, counted);
    } finally {
      this.boardBytesHeld -= bytes;
    }
  }

  /**
   * The rest of `readBoard`, while the message holds the bytes of its pictures: the downloads,
   * the delete, the reads and the DM. `said` holds the words of the pictures not downloaded,
   * `counted` those to download, each with when its use was counted.
   */
  private async readBoardHeld(
    posted: PostedMessage,
    region: Region,
    passive: boolean,
    guildRow: number,
    images: readonly ScreenshotSource[],
    said: (string | undefined)[],
    counted: readonly { index: number; image: ScreenshotSource; countedAt: number }[],
  ): Promise<boolean> {
    const { ctx } = this.options;
    /** What each pane of a picture made (plan 7P), its place and words. */
    const paneSaid: { place?: string; words: string | undefined }[][] = [];
    // All at once (review F3; ten at most, `screenshotsOf`): the message goes after the slowest.
    const had = await Promise.all(counted.map(({ image }) => ctx.screenshots.fetch(image)));
    const fetched: { index: number; image: FetchedScreenshot; countedAt: number }[] = [];
    for (const [n, { index, countedAt }] of counted.entries()) {
      const one = had[n];
      if (one?.kind === 'fetched') fetched.push({ index, image: one.screenshot, countedAt });
      else if (one) said[index] = unreadWords(one);
    }
    const taken = await this.options.board?.take(
      region,
      {
        id: posted.id,
        authorId: posted.authorId,
        by: 'member',
        system: false,
        createdAt: posted.createdAt,
      },
      false,
    );
    // Read as a message of the region's channel; nothing of it is done in the board.
    const nothing = (): Promise<void> => Promise.resolve();
    const message: PostedMessage = {
      ...posted,
      channelId: region.channelId,
      inThread: false,
      bare: false,
      react: nothing,
      unreact: nothing,
      reply: () => Promise.resolve(undefined),
      delete: nothing,
    };
    const batch: Batch = {
      message,
      images: images.length,
      made: 0,
      done: true,
      finish: nothing,
      board: true,
    };
    let stopped: Exclude<ScreenshotOutcome, { kind: 'read' }> | undefined;
    for (const { index, image, countedAt } of fetched) {
      if (this.closed) break;
      if (stopped) {
        said[index] = unreadWords(stopped);
        continue;
      }
      const giveBack = (): void =>
        this.throttles.giveBack(
          'screenshot',
          posted.authorId,
          MENTION_THROTTLE,
          this.now(),
          countedAt,
        );
      // Another pane of a split screenshot (plan 7P) takes a use of its own, as a mention's.
      let heldUntil = 0;
      const anotherUse = (): (() => void) | undefined => {
        const at = this.now();
        const until = this.throttles.use('screenshot', posted.authorId, MENTION_THROTTLE, at);
        if (until !== undefined) {
          heldUntil = until;
          return undefined;
        }
        return () =>
          this.throttles.giveBack('screenshot', posted.authorId, MENTION_THROTTLE, this.now(), at);
      };
      const results = await this.readOne(batch, image, guildRow, passive, giveBack, anotherUse);
      // Each pane is a report of its own, with a line of its own named by its place.
      paneSaid[index] = results.map((result) => ({
        ...(result.place ? { place: result.place } : {}),
        words: boardWords(result, heldUntil),
      }));
      const stop = results.find((result) => result.kind === 'stopped');
      if (stop?.kind === 'stopped') stopped = stop.outcome;
    }
    // Closed after the delete (review F7): the shutdown leaves the member without the DM, as it
    // leaves every answer on its way; accepted (the board shows what was made).
    if (this.closed) return true;
    // Every picture has its line, every pane of a split one its own (plan 7P); one the board flow
    // left unsaid is one it was unsure of.
    const lines = images.flatMap((_, index) => {
      const panes = paneSaid[index] ?? [{ words: said[index] }];
      return panes.map(({ place, words = RAID_UNSURE_IN_BOARD }) => {
        const named =
          images.length === 1
            ? (place ?? '')
            : `${String(index + 1)}${place ? ` (${place.toLowerCase()})` : ''}`;
        return named === '' ? `- ${words}` : `- ${named}: ${words}`;
      });
    });
    // The opening says what became of the message (review F1): taken out, left (a moderator's,
    // Q1), or nothing where the delete failed.
    const where = `From your ${images.length === 1 ? 'screenshot' : 'screenshots'} in <#${posted.channelId}>`;
    const head =
      taken === 'deleted'
        ? `${where} (the board keeps only my lists, so I took your message out of it):`
        : taken === 'kept'
          ? `${where} (I left your message in the board):`
          : `${where}:`;
    const now = this.now();
    ctx.dms.send({
      userId: posted.authorId,
      message: { content: boardDmText(head, lines) },
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + BOARD_DM_EXPIRES_MS,
    });
    return true;
  }

  /**
   * Reads one image: `made` when it made or joined a raid, `asked` when its author was asked
   * which gym, the words of why it made nothing, or the reader's answer when it could not read.
   */
  private async readOne(
    batch: Batch,
    image: ScreenshotSource,
    guildRow: number,
    passive: boolean,
    giveBack: () => void,
    anotherUse: () => (() => void) | undefined,
  ): Promise<PaneResult[]> {
    const { ctx } = this.options;
    const { message } = batch;
    // The uses of the panes read, each given back as its own (the first is the image's).
    const giveBacks = [giveBack];
    const outcome = await ctx.screenshots.readPanes(image, {
      guildId: message.guildId ?? '',
      guildRow,
      channelId: message.channelId,
      uploadedAt: message.createdAt,
      use: passive ? 'passive' : 'mention',
      senderId: message.authorId,
      // Asked for, the message may have been posted a while ago: its screenshot is dated by
      // the message and decided now, and read only while who asked can still be answered. Its
      // sightings against the boss lists are its poster's (review F1).
      ...(batch.asker
        ? {
            readAt: Math.max(this.now(), message.createdAt),
            startBy: batch.asker.startBy,
            postedBy: batch.asker.postedBy,
          }
        : {}),
      anotherPane: () => {
        const back = anotherUse();
        if (back) giveBacks.push(back);
        return back !== undefined;
      },
    });
    if (outcome.kind === 'busy' || outcome.kind === 'unavailable' || outcome.kind === 'failed') {
      return [{ kind: 'stopped', outcome }];
    }
    if (outcome.kind === 'two-screens') {
      // The reader's failure, not the member's (plan 7P): the use is given back.
      giveBack();
      return [refused(unreadWords(outcome))];
    }
    if (outcome.kind !== 'panes') return [refused(unreadWords(outcome))];
    // Every pane is a report of its own: the message waits for each before it goes. A pane not
    // read for want of a use is counted too, so the message stays under the reply that says so.
    batch.images += outcome.panes.length - 1 + outcome.held;
    const results: PaneResult[] = [];
    for (const [i, pane] of outcome.panes.entries()) {
      const result = await this.readPane(batch, pane, guildRow, passive, giveBacks[i] ?? giveBack);
      results.push(pane.pane ? { ...result, place: placeName(pane.pane.side) } : result);
    }
    // A pane not read: the other of a split's two, by the side of the one read.
    const [read] = outcome.panes;
    for (let n = 0; n < outcome.held; n++) {
      results.push(
        read?.pane
          ? { kind: 'held', place: placeName(OTHER_SIDE[read.pane.side]) }
          : { kind: 'held' },
      );
    }
    return results;
  }

  /**
   * One screen read (a screenshot's, or a pane's of a split one): `made` when it made or joined
   * a raid or a max battle, `asked` when its author was asked which gym or Power Spot, or the
   * words of why it made nothing.
   */
  private async readPane(
    batch: Batch,
    outcome: ReadOutcome,
    guildRow: number,
    passive: boolean,
    giveBack: () => void,
  ): Promise<ImageResult> {
    const { ctx } = this.options;
    const { message } = batch;
    if (outcome.screen === 'max') return this.readMax(batch, outcome, guildRow, passive, giveBack);
    const { report, decision, id } = outcome;
    if (decision.kind === 'refuse') return refused(refusalWords(decision.reason));
    // A clear gym that lies in this region is reported unasked; one in another region is asked
    // about like a gym that is not clear: a raid is never sent to another region unasked.
    if (
      decision.kind === 'report' &&
      ctx.gyms.regionsOf(decision.raid.gymId).includes(message.channelId)
    ) {
      const gym = ctx.gyms.get(decision.raid.gymId);
      if (!gym) return refused(refusalWords('no-gym'));
      const reported = await reportShot(ctx, {
        gym,
        memberId: message.authorId,
        member: message.member,
        regionChannelId: message.channelId,
        guildRow,
        raid: decision.raid,
        screenshotId: id,
      });
      if (reported.kind === 'exists') return { kind: 'made', exists: outcomeWords(reported, gym) };
      // A new raid is said by its link line in the channel; from the board, by DM too, and to
      // a member who asked in their answer.
      if (reported.kind === 'created') {
        return batch.board || batch.asker
          ? { kind: 'made', exists: outcomeWords(reported, gym) }
          : { kind: 'made' };
      }
      if (noPostMade(reported)) giveBack();
      return refused(outcomeWords(reported, gym));
    }
    if (passive) {
      // Read passively, a clear gym of another region (Matt, 2026-10-22): a raid there is joined
      // unasked; else its author is asked, Yes or No, whether to report it there.
      if (decision.kind !== 'report') {
        return batch.board ? refused(unsureInBoard(decision.doubts)) : { kind: 'asked' };
      }
      return this.elsewhere(batch, guildRow, decision.raid, id, giveBack);
    }
    // From the board nothing is asked (R1): a clear gym of another region, or one not clear,
    // is pointed to `/raid screenshot:`, which asks privately; a clear gym whose tier is not,
    // by the doubts as the channel words it (review W4).
    if (batch.board) {
      if (decision.kind === 'ask') return refused(unsureInBoard(decision.doubts));
      const gym = ctx.gyms.get(decision.raid.gymId);
      const there = gym && ctx.partyService.regionFor(gym, message.channelId).region;
      return refused(
        gym && there
          ? elsewhereInBoard(plain(gym.nickname || gym.name), there.channelId, '/raid screenshot:')
          : RAID_UNSURE_IN_BOARD,
      );
    }
    const gyms = gymCandidates(ctx, message.channelId, guildRow, report.gym);
    const [first] = gyms;
    const assumed =
      decision.kind === 'report' ? decision : first ? outcome.withGym(first.id) : decision;
    if (assumed.kind === 'ask')
      return refused('I could not tell the tier of this raid. Report it with `/raid`.');
    if (assumed.kind === 'refuse' || gyms.length === 0) return refused(refusalWords('no-gym'));
    const pending: PendingShot = {
      kind: 'gym',
      raid: assumed.raid,
      screenshotId: id,
      gymIds: gyms.map((gym) => gym.id),
      regionChannelId: message.channelId,
      guildRow,
      member: message.member,
      batch,
      giveBack,
    };
    const token = pendingShots.put(message.authorId, pending);
    // The gym is not named here: it is what is asked.
    const what = shortReading(storedReport(report), gymNamerOf(ctx), { gym: false });
    const read = report.gym.read ? ` I read "${plain(truncate(report.gym.read, 80))}".` : '';
    pending.question = truncate(`${what}. Which gym is it?${read}`, QUESTION_ROOM);
    pending.keep = await this.say(
      message,
      {
        content: pending.question,
        components: menuQuestion(
          token,
          'gym',
          'Choose the gym',
          gymMenuOptions(ctx, message.channelId, gyms, (id) => message.channelName(id)),
        ),
      },
      this.options.questionMs ?? QUESTION_MS,
      () => pendingShots.take(token, message.authorId),
    );
    return { kind: 'asked' };
  }

  /**
   * A clear gym of another region, read passively (Matt, 2026-10-22; legacy Pine asked too): a
   * raid already there is joined as one of this region would be, said in the reply that pings
   * the author; none there yet, the author is asked in a reply only they can answer whether to
   * report it there, Yes or No. Nothing is said when the gym lies in no region of the server
   * that has a forum.
   */
  private async elsewhere(
    batch: Batch,
    guildRow: number,
    raid: ScreenshotRaid,
    screenshotId: string | undefined,
    giveBack: () => void,
  ): Promise<ImageResult> {
    const { ctx } = this.options;
    const { message } = batch;
    const gym = ctx.gyms.get(raid.gymId);
    if (!gym) return refused(refusalWords('no-gym'));
    // Joined only, decided under the gym's lock: a raid reported there meanwhile is joined, and
    // none is made unasked (review A2).
    const reported = await reportShot(ctx, {
      gym,
      memberId: message.authorId,
      member: message.member,
      regionChannelId: message.channelId,
      guildRow,
      raid,
      screenshotId,
      joinOnly: true,
    });
    if (reported.kind === 'exists' || reported.kind === 'created') {
      return { kind: 'made', exists: outcomeWords(reported, gym) };
    }
    if (reported.kind !== 'none-there') {
      if (noPostMade(reported)) giveBack();
      return refused(outcomeWords(reported, gym));
    }
    // Asked only where a raid could be reported: a region of the server with a forum (review A3).
    const { region: there } = ctx.partyService.regionFor(gym, message.channelId);
    if (!there) return refused(refusalWords('no-gym'));
    // From the board nothing is asked (R1).
    if (batch.board) {
      return refused(
        elsewhereInBoard(plain(gym.nickname || gym.name), there.channelId, '/raid screenshot:'),
      );
    }
    const pending: PendingShot = {
      kind: 'gym',
      raid,
      screenshotId,
      gymIds: [gym.id],
      regionChannelId: message.channelId,
      guildRow,
      member: message.member,
      batch,
      giveBack,
    };
    const token = pendingShots.put(message.authorId, pending);
    pending.question = `<@${message.authorId}> ${elsewhereQuestion(plain(gym.nickname || gym.name), there.channelId)}`;
    pending.again = ASK_AGAIN_YES;
    pending.keep = await this.say(
      message,
      {
        content: pending.question,
        components: [yesNoRow(token)],
        ping: message.authorId,
      },
      this.options.questionMs ?? QUESTION_MS,
      () => pendingShots.take(token, message.authorId),
    );
    return { kind: 'asked' };
  }

  /**
   * A max battle's screenshot (plan 8X-S): a clear Power Spot of the message's region is reported
   * unasked (`reportMaxShot`: a battle there joined, its boss changed by a newer screenshot, or
   * refused), its words in the message's reply unless a new battle was made (whose link line the
   * region channel gets). With a mention a Power Spot that is not clear, or one of another region,
   * is asked about in a menu; one it does not know is refused, and the moderators told of a name
   * read surely (`ModerationReports.missingSpot`), which the refusal then says. Read passively it
   * never asks which Power Spot nor tells the moderators (Matt, 2026-10-22): a spot not told is
   * said in its short reply (`told`), a clear one of another region is joined there unasked, or
   * asked Yes or No about (`elsewhereSpot`), and what else it refuses is not said.
   */
  private async readMax(
    batch: Batch,
    outcome: MaxRead,
    guildRow: number,
    passive: boolean,
    giveBack: () => void,
  ): Promise<ImageResult> {
    const { ctx } = this.options;
    const { message } = batch;
    const { report, decision, id } = outcome;
    const times = ctx.config.settings.maxBattles;
    const serverId = message.guildId ?? '';
    // Read passively, a screen without a countdown is left alone, whatever it shows: an event's
    // picture of a boss has none (review S-1, Matt 2026-10-23). It was not kept either.
    if (passive && report.countdown === null) return { kind: 'ignored' };
    if (decision.kind === 'refuse') {
      if (decision.reason !== 'no-spot') return refused(maxRefusalWords(decision.reason, times));
      if (passive) return told(MAX_SPOT_UNTOLD);
      const words = maxRefusalWords('no-spot', times, decision.read);
      const missing = missingSpotName(decision, report);
      const staffTold =
        missing !== null &&
        ctx.reports.missingSpot({ serverId, channelId: message.channelId, name: missing });
      return refused(staffTold ? `${words} ${STAFF_TOLD}` : words);
    }
    if (decision.kind === 'ask' && decision.about === 'tier') return refused(MAX_TIER_UNKNOWN);
    if (decision.kind === 'ask') {
      if (batch.board && !passive) return refused(MAX_UNSURE_IN_BOARD);
      return passive
        ? told(MAX_SPOT_UNTOLD)
        : this.askSpot(batch, outcome, decision.spots, guildRow, giveBack);
    }
    const { match } = report.spot;
    // A clear spot of this region is reported unasked; one of another region is asked about
    // with a mention, and joined there or asked Yes or No about read passively (Matt's M1).
    const local = match.kind === 'clear' && match.spot.local;
    if (!local && !passive && batch.board) {
      // From the board nothing is asked (R1): pointed to `/max screenshot:`.
      const request =
        match.kind === 'clear'
          ? maxShotRequest(
              ctx,
              guildRow,
              decision.battle,
              report.boss?.name ?? '',
              message.channelId,
              id,
            )
          : undefined;
      return refused(request ? this.spotElsewhereWords(request) : MAX_UNSURE_IN_BOARD);
    }
    if (!local && !passive) {
      return this.askSpot(
        batch,
        outcome,
        match.kind === 'clear' ? [match.spot] : [],
        guildRow,
        giveBack,
      );
    }
    const request = maxShotRequest(
      ctx,
      guildRow,
      decision.battle,
      report.boss?.name ?? '',
      message.channelId,
      id,
    );
    if (!request) return refused(SPOT_GONE);
    const answer = await reportMaxShot(ctx, request, {
      member: { id: message.authorId, ...message.member },
      serverId,
      guildRow,
      staff: false,
      ...(local ? {} : { joinOnly: true }),
    });
    if (answer.kind === 'none-there') {
      return this.elsewhereSpot(batch, outcome, request, guildRow, giveBack);
    }
    if (maxShotGivesBack(answer)) giveBack();
    const words = maxShotWords(ctx, answer, request);
    if (!maxShotMade(answer)) return refused(words);
    // A new battle is said by its link line in the region channel; anything else in the reply.
    // From the board everything is said, by DM, and to a member who asked in their answer.
    const created = answer.kind === 'reported' && answer.result.outcome.kind === 'created';
    return created && !batch.board && !batch.asker
      ? { kind: 'made' }
      : { kind: 'made', exists: words };
  }

  /**
   * A clear Power Spot of another region, in the board's DM (R1): the command asks whether to
   * report it there; where it lies in no region of the server with a forum, as not clear.
   */
  private spotElsewhereWords(request: MaxShotRequest): string {
    const { region: there } = this.options.ctx.partyService.regionForSpot(
      request.spot,
      request.regionChannelId,
    );
    return there
      ? elsewhereInBoard(plain(maxSpotName(request.spot)), there.channelId, '/max screenshot:')
      : MAX_UNSURE_IN_BOARD;
  }

  /**
   * Asks the author which of these Power Spots a max battle's screenshot shows (plan 8X-S), with
   * a menu as the gym question's: the channel's region's first, another region's named.
   */
  private async askSpot(
    batch: Batch,
    outcome: MaxRead,
    spots: readonly SpotTitle[],
    guildRow: number,
    giveBack: () => void,
  ): Promise<ImageResult> {
    const { ctx } = this.options;
    const { message } = batch;
    const { report, id } = outcome;
    const times = ctx.config.settings.maxBattles;
    if (spots.length === 0) return refused(maxRefusalWords('no-spot', times, report.spot.read));
    const offered = spots.slice(0, MENU_SIZE);
    const pending: PendingShot = {
      kind: 'spot',
      spotIds: offered.map((spot) => spot.id),
      decide: outcome.withSpot,
      bossName: report.boss?.name ?? '',
      serverId: message.guildId ?? '',
      screenshotId: id,
      regionChannelId: message.channelId,
      guildRow,
      member: message.member,
      batch,
      giveBack,
      again: ASK_AGAIN_SPOT,
    };
    const token = pendingShots.put(message.authorId, pending);
    const read = report.spot.read ? ` I read "${plain(truncate(report.spot.read, 80))}".` : '';
    pending.question = truncate(
      `${shortMaxReading(report)}. Which Power Spot is it?${read}`,
      QUESTION_ROOM,
    );
    pending.keep = await this.say(
      message,
      {
        content: pending.question,
        components: menuQuestion(
          token,
          'spot',
          'Choose the Power Spot',
          spotMenuOptions(ctx, offered, message),
        ),
      },
      this.options.questionMs ?? QUESTION_MS,
      () => pendingShots.take(token, message.authorId),
    );
    return { kind: 'asked' };
  }

  /**
   * A clear Power Spot of another region with no battle there, read passively (Matt's M1, as
   * `elsewhere` for a gym): the author is asked Yes or No whether to report it there, in the reply
   * that pings them; nothing is said when the spot lies in no region of the server with a forum.
   */
  private async elsewhereSpot(
    batch: Batch,
    outcome: MaxRead,
    request: MaxShotRequest,
    guildRow: number,
    giveBack: () => void,
  ): Promise<ImageResult> {
    const { ctx } = this.options;
    const { message } = batch;
    const { region: there } = ctx.partyService.regionForSpot(request.spot, message.channelId);
    if (!there || request.spot.kind !== 'powerspot') return refused(SPOT_GONE);
    // From the board nothing is asked (R1).
    if (batch.board) {
      return refused(
        elsewhereInBoard(plain(maxSpotName(request.spot)), there.channelId, '/max screenshot:'),
      );
    }
    const pending: PendingShot = {
      kind: 'spot',
      spotIds: [request.spot.id],
      decide: outcome.withSpot,
      bossName: outcome.report.boss?.name ?? '',
      serverId: message.guildId ?? '',
      screenshotId: outcome.id,
      regionChannelId: message.channelId,
      guildRow,
      member: message.member,
      batch,
      giveBack,
      again: ASK_AGAIN_YES,
    };
    const token = pendingShots.put(message.authorId, pending);
    pending.question = `<@${message.authorId}> ${elsewhereQuestion(plain(maxSpotName(request.spot)), there.channelId)}`;
    pending.keep = await this.say(
      message,
      { content: pending.question, components: [yesNoRow(token)], ping: message.authorId },
      this.options.questionMs ?? QUESTION_MS,
      () => pendingShots.take(token, message.authorId),
    );
    return { kind: 'asked' };
  }

  /**
   * Once every image of a message made or joined a raid, the message has done its work: it
   * goes when it says nothing but the mention, and is marked ✅ otherwise.
   */
  private async finished(batch: Batch): Promise<void> {
    if (this.closed || batch.done || batch.made < batch.images) return;
    batch.done = true;
    const { message } = batch;
    // Read passively or with a mention alike (Matt, 2026-10-14; the legacy bot deleted it too).
    if (message.bare) await this.letGo(message);
    else await message.react(DONE).catch(() => undefined);
  }

  /** Deletes a message whose screenshots were all answered. */
  private async letGo(message: PostedMessage): Promise<void> {
    await message.delete().catch((err: unknown) => {
      this.options.ctx.log.warn(
        { err },
        'could not delete a message whose screenshots were answered',
      );
    });
  }

  /**
   * Replies to the message; the reply goes after `ms` (by default `replyMs`), then `after`. The
   * answer starts the time anew, as long as a reply's (a question that became its answer).
   */
  private async say(
    message: PostedMessage,
    payload: ReplyPayload,
    ms?: number,
    after?: () => void,
  ): Promise<ReplyKeep | undefined> {
    const { ctx } = this.options;
    if (this.closed) return undefined;
    const sent = await message.reply(payload).catch((err: unknown) => {
      ctx.log.warn({ err }, 'could not answer a message with screenshots');
      return undefined;
    });
    if (!sent) return undefined;
    const replyMs = this.options.replyMs ?? ctx.config.settings.messageCleanupDelayError;
    const start = (wait: number) => {
      const timer = setTimeout(() => {
        this.waiting.delete(timer);
        after?.();
        sent.delete().catch(() => undefined);
      }, wait);
      timer.unref();
      this.waiting.set(timer, sent);
      return timer;
    };
    let timer = start(ms ?? replyMs);
    /** Its time from now on, unless it is gone already (its time was up, or the bot closes). */
    const restart = (wait: number): boolean => {
      if (!this.waiting.delete(timer)) return false;
      clearTimeout(timer);
      timer = start(wait);
      return true;
    };
    return {
      answered: () => {
        restart(replyMs);
      },
      askAgain: () => restart(ms ?? replyMs),
    };
  }
}

/** A select menu holds this many options. */
const MENU_SIZE = 25;

/**
 * The question's controls: the menu (`shot:<token>:gym` of gyms, `shot:<token>:spot` of Power
 * Spots) and "Cancel".
 */
function menuQuestion(
  token: string,
  action: 'gym' | 'spot',
  placeholder: string,
  options: APISelectMenuOption[],
): Row[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action }),
          placeholder,
          options,
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'cancel' }),
          label: 'Cancel',
          style: ButtonStyle.Secondary,
        },
      ],
    },
  ];
}

/**
 * The options of a Power Spot menu: each by its title, one of another region than the message's
 * told apart by that region's name (as `menuDescription` tells a gym).
 */
function spotMenuOptions(
  ctx: Pick<AppContext, 'wayspots'>,
  spots: readonly SpotTitle[],
  message: Pick<PostedMessage, 'channelName'>,
): APISelectMenuOption[] {
  return spots.map((spot) => {
    const [elsewhere] = spot.local ? [] : ctx.wayspots.regionsOf(spot.id);
    const region = elsewhere === undefined ? undefined : message.channelName(elsewhere);
    return {
      label: truncate(spot.title, 100),
      value: spot.id,
      ...(region === undefined ? {} : { description: truncate(region, 100) }),
    };
  });
}

/**
 * What came of a report from a screenshot: the report's own outcome, or none made because it
 * would put the member in a forum somebody keeps them out of (`barred`) or because Discord could
 * not say whether it would (`unknown-access`).
 */
type ShotOutcome = ReportOutcome | { kind: 'barred' } | { kind: 'unknown-access' };

/**
 * Whether the raid's post could not be made for none of the member's doing: the bot may not make
 * posts in the forum, or the post was lost while it was made (plan 8S-3, as `/meetup`, `/train`
 * and `/raid` give back every `no-post`).
 */
function noPostMade(outcome: ShotOutcome): boolean {
  return outcome.kind === 'no-post';
}

/** What a screenshot's author is told when Discord cannot say whether they may see the forum. */
const ACCESS_UNKNOWN =
  'Discord cannot be reached just now, so nothing was reported. Try again in a moment.';

/**
 * Reports a raid from a screenshot as the member who posted it, unless it would put them in a
 * forum somebody keeps them out of: `reportBarred`, `/raid`'s and the map's own check (plan 8M-6).
 */
async function reportShot(
  ctx: AppContext,
  shot: {
    gym: Gym;
    memberId: string;
    member: MemberInfo;
    regionChannelId: string;
    guildRow: number;
    raid: ScreenshotRaid;
    screenshotId: string | undefined;
    /** Only a raid already at the gym is joined (`RaidReport.joinOnly`). */
    joinOnly?: true;
  },
): Promise<ShotOutcome> {
  let barred: boolean;
  try {
    barred = await reportBarred(
      reportAccessOf(ctx),
      shot.gym,
      shot.regionChannelId,
      shot.guildRow,
      shot.memberId,
      Date.now(),
    );
  } catch (err) {
    ctx.log.warn(
      { err, user: shot.memberId },
      'could not ask Discord whether a screenshot would report a raid in a forum its author is kept out of',
    );
    return { kind: 'unknown-access' };
  }
  if (barred) return { kind: 'barred' };
  const { raid } = shot;
  const settings = await ctx.users.get(shot.memberId);
  // A raid reported at the gym since the check, in a forum it did not see, is asked about where
  // the report would join it.
  const joining = mayJoinNoting(reportAccessOf(ctx), shot.memberId);
  const outcome = await ctx.partyService.reportRaid({
    mayJoin: joining.mayJoin,
    gym: shot.gym,
    reporterId: shot.memberId,
    reporter: shot.member,
    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
    autoStatus: settings.autoStatus,
    tier: raid.tier,
    boss: raid.boss ? raidBossRef(raid.boss) : null,
    ...(raid.hatched && !raid.boss ? { hatched: true } : {}),
    screenshot: { id: shot.screenshotId ?? null, timeUncertain: raid.timeUncertain },
    regionChannelId: shot.regionChannelId,
    ...(raid.time ? { time: raid.time } : {}),
    ...(shot.joinOnly ? { joinOnly: true } : {}),
  });
  const failed = joining.failure();
  if (failed) {
    ctx.log.warn(
      { err: failed.err, user: shot.memberId },
      'could not ask Discord whether a screenshot would report a raid in a forum its author is kept out of',
    );
    return { kind: 'unknown-access' };
  }
  if (outcome.kind === 'created' && shot.screenshotId !== undefined) {
    await ctx.screenshots.inUse(shot.screenshotId);
  }
  return outcome;
}

/** What came of a report, in a short sentence. */
function outcomeWords(outcome: ShotOutcome, gym: Gym): string {
  const name = plain(gym.nickname || gym.name);
  switch (outcome.kind) {
    case 'created':
      return outcome.party.forumPostId === null
        ? endSentence(`Reported the raid at ${name}`)
        : `Reported the raid at ${name}: <#${outcome.party.forumPostId}>.`;
    case 'exists': {
      const post = outcome.party.forumPostId === null ? '' : `: <#${outcome.party.forumPostId}>`;
      const joined = outcome.joined ? ' You have been signed up for it.' : '';
      return `${endSentence(`There is already a raid at ${name}${post}`)}${joined}`;
    }
    case 'gym-gone':
      return `${name} was removed from my gym list just now.`;
    case 'no-region':
      return `${name} is not in any region of this server.`;
    case 'no-forum':
      return `The region <#${outcome.region.channelId}> has no raid forum yet.`;
    case 'no-post':
      return noPostWords(outcome.refused, (channelId) => `<#${channelId}>`);
    case 'barred':
      return REPORT_BARRED;
    case 'unknown-access':
      return ACCESS_UNKNOWN;
    case 'none-there':
      return `There is no raid at ${name} to join.`;
  }
}

const EXPIRED = 'That question has expired. Post the screenshot again.';
/** `EXPIRED` for a question asked of a member who used "Read screenshot" (plan 7M, review F6). */
const EXPIRED_ASKED = 'That question has expired. Use Read screenshot on the message again.';
const NOT_YOURS = 'That is somebody else’s screenshot.';

/**
 * What a press on a question that expired is told. The question of a member who asked for a
 * message to be read is private (`askedMessage` answers so), a mention's a reply in the channel:
 * told apart by the message pressed on, which outlives the question kept for it (a restart, or
 * the question's time) where a flag on `PendingShot` would not.
 */
function expiredWords(interaction: ButtonInteraction | StringSelectMenuInteraction): string {
  return interaction.message.flags.has(MessageFlags.Ephemeral) ? EXPIRED_ASKED : EXPIRED;
}

/** A press on a question answered already: only acknowledged. */
async function answeredAlready(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
): Promise<boolean> {
  if (!answeredShots.has(token)) return false;
  await interaction.deferUpdate().catch(() => undefined);
  return true;
}

/** The pending question of a control, still kept: refuses anybody but its author. */
function peeked(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
): PendingShot | undefined {
  const found = pendingShots.peek(token, interaction.user.id);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  return found === 'expired' ? undefined : found.value;
}

/** "Cancel" under the question about the gym: the question goes. */
export async function cancelShot(interaction: ButtonInteraction, token: string): Promise<void> {
  if (await answeredAlready(interaction, token)) return;
  const request = peeked(interaction, token);
  if (!request) {
    await interaction.update({ content: expiredWords(interaction), components: [] });
    return;
  }
  await interaction.deferUpdate();
  if (pendingShots.take(token, interaction.user.id) === 'expired') return;
  answeredShots.set(token, true);
  await interaction.deleteReply().catch(() => undefined);
}

/**
 * The gym chosen in the question: the raid is reported as its author, and the question says
 * what came of it until its time is up; the message goes once every image made a raid.
 */
export async function chooseShotGym(
  interaction: StringSelectMenuInteraction,
  token: string,
  ctx: AppContext,
): Promise<void> {
  if (await answeredAlready(interaction, token)) return;
  const request = peeked(interaction, token);
  if (!request) {
    await interaction.update({ content: expiredWords(interaction), components: [] });
    return;
  }
  if (request.kind !== 'gym') throw new UserError(expiredWords(interaction));
  const gymId = Number(interaction.values[0]);
  await answerShot(interaction, token, ctx, request, gymId, true);
}

/**
 * The Power Spot chosen in the question about a max battle's screenshot (plan 8X-S): its battle
 * is reported as its author, as a gym chosen reports a raid.
 */
export async function chooseShotSpot(
  interaction: StringSelectMenuInteraction,
  token: string,
  ctx: AppContext,
): Promise<void> {
  if (await answeredAlready(interaction, token)) return;
  const request = peeked(interaction, token);
  if (!request) {
    await interaction.update({ content: expiredWords(interaction), components: [] });
    return;
  }
  if (request.kind !== 'spot') throw new UserError(expiredWords(interaction));
  await answerSpot(interaction, token, ctx, request, interaction.values[0], true);
}

/**
 * Yes under the question whether to report a clear gym or Power Spot of another region, read
 * passively: the raid or max battle is reported there as its author, with the checks of the
 * menu's answer (Matt, 2026-10-22).
 */
export async function confirmShot(
  interaction: ButtonInteraction,
  token: string,
  ctx: AppContext,
): Promise<void> {
  if (await answeredAlready(interaction, token)) return;
  const request = peeked(interaction, token);
  if (!request) {
    await interaction.update({ content: expiredWords(interaction), components: [] });
    return;
  }
  if (request.kind === 'spot') {
    await answerSpot(interaction, token, ctx, request, request.spotIds[0], false);
    return;
  }
  await answerShot(interaction, token, ctx, request, request.gymIds[0], false);
}

/**
 * Takes an answered question, once its press is acknowledged (a press that could not be
 * acknowledged leaves the question): false when another press took it meanwhile, which the
 * question then says. Answered, the question stays from now on as an answer does.
 */
async function taken(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
  request: PendingShot,
): Promise<boolean> {
  await interaction.deferUpdate();
  if (pendingShots.take(token, interaction.user.id) === 'expired') {
    // Another press took the question meanwhile: the question says what came of that one.
    if (answeredShots.has(token)) return false;
    await interaction
      .editReply({ content: expiredWords(interaction), components: [] })
      .catch(() => undefined);
    return false;
  }
  answeredShots.set(token, true);
  request.keep?.answered();
  return true;
}

/**
 * Discord could not say whether the author may be put in the forum, and may answer in a moment:
 * the question stays, its controls too, with a question's time again, to be answered again
 * (true); unless its time was up meanwhile or somebody deleted it, and it is gone (false: the
 * author is told as for any outcome).
 */
async function askedAgain(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
  request: PendingShot,
): Promise<boolean> {
  if (!request.keep?.askAgain()) return false;
  answeredShots.delete(token);
  pendingShots.put(interaction.user.id, request, token);
  const asked = await interaction
    .editReply({
      content: [request.question, request.again ?? ASK_AGAIN].filter(Boolean).join('\n'),
    })
    .then(() => true)
    .catch(() => false);
  if (asked) return true;
  pendingShots.take(token, interaction.user.id);
  answeredShots.set(token, true);
  return false;
}

/**
 * The question becomes the answer and goes at its time: a private follow-up would stand under
 * "Message could not be loaded" once the question it answers was deleted. Only a question that
 * went meanwhile (its time was up while the report was made) is answered privately.
 */
async function answerInPlace(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  words: string,
): Promise<void> {
  const edited = await interaction
    .editReply({ content: words, components: [] })
    .then(() => true)
    .catch(() => false);
  if (!edited) {
    await interaction
      .followUp({ content: words, flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
  }
}

/** The author's message has one more image that made or joined a party. */
async function madeOne(request: PendingShot): Promise<void> {
  request.batch.made++;
  await request.batch.finish();
}

/**
 * Reports the raid of an answered question at the gym answered (`picked`: chosen in the menu,
 * which the record keeps), and has the question say what came of it until its time is up; the
 * message goes once every image made a raid.
 */
async function answerShot(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
  ctx: AppContext,
  request: PendingGym,
  gymId: number | undefined,
  picked: boolean,
): Promise<void> {
  const gym =
    gymId !== undefined && request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
  if (!gym) {
    await interaction.update({ content: 'That gym no longer exists.', components: [] });
    return;
  }
  if (!(await taken(interaction, token, request))) return;
  let outcome: ShotOutcome;
  try {
    outcome = await reportShot(ctx, {
      gym,
      memberId: interaction.user.id,
      member: request.member,
      regionChannelId: request.regionChannelId,
      guildRow: request.guildRow,
      raid: { ...request.raid, gymId: gym.id },
      screenshotId: request.screenshotId,
    });
  } catch (err) {
    await interaction
      .editReply({ content: 'Nothing was reported.', components: [] })
      .catch(() => undefined);
    throw err;
  }
  if (noPostMade(outcome)) request.giveBack();
  if (outcome.kind === 'unknown-access' && (await askedAgain(interaction, token, request))) return;
  if (picked && request.screenshotId !== undefined)
    await ctx.screenshots.picked(request.screenshotId, gym.id);
  await answerInPlace(interaction, outcomeWords(outcome, gym));
  if (outcome.kind === 'created' || outcome.kind === 'exists') await madeOne(request);
}

/**
 * Reports the max battle of an answered question at the Power Spot answered (plan 8X-S;
 * `picked`: chosen in the menu, which the record keeps), as `answerShot` reports a raid: the
 * decision made again with the spot (`withSpot`), then `reportMaxShot`.
 */
async function answerSpot(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
  ctx: AppContext,
  request: PendingSpot,
  spotId: string | undefined,
  picked: boolean,
): Promise<void> {
  const decision =
    spotId !== undefined && request.spotIds.includes(spotId) ? request.decide(spotId) : undefined;
  const asked =
    decision?.kind === 'report'
      ? maxShotRequest(
          ctx,
          request.guildRow,
          decision.battle,
          request.bossName,
          request.regionChannelId,
          request.screenshotId,
        )
      : undefined;
  if (spotId === undefined || !decision || (decision.kind === 'report' && !asked)) {
    await interaction.update({ content: SPOT_GONE, components: [] });
    return;
  }
  if (!(await taken(interaction, token, request))) return;
  if (!asked) {
    // Chosen, the spot leaves only what the screenshot could not tell (the tier) to refuse.
    const words =
      decision.kind === 'refuse'
        ? maxRefusalWords(decision.reason, ctx.config.settings.maxBattles)
        : MAX_TIER_UNKNOWN;
    await answerInPlace(interaction, words);
    return;
  }
  let answer;
  try {
    answer = await reportMaxShot(ctx, asked, {
      member: { id: interaction.user.id, ...request.member },
      serverId: request.serverId,
      guildRow: request.guildRow,
      staff: false,
    });
  } catch (err) {
    await interaction
      .editReply({ content: 'Nothing was reported.', components: [] })
      .catch(() => undefined);
    throw err;
  }
  if (maxShotGivesBack(answer)) request.giveBack();
  if (answer.kind === 'unknown-access' && (await askedAgain(interaction, token, request))) return;
  if (picked && request.screenshotId !== undefined)
    await ctx.screenshots.pickedSpot(request.screenshotId, spotId);
  await answerInPlace(interaction, maxShotWords(ctx, answer, asked));
  if (maxShotMade(answer)) await madeOne(request);
}
