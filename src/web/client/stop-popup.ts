import type {
  MapGrunt,
  MapHideout,
  MapResearch,
  MapReward,
} from '../../domain/web/stop-report-data.js';
import type { DistanceUnits, Place } from './distance.js';
import { placeHead, type PageNode } from './popup.js';
import { timeLeft } from './raid-marker.js';
import { iconNode } from './report-menu.js';
import { REPORT_ICONS } from './report-icons.js';
import type { StopReport, StopReports } from './stop-reports.js';
import { untilWords } from './what-is-on.js';

/*
 * A stop's popup and phone card on the live map (plan 8M-9B, goal 3), as a tree of nodes
 * (`renderNode`: every text as text): the stop's name, its address line, how far it is and
 * Directions (the parties' map line, `mapLine`); then each report shown there: research (the task,
 * the rewards in short with the pictures of "one of", until when, who reported it), a grunt (its
 * name and lineup, the catches' pictures, its minutes left), a hideout (its picture, name,
 * catches); each with Open on Discord (a `https://discord.com/channels/` address only) and Take
 * back where the server says the member may (`mayTakeBack`); an ended one says "Ended" and loses
 * its Take back (B14). Then the stop's own actions.
 */

/** What a stop's popup needs of the map. */
export interface StopPopupContext {
  now: number;
  /** The reader's zone (plan 8M-8A), the times' words. */
  zone: string;
  /** Your location once the browser said: how far the stop is (the parties' rule). */
  located: Place | undefined;
  units: DistanceUnits;
  /** The stop's own actions ("Report research here", "Report Rocket here"), where offered. */
  actions?: readonly PageNode[];
  /** A report's own actions beyond Take back ("Same task at more stops…"), where offered. */
  more?: (report: StopReport, kind: 'research' | 'grunt' | 'hideout') => readonly PageNode[];
}

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** What a report says once its end has passed (B14). */
export const ENDED = 'Ended';

/** A picture of the server's, as a small one of a line. */
const picture = (src: string, name: string, className: string): PageNode => ({
  tag: 'img',
  className,
  attributes: { src, alt: name, title: name, draggable: 'false' },
});

/** The pictures of rewards or catches with one, small, each named by its title. */
function picturesOf(rewards: readonly MapReward[]): PageNode[] {
  const shown = rewards.flatMap((reward) =>
    reward.image === undefined ? [] : [picture(reward.image, reward.name, 'small-picture')],
  );
  return shown.length === 0 ? [] : [{ tag: 'div', className: 'small-pictures', children: shown }];
}

/** A report's head: its picture (else its layer's icon) and its kind. */
function head(src: string | undefined, kind: 'research' | 'rocket', words: string): PageNode {
  return {
    tag: 'div',
    className: 'report-head',
    children: [
      src === undefined ? iconNode(REPORT_ICONS[kind]) : picture(src, '', 'report-picture'),
      { tag: 'span', className: 'report-kind', text: words },
    ],
  };
}

/** Open on Discord, only to a message of a server's channel. */
function discordLink(link: string | undefined): PageNode[] {
  return link?.startsWith('https://discord.com/channels/') === true
    ? [
        {
          tag: 'a',
          className: 'post-link',
          text: 'Open on Discord',
          attributes: { href: link, ...NEW_TAB },
        },
      ]
    : [];
}

/** Take back, where the member may: the report's id and the version the list showed. */
function takeBack(report: StopReport): PageNode[] {
  return report.mayTakeBack
    ? [
        {
          tag: 'button',
          className: 'link-button',
          text: 'Take back',
          attributes: {
            type: 'button',
            'data-take-back': String(report.id),
            'data-made-at': String(report.madeAt),
          },
        },
      ]
    : [];
}

/** A report's last lines: when, who, its link and actions; "Ended" and no actions once it ended. */
function footer(
  report: StopReport,
  when: PageNode,
  ctx: StopPopupContext,
  more: readonly PageNode[],
): PageNode[] {
  const ended = report.endsAt <= ctx.now;
  const actions = [...discordLink(report.link), ...(ended ? [] : [...takeBack(report), ...more])];
  return [
    {
      tag: 'div',
      className: 'small',
      children: [
        ended ? { tag: 'span', className: 'ended', text: ENDED } : when,
        { tag: 'span', text: ` · reported by ${report.reporter}` },
      ],
    },
    ...(actions.length === 0
      ? []
      : [
          {
            tag: 'div',
            className: 'report-actions',
            children: actions.flatMap((part, index) =>
              index === 0 ? [part] : [{ tag: 'span', className: 'sep', text: ' · ' }, part],
            ),
          },
        ]),
  ];
}

