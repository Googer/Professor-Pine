import { maxEnded } from '../domain/party/max.js';
import { maxBossTierLabel } from '../domain/pogo/max-tier.js';
import {
  partyWord,
  type MaxParty,
  type MeetupParty,
  type PartyType,
  type RaidParty,
  type TimedParty,
  type TrainParty,
} from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import { TRAIN_KIND_WORDS } from './train-words.js';
import { MEETUP_TITLE_KIND } from './meetup-post.js';
import { TRAIN_TITLE_KIND } from './train-post.js';
import {
  RAID_LEVELS,
  raidTier,
  raidWords,
  sameRaidTier,
  type RaidLevel,
  type RaidTier,
} from '../domain/pogo/raid-tier.js';
import type { APIComponentInContainer } from 'discord.js';
import type { V2Message } from '../discord/party-gateway.js';
import { isToday, partyStart } from '../domain/party/board-day.js';
import { startTimeOf, timedOver } from '../domain/party/timed.js';
import { routeFinished } from '../domain/party/train.js';
import { TEXT_BUDGET, trainerCount } from './party-post.js';
import { linkTextOf } from './raid-post.js';
import { count, plain, timestamp } from './text.js';
import { container, LIST_COLOUR, separator, textDisplay } from './v2.js';

/**
 * The title of the region's board (plan 8R-9; open to members' commands since plan 8R-9F): its
 * pinned post that lists the region's
 * raids, max battles, trains and meetups, today's and those coming up (spec 5.1; plan 8X-G, Matt
 * 2026-10-22: every kind of party), with "Today’s Stops" below. Inside the region's forum the
 * title needs no region name.
 */
export const SUMMARY_TITLE = 'Today and coming up';

/**
 * The titles the summary post had before (B12): "Active raids" before plan 8X-G, "Going on now"
 * before plan 8R-9. A post of one of them the bot made is taken over as the region's summary
 * (`takeOverSummary`) and renamed with its next edit.
 */
export const LEGACY_SUMMARY_TITLES: readonly string[] = ['Active raids', 'Going on now'];

/** A raid for a list: the party and the title its post has. */
export interface ListedRaid {
  party: RaidParty;
  title: string;
}

/** When a raid ends, or the latest it can; raids are listed in this order. */
function endOf(party: RaidParty): number {
  return party.endTime ?? party.lastPossibleTime ?? Infinity;
}

/**
 * A raid in a list: its post (or its title while it has none), when it hatches or ends, and how
 * many trainers are signed up. The summary of a region and `/find-gym` list raids so.
 */
export function raidLine({ party, title }: ListedRaid, now: number): string {
  const post = party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
  const stage = raidStage(party, now);
  let when = 'no time set';
  if (party.hatchTime !== null && party.endTime !== null) {
    when =
      stage === 'egg'
        ? `hatches ${timestamp(party.hatchTime, 'R')}`
        : `ends ${timestamp(party.endTime, 'R')}`;
  }
  return `${post} · ${when} · ${trainerCount(party)}`;
}

/** A max battle for a list: the party and the title its post has (plan 8X-3). */
export interface ListedMax {
  party: MaxParty;
  title: string;
}

/** The heading of the max battles in a region's list, after its raids (design 3.3). */
export const MAX_BATTLES_HEADING = '**Max battles**';

/** The order of the max battles in a list: 5 stars down to 1, Gigantamax last (as `/max`). */
const MAX_LIST_ORDER = ['D5', 'D4', 'D3', 'D2', 'D1', 'G'] as const;

/** A max battle in a list: its post, its tier, when it ends, how many come. */
function maxLine({ party, title }: ListedMax): string {
  const post = party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
  const end = party.endTime ?? party.lastPossibleTime;
  const when = end === null ? 'no time set' : `ends ${timestamp(end, 'R')}`;
  const { boss, tier } = party.max;
  const shown = maxBossTierLabel({ key: 'key' in boss ? boss.key : undefined }, tier);
  return `${post} · ${shown} · ${when} · ${trainerCount(party)}`;
}

