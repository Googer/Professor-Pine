/**
 * Whether work that costs may be done (plan 8Z-2): asked right before a file is read, a picture
 * fetched or a view built, and never for an answer from memory. The web server's routes that
 * anybody may ask give one that counts such work of visitors who are not logged in against one
 * overall limit (`PUBLIC_COSTS_PER_MINUTE`, `src/web/server.ts`); without one the work is done.
 */
export type MayCost = () => boolean | Promise<boolean>;

/** The answer where `MayCost` said no: the work was not done. */
export const REFUSED = 'refused';
export type Refused = typeof REFUSED;
