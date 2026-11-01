/*
 * The words of a route's refusal that the map's page says without asking the server (plan 8M-8C,
 * review C7: a stop tapped that is on the route already costs no request) and `/route add` says
 * when the server refuses the same (`problemText`), without an import, so that the map's page
 * takes it whole: one wording for both.
 */

/** A stop added that is on the route already (`already-on-route`). */
export const ALREADY_ON_ROUTE = 'That stop is on the route already.';