/** A meetup for a list: the party and the title its post has. */
export interface ListedMeetup {
  party: MeetupParty;
  title: string;
}

/** The heading of the meetups in a region's list, under its raids. */
export const MEETUPS_HEADING = '**Meetups**';
/**
 * The room the trains and the meetups of a list are each sure of, whatever stands above them:
 * the raids are fitted into the rest of the message first, and each section then has all that
 * is left over what the sections after it are sure of.
 */
const SECTION_ROOM = 600;

/** How far ahead a time is said relatively ("in 5 hours"); beyond it, by date and time. */
const RELATIVE_WITHIN_MS = 24 * 60 * 60_000;

/**
 * A time ahead in a list (plan 8X-H, G4, Matt 2026-10-23): within a day Discord's relative stamp;
 * beyond it, which Discord rounds ("in 4 days" for 3 days and 15 hours), its date-and-time stamp
 * (`f`), which each reader's client draws from the epoch in their own time zone, daylight saving
 * included. The switch to the relative stamp comes at the summary's next draw (at the latest the
 * hourly upkeep); a date and time is never wrong meanwhile.
 */
function ahead(time: number, now: number): string {
  return timestamp(time, time - now > RELATIVE_WITHIN_MS ? 'f' : 'R');
}

/** When a timed party starts or ends, whichever is said of it now. */
function timedWhen(party: TimedParty, now: number): string {
  const start = startTimeOf(party);
  if (start !== null && now < start) return `starts ${ahead(start, now)}`;
  if (party.endTime !== null) return `ends ${ahead(party.endTime, now)}`;
  return start === null ? 'no time set' : `started ${timestamp(start, 'R')}`;
}

/** A party's post in a list, or its title while it has none. */
function postOf(party: { forumPostId: string | null }, title: string): string {
  return party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
}

