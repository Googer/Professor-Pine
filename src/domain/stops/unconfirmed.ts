/**
 * Why a report at a stop is not confirmed (plan 8M-12, Find on the map): research "one of" its
 * task's rewards (`count` of them, `encounters` when all are: a report of before plan 8R-5 has
 * items among them), research typed in full without its reward, or a grunt type of `count`
 * lineups reported "not sure which". A type alone, with no import: the domain's `reportSearch`
 * and the map's view (`stop-report-data.ts`, which the page's type check reads) share it.
 */
export type Unconfirmed =
  | { kind: 'one-of'; count: number; encounters: boolean }
  | { kind: 'no-reward' }
  | { kind: 'not-sure-which'; count: number };
