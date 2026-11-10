import { durationWords } from '../../render/duration-words.js';
import { stageAt } from '../../domain/party/raid-stage.js';
import { endsSoon } from '../../domain/time/ending-soon.js';
import { clockTime } from '../../domain/web/clock.js';
import type { MapMax, MapMaxTier, MapRaid, MapTierGroup } from '../../domain/web/party-data.js';
import type { PageNode } from './popup.js';

/**
 * A raid on the live map (plan 8M-7, frame B of the mockups): a circle centered on the gym, the
 * boss's picture (the egg of its tier before it hatches: the post's picture) in a ring of its
 * tier's color (a named value of `theme.css` per tier group, `tierColour`), a time badge under it
 * ("12m" while it runs, "hatches 2:40" before), and a green count of those going when above
 * zero; in its last minutes it is dimmed. Built as a tree of nodes (`renderNode`), the page
 * keeping the badge and the dimming current (`data-stage`, `data-hatch`, `data-end`). A max battle
 * (plan 8M-9A) is drawn by the same marker at its Power Spot or pin, ringed in Dynamax's or
 * Gigantamax's color, read by its end alone (`markerFacts`).
 *
 * Every fact is the domain's, as the Discord side has it (one source for every fact, Matt
 * 2026-10-25): the tier's group and the going count come computed with the list
 * (`raidTierGroup`, `goingCount`, read as `attendance.going`), egg or hatched by the clock is `stageAt` (`raidStage` reads
 * raids through it), "nearly over" is `endsSoon` (`/max` asks by it). Only the words are the page's.
 */

/** The ring of a max battle (plan 8M-9A, A1): Dynamax's or Gigantamax's color. */
export type MaxRing = 'dynamax' | 'gigantamax';

/** The ring of a max battle by its tier (`MapMax.level`): `G` is Gigantamax, the rest Dynamax. */
export function maxRing(level: MapMaxTier): MaxRing {
  return level === 'G' ? 'gigantamax' : 'dynamax';
}

/**
 * The ring's color: the named value of `theme.css` of the tier's group (`raidTierGroup`), or of a
 * max battle's (`maxRing`).
 */
export function tierColour(group: MapTierGroup | MaxRing): string {
  return `--tier-${group}`;
}

/**
 * What a marker is drawn from (plan 8M-9A, A2): its picture, its ring (`tier-<ring>` of
 * `map.css`), egg or hatched as the list said it, its hatch and end, how many are going. A raid's
 * are its own; a max battle has no egg and no hatch: `hatched` without a hatch time, so that the
 * badge, the dimming and `markerNow` read it by its end alone, by the rules a raid is read by.
 */
export interface MarkerFacts {
  picture: string | null;
  ring: MapTierGroup | MaxRing;
  stage: MapRaid['stage'];
  hatchTime: number | null;
  endTime: number | null;
  going: number;
}

/** A raid's or a max battle's marker facts. */
export function markerFacts(party: MapRaid | MapMax): MarkerFacts {
  if (party.kind === 'max') {
    return {
      picture: party.picture,
      ring: maxRing(party.level),
      stage: 'hatched',
      hatchTime: null,
      endTime: party.endTime,
      going: party.attendance.going,
    };
  }
  return {
    picture: party.picture,
    ring: party.tierGroup,
    stage: party.stage,
    hatchTime: party.hatchTime,
    endTime: party.endTime,
    going: party.attendance.going,
  };
}

/**
 * The raid a gym's one marker is drawn by (fix round 1): the first with a picture, else the first;
 * every fact of the marker (picture, ring, badge, count) is this raid's.
 */
export function leadRaid<R extends Pick<MapRaid, 'picture'>>(raids: readonly R[]): R | undefined {
  return raids.find((raid) => raid.picture !== null) ?? raids[0];
}

/** A ring's size: its radius and its line, in pixels. */
export interface RingSize {
  radius: number;
  weight: number;
}

/**
 * The rings of a train and a meetup at a gym (plans 8S-4, 8M-5M), and, where a raid's circle is
 * drawn at it (`circle` pixels across, by the zoom: `markerSize`), round that circle rather than
 * over its boss (fix round 1), scaling with it: the train's just outside it, the meetup's outside
 * the train's.
 */
export function ringSizes(circle: number | undefined): { train: RingSize; meetup: RingSize } {
  if (circle === undefined) {
    return { train: { radius: 8.5, weight: 3 }, meetup: { radius: 12, weight: 4 } };
  }
  const train = circle / 2 + 4;
  return { train: { radius: train, weight: 3 }, meetup: { radius: train + 5, weight: 4 } };
}

/** A raid marker's size by the zoom (Matt, 2026-10-25): it shrinks zoomed out, never grouped. */
export type MarkerSize = 'full' | 'middle' | 'small';

/** Full from zoom 15 (circle, badge, count), middle at 14 (no badge), small below (ring only). */
export function markerSize(zoom: number): MarkerSize {
  if (zoom >= 15) return 'full';
  return zoom >= 14 ? 'middle' : 'small';
}

/** The smallest tap target, in pixels. */
export const MIN_TAP = 32;

/** The tap target round a circle: never under 32 pixels, a clear margin round a small one. */
export function tapBox(circle: number): number {
  return Math.max(circle, MIN_TAP);
}

