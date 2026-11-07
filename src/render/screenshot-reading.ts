import type { APIButtonComponent } from 'discord.js';
import type { V2Message } from '../discord/party-gateway.js';
import {
  clockText,
  countdownText,
  type StoredMaxReport,
  type StoredReport,
} from '../domain/ocr/screenshot-record.js';
import { TYPED_BOSS_REFUSED } from '../domain/ocr/max-decision.js';
import { maxBossTitle, maxTierLabel } from '../domain/pogo/max-tier.js';
import type { ReportDoubt } from '../domain/ocr/screenshot-report.js';
import { raidTierLabel } from '../domain/pogo/raid-tier.js';
import { cutMarkdown, plain, timestamp, truncate } from './text.js';
import { actionRow, container, section, separator, textDisplay, thumbnail } from './v2.js';

/**
 * What a screenshot showed Pine, in words: for `/read-screenshot`, the question of `/raid`, the
 * answer to a mention and the "Screenshot feedback" button. Each element raw (as read) and as
 * understood, so that a member can see where a mistake came from. Pure: the gym's name is given.
 */

/** The name of a gym by its id; undefined for one that no longer exists. */
export type GymNamer = (gymId: number) => string | undefined;

/** Text that was read off a member's screenshot, shown as code (so nothing in it is Markdown). */
function quoted(text: string | null): string {
  if (text === null || text.trim() === '') return 'nothing';
  return `\`${truncate(text.replace(/`/g, "'"), 80)}\``;
}

/** The doubts in words, one short sentence each. */
const DOUBT_WORDS: Readonly<Record<ReportDoubt, string>> = {
  'not-a-raid-screen': 'This does not look like the screen of a raid.',
  'no-gym': 'I found no gym of this server with that name.',
  'gym-unclear': 'The gym’s name fits more than one gym, or only nearly.',
  'no-time': 'I could not read the countdown.',
  'time-guessed': 'The time is a guess from when the screenshot was posted: I found no clock.',
  'time-stale': 'The screenshot was taken a while before it was posted.',
  'time-sources-differ': 'The name of the file and the phone’s clock say different times.',
  'time-past': 'The time it gives has already passed.',
  'countdown-long': 'The countdown is longer than a raid or an egg lasts.',
  'stage-unknown': 'I could not tell whether it is an egg or a hatched raid.',
  'tier-unknown': 'I could not tell the tier.',
  'tier-from-name':
    'I could not read the tier heads: the tier comes from the mega’s name, and its CP fits it.',
  'heads-unverified': 'I have not seen that many tier heads on a screenshot before.',
  'heads-only': 'The tier comes from the heads alone: the boss may hide one.',
  'heads-uncertain': 'There may be a tier head I missed.',
  'heads-boss-conflict': 'The boss I found is of another tier than the heads say.',
  'boss-unknown': 'I could not tell the boss.',
  'boss-from-name': 'The boss comes from its name alone; its CP fits no current boss.',
  'boss-unlisted':
    'The boss is on no list of current raid bosses: its CP and name fit it at the tier of the heads.',
  'boss-name-differs': 'The name under the CP is not the boss its CP belongs to.',
  elite: 'It looks like an elite raid.',
  'shadow-unlisted':
    'No current boss of that tier matches the color of the screen (shadow or not).',
  'shadow-differs': 'Whether the boss is a shadow does not match the color of the screen.',
};

/**
 * A doubt in words. A guessed time names the clock that was read, when one was: it was guessed
 * because that clock did not fit the upload (a screenshot taken long before), not for want of one.
 */
export function doubtWords(doubt: string, clock: StoredReport['clock'] = null): string {
  const read = clockText(clock);
  if (doubt === 'time-guessed' && read !== null) {
    return `The time is a guess from when the screenshot was posted: the phone’s clock (${read}) does not fit that time.`;
  }
  return DOUBT_WORDS[doubt as ReportDoubt] ?? doubt;
}

