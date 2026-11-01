import { isWayfarerId } from '@pine/wayspot-core/export-file';

/**
 * The stops of a train's route (plan 8X-4; design `2026-10-20-max-battles-design.md`, 6.2): a
 * stop is a gym or a power spot, kept by reference only (`StopRef`): a gym by its row id, a
 * power spot by its Wayfarer id. What a stop is called and where it lies is looked up when it is
 * shown, never kept with the route.
 */

/** A stop of a route: a gym by its id, or a power spot by its Wayfarer id. */
export type StopRef = { kind: 'gym'; id: number } | { kind: 'powerspot'; id: string };

/** A gym as a stop. */
export function gymStop(id: number): StopRef {
  return { kind: 'gym', id };
}

/** A power spot as a stop, by its Wayfarer id. */
export function spotStop(id: string): StopRef {
  return { kind: 'powerspot', id };
}

/** The gym a stop is, by its id; undefined for a power spot. */
export function gymIdOf(ref: StopRef | undefined): number | undefined {
  return ref?.kind === 'gym' ? ref.id : undefined;
}

/**
 * What a stop is called as one text (design 6.2): a gym by its id (`'12'`, as a train's place
 * was before 8X-4), a power spot by `w` and its Wayfarer id (`'w<id>'`: no colon, which a custom
 * id's part may not hold, and not `p`, a DM Stop reason's prefix). Two stops are the same when
 * their keys are; the live map's `MapTrain.route` is made of them.
 */
export function stopKey(ref: StopRef): string {
  return ref.kind === 'gym' ? String(ref.id) : `w${ref.id}`;
}

/** The stop a key names (`stopKey`); undefined for a text that is none. */
export function readStopKey(text: string): StopRef | undefined {
  if (/^[1-9]\d{0,9}$/u.test(text)) return gymStop(Number(text));
  if (text.startsWith('w') && isWayfarerId(text.slice(1))) return spotStop(text.slice(1));
  return undefined;
}

/** Whether two stops are the same stop. */
export function sameStop(a: StopRef | null | undefined, b: StopRef | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/** Whether a route has this stop. */
export function hasStop(route: readonly StopRef[], ref: StopRef): boolean {
  return route.some((stop) => sameStop(stop, ref));
}

/** The index of a stop on a route; -1 when it is not on it. */
export function stopIndexOf(route: readonly StopRef[], ref: StopRef): number {
  return route.findIndex((stop) => sameStop(stop, ref));
}

/** How many characters of a power spot's hash its handle keeps. */
export const SPOT_HANDLE_LENGTH = 8;

/** FNV-1a (32 bits) of a text, as eight hexadecimal digits. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (const unit of text) {
    hash ^= unit.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * A stop as a control carries it (design 6.2, review 2): a Wayfarer id is 35 to 36 characters,
 * so a panel's `party:<uuid>:next:<place>:<target>` with two of them would pass Discord's 100.
 * A gym is its id; a power spot the first `SPOT_HANDLE_LENGTH` characters of a hash of its
 * Wayfarer id. A handle is checked against the route when pressed (`stopsByHandle`): one that
 * matches no stop, or two, is `route-changed`.
 */
export function stopHandle(ref: StopRef): string {
  return ref.kind === 'gym' ? String(ref.id) : fnv1a(ref.id).slice(0, SPOT_HANDLE_LENGTH);
}

/** The indices of the stops of a route that a handle matches (`stopHandle`). */
export function stopsByHandle(route: readonly StopRef[], handle: string): number[] {
  const found: number[] = [];
  route.forEach((stop, index) => {
    if (stopHandle(stop) === handle) found.push(index);
  });
  return found;
}
