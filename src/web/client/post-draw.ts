import type {
  MapParty,
  PostButtonView,
  PostPanel,
  PostLine,
  PostNode,
  PostView,
  PostViewBlock,
} from '../../domain/web/party-data.js';
import { completionAsk, NOT_YET, TAKEN_AS_DONE, YES_DONE } from '../../render/completion-words.js';
import type { DistanceUnits, Place } from './distance.js';
import { meetupActions, meetupHereBox } from './meetup-forms.js';
import { groupPick, STATUS_WORDS } from './parties.js';
import { mapLine, type PageNode } from './popup.js';

export { mapLine };
import { postTime, type TimeShown } from './post-time.js';
import { spawnBox } from './spawn-forms.js';
import { trainHereBox } from './train-forms.js';
import { answerLine, type PressAnswer } from './press-answer.js';
import { arrivalNumbers } from '../../domain/party/stops-ahead.js';

/**
 * A party's post drawn on the live map (plan 8M-8A): the post view the server made of the layout
 * its post was last shown with, drawn as Discord draws a components-v2 container (its edge in the
 * post's color, headings, small print, the buttons in Discord's styles), as trees of nodes set
 * as text (`renderNode`): never HTML from data. Under it the map's own: the member's part (who
 * they are in it, the group to pick, what the map lets them do beyond the post's buttons) and the
 * map's line (distance, Directions, Open on Discord). Pure.
 */

/** What drawing a post needs besides the post and its party. */
export interface PostDrawContext {
  now: number;
  /** Pine's own origin (`location.origin`): a link to its pages stays a link. */
  origin: string;
  /** The server's snowflake: a link on Discord only to its own posts. */
  guild: string;
  /** Where times are shown; the page leaves it to the reader's language and zone. */
  time?: TimeShown;
  /** A stop of a train's route by its key, as the map names it (`stopName`). */
  stopName(key: string): string;
  /** What the member opened under this party's post, kept across redraws (review 8A-10). */
  opened?: PanelsOpen;
  /**
   * The answer of the member's last press on this party (plan 8M-11A, S9), kept by the page for
   * `ANSWER_MS` across redraws, drawn in the answer line under the post's buttons.
   */
  answer?: PressAnswer;
}

/** What is open under a party's post (`PostDrawContext.opened`): Route's part. */
export interface PanelsOpen {
  route?: boolean;
}

/** The map's part of a popup: where the party is and where the member is. */
export interface PlacedContext extends PostDrawContext {
  /** Where the party is (a gym, a stop, a spot, a meetup's place); undefined where unknown. */
  place: Place | undefined;
  /** Where the member is, once the browser said. */
  located: Place | undefined;
  units: DistanceUnits;
}

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * An address the page may link, checked again after the server and as strictly
 * (`linkableOnTheMap`, review 8A-13): Google Maps, this server's posts on Discord, Pine's own
 * pages (its origin as the page has it), by https without a user, password or port; undefined
 * for anything else.
 */
export function safeHref(href: string, origin: string, guild: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.username !== '' || url.password !== '') return undefined;
  if (url.origin === origin) return url.href;
  if (url.protocol !== 'https:' || url.port !== '') return undefined;
  if (url.hostname === 'www.google.com' && /^\/maps(?:\/|$)/u.test(url.pathname)) return url.href;
  if (url.hostname === 'discord.com' && url.pathname.startsWith(`/channels/${guild}/`)) {
    return url.href;
  }
  return undefined;
}

/** A picture's address the page may show: Pine's own (a path) or one by https; else undefined. */
export function safeSrc(src: string): string | undefined {
  if (src.startsWith('/') && !src.startsWith('//')) return src;
  return src.startsWith('https://') ? src : undefined;
}

