import { discardBody, type LimitedResponse } from './limited-json.js';

/** How many times one download may be led on to another address on its host. */
const MAX_HOPS = 3;
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * A download of a feed that goes where its own site moved it, and nowhere else: `fetch` follows
 * nothing by itself (`redirect: 'manual'`), and an address that leads on is taken only on the same
 * scheme and host, at most `MAX_HOPS` times. Sites move their pages (Leek Duck's `<slug>.html` to
 * `<slug>`, seen 2026-11-01), but a feed's host that was taken over must not lead Pine to a
 * service inside the stack or on the home network. Rejects with why, in words that follow the
 * address; an answer that leads nowhere is given as it is, whatever its status.
 */
export async function fetchOnItsHost<I extends { redirect: 'manual' }, R extends LimitedResponse>(
  fetch: (url: string, init: I) => Promise<R>,
  url: string,
  init: I,
): Promise<R> {
  const { protocol, host } = new URL(url);
  let at = url;
  for (let hops = 0; ; hops += 1) {
    const response = await fetch(at, init);
    if (!REDIRECTS.has(response.status)) return response;
    discardBody(response);
    if (hops === MAX_HOPS) throw new Error('it leads on through too many addresses');
    const location = response.headers.get('location');
    const next = location === null ? null : URL.parse(location, at);
    if (next?.protocol !== protocol || next.host !== host) {
      throw new Error('it leads to another host');
    }
    at = next.href;
  }
}
