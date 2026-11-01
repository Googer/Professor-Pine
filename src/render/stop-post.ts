import type { APIComponentInContainer } from 'discord.js';
import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
import type { TaskReward } from '../domain/research/task.js';
import type { RocketCatch } from '../domain/rocket/lineups.js';
import {
  AS_FED,
  researchPicture,
  rocketPicture,
  type PictureLookup,
  type StopPicture,
} from '../domain/stops/pictures.js';
import { backAtWords } from '../domain/stops/back-at.js';
import type { Reporter, ReportedStop, ResearchDetail } from '../domain/stops/report.js';
import { cutText, TEXT_BUDGET } from './party-post.js';
import { RESEARCH_COLOUR, rewardWords, stopMapLine, taskText } from './research.js';
import { catchWords } from './rocket.js';
import { count, memberByName, plain, timestamp } from './text.js';
import { container, countComponents, section, separator, textDisplay, thumbnail } from './v2.js';

/*
 * The post "Today’s Stops" (in the region's board) of a region channel (plan 8R-1; design 6, 9.5, 9.7):
 * research grouped by task, each with its rewards and its stops, then Team GO Rocket's hideouts
 * (plan 8R-2: Giovanni, Cliff, Arlo, Sierra, the decoy grunt, each with its stops), in
 * components-v2 messages of Discord's limits (40 components, `TEXT_BUDGET` of text), spilling
 * into a second and a third, then "…and N more tasks". Since plan 8R-6 (design
 * `2026-10-23-stop-pictures-design.md`) every reward line has its picture by the rule
 * (`researchPicture`, `rocketPicture`), and the day's research that waits under an event's window
 * stays in the post below the window's, without pictures.
 */

/**
 * At most this many messages make one post (design 9.7: three; plan 8R-9F, Matt: a sanity limit
 * of ten, so that a busy day spills rather than cuts, and a hideout is never what is lost).
 */
export const MAX_POST_MESSAGES = 10;

/** Discord's limits of a message: 40 components; classic text 2,000 characters. */
const MAX_COMPONENTS = 40;
const CLASSIC_TEXT = 2_000;

/** How many stops of one task or hideout a post names; the rest are counted. */
const STOPS_SHOWN = 15;

/**
 * How many reward lines of one task carry a picture (plan 8R-6, design Q3): Pokémon first, then
 * items, in the list's order; the rest are text. A section and its thumbnail are three of a
 * message's 40 components.
 */
export const PICTURES_PER_TASK = 6;

/** Which pictures a layout of the post shows: those of items and Mega Energy or not, how many a block. */
interface PictureStep {
  items: boolean;
  perBlock: number;
}

/**
 * The layouts a busy day tries in turn (Matt, 2026-10-24: no reported task is cut for pictures),
 * each showing no more than the one before: every picture; without those of items and Mega
 * Energy; one picture per task or hideout (its first pictured line by the order of the six); none.
 */
const NO_PICTURES: PictureStep = { items: false, perBlock: 0 };
const PICTURE_STEPS: readonly PictureStep[] = [
  { items: true, perBlock: PICTURES_PER_TASK },
  { items: false, perBlock: PICTURES_PER_TASK },
  { items: false, perBlock: 1 },
  NO_PICTURES,
];

/** A stop of the post with who reported it there. */
interface PostStop {
  stop: ReportedStop;
  reporter: Reporter;
}

/**
 * A version of a task in the post (plan 8R-5): its subject (`StopReport.subjectKey`), the
 * rewards it stands for, and the stops it was reported at.
 */
export interface PostVersion {
  key: string;
  rewards: readonly TaskReward[];
  stops: PostStop[];
}

/**
 * A task of the post (plan 8R-5, R9: one block per task): its key (`taskOfSubject`), its text as
 * reported, and its versions with their stops, the rewards' first and "one of" last. A DM links
 * to the message holding the task by any of the keys.
 */
export interface PostTask {
  key: string;
  research: ResearchDetail;
  versions: PostVersion[];
}

/**
 * A hideout of the post (plan 8R-2): who (its `rocketKey`, by which a DM finds the message holding
 * it), by name, what can be caught, and the stops it was reported at today.
 */
export interface PostHideout {
  key: string;
  name: string;
  catches: readonly RocketCatch[];
  stops: PostStop[];
}