/** The nodes of a line of a post. */
function textNodes(nodes: readonly PostNode[], context: PostDrawContext): PageNode[] {
  return nodes.map((node): PageNode => {
    switch (node.kind) {
      case 'text':
        return { tag: 'span', text: node.text };
      case 'strong':
        return { tag: 'strong', children: textNodes(node.children, context) };
      case 'em':
        return { tag: 'em', children: textNodes(node.children, context) };
      case 'underline':
        return { tag: 'u', children: textNodes(node.children, context) };
      case 'strike':
        return { tag: 's', children: textNodes(node.children, context) };
      case 'code':
        return { tag: 'code', text: node.text };
      case 'link': {
        const href = safeHref(node.href, context.origin, context.guild);
        const children = textNodes(node.children, context);
        return href === undefined
          ? { tag: 'span', children }
          : { tag: 'a', attributes: { href, ...NEW_TAB }, children };
      }
      case 'emoji': {
        const src = node.src === undefined ? undefined : safeSrc(node.src);
        return src === undefined
          ? { tag: 'span', text: `:${node.name}:` }
          : {
              tag: 'img',
              className: 'emoji',
              attributes: { src, alt: `:${node.name}:`, title: node.name, draggable: 'false' },
            };
      }
      case 'time':
        return {
          tag: 'time',
          text: postTime(node.at, node.style, context.now, context.time),
          attributes: {
            datetime: new Date(node.at).toISOString(),
            'data-at': String(node.at),
            ...(node.style === 'R' ? { 'data-relative': '' } : {}),
          },
        };
    }
  });
}

const LINE_CLASSES: Readonly<Record<PostLine['style'], [string, string]>> = {
  heading: ['h3', 'post-heading'],
  small: ['div', 'small'],
  plain: ['div', 'line'],
};

function lineNode(line: PostLine, context: PostDrawContext): PageNode {
  const [tag, className] = LINE_CLASSES[line.style];
  return { tag, className, children: textNodes(line.nodes, context) };
}

/** Whether a member may press this press now, as the map's list of what applies says. */
function pressable(party: MapParty, action: string): boolean {
  const { attendance } = party;
  if (action === 'remote') return attendance.remote.offered;
  // +1 and −1 (plan 8M-8B): for everybody, as the post has them; never while read-only.
  if (action === 'more' || action === 'less') return attendance.count;
  return attendance.actions.some((press) => press.action === action);
}

/**
 * What a panel of the map is on this party for this member: its attributes, `off` where it does
 * nothing now, else Discord.
 */
function panelAttributes(
  party: MapParty,
  panel: PostPanel,
): Record<string, string> | 'off' | undefined {
  switch (panel) {
    case 'meet':
      // Meet…'s form (plan 8M-8B), which asks the server what it offers and refuses as the press
      // does; nothing while read-only (`count`, as everything that may be pressed).
      return party.attendance.count ? { 'data-meet': party.id } : 'off';
    case 'group': {
      const { pick, regroup } = party.attendance;
      // A newcomer to several groups picks in the member's part (plan 8X-1B); else Group…'s form
      // (plan 8M-8B), or why it would not open, as the server decided it; nothing while read-only.
      if (pick !== undefined && pick.length > 0) return { 'data-focus-pick': '' };
      if (regroup === undefined) return 'off';
      if ('onlyNewGroup' in regroup) {
        // A new group the only way (review W-1): nothing to submit here, the note with the post's
        // link (plan 8M-11A, S9).
        return {
          'data-on-discord': 'group',
          'data-why': '',
          'data-note': discordNote(party, 'group'),
        };
      }
      return 'refused' in regroup
        ? {
            'data-on-discord': 'group',
            'data-why': regroup.refused,
            'data-note': discordNote(party, 'group'),
          }
        : { 'data-regroup': party.id };
    }
    case 'time':
      return party.kind === 'raid' && party.mayChange
        ? { 'data-change-raid': party.id }
        : undefined;
    case 'moves':
      // Move…'s form (plan 8M-8C, R1), the post's dialog as the list carries it.
      return party.kind === 'train' && party.moves !== null
        ? { 'data-move-train': party.id }
        : undefined;
    case 'manage':
      // Manage…'s form (plan 8M-8C) where the server says it opens (`mayManage`, branch review
      // B2: as the dialog opens, a train without a route too); else why not, as it decided it.
      return party.kind === 'train' && party.mayManage
        ? { 'data-manage-train': party.id }
        : undefined;
    case 'route':
      return party.kind === 'train' ? { 'data-toggle': 'route' } : undefined;
    case 'split':
      // Split…'s form (plan 8M-8C), which asks the server first and says its refusal, as the
      // dialog does before it opens; nothing while read-only.
      if (party.kind !== 'train') return undefined;
      return party.moveRefusal?.reason === 'read-only' ? 'off' : { 'data-split-train': party.id };
  }
}

