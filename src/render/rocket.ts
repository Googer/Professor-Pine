import { ButtonStyle, ComponentType, type APIButtonComponentWithCustomId } from 'discord.js';
import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
import { catchesInShort, typeKeyOf, type RocketCatch } from '../domain/rocket/lineups.js';
import { AS_FED, rocketPicture, type PictureLookup } from '../domain/stops/pictures.js';
import type { ReportedStop, RocketDetail, RocketReport } from '../domain/stops/report.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import { cutText } from './party-post.js';
import { mapMarkdown } from './raid-post.js';
import {
  boardWords,
  DISCORD_CHANNEL,
  stopLine,
  stopMapLine,
  type ChannelNamer,
} from './research.js';
import {
  memberByName,
  memberName,
  plain,
  plainNoLinks,
  timestamp,
  truncate,
  type NamedMember,
} from './text.js';
import { actionRow, container, section, textDisplay, thumbnail } from './v2.js';

/*
 * Team GO Rocket's messages (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): a
 * grunt's report in the region channel, deleted after `settings.rocket.gruntMinutes`, as a spawn
 * report is; and the words the answers, the post and the DMs share.
 */

/** The colour of what is about Team GO Rocket. */
export const ROCKET_COLOUR = 0xb3262f;

/** What a grunt's message in a region channel shows. */
export interface GruntView {
  /** Who: `Water-type grunt`, `Grunt (no type)`. */
  name: string;
  catches: readonly RocketCatch[];
  stop: ReportedStop;
  reporter: NamedMember;
  /**
   * The address of its one picture beside the heading (plan 8R-6: by the rule, `rocketPicture`,
   * as `StopPictures.url` names it); none where it has none, and in a message sent again
   * without pictures.
   */
  picture?: string | undefined;
}

/**
 * What can be caught, in short: `Bellsprout` alone, `one of Mudkip, Tentacool +3` of several (the
 * first `most`); empty for none.
 */
export function catchWords(catches: readonly Pick<RocketCatch, 'name'>[], most = 5): string {
  if (catches.length === 0) return '';
  const short = plainNoLinks(catchesInShort(catches, most));
  return catches.length === 1 ? short : `one of ${short}`;
}

/**
 * How a grunt type's merged choice is named beside its lineups, and a report of it that a lineup
 * replaced (plan 8R-4L, S8, B8).
 */
export const NOT_SURE_WHICH = 'not sure which';

/**
 * Who a Rocket report is of, where it is named apart from its catches (plan 8R-4L, S10): a
 * lineup of a grunt type by the type and its first slot (`Water-type grunt · Magikarp, Feebas`),
 * anything else by its name. Not made plain: the caller does.
 */
export function rocketLabel(detail: Pick<RocketDetail, 'name' | 'lineup'>): string {
  return detail.lineup === undefined ? detail.name : `${detail.name} · ${detail.lineup}`;
}

/**
 * What a Rocket report replaced, as its answer names it (plan 8R-4L, B8): by `rocketLabel`, and a
 * grunt of the same type without a lineup as "not sure which".
 */
function replacedLabel(replaced: RocketReport, report: RocketReport): string {
  const sameType = typeKeyOf(replaced.subjectKey) === typeKeyOf(report.subjectKey);
  return sameType && replaced.rocket.lineup === undefined
    ? `${replaced.rocket.name}, ${NOT_SURE_WHICH}`
    : rocketLabel(replaced.rocket);
}

/** A stop as a line names it in a grunt's message (its Where line, beside [Map]): plain, without links, cut. */
export function rocketStopLine(stop: Pick<ReportedStop, 'name' | 'address'>): string {
  const name = `**${plainNoLinks(truncate(stop.name, 80))}**`;
  return stop.address === null ? name : `${name} · ${plainNoLinks(truncate(stop.address, 80))}`;
}

/**
 * A name with its article, by the name's first letter: `a Water-type grunt`, `an Electric-type
 * grunt`; `shown` is the name as it is shown (in bold).
 */
export function withArticle(name: string, shown = name): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${shown}`;
}

/** A text with its first letter upper case. */
function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * A grunt's report in the region channel (design 5.2), a components-v2 message like a spawn
 * report: `### Water-type grunt`, what can be caught, when the report goes away, with its one
 * picture beside them (plan 8R-6: no gallery); where, with the stop's address line, its maps
 * link and its picture beside it; the reporter in the small print (`memberByName`, no ping).
 * Everything a member or a feed wrote through `plainNoLinks`.
 */
