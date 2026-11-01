import type { V2Message } from '../discord/party-gateway.js';
import {
  addWayspotChanges,
  NO_KIND_CHANGES,
  type KindChanges,
  type WayspotChanges,
} from '../domain/wayspots/keep.js';
import { GYM_COLOUR } from './gym-view.js';
import { container, textDisplay } from './v2.js';

/**
 * What changed the gym list in bulk, as one post in the channel for bot updates (Matt,
 * 2026-10-15): how many gyms were added, renamed, moved and deleted, never a list of each (a
 * city's first import adds thousands), and what an import changed of the PokéStops and power
 * spots. It says what changed, never what made the change (Matt, 2026-10-16). A name that only
 * changed in spaces or capitals is no rename (`tidiesName`). A single `/gym add` or
 * `/gym delete` keeps its own post.
 */

/**
 * The counts of one summary. `promoted`: of the gyms added, those that were PokéStops (a kept
 * Wayspot of the kind `stop`, or a Wayfarer gym kept that was one before: plan 8W-2).
 * `wayspots`: the kept PokéStops and power spots an import changed (`planKept`'s `byKind`).
 */
export interface GymListChanges {
  added: number;
  promoted: number;
  renamed: number;
  moved: number;
  deleted: number;
  wayspots: WayspotChanges;
}

/**
 * What made the changes: a Wayfarer import (`import`), the answers of its review queue, gathered
 * for a while (`review`), or the deletion of the gyms outside the area an import scanned
 * (`outside`). The summary does not say it; it decides when the summary is posted.
 */
export type GymChangeSource = 'import' | 'review' | 'outside';

export const NO_CHANGES: Readonly<GymListChanges> = {
  added: 0,
  promoted: 0,
  renamed: 0,
  moved: 0,
  deleted: 0,
  wayspots: NO_KIND_CHANGES,
};

const kindTotal = (kind: KindChanges): number => kind.added + kind.changed + kind.gone;

const anyGymChanges = (changes: GymListChanges): boolean =>
  changes.added + changes.renamed + changes.moved + changes.deleted > 0;

const anyWayspotChanges = ({ wayspots }: GymListChanges): boolean =>
  kindTotal(wayspots.stops) + kindTotal(wayspots.powerSpots) > 0;

/** Whether there is anything to say. */
export function anyChanges(changes: GymListChanges): boolean {
  return anyGymChanges(changes) || anyWayspotChanges(changes);
}

/** Two sets of counts as one. */
export function addChanges(a: GymListChanges, b: GymListChanges): GymListChanges {
  return {
    added: a.added + b.added,
    promoted: a.promoted + b.promoted,
    renamed: a.renamed + b.renamed,
    moved: a.moved + b.moved,
    deleted: a.deleted + b.deleted,
    wayspots: addWayspotChanges(a.wayspots, b.wayspots),
  };
}

const counted = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "1 gym", "2,596 gyms". */
const gyms = (n: number): string => counted(n, 'gym', 'gyms');

/** "a", "a and b", "a, b, and c": the serial comma (Matt, 2026-10-16). */
function joined(parts: readonly string[]): string {
  if (parts.length <= 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

/** " (3 of them were PokéStops)" after the gyms added; nothing when none was. */
function promotedWords({ added, promoted }: GymListChanges): string {
  if (promoted === 0) return '';
  if (added === 1) return ' (it was a PokéStop)';
  const n = promoted.toLocaleString('en-US');
  return promoted === 1 ? ` (${n} of them was a PokéStop)` : ` (${n} of them were PokéStops)`;
}

/** "added 2,596 gyms, renamed 169, and moved 109": the first count names the gyms. */
function gymWords(changes: GymListChanges): string {
  const parts: string[] = [];
  let noun = true;
  const say = (n: number, verb: string, after = ''): void => {
    if (n === 0) return;
    parts.push(`${verb} ${noun ? gyms(n) : n.toLocaleString('en-US')}${after}`);
    noun = false;
  };
  say(changes.added, 'added', promotedWords(changes));
  say(changes.renamed, 'renamed');
  say(changes.moved, 'moved');
  say(changes.deleted, 'deleted');
  return joined(parts);
}

/**
 * "added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power Spots": each
 * count names its kind; counts of nothing are left out.
 */
function wayspotWords({ wayspots }: GymListChanges): string {
  const parts: string[] = [];
  const say = (verb: string, of: (kind: KindChanges) => number): void => {
    const stops = of(wayspots.stops);
    const spots = of(wayspots.powerSpots);
    const kinds = [
      ...(stops > 0 ? [counted(stops, 'PokéStop', 'PokéStops')] : []),
      ...(spots > 0 ? [counted(spots, 'Power Spot', 'Power Spots')] : []),
    ];
    if (kinds.length > 0) parts.push(`${verb} ${kinds.join(' and ')}`);
  };
  say('added', (kind) => kind.added);
  say('changed', (kind) => kind.changed);
  say('removed', (kind) => kind.gone);
  return joined(parts);
}

/**
 * The post: one container of the gym colour, its heading and a sentence of the gyms ("Professor
 * Pine has added 2,596 gyms, renamed 169, and moved 109."), then one of the PokéStops and power
 * spots ("It also added 120 PokéStops and 3 Power Spots."). It pings nobody. Undefined when no
 * gym was added, renamed, moved or deleted (8W-3, Matt 2026-10-29: the PokéStops and Power Spots
 * alone are no news for the channel; the import's own answer counts them).
 */
export function gymListSummary(changes: GymListChanges): V2Message | undefined {
  if (!anyGymChanges(changes)) return undefined;
  const sentences = [`Professor Pine has ${gymWords(changes)}.`];
  if (anyWayspotChanges(changes)) sentences.push(`It also ${wayspotWords(changes)}.`);
  return {
    v2: true,
    components: [
      container(GYM_COLOUR, [
        textDisplay('### The gym list changed'),
        textDisplay(sentences.join(' ')),
      ]),
    ],
  };
}