/** The note of a button the map leaves to Discord (plan 8M-11A, S9), beside the post's link. */
export const ON_DISCORD_NOTE = 'This is done in the post on Discord.';

/** The note where Group… can only start a new group (review W-1, plan 8M-11A S9). */
export const NEW_GROUP_NOTE = 'A new group is started on Discord.';

/**
 * The words of the note box that a button done on Discord shows in the form's place (plan 8M-11A,
 * S9), with "Open the post on Discord": `NEW_GROUP_NOTE` for Group… where a new group is the only
 * way (review W-1), else `ON_DISCORD_NOTE`.
 */
export function discordNote(party: MapParty, button: string): string {
  const { regroup } = party.attendance;
  return button === 'group' && regroup !== undefined && 'onlyNewGroup' in regroup
    ? NEW_GROUP_NOTE
    : ON_DISCORD_NOTE;
}

/**
 * Why the member may not use a button the map has no panel of for them (reviews 8A-12, N1): for
 * a train's Move… and Manage…, as the server decided and worded it (`MapTrain.moveRefusal`: the
 * commands' `mayNotMove`, no route, read-only, in Discord's words; plan 8M-8C, review C1: the page
 * words none itself); else nothing, and the button opens the note to do it on Discord. Said in the
 * answer line as a refusal (plan 8M-11A, S20). `button` is which button was pressed (`moves`,
 * `manage`, `group`, or another's).
 */
export function whyNot(party: MapParty, button: string): string {
  // Group…'s refusal before it opens (plan 8M-8B), as the post's dialog says it.
  if (button === 'group') {
    const { regroup } = party.attendance;
    return regroup !== undefined && 'refused' in regroup ? regroup.refused : '';
  }
  if (party.kind !== 'train' || (button !== 'moves' && button !== 'manage')) return '';
  return party.moveRefusal?.text ?? '';
}

/**
 * A button of a post as Discord draws it (its style, its icon, its label), named for a reader and
 * a screen reader (`aria-label`, `title`), and what it does on the map: a press (off while the
 * member may not press it now), one of the map's panels or forms (where the member may not use it,
 * why not, or the post's link: `data-on-discord`), or the screenshot's note in its place.
 */
function controlNode(button: PostButtonView, party: MapParty, context: PostDrawContext): PageNode {
  const { does } = button;
  if (does.kind === 'screenshot') {
    const href = safeHref(party.link, context.origin, context.guild);
    return {
      tag: 'a',
      className: 'screenshot-note',
      text: 'Reported from a screenshot · feedback on Discord →',
      attributes: href === undefined ? {} : { href, ...NEW_TAB },
    };
  }
  let doing: Record<string, string> = {};
  let on = !button.disabled;
  if (does.kind === 'press') {
    doing = { 'data-party': party.id, 'data-action': does.action };
    on &&= pressable(party, does.action);
  } else if (does.kind === 'panel') {
    // A button the post drew off opens nothing (review B-2): no form attribute, which
    // `formControls` would turn back on.
    const attributes = button.disabled ? 'off' : panelAttributes(party, does.panel);
    if (attributes === 'off') {
      on = false;
    } else {
      // Why not, or the post's link: the words of the link the line shows (`data-link`,
      // review N-4), which the page reads.
      doing = attributes ?? {
        'data-on-discord': does.panel,
        'data-why': whyNot(party, does.panel),
        'data-note': discordNote(party, does.panel),
      };
    }
  } else {
    on = false;
  }
  const src = button.emoji?.src === undefined ? undefined : safeSrc(button.emoji.src);
  const icon: PageNode[] =
    button.emoji === undefined
      ? []
      : src === undefined
        ? [{ tag: 'span', className: 'icon-text', text: button.emoji.name }]
        : [{ tag: 'img', className: 'emoji', attributes: { src, alt: '', draggable: 'false' } }];
  const label = button.label;
  return {
    tag: 'button',
    className: `press ${button.style}${label === undefined ? ' icon' : ''}`,
    ...(icon.length === 0 && label !== undefined
      ? { text: label }
      : { children: [...icon, ...(label === undefined ? [] : [{ tag: 'span', text: label }])] }),
    attributes: {
      type: 'button',
      title: button.name,
      'aria-label': button.name,
      ...doing,
      ...(on ? {} : { disabled: '' }),
    },
  };
}