export function gruntMessage(view: GruntView, goneAt: number): V2Message {
  const catches = catchWords(view.catches);
  const head = [
    `### ${plain(view.name)}`,
    ...(catches === '' ? [] : [`**Catch** ${catches}`]),
    `This report goes away ${timestamp(goneAt, 'R')}.`,
  ].join('\n');
  const where = `**Where** ${rocketStopLine(view.stop)} · ${mapMarkdown(view.stop)}`;
  const picture = wayspotPicture(view.stop.image);
  return {
    v2: true,
    components: [
      container(ROCKET_COLOUR, [
        view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
        picture === undefined ? textDisplay(where) : section(where, thumbnail(picture)),
        textDisplay(`-# Reported by ${memberByName(view.reporter)} · /rocket reports one`),
      ]),
    ],
  };
}

/** The custom-id kind of `/rocket report`'s answer and dialog. */
export const ROCKET_KIND = 'rocket';

/** The actions: Take back (a button) and Replace (the dialog's Submit). */
export const ROCKET_ACTIONS = { back: 'back', replace: 'replace' } as const;

/** What the answer of a Rocket report shows. */
export interface RocketAnswerView {
  report: RocketReport;
  /** The Rocket report at the stop it replaced, while that one stood. */
  replaced: RocketReport | undefined;
  /** Whether it is a hideout (in the posts of the stops), or a grunt (messages of its own). */
  hideout: boolean;
  /** The region channels that hold the stop. */
  channels: readonly string[];
  /**
   * Those of `channels` whose region has a board recorded (review W4, `boardThreadOf`): a
   * hideout's words name only these, and none where there is none (as in rehearsal mode).
   */
  boards: readonly string[];
  /** The channels the grunt's message was posted in. */
  posted: readonly { channelId: string }[];
  /** Rehearsal mode: nothing is posted, no post of the stops is made. */
  rehearsal: boolean;
  /** A hideout's end as a sentence ends (`periodEndWords`: `until midnight`). */
  until: string;
  /** A grunt refined in place: its messages were edited ("Changed in", plan 8R-6). */
  changed?: boolean;
}

/**
 * The answer of a Rocket report (plan 8R-2; design 5.2), for the reporter alone: who, at which
 * stop, what can be caught, and what it replaced ("was: Arlo"; "again" for the same hideout);
 * where it shows (a grunt's messages and when they go; a hideout's posts of the stops, until
 * midnight; in rehearsal mode only until when) and "Take back"
 * (`rocket:<id>:back:<stop key>:<who>:<made at>`).
 */
export function rocketAnswer(view: RocketAnswerView): V2Message {
  const { report } = view;
  const { head, where } = rocketWords(view, DISCORD_CHANNEL);
  const button: APIButtonComponentWithCustomId = {
    type: ComponentType.Button,
    style: ButtonStyle.Danger,
    // With the stop, who (`:` read as `.`) and when it was made (base 36), so that a hideout put
    // back under a new id, which keeps its time, is still found by its meaning (fix S3), and a
    // newer report of the same who is not (fix F1); without them where the id would not fit.
    custom_id:
      encodeCustomIdIfFits({
        kind: ROCKET_KIND,
        id: String(report.id),
        action: ROCKET_ACTIONS.back,
        args: [report.stop.key, report.subjectKey.replaceAll(':', '.'), report.madeAt.toString(36)],
      }) ??
      encodeCustomId({ kind: ROCKET_KIND, id: String(report.id), action: ROCKET_ACTIONS.back }),
    label: 'Take back',
  };
  return {
    v2: true,
    components: [
      container(ROCKET_COLOUR, [
        textDisplay(cutText(head, 3_000)),
        textDisplay(`-# ${where}`),
        actionRow([button]),
      ]),
    ],
  };
}

/**
 * The words of a Rocket report's answer (plan 8R-3: shared by `/rocket` and the map): who, at
 * which stop, what can be caught and what it replaced as `head`; where it shows and until when
 * as `where`, the region channels named by `channel`.
 */
export function rocketWords(
  view: RocketAnswerView,
  channel: ChannelNamer,
): { head: string; where: string } {
  const { report, replaced } = view;
  const catches = catchWords(report.rocket.catches);
  // "Again" only for the very same who: a lineup whose first slot rotated is named as it was (L-3).
  const before =
    replaced === undefined
      ? ''
      : replaced.subjectKey === report.subjectKey && replaced.rocket.lineup === report.rocket.lineup
        ? ' (again)'
        : ` (was: ${plain(replacedLabel(replaced, report))})`;
  const head = [
    '### Team GO Rocket reported',
    `**${plain(report.rocket.name)}** at ${stopLine(report.stop)}` +
      `${catches === '' ? '' : ` · catch ${catches}`}${before}`,
  ].join('\n');
  const channels = (ids: readonly string[]): string => ids.map(channel).join(', ');
  let where: string;
  if (view.hideout) {
    where = view.rehearsal
      ? `It lasts ${view.until}.`
      : view.channels.length === 0
        ? `It lies in no region now, so no post shows it; it lasts ${view.until}.`
        : view.boards.length === 0
          ? `It lasts ${view.until}.`
          : `${boardWords(view.boards.map(channel))}, ${view.until}.`;
  } else if (view.rehearsal) {
    where = `It lasts until ${timestamp(report.endsAt, 't')} (rehearsal mode posts nothing).`;
  } else if (view.posted.length === 0) {
    where =
      'It could not be posted in a region channel; it lasts until ' +
      `${timestamp(report.endsAt, 't')}.`;
  } else {
    where =
      `${view.changed === true ? 'Changed' : 'Posted'} in ` +
      `${channels(view.posted.map((one) => one.channelId))}; it goes away ` +
      `${timestamp(report.endsAt, 'R')}.`;
  }
  return { head, where };
}

