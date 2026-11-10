/**
 * A PokéStop of Pine's own (plan 8R-1; design 3, decision 9): a sponsored stop, which Wayfarer
 * does not list, added by staff with `/pokestop`. Per server (`serverId`, a snowflake), never in
 * `Wayspot`, which belongs to the imports and is shared by all servers; an import never touches
 * it. Its key wherever a stop is named is `pine-<id>` (`pineStopKey`).
 */
export interface PineStop {
  id: number;
  serverId: string;
  /** As staff typed it, tidied (`tidyLine`), at most `MAX_PINE_STOP_NAME`. */
  name: string;
  lat: number;
  lon: number;
  /** As staff typed it, null for none. */
  address: string | null;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
}

/** What `/pokestop add` makes: the storage gives the id. */
export type NewPineStop = Omit<PineStop, 'id' | 'updatedBy' | 'updatedAt'>;

/** What `/pokestop edit` may change. */
export interface PineStopChange {
  name?: string;
  lat?: number;
  lon?: number;
  address?: string | null;
}

/** How long a stop's name may be (the column holds 255; a stop's title in the game is far shorter). */
export const MAX_PINE_STOP_NAME = 100;

/** How long its address may be. */
export const MAX_PINE_STOP_ADDRESS = 200;