function blockNode(block: PostViewBlock, party: MapParty, context: PostDrawContext): PageNode {
  switch (block.type) {
    case 'separator':
      return { tag: 'hr', className: 'post-line' };
    case 'controls':
      return {
        tag: 'div',
        className: 'post-controls',
        children: block.rows.map((row) => ({
          tag: 'div',
          className: 'post-row',
          children: row.map((button) => controlNode(button, party, context)),
        })),
      };
    case 'text': {
      const src = block.beside?.kind === 'picture' ? safeSrc(block.beside.src) : undefined;
      // A section's button beside its text (review W-4), drawn as the post's controls are.
      const control =
        block.beside?.kind === 'button'
          ? controlNode(block.beside.button, party, context)
          : undefined;
      return {
        tag: 'div',
        className: block.role === undefined ? 'post-text' : `post-text role-${block.role}`,
        children: [
          ...(src === undefined
            ? []
            : [{ tag: 'img', className: 'beside', attributes: { src, alt: '' } }]),
          ...(control === undefined
            ? []
            : [{ ...control, className: `${control.className ?? ''} beside-control`.trim() }]),
          ...block.lines.map((line) => lineNode(line, context)),
        ],
      };
    }
  }
}

/**
 * The post as Discord draws it: its edge (`accent-<name>`, a value of `theme.css`), its parts in
 * order; the completion question to the member it asked above its buttons (plan 8M-11A, S21), and
 * under them the answer line of the member's presses (`answerLine`, S9), which the phone card's
 * summary shows too.
 */
export function postCard(view: PostView, party: MapParty, context: PostDrawContext): PageNode {
  const blocks = view.blocks.map((block) => blockNode(block, party, context));
  const first = view.blocks.findIndex((block) => block.type === 'controls');
  const last = view.blocks.findLastIndex((block) => block.type === 'controls');
  const question = completionPart(party, context);
  const answer = answerLine(context.answer);
  const children =
    first === -1
      ? [...blocks, ...question, answer]
      : [
          ...blocks.slice(0, first),
          ...question,
          ...blocks.slice(first, last + 1),
          answer,
          ...blocks.slice(last + 1),
        ];
  return {
    tag: 'div',
    className: `post accent-${view.accent}`,
    attributes: { 'data-post': party.id },
    children,
  };
}

const button = (text: string, attributes: Record<string, string>): PageNode => ({
  tag: 'button',
  className: 'press',
  text,
  attributes: { type: 'button', ...attributes },
});

/** How far away a stop ahead is in the Route list (plan 8M-15): ` (next)`, ` (in 3 stops)`. */
function awayWords(number: number | undefined): string {
  if (number === undefined) return '';
  return number === 1 ? ' (next)' : ` (in ${String(number)} stops)`;
}

/**
 * A train's part for the member: whose the conductor role is, Edit route and the conductor's
 * buttons (`/conductor`'s, outside Manage…, which is Discord's dialog: R2), and the stop list
 * Route shows.
 */