function meetupLine({ party, title }: ListedMeetup, now: number): string {
  return `${postOf(party, title)} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
}

/** A train for a list: the party, the title its post has, and the name of the gym it is at. */
export interface ListedTrain {
  party: TrainParty;
  title: string;
  /** The name of its current stop, as the gym has it; undefined when it is at none. */
  at?: string | undefined;
  /**
   * Of a train of another region passing through (plan 8X-G): the address of its copy in this
   * region's channel (a message link), which the line links in the place of the post; undefined
   * where it has none there.
   */
  copyUrl?: string | undefined;
}

/** The heading of the trains of other regions with a stop in this one (plan 8X-G). */
export const PASSING_HEADING = '**Passing through**';

/**
 * The post "Today’s Stops" in the board of the region's channel (plan 8R-1), for its line in the
 * summary (plan 8X-G): the address of its first message, and how many tasks and hideouts it
 * names, as it names them.
 */
export interface StopsLine {
  url: string;
  tasks: number;
  hideouts: number;
  /**
   * Under an event's window, the day's research the post shows below it (plan 8R-6): how many
   * tasks, and when they come back.
   */
  waiting?: { tasks: number; at: number } | undefined;
}

/** What the summary lists besides the region's own parties (plan 8X-G). */
export interface SummaryMore {
  /** Trains of other regions of the server with a stop in this one. */
  passing?: readonly ListedTrain[];
  /** The region's post of the stops today; undefined where there is none. */
  stops?: StopsLine | undefined;
  /**
   * Whether the stops are below this message, in the region's board (plan 8R-9: the board post
   * itself, not `/status` in the region's channel): their line says "(below)".
   */
  stopsBelow?: boolean;
  /**
   * `settings.timezone` (plan 8R-9, B8): what starts after the next local midnight is listed
   * under Coming up (`isToday`). Without it everything is today's.
   */
  zone?: string;
  /**
   * The application's train emoji as message text (plan 8M-11A, Matt's answers: `pinetrain`,
   * `customIconText`), put before each train's name; none while the application lacks it, and the
   * lines read as before.
   */
  trainMark?: string | undefined;
}

/** A train's name in a list after its mark, where there is one (plan 8M-11A). */
function marked(mark: string | undefined, name: string): string {
  return mark === undefined ? name : `${mark} ${name}`;
}

/**
 * The counts of the stops, in the post's order: `6 tasks · 2 hideouts`, and under an event's
 * window the day's research waiting named apart, last as in the post: `13 tasks back at 5:00 PM`
 * (plan 8R-6); none where nothing is reported.
 */
function stopCounts(stops: StopsLine | undefined): string[] {
  if (stops === undefined) return [];
  const waiting = stops.waiting;
  return [
    ...(stops.tasks > 0 ? [count(stops.tasks, 'task')] : []),
    ...(stops.hideouts > 0 ? [count(stops.hideouts, 'hideout')] : []),
    ...(waiting !== undefined && waiting.tasks > 0
      ? [`${count(waiting.tasks, 'task')} back at ${timestamp(waiting.at, 't')}`]
      : []),
  ];
}

/**
 * The line of the stops: `[Today’s Stops](<link>): 6 tasks · 2 hideouts`, with "(below)" after
 * the link in the board itself (plan 8R-9: the link goes to the first message of the stops under
 * the summary); undefined where nothing is reported.
 */
function stopsLine(stops: StopsLine | undefined, below: boolean): string | undefined {
  const counts = stopCounts(stops);
  if (stops === undefined || counts.length === 0) return undefined;
  return `[Today’s Stops](<${stops.url}>)${below ? ' (below)' : ''}: ${counts.join(' · ')}`;
}

/** The heading of what starts after the next local midnight (plan 8R-9, B8). */
export const COMING_UP_HEADING = '**Coming up**';

/** A party of the list under Coming up: its kind first, its post, its date and time, its count. */
interface Later {
  start: number;
  createdAt: number;
  line: string;
}

/**
 * A line of Coming up (plan 8R-9): its kind first, its post (a train passing through: its copy
 * here), the full date and time of its start (`f`, each reader's own zone) and how many come:
 * `Elite raid · <post> · <t:…:f> · 7 trainers`. The kind is left out where the post's title, which
 * the post's link shows, says it already (plan 8R-9F, M1: `<post> · …` for a meetup titled
 * "Meetup · …"); `kind` empty then.
 */
function laterLine(
  kind: string,
  post: string,
  start: number,
  party: TimedParty | RaidParty,
): Later {
  return {
    start,
    createdAt: party.createdAt,
    line: [...(kind === '' ? [] : [kind]), post, timestamp(start, 'f'), trainerCount(party)].join(
      ' · ',
    ),
  };
}

/** Whether a post's title starts with a kind word (`Meetup · …`, `Train · …`; plan 8R-9F, M1). */
function titleSays(title: string, word: string): boolean {
  return title.startsWith(`${word} · `);
}

/**
 * How a train is named under Coming up (plan 8R-9F, M1, review F9), as `kind` (a part of its own
 * before the post) and `lead` (words just before the post): where its title says "Train", a raid
 * train says nothing more, and a train of another kind its kind's words without the "Train" the
 * title says (`Gigantamax <#post>`, which reads "Gigantamax Train · …"); where its title does not,
 * its kind's words as a part (`Train`, `Gigantamax Train`; plan 8X-4). `TRAIN_KIND_WORDS` stay.
 */
function trainNaming(party: TrainParty, title: string): { kind: string; lead: string } {
  const words = party.train.kind === 'raid' ? TRAIN_TITLE_KIND : TRAIN_KIND_WORDS[party.train.kind];
  if (!titleSays(title, TRAIN_TITLE_KIND)) return { kind: words, lead: '' };
  if (party.train.kind === 'raid') return { kind: '', lead: '' };
  const ending = ` ${TRAIN_TITLE_KIND}`;
  return words.endsWith(ending)
    ? { kind: '', lead: `${words.slice(0, -ending.length)} ` }
    : { kind: words, lead: '' };
}

/** The heading of the trains in a region's list, under its raids and above its meetups. */
export const TRAINS_HEADING = '**Trains**';

/** Where a train is: at a gym, before its route, or through with it. */
function trainLine(
  { party, title, at, copyUrl }: ListedTrain,
  now: number,
  mark: string | undefined,
): string {
  const where =
    party.train.route.length === 0
      ? 'no route yet'
      : routeFinished(party)
        ? 'route finished'
        : `at ${plain(at ?? 'Unknown gym')}`;
  // A train of max battles says its kind (plan 8X-4): "Trains" alone meant raid trains so far.
  const kind = party.train.kind === 'raid' ? '' : ` · ${TRAIN_KIND_WORDS[party.train.kind]}`;
  const post =
    copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`;
  return `${marked(mark, post)}${kind} · ${where} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
}

/** The timed parties of a list that are not over, by their start, then as they were made. */
function planned<L extends { party: TimedParty }>(listed: readonly L[], now: number): L[] {
  return listed
    .filter(({ party }) => party.status === 'active' && !timedOver(party, now))
    .sort(
      (a, b) =>
        (startTimeOf(a.party) ?? Infinity) - (startTimeOf(b.party) ?? Infinity) ||
        a.party.createdAt - b.party.createdAt,
    );
}

/**
 * As many of `texts`, one per line, as fit into `limit` characters (each with its line break);
 * what does not fit is counted in a last line.
 */
export function fitLines(texts: readonly string[], limit: number): string[] {
  const lines: string[] = [];
  let length = 0;
  for (const [index, text] of texts.entries()) {
    const rest = texts.length - index;
    // Room is kept for the line that says how many were left out, unless this is the last one
    // and its own line fits: then nothing is left out.
    const fits =
      rest === 1 ? length + text.length <= limit : length + text.length + 1 <= limit - 30;
    if (!fits) {
      lines.push(`…and ${rest} more`);
      break;
    }
    lines.push(text);
    length += text.length + 1;
  }
  return lines;
}

/** What the list says when the region has nothing going on (plan 8X-G: every kind). */
export const NOTHING_GOING =
  'Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.';

/**
 * The place of each level in a region's list: the rarest and largest first (an elite raid is
 * rare, but where there is one it is the news). A record, so that a level the game adds cannot
 * be left out of the list without the compiler saying so.
 */
const TIER_RANK: Readonly<Record<RaidLevel, number>> = {
  Elite: 0,
  T5: 1,
  MegaLegendary: 2,
  SuperMega: 3,
  Mega: 4,
  T3: 5,
  T1: 6,
};

/** Every tier there is, in the order of the list: each shadow tier right after its plain one. */
export const SUMMARY_TIERS: readonly RaidTier[] = [...RAID_LEVELS]
  .sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
  .flatMap((level) => [false, true].flatMap((shadow) => raidTier(level, shadow) ?? []));

/** A tier's heading in the list: the post's words without " raid" (`**Shadow Level 3**`). */
export function tierHeading(tier: RaidTier): string {
  return `**${raidWords(tier).replace(/ raid$/, '')}**`;
}

/**
 * The room a heading of `heading` is sure of below the sections before it: the heading, its
 * line break, and the line that says how many were left out.
 */
const sureRoom = (heading: string): number => heading.length + 1 + 20;

/**
 * The summary of a region as a components-v2 message (the draft "In the channels"; plan 8R-9:
 * the region's board): one container, `### Today and coming up` (`SUMMARY_TITLE`) with a count of
 * what is on (`3 raids · 1 train today · 2 coming up · 4 tasks · 2 hideouts`, only the kinds there
 * are, " today" after today's where something is coming up, the stops as their line counts them;
 * `NOTHING_GOING` when no party is listed), then today's (`isToday` in `more.zone`): the raids that
 * have not ended by the clock under a bold heading per tier (`SUMMARY_TIERS`, the soonest end
 * first in each; a raid that has ended but whose post is still open is left out), then the max
 * battles whose end has not come (plan 8X-3, `MAX_BATTLES_HEADING`: 5 stars down to 1,
 * Gigantamax last, the soonest end first in each), then the trains, the trains of other regions
 * passing through (plan 8X-G, `PASSING_HEADING`, `more.passing`: each linked to its copy in this
 * region's channel where it has one, `copyUrl`) and the meetups, each under its heading: those
 * that are not over, by their start, then those without one in the order they were made; then,
 * after a line, what starts after the next local midnight, every kind in one list by start under
 * `COMING_UP_HEADING` (plan 8R-9, B8: `laterLine`); last, after a line, the region's post of the
 * stops today with its counts (`more.stops`, `stopsLine`, "(below)" in the board itself; nothing
 * where nothing is reported). One text display per tier and section, so the component count stays
 * small whatever is listed.
 *
 * All of it keeps within `TEXT_BUDGET`: the max battles, the trains, the trains passing through,
 * the meetups and Coming up are each sure of some room (`SECTION_ROOM`), every tier below another
 * of its heading and a line, and each has all that is left over what the ones after it are sure
 * of; what does not fit is counted (`…and N more`).
 */
export function renderSummary(
  raids: readonly ListedRaid[],
  now: number,
  meetups: readonly ListedMeetup[] = [],
  trains: readonly ListedTrain[] = [],
  maxBattles: readonly ListedMax[] = [],
  more: SummaryMore = {},
): V2Message {
  const { zone, trainMark } = more;
  // Today's, by the one rule of the board (plan 8R-9, B8); everything without a zone.
  const today = (party: RaidParty | TimedParty): boolean =>
    zone === undefined || isToday(party, now, zone);
  const going = raids
    .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
    .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
  const maxOn = maxBattles
    .filter(({ party }) => party.status === 'active' && !maxEnded(party, now))
    .sort(
      (a, b) =>
        MAX_LIST_ORDER.indexOf(a.party.max.tier) - MAX_LIST_ORDER.indexOf(b.party.max.tier) ||
        (a.party.endTime ?? 0) - (b.party.endTime ?? 0) ||
        a.party.createdAt - b.party.createdAt,
    );
  const allTrains = planned(trains, now);
  const allMeetups = planned(meetups, now);
  const allPassing = planned(more.passing ?? [], now);
  const raidsToday = going.filter(({ party }) => today(party));
  const trainsToday = allTrains.filter(({ party }) => today(party));
  const meetupsToday = allMeetups.filter(({ party }) => today(party));
  const passingToday = allPassing.filter(({ party }) => today(party));
  // What starts after midnight has a start (no start is today's): one list by it.
  const startOf = (party: RaidParty | TimedParty): number => partyStart(party) ?? now;
  const comingUp: Later[] = [
    ...going
      .filter(({ party }) => !today(party))
      .map(({ party, title }) =>
        laterLine(raidWords(party.raid.tier), postOf(party, title), startOf(party), party),
      ),
    ...allTrains
      .filter(({ party }) => !today(party))
      .map(({ party, title }) => {
        const { kind, lead } = trainNaming(party, title);
        return laterLine(
          kind,
          marked(trainMark, `${lead}${postOf(party, title)}`),
          startOf(party),
          party,
        );
      }),
    ...allPassing
      .filter(({ party }) => !today(party))
      .map(({ party, title, copyUrl }) => {
        const { kind, lead } = trainNaming(party, title);
        const post =
          copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`;
        return laterLine(
          kind === '' ? 'Passing through' : `${kind} passing through`,
          marked(trainMark, `${lead}${post}`),
          startOf(party),
          party,
        );
      }),
    ...allMeetups
      .filter(({ party }) => !today(party))
      .map(({ party, title }) =>
        laterLine(
          titleSays(title, MEETUP_TITLE_KIND) ? '' : MEETUP_TITLE_KIND,
          postOf(party, title),
          startOf(party),
          party,
        ),
      ),
  ].sort((a, b) => a.start - b.start || a.createdAt - b.createdAt);
  const stops = stopsLine(more.stops, more.stopsBelow === true);
  const todayCounts = [
    ...(raidsToday.length > 0 ? [count(raidsToday.length, 'raid')] : []),
    ...(maxOn.length > 0 ? [count(maxOn.length, 'max battle')] : []),
    ...(trainsToday.length > 0 ? [count(trainsToday.length, 'train')] : []),
    ...(meetupsToday.length > 0 ? [count(meetupsToday.length, 'meetup')] : []),
    ...(passingToday.length > 0 ? [`${count(passingToday.length, 'train')} passing through`] : []),
  ];
  // " today" after the last of today's where something is coming up, so the two read apart.
  const counts = [
    ...todayCounts.map((text, index) =>
      comingUp.length > 0 && index === todayCounts.length - 1 ? `${text} today` : text,
    ),
    ...(comingUp.length > 0 ? [`${String(comingUp.length)} coming up`] : []),
  ];
  // The parties' counts and the stops' together; `NOTHING_GOING` only where both are none (P7).
  const all = [...counts, ...stopCounts(more.stops)];
  const head = `### ${SUMMARY_TITLE}\n${all.length === 0 ? NOTHING_GOING : all.join(' · ')}`;
  // The line of the stops is last, after a line, and its room is kept from the start.
  const tail: APIComponentInContainer[] =
    stops === undefined ? [] : [separator(), textDisplay(stops)];
  const tailRoom = stops?.length ?? 0;
  if (counts.length === 0) {
    return { v2: true, components: [container(LIST_COLOUR, [textDisplay(head), ...tail])] };
  }
  const size = (texts: readonly string[]): number =>
    texts.reduce((sum, text) => sum + text.length + 1, 0);
  const tiers = SUMMARY_TIERS.map((tier) => ({
    heading: tierHeading(tier),
    lines: raidsToday
      .filter(({ party }) => sameRaidTier(party.raid.tier, tier))
      .map((raid) => raidLine(raid, now)),
    group: 'raids',
    // A tier is sure of its heading and the line that counts what does not fit.
    sure: (heading: string) => sureRoom(heading),
  }));
  const timed = [
    { heading: MAX_BATTLES_HEADING, lines: maxOn.map((battle) => maxLine(battle)), group: 'today' },
    {
      heading: TRAINS_HEADING,
      lines: trainsToday.map((train) => trainLine(train, now, trainMark)),
      group: 'today',
    },
    {
      heading: PASSING_HEADING,
      lines: passingToday.map((train) => trainLine(train, now, trainMark)),
      group: 'today',
    },
    {
      heading: MEETUPS_HEADING,
      lines: meetupsToday.map((meetup) => meetupLine(meetup, now)),
      group: 'today',
    },
    { heading: COMING_UP_HEADING, lines: comingUp.map((later) => later.line), group: 'later' },
  ].map((section) => ({
    ...section,
    sure: (heading: string) => Math.min(heading.length + 1 + size(section.lines), SECTION_ROOM),
  }));
  const sections = [...tiers, ...timed]
    .filter((section) => section.lines.length > 0)
    .map(({ heading, lines, group, sure }) => ({ heading, lines, group, room: sure(heading) }));
  const reserved = (from: number): number =>
    sections.slice(from).reduce((sum, section) => sum + section.room, 0);
  let used = head.length + tailRoom;
  const parts: APIComponentInContainer[] = [textDisplay(head)];
  for (const [index, section] of sections.entries()) {
    // A line under the count, one between the raids and what follows them, and one above what
    // is coming up.
    if (index === 0 || section.group !== sections[index - 1]?.group) parts.push(separator());
    const room = TEXT_BUDGET - used - reserved(index + 1) - section.heading.length - 1;
    const text = [section.heading, ...fitLines(section.lines, room)].join('\n');
    used += text.length;
    parts.push(textDisplay(text));
  }
  return { v2: true, components: [container(LIST_COLOUR, [...parts, ...tail])] };
}

/**
 * The line posted in the region's text channel when a party is created, linking to its post
 * (spec 5.1). It is deleted when the party ends. Discord shows the link under the post's title,
 * as it is at that moment, so the line never needs an edit.
 */
export function renderRegionLink(postId: string, type: PartyType = 'raid'): string {
  return `New ${partyWord({ type })}: <#${postId}>`;
}