/** The doubts as a list, or nothing when there are none; `clock` is the clock read, if any. */
export function doubtLines(
  doubts: readonly string[],
  clock: StoredReport['clock'] = null,
): string[] {
  return doubts.map((doubt) => `- ${doubtWords(doubt, clock)}`);
}

function gymLine(report: StoredReport, gymName: GymNamer): string {
  const { gym } = report;
  const found = gym.gymId === null ? undefined : gymName(gym.gymId);
  const understood =
    found === undefined ? 'no gym' : `**${plain(found)}**${gym.clear ? '' : ' (not sure)'}`;
  return `**Gym:** read ${quoted(gym.read)} → ${understood}`;
}

function timeLine(report: StoredReport): string {
  const clock = clockText(report.clock);
  const countdown = countdownText(report.countdown);
  const read = `clock ${clock === null ? 'not read' : `\`${clock}\``}, countdown ${
    countdown === null ? 'not read' : `\`${countdown}\``
  }`;
  const { time } = report;
  const understood =
    time === null
      ? 'no time'
      : 'hatch' in time
        ? `hatches at ${timestamp(time.hatch)}`
        : `ends at ${timestamp(time.end)}`;
  const guessed = report.doubts.includes('time-guessed') ? ' (guessed from the upload)' : '';
  return `**Time:** ${read} → ${understood}${guessed}`;
}

function stageWords(report: StoredReport): string {
  return report.stage === null ? 'cannot tell' : report.stage === 'egg' ? 'an egg' : 'hatched';
}

function tierLine(report: StoredReport): string {
  const heads =
    report.heads === null ? 'no heads' : `${report.heads} head${report.heads === 1 ? '' : 's'}`;
  const tier = report.tier === null ? 'no tier' : `**${raidTierLabel(report.tier)}**`;
  return `**Tier:** ${heads} → ${tier}`;
}

function bossLine(report: StoredReport): string {
  const cp = report.cp === null ? 'no CP' : `CP \`${report.cp}\``;
  const understood = report.boss ? `**${plain(report.boss.name)}**` : 'no boss';
  return `**Boss:** ${cp}, name read ${quoted(report.bossName)} → ${understood}`;
}

/**
 * Every element, raw and as understood, and what was not sure (`doubts: false` leaves that out,
 * for a message that says it apart: `screenshotMessage`).
 */
export function readingLines(
  report: StoredReport,
  gymName: GymNamer,
  options: { doubts?: boolean } = {},
): string[] {
  const lines = [
    gymLine(report, gymName),
    timeLine(report),
    `**Egg or hatched:** ${stageWords(report)}`,
    tierLine(report),
  ];
  if (report.stage !== 'egg') lines.push(bossLine(report));
  lines.push(`**Shadow purple:** ${(report.purple * 100).toFixed(1)}% of the screen`);
  if (report.doubts.length > 0 && options.doubts !== false)
    lines.push('', 'Not sure:', ...doubtLines(report.doubts, report.clock));
  return lines;
}

/** The colour of what is said about a screenshot (`/read-screenshot`, Screenshot feedback). */
export const SHOT_COLOUR = 0xf1c40f;

/**
 * How much room the reading and the doubts of a screenshot take at most: with the decision and
 * the question well within the 4,000 characters of a components-v2 message.
 */
const READING_ROOM = 1_800;
const DOUBTS_ROOM = 1_200;

/** What a message about a screenshot shows beside its reading (`screenshotMessage`). */
interface ShotView {
  /** What Pine did, or would do, with it (`decisionWords`). */
  decision: string;
  /** The question under it ("Did I read it right?"); none when nothing can be answered. */
  question?: string | undefined;
  /** The screenshot beside what was read: an https address or `attachment://<file>`. */
  picture?: string | undefined;
  /** "All right" and "Something is wrong". */
  buttons?: readonly APIButtonComponent[] | undefined;
  /**
   * A pane of a split screenshot (plan 7P): its place ("Top", "Left") heads the reading, and the
   * message holds `of` panes, each in its share of the room.
   */
  pane?: { place: string; of: number };
}