function trainPart(
  train: Extract<MapParty, { kind: 'train' }>,
  context: PostDrawContext,
): PageNode[] {
  const { conductor } = train;
  const who =
    conductor.who === 'you'
      ? 'You are its conductor.'
      : conductor.who === 'other'
        ? 'It has a conductor.'
        : 'It has no conductor.';
  const actions = [
    ...(train.may.arrange ? [button('Edit route', { 'data-route-train': train.id })] : []),
    ...(conductor.mayTake
      ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
      : []),
    ...(conductor.mayDrop
      ? [
          button(conductor.who === 'you' ? 'Stop being the conductor' : 'Take the conductor off', {
            'data-conductor': 'give-up',
            'data-train': train.id,
          }),
        ]
      : []),
  ];
  // Route (plan 8M-8C, R3): the stops read-only and what lies ahead as the server words it (the
  // post's small print); route mode is the Edit route above it, once (review C8). Each stop ahead
  // says how far away it is, as the map's badges number it (plan 8M-15, Q1: only here, not in
  // the post on Discord).
  const away = arrivalNumbers(train.stopsAhead, train.stop);
  const route: PageNode = {
    tag: 'section',
    className: 'route',
    attributes: context.opened?.route ? {} : { hidden: '' },
    children: [
      {
        tag: 'ol',
        children: train.route.map((key, index) => ({
          tag: 'li',
          text: `${context.stopName(key)}${index === train.stop ? ' (the train is here)' : awayWords(away.get(index))}`,
        })),
      },
      ...(train.ahead === null
        ? []
        : [{ tag: 'div', className: 'route-ahead', text: train.ahead }]),
    ],
  };
  return [
    { tag: 'div', className: 'conductor', text: who },
    ...(actions.length === 0
      ? []
      : [{ tag: 'div', className: 'train-actions', children: actions }]),
    route,
  ];
}

/**
 * The member's own part under the post (the map's, as before plan 8M-8A, in the post's look):
 * who they are in it (`You: Coming, group B · remote`), the group a newcomer picks (Interested,
 * Join and Here send it), and what the map lets them do beyond the post's buttons: a raid's
 * Manage… (its boss and moves are slash commands on Discord), a train's conductor role, Edit
 * route and what Route shows, a meetup's Manage….
 */
function minePart(party: MapParty, context: PostDrawContext): PageNode[] {
  const { mine, groups, remote } = party.attendance;
  const several = groups.length > 1;
  const you =
    mine === null
      ? []
      : [
          {
            tag: 'div',
            className: 'mine',
            text: `You: ${STATUS_WORDS[mine.status]}${several && mine.status !== 'complete' ? `, group ${mine.group}` : ''}${remote.on ? ' · remote' : ''}`,
          },
        ];
  const own: PageNode[] =
    party.kind === 'raid'
      ? party.mayChange
        ? [
            button('Manage…', {
              'data-change-raid': party.id,
              title: 'Change its boss, moves or times',
            }),
          ]
        : []
      : party.kind === 'train'
        ? trainPart(party, context)
        : party.kind === 'meetup'
          ? meetupActions(party)
          : [];
  const pick = groupPick(party.id, party.attendance);
  const parts = [...you, ...pick, ...own];
  return parts.length === 0 ? [] : [{ tag: 'div', className: 'mine-part', children: parts }];
}

/**
 * The completion question to the member it asked (plan 8M-8B), as the post's message asks it with
 * its two answers ("Yes, done", "Not yet": a press `answer` with `data-yes`), and when no answer
 * counts as done, in the reader's own zone.
 */