/** What the post shows. */
export interface StopPostView {
  /** `Tuesday, October 21`: the local day. */
  day: string;
  /** The tasks of the period on now, most stops first. */
  tasks: PostTask[];
  /** Today's hideouts, Giovanni first, then Cliff, Arlo, Sierra and the decoy (plan 8R-2). */
  hideouts?: PostHideout[] | undefined;
  /** The event of the period on now, when it is one's (its name). */
  event?: string | undefined;
  /**
   * Under an intra-day event's window (or a big event's daily hours): when the day's research
   * comes back, and its tasks, most stops first (plan 8R-6, Matt: shown below the window's,
   * without pictures, under `### Back at <time>, after <event>`).
   */
  waiting?: { at: number; tasks: PostTask[] } | undefined;
  /**
   * When the period on now ends (an event's), as its line ends it: `until midnight`, `until
   * <time>`, with the day when it is not today (`periodEndWords`; review B7).
   */
  until?: string | undefined;
}

/** A run of a block's lines, with the picture its line may carry by the rule. */
interface Piece {
  text: string;
  picture?: StopPicture | undefined;
}

/** A part of the post that stays in one message: a task or a hideout. */
interface Block {
  /** What a DM finds it by: a task's key and its versions' (R9), a hideout's `rocketKey`. */
  keys: string[];
  kind: 'task' | 'hideout';
  /** Its lines in at most `room` characters in all, by whole lines, in runs. */
  pieces: (room: number) => Piece[];
}

/** The line that counts the stops a block's text does not name. */
function moreStops(left: number): string {
  return `- …and ${count(left, 'more stop')}`;
}

/** Groups of stops, each under its own line where it has one, with its picture by the rule. */
interface StopGroup {
  line?: string;
  stops: readonly PostStop[];
  picture?: StopPicture | undefined;
}

/**
 * The stop lines of each group that fit `room` characters after `used` of them: whole lines
 * only (each stop's name the link to its place, `stopMapLine`, plan 8R-7: a line is counted with
 * its link, so a link is never cut), `STOPS_SHOWN` stops at most in all, a group's line only with
 * at least one of its stops
 * (each line made of parts cut before they are escaped, design 9.7, and never cut itself: review
 * B6), and how many are left over to be counted.
 */
function fill(
  used: number,
  groups: readonly StopGroup[],
  room: number,
): { lines: string[][]; more: number } {
  const total = groups.reduce((sum, group) => sum + group.stops.length, 0);
  const lines: string[][] = groups.map(() => []);
  let shown = 0;
  let length = used;
  fill: for (const [at, group] of groups.entries()) {
    for (const [index, { stop, reporter }] of group.stops.entries()) {
      if (shown >= STOPS_SHOWN) break fill;
      const own = `- ${stopMapLine(stop)} · ${memberByName(reporter)}`;
      const line = index === 0 && group.line !== undefined ? `${group.line}\n${own}` : own;
      const left = total - shown - 1;
      const tail = left > 0 ? 1 + moreStops(left).length : 0;
      if (length + 1 + line.length + tail > room) break fill;
      lines[at]?.push(own);
      length += 1 + line.length;
      shown += 1;
    }
  }
  return { lines, more: total - shown };
}

/**
 * A head and groups of stops as pieces of at most `room` characters in all (`fill`), after a
 * heading of their section where it has one (its own piece). One group without a line is one
 * piece with its picture (a task of one version, a hideout: one block, as before); several are the
 * head, then a piece per group with a stop shown (its line and its stops, its picture), then the
 * line that counts the rest: a group with no stop shown has no piece and no picture.
 */
function stopPieces(
  heading: string | undefined,
  head: string,
  groups: readonly StopGroup[],
  room: number,
): Piece[] {
  const used = head.length + (heading === undefined ? 0 : heading.length + 1);
  const { lines, more } = fill(used, groups, room);
  const tail = more > 0 ? [moreStops(more)] : [];
  const top = heading === undefined ? [] : [{ text: heading }];
  const [only] = groups;
  if (groups.length === 1 && only?.line === undefined) {
    const shown = lines[0] ?? [];
    return [
      ...top,
      {
        text: [head, ...shown, ...tail].join('\n'),
        picture: shown.length > 0 ? only?.picture : undefined,
      },
    ];
  }
  return [
    ...top,
    { text: head },
    ...groups.flatMap((group, at): Piece[] => {
      const shown = lines[at] ?? [];
      if (shown.length === 0) return [];
      const text = [...(group.line === undefined ? [] : [group.line]), ...shown].join('\n');
      return [{ text, picture: group.picture }];
    }),
    ...tail.map((text) => ({ text })),
  ];
}

