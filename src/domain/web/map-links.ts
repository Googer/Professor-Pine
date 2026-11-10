/**
 * The address a link in a post's text may have on the map (plan 8M-8A; the one rule since plan
 * 8Z-2, asked by the server as it draws a post, `linkableOnTheMap`, and by the page before it
 * makes a link, `safeHref`), as the browser resolves it; undefined for anything else, which is
 * shown as its text:
 *
 * - Google Maps (a Where's Map) and a post or message of this server on Discord, by https
 *   without a port;
 * - Pine's own pages (`origin`: the public address' origin, plain http on this machine), but
 *   only those of this server, under `/s/<guild>/`. Nothing else of Pine's own origin is a
 *   link: a login link (`/auth/link/…`) pasted into a meetup's information would log in
 *   whoever followed it, as its maker (audit L-W2).
 *
 * Never an address with a user or a password. The path is judged after the browser's own
 * resolving (`URL`: dot segments, plain or encoded, and backslashes), and the address given
 * back is that resolved one, so what is checked is what is linked.
 */
export function mapLink(url: string, guildId: string, origin: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.username !== '' || parsed.password !== '') return undefined;
  if (parsed.origin === origin) {
    return parsed.pathname.startsWith(`/s/${guildId}/`) ? parsed.href : undefined;
  }
  if (parsed.protocol !== 'https:' || parsed.port !== '') return undefined;
  if (parsed.hostname === 'www.google.com') {
    return /^\/maps(?:\/|$)/u.test(parsed.pathname) ? parsed.href : undefined;
  }
  if (parsed.hostname === 'discord.com') {
    return parsed.pathname.startsWith(`/channels/${guildId}/`) ? parsed.href : undefined;
  }
  return undefined;
}
