/*
 * Campfire, Scopely's app of official meetups by Community Ambassadors and Community Leaders
 * (design `2026-10-28-campfire-links-design.md`, Matt 2026-10-28): Pine points members to it with
 * links and never fetches anything from it (Scopely Explore's terms forbid bots and scraping;
 * `src/campfire-links.test.ts` refuses its API in the sources). Pure: the bot and the web page
 * import it.
 */

/**
 * Campfire's map of meetups. It cannot point at a region (the site keeps the chosen place to
 * itself and takes no center in its address), so it is the same for every instance and server:
 * the visitor picks the area there.
 */
export const CAMPFIRE_DISCOVER_URL = 'https://campfire.scopely.com/discover';