/** The line of a version among others whose reward was not said. */
const REWARD_NOT_SAID = 'reward not said';

/** The heading of the Rocket section, over its first hideout. */
const ROCKET_HEADING = '### Team GO Rocket hideouts';

/** The heading of the day's research under an event's window (plan 8R-6). */
function backHeading(at: number, event: string | undefined): string {
  return `### ${backAtWords(timestamp(at, 't'), event === undefined ? undefined : plain(event))}`;
}

/**
 * A task's block: its text with its version's rewards beside it where it has one version, else
 * its text a line of its own and a line of each version's rewards before its stops (R9), each
 * with its picture by the rule (`researchPicture`) unless `pictured` is false.
 */
function taskBlock(task: PostTask, pictured: boolean, heading?: string): Block {
  const keys = [task.key, ...task.versions.map((version) => version.key)];
  const [only, ...others] = task.versions;
  const single = only !== undefined && others.length === 0;
  const rewards = single ? rewardWords(only.rewards) : '';
  const head = `**${taskText(task.research)}**${rewards === '' ? '' : ` · ${rewards}`}`;
  // A version whose reward was not said (a typed task without `reward:`) has a line of its own
  // too, else its stops would run on under the version before it (review R1).
  const groups = task.versions.map((version): StopGroup => {
    const line = rewardWords(version.rewards);
    const picture = pictured ? researchPicture(version.rewards) : undefined;
    return single
      ? { stops: version.stops, picture }
      : { line: line === '' ? REWARD_NOT_SAID : line, stops: version.stops, picture };
  });
  return {
    keys: [...new Set(keys)],
    kind: 'task',
    pieces: (room) => stopPieces(heading, head, groups, room),
  };
}

/**
 * The blocks of a view: its tasks; its hideouts under their heading; then the day's research
 * that waits under an event's window, under its heading and without pictures (plan 8R-6), last,
 * so that it is what a busy event day counts away (Matt, 2026-10-24).
 */
function blocksOf(view: StopPostView): Block[] {
  const tasks = view.tasks.map((task) => taskBlock(task, true));
  const waiting = (view.waiting?.tasks ?? []).map((task, index) =>
    taskBlock(
      task,
      false,
      index === 0 && view.waiting ? backHeading(view.waiting.at, view.event) : undefined,
    ),
  );
  const hideouts = (view.hideouts ?? []).map((hideout, index): Block => {
    const catches = catchWords(hideout.catches);
    const head = `**${plain(hideout.name)}**${catches === '' ? '' : ` · catch ${catches}`}`;
    const group = { stops: hideout.stops, picture: rocketPicture(hideout.key, hideout.catches) };
    return {
      keys: [hideout.key],
      kind: 'hideout',
      pieces: (room) => stopPieces(index === 0 ? ROCKET_HEADING : undefined, head, [group], room),
    };
  });
  return [...tasks, ...hideouts, ...waiting];
}

/**
 * The pictures a post shows, by their sources, each once (a task's Pokémon before its items;
 * plan 8R-6): what `StopPictures.prepare` makes before the post is drawn. Read off the layout
 * `stopPostMessages` chooses with the same lookup, so only what it shows: `PICTURES_PER_TASK` of
 * a task, none of a version with no stop shown or of a task counted by "…and N more", none of the
 * day's research under a window, and on a busy day only those of the step it takes. `picture` is
 * the lookup the post is drawn with (`StopPictures.url`): a source gone takes no place, so the
 * next line's picture is listed, and the gone one with it, to be asked for again once its failure
 * is old.
 */
export function postPictures(view: StopPostView, picture: PictureLookup = AS_FED): string[] {
  const sources = new Set<string>();
  layoutOf(view, busyStep(view, picture), picture, sources);
  return [...sources];
}

/**
 * The step of a busy day the post is drawn with (Matt, 2026-10-24): the first of `PICTURE_STEPS`
 * whose layout places every task and hideout. Where none does, the first of those that place the
 * most blocks (review W5 of 8R-7): pictures cost components, not text, so on a day limited by text
 * every step places as many and the pictures stay; a day limited by components gets the one
 * without pictures, as before. Either then spills and counts away as it must. The same view and
 * lookup always give the same step.
 */