/** A pane's place in words: "Top", "Bottom", "Left", "Right". */
export function placeName(side: 'top' | 'bottom' | 'left' | 'right'): string {
  return `${side.slice(0, 1).toUpperCase()}${side.slice(1)}`;
}

/** What a message about a raid's screenshot shows (`screenshotMessage`). */
export interface ScreenshotView extends ShotView {
  report: StoredReport;
  gymName: GymNamer;
}

/** What a message about a max battle's screenshot shows (`maxScreenshotMessage`, plan 8X-S). */
export interface MaxScreenshotView extends ShotView {
  report: StoredMaxReport;
}

/**
 * What a screenshot showed Pine as a components-v2 message (`/read-screenshot`, Screenshot
 * feedback; plan 8B-4): one container of `SHOT_COLOUR`, what was read beside the screenshot
 * itself (a plain text without a picture), the doubts in small print, a line, what Pine does
 * with such a screenshot and the question, and the buttons inside.
 */
export function screenshotMessage(view: ScreenshotView): V2Message {
  const { report } = view;
  return shotMessage(
    view,
    readingLines(report, view.gymName, { doubts: false }),
    report.doubts.map((doubt) => doubtWords(doubt, report.clock)),
  );
}

/** `screenshotMessage` of a max battle's screenshot (plan 8X-S): its own reading and doubts. */
export function maxScreenshotMessage(view: MaxScreenshotView): V2Message {
  const { report } = view;
  return shotMessage(
    view,
    maxReadingLines(report, { doubts: false }),
    report.doubts.map((doubt) => maxDoubtWords(doubt, report.clock)),
  );
}

function shotMessage(
  view: ShotView,
  lines: readonly string[],
  doubtTexts: readonly string[],
): V2Message {
  const share = view.pane?.of ?? 1;
  const heading = view.pane ? [`**${view.pane.place}**`] : [];
  const read = cutMarkdown([...heading, ...lines].join('\n'), Math.floor(READING_ROOM / share));
  const doubts =
    doubtTexts.length === 0
      ? undefined
      : cutMarkdown(`-# Not sure: ${doubtTexts.join(' ')}`, Math.floor(DOUBTS_ROOM / share));
  const buttons = view.buttons ?? [];
  return {
    v2: true,
    components: [
      container(SHOT_COLOUR, [
        view.picture === undefined ? textDisplay(read) : section(read, thumbnail(view.picture)),
        ...(doubts === undefined ? [] : [textDisplay(doubts)]),
        separator(),
        textDisplay([view.decision, view.question].filter(Boolean).join('\n')),
        ...(buttons.length === 0 ? [] : [actionRow([...buttons])]),
      ]),
    ],
  };
}

/**
 * What the screenshot shows, in one line: `T5 egg at Heinz Plant, hatching at 13:49`. Without the
 * gym (`gym: false`) when the gym is what is asked about; a raid whose stage was not told is a
 * `raid`.
 */
export function shortReading(
  report: StoredReport,
  gymName: GymNamer,
  options: { gym?: boolean } = {},
): string {
  const found =
    options.gym === false || report.gym.gymId === null ? undefined : gymName(report.gym.gymId);
  const what =
    report.tier === null
      ? 'A raid'
      : report.boss && report.stage === 'hatched'
        ? `${plain(report.boss.name)} (${raidTierLabel(report.tier)})`
        : `${raidTierLabel(report.tier)} ${report.stage === 'egg' ? 'egg' : 'raid'}`;
  const where = found === undefined ? '' : ` at ${plain(found)}`;
  const { time } = report;
  const when =
    time === null
      ? ''
      : 'hatch' in time
        ? `, hatching at ${timestamp(time.hatch)}`
        : `, ending at ${timestamp(time.end)}`;
  return `${what}${where}${when}`;
}

/** The first and last battle times of the day (`settings.maxBattles`), which refusals name. */
export interface BattleTimes {
  firstBattle: string;
  lastBattle: string;
}

