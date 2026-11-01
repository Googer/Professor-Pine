/**
 * A picture's address only when the page may load it: its origin is one of `origins` (the
 * Content Security Policy's picture hosts, `pictureOrigins`); undefined for any other, and for an
 * address that is none (an `attachment://` picture of a post among them). Pure, for the map's
 * views (`partyView`, the pick lists of a max battle).
 */
export function allowedPicture(
  url: string | undefined,
  origins: readonly string[],
): string | undefined {
  if (url === undefined) return undefined;
  try {
    return origins.includes(new URL(url).origin) ? url : undefined;
  } catch {
    return undefined;
  }
}