/**
 * Whether a raid has hatched by the clock (the list may be older than its hatch): the domain's
 * `stageAt`; without a hatch time, as the server read it.
 */
function hatched(raid: Pick<MapRaid, 'stage' | 'hatchTime'>, now: number): boolean {
  return (
    stageAt(
      { hatchTime: raid.hatchTime, endTime: null, reportedHatched: raid.stage !== 'egg' },
      now,
    ) === 'hatched'
  );
}

/** Whether a raid is nearly over (`endsSoon`): dimmed. An egg never is. */
export function isDimmed(
  raid: Pick<MapRaid, 'stage' | 'hatchTime' | 'endTime'>,
  now: number,
): boolean {
  return hatched(raid, now) && raid.endTime !== null && endsSoon(raid.endTime, now);
}

/** `2:40` in the reader's zone (plan 8M-8A), the hour and minute alone (a badge has no room for more). */
function shortClock(at: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => parts.find((one) => one.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')}`;
}

/**
 * A badge's words: the time left (`12 min`, `1 h 05`: `durationWords`' compact form, plan 8M-11A),
 * `Ended`, or `hatches 2:40`.
 */
export function badgeWords(kind: 'end' | 'hatch', at: number, now: number, zone: string): string {
  if (kind === 'hatch') {
    // The posts' time (`clockTime`: the day when it is not today); AM or PM left out today only.
    const clock = clockTime(at, zone, now);
    return `hatches ${clock === clockTime(at, zone, at) ? shortClock(at, zone) : clock}`;
  }
  if (at <= now) return 'Ended';
  return durationWords(at - now, { compact: true });
}

/**
 * A time left in full, for a line of the list or a popup (plan 8M-11A, S19): `29 min left`,
 * `1 h 05 min left` (`durationWords`); undefined once it is over.
 */
export function timeLeft(end: number, now: number): string | undefined {
  return end <= now ? undefined : `${durationWords(end - now)} left`;
}

/**
 * The badge of a raid by its times as the marker keeps them (`data-hatch`, `data-end`): an egg
 * counts toward its hatch, a hatched raid (by the clock) toward its end; `Egg` or `Hatched` where
 * nobody said when.
 */
export function badgeFor(
  stage: MapRaid['stage'],
  hatchTime: number | null,
  endTime: number | null,
  now: number,
  zone: string,
): string {
  // Egg, hatched or ended: the domain's reading (`stageAt`); only the words are the page's.
  const reading = stageAt({ hatchTime, endTime, reportedHatched: stage !== 'egg' }, now);
  if (reading === 'ended') return 'Ended';
  if (reading === 'egg') {
    return hatchTime === null ? 'Egg' : badgeWords('hatch', hatchTime, now, zone);
  }
  return endTime === null ? 'Hatched' : badgeWords('end', endTime, now, zone);
}

/** The badge under a raid's or a max battle's marker. */
export function raidBadge(party: MapRaid | MapMax, now: number, zone: string): string {
  const facts = markerFacts(party);
  return badgeFor(facts.stage, facts.hatchTime, facts.endTime, now, zone);
}

/**
 * The marker of a raid or a max battle (plan 8M-9A: one marker for both, by `markerFacts`) as a
 * tree of nodes.
 */
export function raidMarkerNode(
  party: MapRaid | MapMax,
  now: number,
  zone: string,
  size: MarkerSize = 'full',
): PageNode {
  const facts = markerFacts(party);
  const { going } = facts;
  const times = {
    'data-stage': facts.stage,
    ...(facts.hatchTime === null ? {} : { 'data-hatch': String(facts.hatchTime) }),
    ...(facts.endTime === null ? {} : { 'data-end': String(facts.endTime) }),
  };
  return {
    tag: 'div',
    className: `raid-marker tier-${facts.ring}${size === 'full' ? '' : ` size-${size}`}${
      isDimmed(facts, now) ? ' dim' : ''
    }`,
    attributes: times,
    children: [
      {
        tag: 'span',
        className: 'ring',
        children:
          facts.picture === null
            ? []
            : [{ tag: 'img', attributes: { src: facts.picture, alt: '', draggable: 'false' } }],
      },
      // The badge from zoom 15, the count from 14 (`markerSize`).
      ...(size === 'full'
        ? [{ tag: 'span', className: 'badge', text: raidBadge(party, now, zone) }]
        : []),
      ...(going > 0 && size !== 'small'
        ? [{ tag: 'span', className: 'going', text: String(going) }]
        : []),
    ],
  };
}

/**
 * A marker kept current between two lists from the times it carries: its badge's words and
 * whether it is dimmed, by the same rules as when it was drawn.
 */
export function markerNow(
  times: { stage?: string; hatch?: string; end?: string },
  now: number,
  zone: string,
): { badge: string; dimmed: boolean } {
  const time = (value: string | undefined) => (value === undefined ? null : Number(value));
  const raid = {
    stage: times.stage === 'egg' ? ('egg' as const) : ('hatched' as const),
    hatchTime: time(times.hatch),
    endTime: time(times.end),
  };
  return {
    badge: badgeFor(raid.stage, raid.hatchTime, raid.endTime, now, zone),
    dimmed: isDimmed(raid, now),
  };
}
