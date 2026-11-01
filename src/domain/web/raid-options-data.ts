/**
 * What the live map's raid forms read and send (plan 8M-4, spec 3.6), as the page reads it.
 * Types alone, with no import of the server's code: the page's bundle (`src/web/client/`) takes
 * them.
 */

import type { MapRaid } from './party-data.js';

/**
 * What a report or a change of a raid answers: whether it was done, the command's words as plain
 * text, and the raid as the member now sees it on the map (for a report also the raid that was
 * at the gym already), when there is one to show. A report at a gym that lies in several regions
 * is answered with those regions (`regions`), to pick one.
 */
export interface RaidAnswer {
  ok: boolean;
  text: string;
  raid?: MapRaid;
  regions?: Array<{ id: number; name: string }>;
}

/**
 * What the map may change of a raid (spec 3.6), each as its command does it: `/hatch`, `/end`,
 * `/boss`, `/moveset`.
 */
export const RAID_CHANGES = ['hatch', 'end', 'boss', 'moves'] as const;
export type RaidChange = (typeof RAID_CHANGES)[number];

/** A move as `/moveset` offers it: its id (what a change of the moves sends) and its name. */
export interface MoveOption {
  id: string;
  name: string;
}

/** The moves the boss of a raid can have (`GET /s/<guild>/api/raids/<id>/moves`). */
export interface RaidMovesView {
  boss: string;
  fast: MoveOption[];
  charged: MoveOption[];
}

/** A boss as `/raid` lists it: its value (`b:yveltal:T5:0`), name, and tier in the posts' words. */
export interface BossOption {
  value: string;
  name: string;
  /** `Level 5 raid`, `Shadow Level 3 raid`. */
  tier: string;
}

/** The egg of a tier as `/raid` lists it: its value (`e:T5:0`) and the tier in the posts' words. */
export interface EggOption {
  value: string;
  tier: string;
}

/**
 * The pick lists of a report (`GET /s/<guild>/api/raid-options`), in `/raid`'s order: the
 * current bosses, then an egg of every tier; and the posts' time zone, in which typed clock
 * times are read.
 */
export interface RaidOptionsView {
  zone: string;
  bosses: BossOption[];
  eggs: EggOption[];
}