/**
 * Why a max battle's screenshot was not reported (`decideMax`'s `refuse`, plan 8X-S): `read` is
 * the Power Spot's name as read, for `no-spot`. `/max`'s own words where `/max` says the same.
 */
export function maxRefusalWords(
  reason: string,
  times: BattleTimes,
  read: string | null = null,
  passive = false,
): string {
  switch (reason) {
    case 'two-screens':
      return TWO_SCREENS;
    case 'several':
      return `This screenshot shows two max battles: ${reportBothWords('it', passive)}.`;
    case 'not-a-max-screen':
      return 'That is a raid: use `/raid screenshot:`, or post it with a mention.';
    case 'over-for-today':
      return `Max battles are over for today: they can be fought from ${times.firstBattle} to ${times.lastBattle}.`;
    case 'battle-over':
      return MAX_BATTLE_OVER;
    case 'before-first':
      return `That battle ends before max battles can be fought (${times.firstBattle}).`;
    case 'no-spot':
      return read === null || read.trim() === ''
        ? 'I could not read the name of the Power Spot: use `/max spot:`.'
        : `I do not know a Power Spot called "${plain(truncate(read, 80))}" here: use \`/max spot:\`.`;
    case 'no-boss':
      return 'I could not tell which boss: use `/max`.';
    case TYPED_BOSS_REFUSED:
      return 'The boss typed beside it cannot battle as this screen shows, so nothing was reported.';
    default:
      return 'This does not look like the screen of a max battle, so I made nothing of it.';
  }
}

/** `/raid screenshot:` given a max battle's screen (plan 8X-S): the wrong picture. */
export const MAX_SCREEN_FOR_RAID =
  'That is a max battle: use `/max screenshot:`, or post it with a mention.';

/** A max battle's countdown that is over: by the reading, or by the time it would be reported. */
export const MAX_BATTLE_OVER = 'That battle has ended.';

/** Said of a max battle's screenshot whose tier could not be told (`decideMax` asks it). */
export const MAX_TIER_UNKNOWN =
  'I could not tell the tier of this max battle: use `/max` with `tier:`.';

/** The passive reading's one reply about a max battle's screenshot it could not place (Matt). */
export const MAX_SPOT_UNTOLD = 'I could not tell which Power Spot this is: use `/max screenshot:`.';

/** Added to `no-spot`'s words when the moderators were told the Power Spot may be missing. */
export const STAFF_TOLD = 'I have let the staff know Pine may be missing this Power Spot.';

/**
 * What a max battle's screenshot shows, in one line, without its Power Spot (which is asked):
 * `Dynamax Machop (2★), ending at 14:28`; a boss not told is `A max battle`; `label` names a boss
 * the member typed in its place.
 */
export function shortMaxReading(report: StoredMaxReport, label?: string): string {
  const what =
    label ??
    (report.boss && report.tier
      ? plain(maxBossTitle(report.boss.name, report.tier))
      : 'A max battle');
  return report.end === null ? what : `${what}, ending at ${timestamp(report.end)}`;
}

/** A max report's doubts in words, one short sentence each (those of the moment as a raid's). */
const MAX_DOUBT_WORDS: Readonly<Record<string, string>> = {
  'not-a-max-screen': 'This does not look like the screen of a max battle.',
  'no-spot': 'I found no Power Spot of this server with that name.',
  'spot-unclear': 'The Power Spot’s name fits more than one Power Spot, or only nearly.',
  'spot-read-poorly': 'The Power Spot’s name was hard to read.',
  'no-boss': 'I could not tell the boss.',
  'boss-unlisted': 'The boss is on no list of current max bosses.',
  'tier-unknown': 'I could not tell the tier.',
  'heads-boss-conflict': 'The boss I found is of another tier than the heads say.',
  'heads-form-conflict': 'The heads do not fit the kind of battle the screen says.',
  'no-time': 'I could not read the countdown, so the battle ends as `/max` would end it.',
};

