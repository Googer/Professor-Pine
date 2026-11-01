import { distanceWords, type DistanceUnits } from './distance-words.js';
import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
  type APIStringSelectComponent,
} from 'discord.js';
import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import { taskOfSubject } from '../domain/research/reports.js';
import { AS_FED, researchPicture, type PictureLookup } from '../domain/stops/pictures.js';
import { rewardLine, rewardsInShort, type TaskReward } from '../domain/research/task.js';
import type {
  ReportedStop,
  ResearchDetail,
  ResearchReport,
  StopReport,
} from '../domain/stops/report.js';
import { addDays, zoned } from '../domain/time/zoned.js';
import { cutText } from './party-post.js';
import { linkTextOf, stopMapsUrl } from './raid-post.js';
import {
  clockOrDay,
  count,
  memberByName,
  memberName,
  plain,
  plainNoLinks,
  timestamp,
  truncate,
  type NamedMember,
} from './text.js';
import { actionRow, container, menuRow, textDisplay } from './v2.js';

/** The colour of what is about field research. */
export const RESEARCH_COLOUR = 0x9b59b6;

/** The custom-id kind of the controls of `/research report`'s answer. */
export const RESEARCH_KIND = 'research';

/**
 * The actions: "Same task at more stops…" (a menu), "Take back" (a button) and the Submit of the
 * dialog that asks before replacing other members' reports (plan 8R-5, R7).
 */
export const RESEARCH_ACTIONS = { more: 'more', back: 'back', replace: 'replace' } as const;

/** A task's text as shown: a typed one through `plainNoLinks` (Matt's answer 5), cut first. */
export function taskText(research: Pick<ResearchDetail, 'text' | 'typed'>, room = 120): string {
  const cut = truncate(research.text, room);
  return research.typed ? plainNoLinks(cut) : plain(cut);
}

/**
 * What a report is of, as an answer names it: a task's text (`taskText`), or who of Team GO
 * Rocket (plan 8R-2: `Water-type grunt`, `Arlo`).
 */
export function reportSubject(report: StopReport): string {
  return report.kind === 'research' ? taskText(report.research) : plain(report.rocket.name);
}

/**
 * What a task may give, in short: `one of Dratini, Bagon, Axew +4`, `Rare Candy ×3`; the map's
 * line (`rewardLine`, plan 8M-9B) made plain.
 */
export function rewardWords(rewards: readonly TaskReward[]): string {
  return plain(rewardLine(rewards));
}

/** A stop as a line names it: `**Yellow Mural** · Market Street`. */
export function stopLine(stop: Pick<ReportedStop, 'name' | 'address'>): string {
  const name = `**${plain(truncate(stop.name, 80))}**`;
  return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
}

/**
 * A stop as a line of "Today’s Stops" and of the research and Rocket DMs names it (plan 8R-7;
 * Matt's R6): its name, bold, the link to its place on Google Maps (`stopMapsUrl`, in angle
 * brackets: no preview), then its address: `**[Yellow Mural](<https://…>)** · Market Street`.
 * The name is cut before it is made plain, and a bracket in it cannot end the link early
 * (`linkTextOf`); it is always made plain without a working address (`plainNoLinks`, review
 * 8R7-1: a stop named `https://…` or `www.…` would show one address and link another, and the
 * line reaches other members' DMs). The party posts keep the name plain bold (`gymWhere`): this
 * differs by Matt's choice.
 */
export function stopMapLine(stop: Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>): string {
  const name = stopMapLink(stop);
  return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
}

/**
 * A stop's name, bold, as the link to its place (`stopMapLine` without the address; the
 * confirmation's sentence, plan 8R-8): `**[Yellow Mural](<https://…>)**`, made as that says.
 */
export function stopMapLink(stop: Pick<ReportedStop, 'name' | 'lat' | 'lon'>): string {
  const text = linkTextOf(truncate(stop.name, 80), plainNoLinks);
  return `**[${text}](<${stopMapsUrl(stop)}>)**`;
}

/**
 * When a period's reports end, as a sentence ends: `until midnight` for the next local midnight,
 * else the time, with its day when it is not today (`clockOrDay`; review B7): a multi-day
 * event's last day ends at its hour, a day under a coming event at the event's start.
 */
export function periodEndWords(end: number, now: number, zone: string): string {
  const midnight = addDays(zoned(now, zone).startOfDay(), 1).epochMilliseconds;
  return end === midnight ? 'until midnight' : `until ${clockOrDay(end, now, zone)}`;
}

/** A stop "Same task at more stops…" offers: its key, name, and how far from the first stop. */
export interface MoreStop {
  key: string;
  name: string;
  metres: number;
  where: string | undefined;
}