function completionPart(party: MapParty, context: PostDrawContext): PageNode[] {
  const { asked } = party.attendance;
  if (asked === undefined) return [];
  // The question as Discord words it (`completionAsk`), the party named as the server sent it.
  const ask = completionAsk(asked.word);
  const answer = (text: string, yes: boolean, style: string): PageNode => ({
    tag: 'button',
    className: `press ${style}`,
    text,
    attributes: {
      type: 'button',
      'data-party': party.id,
      'data-action': 'answer',
      'data-yes': String(yes),
    },
  });
  return [
    {
      tag: 'div',
      className: 'completion',
      children: [
        { tag: 'div', className: 'question', text: ask.charAt(0).toUpperCase() + ask.slice(1) },
        {
          tag: 'div',
          className: 'small',
          text: `Without an answer by ${postTime(asked.until, 't', context.now, context.time)} ${TAKEN_AS_DONE}`,
        },
        {
          tag: 'div',
          className: 'post-row',
          children: [answer(YES_DONE, true, 'success'), answer(NOT_YET, false, 'secondary')],
        },
      ],
    },
  ];
}

/**
 * The map's own controls of a party beside Open on Discord (plan 8M-8B, X1, X2: the post has no
 * button for them): Report… for every member (nothing while read-only), and staff's Delete…,
 * where the list offers it (`close`).
 */
export function mapControls(party: MapParty): PageNode[] {
  const control = (text: string, data: string): PageNode => ({
    tag: 'button',
    className: 'link-button',
    text,
    attributes: { type: 'button', [data]: party.id },
  });
  return [
    // For a member who sees the party's forum on Discord (review W-7; never while read-only).
    ...(party.mayReport === true ? [control('Report…', 'data-report-party')] : []),
    ...(party.close === undefined ? [] : [control('Delete…', 'data-close-party')]),
  ];
}

/** A raid among several at one gym, as the list of them names it. */
export interface RaidChoice {
  id: string;
  picture: string | null;
  heading: string;
  time: string;
}

/**
 * The popup of a gym with several raids (plan 8M-8A, ruling 14): the gym's name, then each raid's
 * heading line (its picture, its post's heading words, its time), each opening that raid's post
 * in the popup (`data-show-raid`), never the posts stacked; then `extras`.
 */
export function raidChoices(
  gymName: string,
  raids: readonly RaidChoice[],
  extras: readonly PageNode[] = [],
): PageNode {
  return {
    tag: 'div',
    className: 'party-popup raid-choices',
    children: [
      {
        tag: 'div',
        className: 'place-list',
        children: [
          { tag: 'strong', className: 'name', text: gymName },
          {
            tag: 'div',
            className: 'choices',
            children: raids.map((raid): PageNode => {
              const src = raid.picture === null ? undefined : safeSrc(raid.picture);
              return {
                tag: 'button',
                className: 'place-choice',
                attributes: { type: 'button', 'data-show-raid': raid.id },
                children: [
                  src === undefined
                    ? { tag: 'span', className: 'picture none' }
                    : { tag: 'img', className: 'picture', attributes: { src, alt: '' } },
                  { tag: 'span', className: 'what', text: raid.heading },
                  { tag: 'span', className: 'when', text: raid.time },
                ],
              };
            }),
          },
        ],
      },
      ...extras,
    ],
  };
}

/**
 * What a gym that shows its raid offers under it (review 8A-2): "Report spawn here", "Hold meetup here"
 * and "Start train here", no "Report raid" (the popup offers the raid; reporting one where one stands opens it
 * anyway: `reportClosesForm`).
 */
export function gymWithRaidBoxes(gymId: number): PageNode[] {
  return [spawnBox(gymId), meetupHereBox(gymId), trainHereBox(String(gymId))];
}

/** Back from a raid's post to the list of the raids at its gym. */
export const ALL_RAIDS_HERE: PageNode = {
  tag: 'button',
  className: 'press back place-control',
  text: '← All raids here',
  attributes: { type: 'button', 'data-show-raid': '' },
};

/** A party's popup on the map: its post, the member's own part, the map's line, then `extras`. */
export function postPopup(
  view: PostView,
  party: MapParty,
  context: PlacedContext,
  extras: readonly PageNode[] = [],
): PageNode {
  return {
    tag: 'div',
    className: `party-popup post-popup ${party.kind}`,
    children: [
      postCard(view, party, context),
      ...minePart(party, context),
      mapLine(context.place, party.link, context.located, context.units, mapControls(party)),
      ...extras,
    ],
  };
}