/** A max report's doubt in words (`doubtWords` for the moment's). */
export function maxDoubtWords(doubt: string, clock: StoredReport['clock'] = null): string {
  return MAX_DOUBT_WORDS[doubt] ?? doubtWords(doubt, clock);
}

/** A max report's doubts as a list, or nothing when there are none. */
export function maxDoubtLines(
  doubts: readonly string[],
  clock: StoredReport['clock'] = null,
): string[] {
  return doubts.map((doubt) => `- ${maxDoubtWords(doubt, clock)}`);
}

const FORM_WORDS = { dynamax: 'Dynamax', gigantamax: 'Gigantamax', eternamax: 'Eternamax' };

/**
 * A max battle's screenshot's every element, raw and as understood (plan 8X-S, as `readingLines`
 * for a raid): the Power Spot as read and as matched, the time, the heads and the form with the
 * tier, the boss; and what was not sure (`doubts: false` leaves that out).
 */
export function maxReadingLines(
  report: StoredMaxReport,
  options: { doubts?: boolean } = {},
): string[] {
  const { match } = report.spot;
  const spot =
    match.kind === 'clear'
      ? `**${plain(match.spot.title)}**`
      : match.kind === 'candidates' && match.spots[0]
        ? `**${plain(match.spots[0].title)}** (not sure)`
        : 'no Power Spot';
  const clock = clockText(report.clock);
  const countdown = countdownText(report.countdown);
  const ends =
    report.end === null
      ? 'no end: max battles were over'
      : `ends at ${timestamp(report.end)}${report.endFrom === 'default' ? ' (as `/max` would end it)' : ''}`;
  const guessed = report.doubts.includes('time-guessed') ? ' (guessed from the upload)' : '';
  const heads =
    report.heads === null ? 'no heads' : `${report.heads} head${report.heads === 1 ? '' : 's'}`;
  const form = report.form === null ? 'no max battle' : FORM_WORDS[report.form];
  const tier = report.tier === null ? 'no tier' : `**${maxTierLabel(report.tier)}**`;
  const boss = report.boss ? `**${plain(report.boss.name)}**` : 'no boss';
  const lines = [
    `**Power Spot:** read ${quoted(report.spot.read)} → ${spot}`,
    `**Time:** clock ${clock === null ? 'not read' : `\`${clock}\``}, countdown ${
      countdown === null ? 'not read' : `\`${countdown}\``
    } → ${ends}${guessed}`,
    `**Tier:** ${heads}, ${form} → ${tier}`,
    `**Boss:** name read ${quoted(report.speciesRead)} → ${boss}`,
  ];
  if (report.doubts.length > 0 && options.doubts !== false)
    lines.push('', 'Not sure:', ...maxDoubtLines(report.doubts, report.clock));
  return lines;
}

/** A picture of two screens that could not be told apart (plan 7P, design section 4). */
export const TWO_SCREENS =
  'This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own.';

/**
 * How a member reports both screens of a split screenshot (plan 7P, Matt's Q1): with a mention
 * of the bot, or, where screenshots are read passively (`passive`), by posting `what` as it is.
 * Every pointer of 7P is worded by this.
 */
export function reportBothWords(what: string, passive: boolean): string {
  return passive
    ? `post ${what} in the channel to report both`
    : `post ${what} in the channel with a mention of me to report both`;
}

/**
 * Why a screenshot was not made into a raid (`refuse`'s reason); `passive`: screenshots are
 * read passively where it was sent (for `several`'s pointer).
 */
export function refusalWords(reason: string, passive = false): string {
  switch (reason) {
    case 'no-gym':
      return 'I could not find the gym of this screenshot among this server’s gyms.';
    case 'raid-over':
      return 'By its countdown this raid has already ended.';
    case 'elite-egg-time':
      return 'I could not read when this Elite egg hatches: report it with `/raid` and its hatch time.';
    case 'two-screens':
      return TWO_SCREENS;
    case 'several':
      return `This screenshot shows two screens of one kind: ${reportBothWords('it', passive)}.`;
    default:
      return 'This does not look like the screen of a raid, so I made nothing of it.';
  }
}