/**
 * A stop where a report stands already (plan 8R-5, R8): the report, the link to the message of
 * the post of the stops that holds it, and the reporter as the caller names them (the map: by name).
 */
export interface AlreadyAt {
  report: ResearchReport;
  link: string | undefined;
  by?: string;
}

/**
 * A research report that stands already, as `alreadyReported` words a Rocket one (R8):
 * `Already reported: **Make 3 Excellent Throws in a row** · Gible at **Yellow Mural**, by
 * **Misty** <t:R>.`, the link after it.
 */
export function researchAlready({ report, link, by }: AlreadyAt): string {
  const rewards = rewardWords(report.research.rewards);
  return (
    `Already reported: **${taskText(report.research)}**${rewards === '' ? '' : ` · ${rewards}`} ` +
    `at ${stopLine(report.stop)}, by ${by ?? memberByName(report.reporter)} ` +
    `${timestamp(report.madeAt, 'R')}.` +
    (link === undefined ? '' : ` ${link}`)
  );
}

/**
 * What a replaced report was, as an answer's stop line says it (plan 8R-5): ` (again)` for the
 * same version, the version's rewards for another of the same task (`one of Larvitar, Beldum,
 * Gible`, `Gible`), nothing for the same task whose reward was not said (a typed task given its
 * reward: review L6), else the other task's text.
 */
function replacedWords(report: ResearchReport, replaced: ResearchReport): string {
  if (replaced.subjectKey === report.subjectKey) return ' (again)';
  const words = rewardWords(replaced.research.rewards);
  if (taskOfSubject(replaced.subjectKey) !== taskOfSubject(report.subjectKey)) {
    return ` (was: ${taskText(replaced.research, 60)})`;
  }
  return words === '' ? '' : ` (was: ${words})`;
}

/** What the words of a research report's answer say (`researchWords`), on Discord or the map. */
export interface ResearchWordsView {
  /** The reports made, one per stop, in the order given; with the report each replaced. */
  saved: readonly { report: ResearchReport; replaced: ResearchReport | undefined }[];
  /** The stops where a report stood already (plan 8R-5, R8): said after those reported. */
  already?: readonly AlreadyAt[];
  /** The region channels the stops lie in. */
  channels: readonly string[];
  /**
   * Those of `channels` whose region has a board recorded (review W4, `boardThreadOf`): the
   * words name only these, and none where there is none (as in rehearsal mode).
   */
  boards: readonly string[];
  /** When they end, as shown (`periodEndWords`). */
  until: string;
  /** `also`: the answer of "Same task at more stops…", which says "Also reported". */
  also?: boolean;
  /** Whether posts of the stops are made (not in rehearsal mode: then none is named). */
  posts?: boolean;
}

/** What the answer of a research report shows. */
export interface ResearchAnswerView extends ResearchWordsView {
  /** The stops near the first that have no report of this task in the period (25 at most). */
  more: readonly MoreStop[];
  /** The units distances are said in (`settings.distanceUnits`, task 7). */
  units: DistanceUnits;
}

/** A channel as a caller's answer names it: `<#id>` on Discord, `#west` on the map. */
export type ChannelNamer = (channelId: string) => string;

/** A channel as Discord shows it: a mention. */
export const DISCORD_CHANNEL: ChannelNamer = (channelId) => `<#${channelId}>`;

/**
 * The words of a research report's answer (plan 8R-3: shared by `/research` and the map): the
 * task and its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again"
 * for the same task) as `head`, and where it shows and until when as `where`, the region
 * channels named by `channel`.
 */
export function researchWords(
  view: ResearchWordsView,
  channel: ChannelNamer,
): { head: string; where: string } {
  const already = (view.already ?? []).map(researchAlready);
  const [first] = view.saved;
  // Every stop reported already (R8): only that is said.
  if (!first) {
    if (already.length === 0) throw new Error('a research answer needs a report');
    return { head: already.join('\n'), where: '' };
  }
  const { research } = first.report;
  const rewards = rewardWords(research.rewards);
  const lines = view.saved.map(
    ({ report, replaced }) =>
      `- ${stopLine(report.stop)}${replaced === undefined ? '' : replacedWords(report, replaced)}`,
  );
  const head = [
    `### ${view.also === true ? 'Also reported' : 'Field research reported'}`,
    `**${taskText(research)}**${rewards === '' ? '' : ` · ${rewards}`}`,
    ...lines,
    ...already,
  ].join('\n');
  const where =
    view.posts === false
      ? `It stands ${view.until}.`
      : view.channels.length === 0
        ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
        : view.boards.length === 0
          ? `It stands ${view.until}.`
          : `${boardWords(view.boards.map(channel))}, ${view.until}.`;
  return { head, where };
}