/** A report's section, its end on it for the page to say "Ended" when it passes (B14). */
function section(report: StopReport, kind: string, children: PageNode[]): PageNode {
  return {
    tag: 'section',
    className: `stop-report ${kind}`,
    attributes: { 'data-report': String(report.id), 'data-ends': String(report.endsAt) },
    children,
  };
}

function researchPart(report: MapResearch, ctx: StopPopupContext): PageNode {
  // "One of" as the server says it (`isOneOf`, review F7).
  const { oneOf } = report;
  return section(report, 'research', [
    head(report.picture, 'research', 'Field research'),
    { tag: 'div', className: 'report-name', text: report.text },
    ...(report.rewardText === ''
      ? []
      : [{ tag: 'div', className: 'rewards', text: report.rewardText }]),
    ...(oneOf ? picturesOf(report.rewards) : []),
    ...footer(
      report,
      { tag: 'span', text: untilWords(report.endsAt, ctx.now, ctx.zone) },
      ctx,
      ctx.more?.(report, 'research') ?? [],
    ),
  ]);
}

/** A grunt's minutes left, kept current by the page between two lists (`data-left`). */
function minutesLeft(report: MapGrunt, now: number): PageNode {
  return {
    tag: 'span',
    className: 'left',
    text: timeLeft(report.endsAt, now) ?? ENDED,
    attributes: { 'data-left': String(report.endsAt) },
  };
}

function gruntPart(report: MapGrunt, ctx: StopPopupContext): PageNode {
  return section(report, 'grunt', [
    head(report.picture, 'rocket', 'Team GO Rocket'),
    {
      tag: 'div',
      className: 'report-name',
      text: report.lineup === undefined ? report.name : `${report.name} · ${report.lineup}`,
    },
    ...picturesOf(report.catches),
    ...footer(report, minutesLeft(report, ctx.now), ctx, ctx.more?.(report, 'grunt') ?? []),
  ]);
}

function hideoutPart(report: MapHideout, ctx: StopPopupContext): PageNode {
  return section(report, 'hideout', [
    head(report.picture, 'rocket', 'Team GO Rocket'),
    { tag: 'div', className: 'report-name', text: report.name },
    ...picturesOf(report.catches),
    ...footer(
      report,
      { tag: 'span', text: untilWords(report.endsAt, ctx.now, ctx.zone) },
      ctx,
      ctx.more?.(report, 'hideout') ?? [],
    ),
  ]);
}

/** The stop's own actions, where offered. */
function actionsPart(ctx: StopPopupContext): PageNode[] {
  return ctx.actions === undefined || ctx.actions.length === 0
    ? []
    : [{ tag: 'div', className: 'stop-actions', children: [...ctx.actions] }];
}

/** A stop's popup (goal 3): the stop, then each report shown there, then its own actions. */
export function stopPopup(at: StopReports, ctx: StopPopupContext): PageNode {
  return {
    tag: 'div',
    className: 'stop-popup',
    attributes: { 'data-stop': at.stop.key },
    children: [
      ...placeHead(at.stop, ctx),
      ...at.research.map((report) => researchPart(report, ctx)),
      ...at.grunts.map((report) => gruntPart(report, ctx)),
      ...at.hideouts.map((report) => hideoutPart(report, ctx)),
      ...actionsPart(ctx),
    ],
  };
}

/**
 * A PokéStop's popup without reports (B11): `placeHead`, then its own actions.
 */
export function plainStopPopup(
  stop: { id: string; title: string; lat: number; lon: number; address?: string | null },
  ctx: StopPopupContext,
): PageNode {
  return {
    tag: 'div',
    className: 'stop-popup plain',
    attributes: { 'data-stop': stop.id },
    children: [
      ...placeHead(
        { name: stop.title, address: stop.address ?? null, lat: stop.lat, lon: stop.lon },
        ctx,
      ),
      ...actionsPart(ctx),
    ],
  };
}

/** What a report is called in its Take back's question: the task, or the grunt's or hideout's name. */
function subjectOf(report: StopReport): string {
  return 'text' in report ? report.text : report.name;
}

/** The question before a report is taken back: "Take back <task> at <stop>?". */
export function takeBackQuestion(report: StopReport): string {
  return `Take back ${subjectOf(report)} at ${report.stop.name}?`;
}