function busyStep(view: StopPostView, picture: PictureLookup): PictureStep {
  let best: { step: PictureStep; placed: number } | undefined;
  for (const step of PICTURE_STEPS) {
    const { placedAll, placed } = layoutOf(view, step, picture);
    if (placedAll) return step;
    if (best === undefined || placed > best.placed) best = { step, placed };
  }
  return best?.step ?? NO_PICTURES;
}

/** The head of the post: its title, the day, an event's line. */
function headText(view: StopPostView, part: number): string {
  if (part > 0) return `-# Today’s Stops, continued (${String(part + 1)})`;
  const lines = [`## Today’s Stops`, `-# ${plain(view.day)} · field research and Team GO Rocket`];
  if (view.event !== undefined) {
    lines.push(
      `**${plain(view.event)}**: its tasks${view.until === undefined ? '' : ` ${view.until}`}.`,
    );
  }
  if (
    view.tasks.length === 0 &&
    (view.hideouts ?? []).length === 0 &&
    (view.waiting?.tasks ?? []).length === 0
  ) {
    lines.push(
      'Nothing reported right now. `/research report` and `/rocket report` tell the region ' +
        'what a stop has.',
    );
  }
  return lines.join('\n');
}

/**
 * A block as components: its pieces, `step.perBlock` of their pictures at most beside them
 * (Pokémon first, then items, in order; none of items and Mega Energy where `step.items` is
 * false), the address of each as `picture` names it, none where it names none (a source gone,
 * which takes no place among them); consecutive pieces without a picture in one text.
 */
function blockParts(
  block: Block,
  room: number,
  step: PictureStep,
  picture: PictureLookup,
): APIComponentInContainer[] {
  const pieces = block.pieces(room);
  const candidates = pieces.flatMap((piece, at) =>
    piece.picture !== undefined && (step.items || piece.picture.kind === 'pokemon')
      ? [{ at, kind: piece.picture.kind }]
      : [],
  );
  const addresses = new Map<number, string>();
  for (const one of [
    ...candidates.filter((candidate) => candidate.kind === 'pokemon'),
    ...candidates.filter((candidate) => candidate.kind !== 'pokemon'),
  ]) {
    if (addresses.size >= step.perBlock) break;
    const source = pieces[one.at]?.picture?.source;
    const address = source === undefined ? undefined : picture(source);
    if (address !== undefined) addresses.set(one.at, address);
  }
  const parts: APIComponentInContainer[] = [];
  let run: string[] = [];
  const endRun = () => {
    // `cutText` only as a backstop: the pieces fit `room` by whole lines.
    if (run.length > 0) parts.push(textDisplay(cutText(run.join('\n'), room)));
    run = [];
  };
  for (const [at, piece] of pieces.entries()) {
    const address = addresses.get(at);
    if (address !== undefined) {
      endRun();
      parts.push(section(cutText(piece.text, room), thumbnail(address)));
    } else {
      run.push(piece.text);
    }
  }
  endRun();
  return parts;
}

/** The line that counts what the post has no room for: `…and 4 more tasks and 1 more hideout`. */
function leftLine(left: readonly Block[]): string {
  const tasks = left.filter((block) => block.kind === 'task').length;
  const hideouts = left.length - tasks;
  const parts = [
    ...(tasks > 0 ? [count(tasks, 'more task')] : []),
    ...(hideouts > 0 ? [count(hideouts, 'more hideout')] : []),
  ];
  return `…and ${parts.join(' and ')}`;
}

/**
 * The post as components-v2 messages (design 6, 9.7): research first, then the hideouts (plan
 * 8R-2), then the day's research waiting under an event's window, in as many messages as they
 * need of `MAX_POST_MESSAGES`, each a container of the research colour within Discord's limits; a
 * block too long for a message is cut (text cut before it is escaped: each line is made of
 * escaped parts, cut whole by `cutText` as a backstop); what does not fit the last message is
 * counted there: "…and 4 more tasks and 1 more hideout". A busy day is decided for the whole post
 * (plan 8R-6; Matt, 2026-10-24): the first layout of `PICTURE_STEPS` that places every task and
 * hideout (every picture; without those of items and Mega Energy; one a task; none), else the
 * first that places the most (`busyStep`), which spills and counts away as it must; the same view
 * always gives the same layout. `picture` gives the address of each picture's source (`StopPictures.url`).
 */
export function stopPostMessages(
  view: StopPostView,
  picture: PictureLookup = AS_FED,
): PostLayout<V2Message> {
  const { messages, placement } = layoutOf(view, busyStep(view, picture), picture);
  return { messages, placement };
}