/**
 * Where the post of the stops shows a report (plan 8R-9): `In "Today’s Stops" on the board of
 * #west`, the region channels as the caller names them; the board is the region's forum's pinned
 * post, which the words name by its region's channel.
 */
export function boardWords(channels: readonly string[]): string {
  return `In "Today’s Stops" on the board${channels.length > 1 ? 's' : ''} of ${channels.join(', ')}`;
}

/**
 * The answer of a research report (plan 8R-1; design 4.3), for the reporter alone: the task and
 * its rewards, each stop (with the task it replaced: "was: Catch 7 Pokémon"; "again" for the
 * same task), where it shows and until when, "Same task at more stops…" (a menu of the stops
 * near the first one without this task, up to five at once) and "Take back" (every report of
 * the answer whose id fits the custom id; the rest by `/research remove`).
 */
export function researchAnswer(view: ResearchAnswerView): V2Message {
  const { head, where } = researchWords(view, DISCORD_CHANNEL);
  const [first] = view.saved;
  // Nothing reported (R8): the stops reported already, no Take back nor more stops.
  if (!first) {
    return {
      v2: true,
      components: [container(RESEARCH_COLOUR, [textDisplay(cutText(head, 3_000))])],
    };
  }
  const parts: APIComponentInContainer[] = [
    textDisplay(cutText(head, 3_000)),
    textDisplay(`-# ${where}`),
  ];
  if (view.more.length > 0) {
    const menu: APIStringSelectComponent = {
      type: ComponentType.StringSelect,
      // The version it reports (R14), `.` for every `:`: a first report narrowed meanwhile does
      // not stop it.
      custom_id: encodeCustomId({
        kind: RESEARCH_KIND,
        id: String(first.report.id),
        action: RESEARCH_ACTIONS.more,
        args: [first.report.subjectKey.replaceAll(':', '.')],
      }),
      placeholder: 'Same task at more stops…',
      min_values: 1,
      max_values: Math.min(5, view.more.length),
      options: view.more.slice(0, 25).map((stop) => ({
        label: truncate(stop.name, 100),
        value: stop.key,
        description: truncate(
          `${distanceWords(stop.metres, view.units)} away${stop.where === undefined ? '' : ` · ${stop.where}`}`,
          100,
        ),
      })),
    };
    parts.push(menuRow(menu));
  }
  const ids = view.saved.map(({ report }) => String(report.id));
  let back: string | undefined;
  let taken = ids.length;
  for (; taken > 0; taken--) {
    const [id = '', ...args] = ids.slice(0, taken);
    back = encodeCustomIdIfFits({ kind: RESEARCH_KIND, id, action: RESEARCH_ACTIONS.back, args });
    if (back !== undefined) break;
  }
  if (back !== undefined) {
    const button: APIButtonComponentWithCustomId = {
      type: ComponentType.Button,
      style: ButtonStyle.Danger,
      custom_id: back,
      label: taken === 1 ? 'Take back' : `Take back (${count(taken, 'stop')})`,
    };
    parts.push(actionRow([button]));
  }
  return { v2: true, components: [container(RESEARCH_COLOUR, parts)] };
}

/** How many stops a direct message about research names; the rest are counted. */
const DM_STOPS_SHOWN = 10;
/**
 * The characters a research DM's stop lines and the line that counts the rest may take, newlines
 * included (review W2 of 8R-7): ten lines with links and escape-heavy names could reach
 * Discord's 4,000 for a message.
 */
const DM_STOP_ROOM = 2_400;

/** The line of a research DM that counts the stops not named. */
const dmMoreStops = (left: number): string => `- …and ${count(left, 'more stop')}`;

/**
 * A research DM's stop lines (`stopMapLine`): whole lines while they fit `DM_STOP_ROOM` with the
 * line that would count the rest (as `fill` of the post of the stops), `DM_STOPS_SHOWN` at most.
 */
function dmStopLines(
  stops: readonly Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>[],
): string[] {
  const lines: string[] = [];
  let length = 0;
  for (const stop of stops.slice(0, DM_STOPS_SHOWN)) {
    const line = `- ${stopMapLine(stop)}`;
    const left = stops.length - lines.length - 1;
    const tail = left > 0 ? 1 + dmMoreStops(left).length : 0;
    if ((lines.length === 0 ? 0 : length + 1) + line.length + tail > DM_STOP_ROOM) break;
    length += (lines.length === 0 ? 0 : 1) + line.length;
    lines.push(line);
  }
  return lines;
}

/**
 * The first line of a direct message about field research (plan 8R-1; design 7): where it was
 * reported and by whom, and the task. Everything in it through `plainNoLinks` (it reaches other
 * members' DMs).
 */
