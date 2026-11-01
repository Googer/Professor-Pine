/**
 * The hosts a Wayspot's picture is shown from (plan 8W-2): Google's image CDN, the only host the
 * pictures of Pittsburgh's export use (2026-10-15, 43,057 Wayspots: 28,050 pictures on
 * `https://lh3.googleusercontent.com`, 33 on the same host by plain http, none elsewhere).
 */
export const WAYSPOT_PICTURE_HOSTS: ReadonlySet<string> = new Set(['lh3.googleusercontent.com']);

/**
 * The address of a gym's or Wayspot's picture as a message may show it (a thumbnail): only an
 * address on `WAYSPOT_PICTURE_HOSTS` with no user or port, by `https:` (one by plain `http:` is
 * shown by `https:` on the same host: Google serves both), asking for a small picture
 * (`WAYSPOT_PICTURE_SIZE`); anything else is shown as no picture.
 */
export function wayspotPicture(url: string | null | undefined): string | undefined {
  if (url === null || url === undefined || url === '') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const plainHost =
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === '' &&
    WAYSPOT_PICTURE_HOSTS.has(parsed.hostname);
  if (!plainHost) return undefined;
  parsed.protocol = 'https:';
  parsed.pathname = sized(parsed.pathname);
  return parsed.href;
}

/**
 * How large a picture the thumbnail asks Google's CDN for: the longest side in pixels (a
 * Wayfarer cover photo can be thousands; a thumbnail shows a few hundred).
 */
export const WAYSPOT_PICTURE_SIZE = 400;

/**
 * The path of a picture on Google's CDN asking for `WAYSPOT_PICTURE_SIZE`: any size options
 * after the last segment (`=s1600`, `=w800-h600-k-no`) give way to `=s400`.
 */
function sized(path: string): string {
  const slash = path.lastIndexOf('/');
  const last = path.slice(slash + 1);
  const equals = last.indexOf('=');
  const name = equals === -1 ? last : last.slice(0, equals);
  return `${path.slice(0, slash + 1)}${name}=s${String(WAYSPOT_PICTURE_SIZE)}`;
}