/**
 * The post laid out with the pictures `step` shows, how many blocks it placed and whether every one;
 * `shownSources`, where given, gathers the sources of the pictures of the blocks placed
 * (`postPictures`).
 */
function layoutOf(
  view: StopPostView,
  step: PictureStep,
  picture: PictureLookup,
  shownSources?: Set<string>,
): PostLayout<V2Message> & { placedAll: boolean; placed: number } {
  const messages: APIComponentInContainer[][] = [];
  const placement = new Map<string, number>();
  let parts: APIComponentInContainer[] = [textDisplay(headText(view, 0))];
  const blocks = blocksOf(view);
  let shown = 0;
  for (const block of blocks) {
    // Every source looked up, a gone one too: `prepare` asks for it again once its failure is old.
    const sources: string[] = [];
    const named: PictureLookup = (source) => {
      sources.push(source);
      return picture(source);
    };
    const own = blockParts(block, BLOCK_ROOM, step, named);
    const joined = [...parts, separator(), ...own];
    if (fits(joined)) {
      parts = joined;
    } else {
      if (messages.length + 1 >= MAX_POST_MESSAGES) break;
      messages.push(parts);
      parts = [textDisplay(headText(view, messages.length)), ...own];
    }
    // The window's task first: a DM of now finds it there, not among the day's that waits.
    for (const key of block.keys) if (!placement.has(key)) placement.set(key, messages.length);
    for (const source of sources) shownSources?.add(source);
    shown += 1;
  }
  if (shown < blocks.length) parts.push(textDisplay(leftLine(blocks.slice(shown))));
  messages.push(parts);
  return {
    messages: messages.map((one) => ({ v2: true, components: [container(RESEARCH_COLOUR, one)] })),
    placement,
    placedAll: shown === blocks.length,
    placed: shown,
  };
}

/** The messages of a post, and which of them holds each task or hideout (by its key). */
export interface PostLayout<T> {
  messages: T[];
  placement: Map<string, number>;
}

/** Room kept in every message for the line "…and N more tasks" and its component. */
const TAIL_ROOM = 80;

/**
 * The room of one block's text in a components-v2 message: `TEXT_BUDGET` less the tail line's
 * room and 200 for the head of a message the block may open.
 */
export const BLOCK_ROOM = TEXT_BUDGET - TAIL_ROOM - 200;

/** The room of one block's text in the plain text post. */
export const CLASSIC_BLOCK_ROOM = 1_800;

/** The text of components, as Discord counts it against a message's 4,000 characters. */
function textOf(parts: readonly object[]): number {
  return parts.reduce((sum: number, part) => {
    const nested = part as { content?: unknown; components?: object[] };
    const own = typeof nested.content === 'string' ? nested.content.length : 0;
    return sum + own + textOf(nested.components ?? []);
  }, 0);
}

/** Whether components fit one message with the room of the tail line kept. */
function fits(parts: readonly APIComponentInContainer[]): boolean {
  return (
    textOf(parts) <= TEXT_BUDGET - TAIL_ROOM &&
    countComponents([container(0, [...parts])]) <= MAX_COMPONENTS - 1
  );
}

/**
 * The post as plain text, where the bot may not post embeds (as `spawnTextMessage`): the same
 * lines in messages of Discord's 2,000 characters, `MAX_POST_MESSAGES` at most.
 */
export function stopPostText(view: StopPostView): PostLayout<ClassicMessage> {
  const messages: string[] = [];
  const placement = new Map<string, number>();
  let current = headText(view, 0);
  const blocks = blocksOf(view);
  let shown = 0;
  for (const block of blocks) {
    const text = cutText(
      block
        .pieces(CLASSIC_BLOCK_ROOM)
        .map((piece) => piece.text)
        .join('\n'),
      CLASSIC_BLOCK_ROOM,
    );
    const joined = `${current}\n\n${text}`;
    if (joined.length <= CLASSIC_TEXT - TAIL_ROOM) {
      current = joined;
    } else {
      if (messages.length + 1 >= MAX_POST_MESSAGES) break;
      messages.push(current);
      current = text;
    }
    for (const key of block.keys) if (!placement.has(key)) placement.set(key, messages.length);
    shown += 1;
  }
  if (shown < blocks.length) current = `${current}\n${leftLine(blocks.slice(shown))}`;
  messages.push(current);
  return { messages: messages.map((content) => ({ content })), placement };
}
