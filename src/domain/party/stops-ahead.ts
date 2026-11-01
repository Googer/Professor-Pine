/*
 * What lies ahead of a train in the order it travels (plan 8M-15, design 3), and how many stops
 * away each stop is. Beside `train.ts`, which gives both on (`routeAhead` counts from them), in a
 * module of no import, so that the live map's page takes it too (review R1-5: one path for the
 * badges, the Route list and the post): `train.ts` and `party.ts` reach the times (Temporal) and
 * the settings, even as types, which the page has none of.
 */

/**
 * What a train does at the end of its route, as `TrainAtEnd` of `party.ts` spells it (not imported:
 * see above). A mode added there and not here fails the typecheck where `train.ts` passes it in.
 */
type AtEnd = 'finish' | 'loop' | 'turn-back';

/**
 * The stops ahead of a train at index `stop` of a route of `length` stops whose mode at the end
 * is `atEnd` (as `endMode` gives it), as indices of the route as it is stored now, in the order
 * the train reaches them, until it has reached every stop of the route once more (plan 8M-15,
 * design 3): a train that finishes to its last stop; one that loops round to the stop before the
 * current one; one that turns back out to the last stop, then back (a turn stores the route the
 * other way, but the indices stay those of now) to the first, passing the current stop on the way
 * (listed, since the train stops there) unless it is the first. A stop listed twice in the route
 * is two indices. Nothing for a finished route, a route of one stop or none. The post's "Next:"
 * (`routeAhead`) and the map's badges and Route list (`MapTrain.stopsAhead`) count from it.
 */
export function stopsAhead(length: number, stop: number, atEnd: AtEnd): number[] {
  if (length < 2 || stop < 0 || stop >= length) return [];
  const last = length - 1;
  const span = (from: number, to: number): number[] =>
    from <= to
      ? Array.from({ length: to - from + 1 }, (_none, at) => from + at)
      : Array.from({ length: from - to + 1 }, (_none, at) => from - at);
  switch (atEnd) {
    case 'finish':
      return stop === last ? [] : span(stop + 1, last);
    case 'loop':
      return [
        ...(stop === last ? [] : span(stop + 1, last)),
        ...(stop === 0 ? [] : span(0, stop - 1)),
      ];
    case 'turn-back':
      if (stop === 0) return span(1, last);
      if (stop === last) return span(last - 1, 0);
      return [...span(stop + 1, last), ...span(last - 1, 0)];
  }
}

/**
 * Each stop ahead's number, by its index in the route (plan 8M-15, design 3; Matt 2026-10-30,
 * Q2): how many stops away its next arrival is (1: the next stop), counted along `stopsAhead`
 * (`MapTrain.stopsAhead`), every stop there counted, also the current one passed again and one
 * the map cannot place; none for the current stop (`stop`, null once finished) nor for a later
 * arrival at a stop already numbered. In the order of the arrivals. The live map's badges and its
 * Route list's "next" / "in N stops".
 */
export function arrivalNumbers(ahead: readonly number[], stop: number | null): Map<number, number> {
  const numbers = new Map<number, number>();
  ahead.forEach((index, at) => {
    if (index !== stop && !numbers.has(index)) numbers.set(index, at + 1);
  });
  return numbers;
}
