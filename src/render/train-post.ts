import { memberOf, type SplitOff, type StopRef, type TrainParty } from '../domain/party/party.js';
import { nameOf } from '../domain/party/timed.js';
import {
  currentStop,
  routeAhead,
  routeFinished,
  splitsPossible,
  WHOLE_ROUTE_STOPS,
} from '../domain/party/train.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import {
  bottomControls,
  manageTrainButton,
  moveTrainButton,
  splitGroupButton,
  wholeRouteButton,
} from './party-controls.js';
import {
  cutText,
  ENDED_COLOUR,
  fittedLayout,
  inRole,
  KEPT_OPEN,
  renderedPost,
  tidyTitle,
  trainerBlocks,
  trainerCount,
  type Fit,
  type ForumTag,
  type PartyBrief,
  type PostBlock,
  type PostLayout,
  type RenderedPost,
} from './party-post.js';
import {
  bossFacts,
  maxBossFacts,
  unlistedMegaFacts,
  WHERE_HEADING,
  type ShownBoss,
} from './raid-post.js';
import { LIMITS, memberByName, memberName, plain, plainNoLinks, truncate } from './text.js';
import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
import { stopLabel, stopLink, stopWhere, type StopLookup } from './train-stops.js';
import { TRAIN_KIND_WORDS } from './train-words.js';

/** A train and the stops of its route, for everything that shows where it is. */
export interface TrainPlaces {
  party: TrainParty;
  /** A stop of its route as it is now (`stopsFrom`): a gym or a power spot, or one that is gone. */
  stop: StopLookup;
}

/** What the post of a train is rendered from. */
export interface TrainPostView extends TimedPostView<TrainParty>, TrainPlaces {
  /** The Pokémon the train is after, resolved (`shownBoss`); undefined while nobody said. */
  boss: ShownBoss | undefined;
  catalogue: PokemonCatalogue;
}

/**
 * The kind word a train's title starts with, whatever its kind (plan 8R-9F, M1: a list that
 * shows the title says "Train" no second time; a train of max battles still says its kind).
 */
export const TRAIN_TITLE_KIND = 'Train';

/** `Train · Saturday legendaries`: the title of the post, which is also how lists name it. */
export function trainTitle(party: TrainParty): string {
  return tidyTitle(truncate(tidyTitle(`${TRAIN_TITLE_KIND} · ${nameOf(party)}`), LIMITS.title));
}

/**
 * What it is (a Dynamax or Gigantamax train is a max battle too, plan 8X-4: its tag changes with
 * its kind), and that it has ended once it is over.
 */
export function trainTags(party: TrainParty, now: number): ForumTag[] {
  return [
    'Train',
    ...(party.train.kind === 'raid' ? [] : ['Max battle' as const]),
    ...(shownAsOver(party, now) ? ['Ended' as const] : []),
  ];
}

/** `Max Battle Train: Wild Area`: what the train is, by its kind, and its name, made plain. */
function headline(party: TrainParty, shown: (text: string) => string = plain): string {
  return `${TRAIN_KIND_WORDS[party.train.kind]}: ${shown(nameOf(party))}`;
}

/**
 * The route, one line per stop, numbered from 1: a stop the train has left is struck through,
 * the one it is at stands out and says so. A power spot says so after its name (`stopLabel`).
 * An elite raid gym is not marked: members are not told any more (Matt, 2026-10-17). With
 * `links`, every stop is a link to its place (for a message, as `/route show`; `bare` as for
 * `stopLink`).
 */
export function routeLines(
  view: TrainPlaces,
  options: { links?: boolean; bare?: boolean } = {},
): string[] {
  const { route, stop } = view.party.train;
  return route.map((ref, index) => {
    const shown = view.stop(ref);
    const name = options.links ? stopLink(shown, options.bare) : plain(stopLabel(shown));
    // The dot is escaped: a numbered list would count anew after a line that is cut out.
    const text = `${index + 1}\\. ${name}`;
    if (index < stop) return `~~${text}~~`;
    return index === stop ? `**${text}** (the train is here)` : text;
  });
}