/**
 * The answer where the same grunt stands at the stop (Matt's answer 4): who reported it and when,
 * when it goes, and a link to its message (none in rehearsal mode). `by` is the reporter as the
 * caller names them (`memberByName` on Discord; the map names nobody by an id, plan 8R-3).
 */
export function alreadyReported(
  standing: RocketReport,
  link: string | undefined,
  by = memberByName(standing.reporter),
): string {
  const named = `**${plain(rocketLabel(standing.rocket))}**`;
  return (
    `Already reported: ${withArticle(standing.rocket.name, named)} at ` +
    `${stopLine(standing.stop)}, by ${by} ` +
    `${timestamp(standing.madeAt, 'R')}; it goes away ${timestamp(standing.endsAt, 'R')}.` +
    (link === undefined ? '' : ` ${link}`)
  );
}

/**
 * The first line of a direct message about Team GO Rocket (plan 8R-2; design 7): who, where and
 * by whom, everything through `plainNoLinks` (it reaches other members' DMs): `A **Water-type
 * grunt** has been reported in #west by **Rita**.`, `**Arlo** has been reported …`.
 */
export function rocketDmSentence(view: {
  name: string;
  /** A grunt or the decoy is "a" one; a leader and Giovanni are named. */
  named: boolean;
  regionChannelId: string;
  reporter: NamedMember;
}): string {
  const name = `**${plainNoLinks(view.name)}**`;
  return (
    `${view.named ? name : capitalised(withArticle(view.name, name))} has been reported in ` +
    `<#${view.regionChannelId}> by **${memberName(view.reporter)}**.`
  );
}

/**
 * Team GO Rocket in brief, for a direct message (`notifyDm`): what can be caught, the stop, its
 * name the link to its place, with its address line (`stopMapLine`, plan 8R-7), and when the
 * report goes (a grunt) or until when it stands (a hideout), with
 * its picture by the rule (plan 8R-6, `rocketPicture` of who, `key`: the encounter picture while
 * the catch is open, the Pokémon of one, a leader's or Giovanni's portrait) and Rocket's colour.
 */
export function rocketDmBrief(
  view: {
    /** Who it is of (`rocketKey`). */
    key: string;
    catches: readonly RocketCatch[];
    stop: Pick<ReportedStop, 'name' | 'address' | 'lat' | 'lon'>;
    /** A grunt: when its report goes; a hideout: until when, as a sentence ends it. */
    ends: { goneAt: number } | { until: string };
  },
  lookup: PictureLookup = AS_FED,
): { accent: number; picture?: string; lines: string[] } {
  const shown = rocketPicture(view.key, view.catches);
  const picture = shown === undefined ? undefined : lookup(shown.source);
  const catches = catchWords(view.catches);
  const ends =
    'goneAt' in view.ends
      ? `The report goes away ${timestamp(view.ends.goneAt, 'R')}.`
      : `${view.ends.until.charAt(0).toUpperCase()}${view.ends.until.slice(1)}.`;
  return {
    accent: ROCKET_COLOUR,
    ...(picture === undefined ? {} : { picture }),
    lines: [
      ...(catches === '' ? [] : [`**Catch** ${catches}`]),
      `- ${stopMapLine(view.stop)}`,
      ends,
    ],
  };
}

/**
 * The note of a grunt's DM (Matt's answer 3): the hour in which no more of the type is told,
 * without a plural made of the name (fix B4: "Grunt (no type)s").
 */
export function gruntHourNote(): string {
  return "You won't be told about this grunt type again for an hour.";
}

/**
 * A grunt's report where the bot may not post embeds (as `spawnTextMessage`): the same in a
 * sentence or two of classic text, without pictures.
 */
export function gruntTextMessage(view: GruntView, goneAt: number): ClassicMessage {
  const catches = catchWords(view.catches);
  return {
    content:
      `${capitalised(withArticle(view.name, `**${plain(view.name)}**`))} has been reported by ` +
      `${memberByName(view.reporter)} at ` +
      `${rocketStopLine(view.stop)} · ${mapMarkdown(view.stop)}.\n` +
      (catches === '' ? '' : `Catch ${catches}.\n`) +
      `This report goes away ${timestamp(goneAt, 'R')}.\n-# /rocket reports one`,
  };
}
