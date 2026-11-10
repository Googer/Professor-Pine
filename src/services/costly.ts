/**
 * Whether work that costs may be done (plan 8Z-2): asked right before a file is read, a picture
 * fetched or a view built, and never for an answer from memory. The web server's routes that
 * anybody may ask give one that counts such work of visitors who are not logged in against an
 * overall budget of its kind, and of somebody logged in against their account (`publicCosts`,
 * `src/web/public-costs.ts`); without one the work is done.
 */
export type MayCost = () => boolean | Promise<boolean>;

/** The answer where `MayCost` said no: the work was not done. */
export const REFUSED = 'refused';
export type Refused = typeof REFUSED;