/** Where the train is, in a word, for a direct message: `At The Stacks`, `No route yet`. */
function placeLine(view: TrainPostView): string {
  const { party } = view;
  if (party.train.route.length === 0) return 'No route yet';
  if (routeFinished(party)) return 'Route finished';
  const at = currentStop(party);
  return at === undefined ? 'No route yet' : `At ${stopLink(view.stop(at), true)}`;
}

/** What a stop past the end of the route says: round to the first stop, or back along it. */
const TURN_WORDS = { round: ' (round again)', back: ' (turning back)' } as const;

/** The room what lies ahead of a train may take, in small print under where it is. */
const AHEAD_ROOM = 600;

/**
 * What the line of a whole route says of a train that does not finish at its last stop, while it
 * has not finished: a finished route goes nowhere any more.
 */
const MODE_WORDS = { finish: '', loop: ', loops', 'turn-back': ', turns back at the end' } as const;

/** What follows the next stops (`RouteAhead.then`). */
const THEN_WORDS = {
  'back-here': ', then back here',
  'last-stop': ', the last stop',
  'turns-back': ', where it turns back',
} as const;

/** Where the stops left after the next ones lead (`RouteAhead.rest`). */
const TOWARD_WORDS = {
  end: 'to the end',
  loop: 'round the loop',
  start: 'back to the start',
  turn: 'to the end, where it turns back',
} as const;

/**
 * What lies ahead of the train in one line of small print (Matt, 2026-10-17; `routeAhead`): a
 * route of three stops or fewer whole, the current stop in bold, with what the train does at the
 * end (`Route: 1. A · **2. B** · 3. C, loops`); on a longer one the next two stops and how many
 * more (`Next: 3. C · 4. D, and 3 more to the end`), looking past the end of a loop or a train
 * that turns back; `This is the last stop.` at the last stop of one that finishes. Nothing for a
 * train without a route or a long route that is finished. The names are plain, without links
 * (Where has the Map of the current stop, Route the rest), each cut alike when the line is
 * too long (`fit.part`).
 */
function aheadLine(view: TrainPlaces, fit: Fit): PostBlock[] {
  const ahead = routeAhead(view.party);
  const name = (ref: StopRef) => plain(stopLabel(view.stop(ref)));
  let names: string[];
  let line: (shown: readonly string[]) => string;
  switch (ahead.kind) {
    case 'no-route':
    case 'finished':
      return [];
    case 'last-stop':
      return [{ type: 'text', content: '-# This is the last stop.' }];
    case 'whole': {
      names = ahead.route.map(name);
      const { current } = ahead;
      line = (shown) =>
        `Route: ${shown
          .map((text, index) =>
            index === current ? `**${index + 1}. ${text}**` : `${index + 1}. ${text}`,
          )
          .join(' · ')}${current === undefined ? '' : MODE_WORDS[ahead.atEnd]}`;
      break;
    }
    case 'next': {
      names = ahead.stops.map((stop) => name(stop.stop));
      const then = ahead.then === undefined ? '' : THEN_WORDS[ahead.then];
      const { rest } = ahead;
      const more =
        rest === undefined ? '' : `, and ${rest.count} more ${TOWARD_WORDS[rest.toward]}`;
      line = (shown) =>
        `Next: ${ahead.stops
          .map((stop, index) => {
            const turn = stop.turn === undefined ? '' : TURN_WORDS[stop.turn];
            return `${stop.number}. ${shown[index] ?? ''}${turn}`;
          })
          .join(' · ')}${then}${more}`;
      break;
    }
  }
  const longest = Math.max(...names.map((text) => text.length));
  const shown = fit.part((room) => {
    const limit = Math.min(room, AHEAD_ROOM);
    // Every name cut to the same room, as long as they can be.
    for (let each = longest; each > 1; each--) {
      const text = line(names.map((text) => cutText(text, each)));
      if (text.length <= limit) return text;
    }
    return line(names.map((text) => cutText(text, 1)));
  });
  return [{ type: 'text', content: `-# ${shown}` }];
}

