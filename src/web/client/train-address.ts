import { TRAIN_QUERY } from '../../domain/web/train-history-data.js';

/*
 * The map's address of an ended train (plan 8H-7B, review G4): `?train=<record id>`, which the
 * post's "Route on the map" opens, History then showing that train. Pure; no Leaflet, so that the
 * pages' frame (`page-frame.ts`) may take it.
 */

/** A record's id as the address gives it: digits, no leading zero, at most 15 (the server's rule). */
const HISTORY_ID = /^[1-9]\d{0,14}$/u;

/** A server's map, the one page the train is passed to. */
const MAP_PATH = /^\/s\/\d{15,20}\/map$/u;

/** The train the address names, or undefined. */
export function trainOfAddress(search: string): number | undefined {
  const asked = new URLSearchParams(search).get(TRAIN_QUERY) ?? '';
  return HISTORY_ID.test(asked) ? Number(asked) : undefined;
}

/** The address without its train, once the map took it, for `history.replaceState`. */
export function addressWithoutTrain(pathname: string, search: string, hash: string): string {
  const query = new URLSearchParams(search);
  query.delete(TRAIN_QUERY);
  const rest = query.toString();
  return `${pathname}${rest === '' ? '' : `?${rest}`}${hash}`;
}

/**
 * The page a login returns to (`next`): the path, and on the map the train it names (review G4:
 * the server's `localPath` takes `?train=<digits>` on the map's path and no other query).
 */
export function loginNext(pathname: string, search: string): string {
  const train = MAP_PATH.test(pathname) ? trainOfAddress(search) : undefined;
  return train === undefined ? pathname : `${pathname}?${TRAIN_QUERY}=${String(train)}`;
}