export function researchDmSentence(view: {
  research: Pick<ResearchDetail, 'text'>;
  regionChannelId: string;
  reporter: NamedMember;
}): string {
  return (
    `Field research has been reported in <#${view.regionChannelId}> by ` +
    `**${memberName(view.reporter)}**: **${plainNoLinks(truncate(view.research.text, 120))}**.`
  );
}

/**
 * The first line of the direct message that confirms a "one of" a member was told of (plan 8R-5,
 * design point 5, R4): `Confirmed: the reward at **[Yellow Mural](<…>)** and **[Paititi
 * Inti](<…>)** is **Gible**.`, each stop's name the link to its place (`stopMapLink`, plan 8R-8,
 * Matt 2026-10-25), all through `plainNoLinks`; the stops ten at most and while they fit
 * `DM_STOP_ROOM` with the words that count the rest (as `dmStopLines`), the rest counted.
 */
export function researchConfirmSentence(view: {
  stops: readonly Pick<ReportedStop, 'name' | 'lat' | 'lon'>[];
  rewards: readonly TaskReward[];
}): string {
  const names: string[] = [];
  let length = 0;
  for (const stop of view.stops.slice(0, DM_STOPS_SHOWN)) {
    const name = stopMapLink(stop);
    const left = view.stops.length - names.length - 1;
    // ", " or " and " before each name after the first, and before the count of the rest.
    const tail = left > 0 ? 5 + count(left, 'more stop').length : 0;
    if ((names.length === 0 ? 0 : length + 5) + name.length + tail > DM_STOP_ROOM) break;
    length += (names.length === 0 ? 0 : 5) + name.length;
    names.push(name);
  }
  const more = view.stops.length - names.length;
  if (more > 0) names.push(count(more, 'more stop'));
  const last = names.pop() ?? '';
  const stops = names.length === 0 ? last : `${names.join(', ')} and ${last}`;
  const reward = plainNoLinks(rewardsInShort(view.rewards));
  return `Confirmed: the reward at ${stops} is **${reward}**.`;
}

/**
 * A DM's picture by the rule (plan 8R-6, `researchPicture`), its address as `picture` names it;
 * none where it names none (the source is gone).
 */
function dmPicture(rewards: readonly TaskReward[], picture: PictureLookup): { picture?: string } {
  const shown = researchPicture(rewards);
  const address = shown === undefined ? undefined : picture(shown.source);
  return address === undefined ? {} : { picture: address };
}

/**
 * The brief of the direct message that confirms a "one of" (plan 8R-5): the task, until when, and
 * the reward's picture (plan 8R-6: the Pokémon, now known).
 */
export function researchConfirmBrief(
  view: {
    research: Pick<ResearchDetail, 'text' | 'rewards'>;
    until: string;
  },
  picture: PictureLookup = AS_FED,
): { accent: number; picture?: string; lines: string[] } {
  const { until } = view;
  return {
    accent: RESEARCH_COLOUR,
    ...dmPicture(view.research.rewards, picture),
    lines: [
      `**${plainNoLinks(truncate(view.research.text, 120))}**`,
      `${until.charAt(0).toUpperCase()}${until.slice(1)}.`,
    ],
  };
}

/**
 * Field research in brief, for a direct message (`notifyDm`): the rewards ("one of" where one is
 * drawn), a line per stop, its name the link to its place and its address (`stopMapLine`, plan
 * 8R-7; ten at most and while they fit their room, `dmStopLines`, the rest counted) and until when
 * (`periodEndWords`: the day too when it is not today, review B7), with its picture by the rule
 * (plan 8R-6: a reward's own, the encounter picture for "one of") and the colour of research.
 */
export function researchDmBrief(
  view: {
    research: Pick<ResearchDetail, 'rewards'>;
    stops: readonly Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>[];
    /** When the reports end, as a sentence ends (`periodEndWords`). */
    until: string;
  },
  picture: PictureLookup = AS_FED,
): { accent: number; picture?: string; lines: string[] } {
  const { rewards } = view.research;
  const short = rewards.length === 0 ? '' : plainNoLinks(rewardsInShort(rewards));
  const stops = dmStopLines(view.stops);
  const more = view.stops.length - stops.length;
  const { until } = view;
  return {
    accent: RESEARCH_COLOUR,
    ...dmPicture(rewards, picture),
    lines: [
      ...(short === '' ? [] : [`**Rewards** ${rewards.length === 1 ? short : `one of ${short}`}`]),
      ...stops,
      ...(more > 0 ? [dmMoreStops(more)] : []),
      `${until.charAt(0).toUpperCase()}${until.slice(1)}.`,
    ],
  };
}