/**
 * What lies ahead of the train as the post's small print says it (`aheadLine`, its names not cut
 * for the post's room), without the small print's mark: the live map's Route (plan 8M-8C, R3),
 * which words no turning or looping of its own. Undefined where the post says nothing.
 */
export function aheadText(view: TrainPlaces): string | undefined {
  const whole: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
  const [block] = aheadLine(view, whole);
  return block?.type === 'text' ? block.content.replace(/^-# /u, '') : undefined;
}

/**
 * Where the train is (Matt, 2026-10-17): `**Where · stop 2 of 7**` and its current stop as a
 * raid's gym (`stopWhere`: a gym or a power spot, its address and Map, a gym's notice, its picture);
 * `Route complete` once the route is finished, how to add a stop while it has none; then what
 * lies ahead (`aheadLine`). Its buttons, "Move…", "Manage…", "Split…" and "Route", are in the
 * third row of the controls (plans 8X-1B, 8X-G; `trainLayout`).
 */
function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
  const { party } = view;
  const { route, stop } = party.train;
  const at = currentStop(party);
  const where: PostBlock =
    route.length === 0
      ? { type: 'text', content: `${WHERE_HEADING}\nNo route yet: \`/route add\` adds a stop.` }
      : at === undefined
        ? { type: 'text', content: `${WHERE_HEADING}\nRoute complete` }
        : stopWhere(`**Where · stop ${stop + 1} of ${route.length}**`, view.stop(at), fit);
  return [where, ...aheadLine(view, fit)].map((block) => inRole('where', block));
}

/** The room the small print of a train's splits may take. */
const SPLITS_ROOM = 1_000;

/**
 * Where the other trains of a split are, in small print under the heading (plan 8T; mockup 3,
 * draft 2): `Split off from <post>` on a train that was split off another, and on a train that
 * groups were split off, `Group B (Fast) went its own way: <post>` for each, newest first. The
 * posts are channel mentions, which Discord shows by the post's current title, in the post and in
 * its copies alike, also once that train has ended (the archived post is still there). When the
 * post is too long, the labels are cut, then the oldest lines give way to `…and N more`
 * (`fit.part`).
 */
function splitLines(party: TrainParty, fit: Fit): string[] {
  const { splitFrom, splitOff } = party.train;
  const from = splitFrom === null ? [] : [`-# Split off from <#${splitFrom.postId}>`];
  if (splitOff.length === 0) return from;
  const line = (split: SplitOff, labelRoom: number): string => {
    const label = split.label === undefined ? '' : ` (${cutText(plain(split.label), labelRoom)})`;
    return `-# Group ${split.group}${label} went its own way: <#${split.postId}>`;
  };
  const shownAs = (shown: number, labelRoom: number): string => {
    const left = splitOff.length - shown;
    const lines = splitOff.slice(0, shown).map((split) => line(split, labelRoom));
    return [...lines, ...(left > 0 ? [`-# …and ${left} more`] : [])].join('\n');
  };
  const text = fit.part((room) => {
    const limit = Math.min(room, SPLITS_ROOM);
    for (let shown = splitOff.length; shown >= 1; shown--) {
      for (const labelRoom of [Infinity, 40, 10]) {
        const lines = shownAs(shown, labelRoom);
        if (lines.length <= limit) return lines;
      }
    }
    return shownAs(1, 1);
  });
  return [...from, text];
}

function colour(view: TrainPostView): number {
  return view.closed !== undefined || shownAsOver(view.party, view.now)
    ? ENDED_COLOUR
    : TIMED_COLOUR;
}

/** `After Yveltal ✨`: what the train is after, when somebody said. */
function afterLine(view: TrainPostView): string[] {
  const { boss, emoji } = view;
  return boss ? [`**After ${plain(boss.name)}**${boss.shiny ? ` ${emoji.shiny}` : ''}`] : [];
}

/**
 * The post of a train laid out: its name, what it is after, its times, its conductor and what
 * the game says of its boss, with the boss's picture beside them; where it is, what lies ahead
 * and its two buttons (`trainWhere`); who comes, with the buttons; the rows of the rest of the
 * controls; who made it, unless they asked not to be named.
 */
function trainLayout(view: TrainPostView): PostLayout {
  const { party, boss } = view;
  const { conductorId } = party.train;
  const header = (fit: Fit): string =>
    [
      `### ${headline(party)}`,
      ...afterLine(view),
      view.closed ?? describeTimes(view),
      ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}`]),
      // Not in the last showing of a train that was closed: that post is archived.
      ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
      // A raid train is after the boss as raids have it (the CP of a shadow raid is not asked
      // for); a Dynamax or Gigantamax train as max battles have it (review BR-3).
      ...(boss?.entry
        ? party.train.kind === 'raid'
          ? bossFacts(view.catalogue, boss.entry, false, view.emoji)
          : maxBossFacts(view.catalogue, boss.entry, view.emoji)
        : boss && party.train.kind === 'raid'
          ? unlistedMegaFacts(view.catalogue, boss.name, false, view.emoji)
          : []),
      // Last in the heading, after the boss (mockup 3).
      ...splitLines(party, fit),
    ].join('\n');
  return fittedLayout((fit) => ({
    accent: colour(view),
    ...(boss?.image === undefined ? {} : { picture: boss.image }),
    blocks: [
      { type: 'section', content: header(fit), accessory: 'picture', role: 'head' },
      { type: 'separator' },
      ...trainWhere(view, fit),
      { type: 'separator' },
      ...trainerBlocks(view, { complete: false, lobby: true, meetHint: false }, fit),
      { type: 'separator' },
      {
        type: 'controls',
        rows: bottomControls(party, {
          emoji: view.emoji,
          // After Group…, in the third row (plans 8X-1B, 8X-G): Move… (while there is a route to
          // move along), Manage… and Split… for the train's own post (`moves`), Route for its
          // copies too.
          opens: [
            ...(party.train.route.length > 0 ? [moveTrainButton(party)] : []),
            manageTrainButton(party),
            // Plan 8T: only while there is a group to split off from another with somebody in it.
            ...(splitsPossible(party) ? [splitGroupButton(party)] : []),
            ...(party.train.route.length > WHOLE_ROUTE_STOPS ? [wholeRouteButton(party)] : []),
          ],
        }),
      },
      // Unless they chose not to be named (`/settings privacy`), as for a raid they report.
      ...(party.anonymous
        ? []
        : [
            {
              type: 'text' as const,
              role: 'note' as const,
              content: `-# Created by ${memberByName(memberOf(party, party.createdById))}`,
            },
          ]),
    ],
  }));
}

/**
 * The train in brief, for a direct message: its name (the sentence of a new train does not say
 * it; a member's words, sent to members who did not ask for them, so no address in it is a link),
 * what it is after, where it is, its times as the post says them and how many come, with the
 * colour of its post and the boss's picture.
 */
function trainBrief(view: TrainPostView): PartyBrief {
  const { party, boss } = view;
  return {
    accent: colour(view),
    ...(boss?.image === undefined ? {} : { picture: boss.image }),
    lines: [
      `**${headline(party, plainNoLinks)}**`,
      ...afterLine(view),
      placeLine(view),
      view.closed ?? describeTimes(view),
      trainerCount(party),
    ],
    whereLine: placeLine(view),
  };
}

/**
 * The forum post of a raid train: title, tags, the components-v2 message (`trainLayout`) and the
 * brief of a direct message. Pure: the same view gives the same post. It has what the post of a
 * meetup has and what a train has: its conductor, the Pokémon it is after, where it is (its
 * current stop as a raid's gym, with its Map) and what lies ahead, and its groups, as in a raid.
 */
export function renderTrainPost(view: TrainPostView): RenderedPost {
  const { party, now } = view;
  const tags = trainTags(party, now);
  return renderedPost({
    title: trainTitle(party),
    tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
    layout: trainLayout(view),
    brief: trainBrief(view),
  });
}
