import { isSnowflake } from '../db/snowflake.js';
import { discardBody, readLimitedJson } from '../services/limited-json.js';

/** Discord's API, as the OAuth2 exchange and `/users/@me` use it. */
const API = 'https://discord.com/api/v10';
/** How long a question to Discord may take. */
const TIMEOUT_MS = 10_000;
/** How much of an answer is read: a token's or a user's JSON is well under a kilobyte. */
const MAX_ANSWER_BYTES = 64 * 1024;

/** Who logged in: a member's id and the name the page's header shows. */
export interface OAuthUser {
  id: string;
  name: string;
}

/** Discord's side of "Log in with Discord"; `FakeOAuth` in tests. */
export interface OAuthGateway {
  /** Exchanges the code of a callback for an access token. */
  exchange(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string } | { failed: string }>;
  /** Whose an access token is: their id, and `global_name ?? username`. */
  who(accessToken: string): Promise<OAuthUser | { failed: string }>;
}

/**
 * The address Discord's consent page is at, for the scope `identify` alone (spec 2.4): Pine
 * learns the member's id and name, nothing else. `prompt` is left to Discord (it skips the
 * page for a member who agreed before).
 */
export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    scope: 'identify',
    state,
    redirect_uri: redirectUri,
  });
  return `https://discord.com/oauth2/authorize?${query.toString()}`;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** One code exchange in this long, across the process (plan 8Z). */
export const EXCHANGE_SPACING_MS = 1_000;
/** How long a login waits for its exchange at most; one whose slot is further away is `busy`. */
export const EXCHANGE_WAIT_MS = 5_000;
/** How long a 429 without a readable `Retry-After` stops the logins. */
const NO_RETRY_AFTER_MS = 60_000;
/** The answer of a login over the limit, or while a 429 stops them. */
const BUSY = { failed: 'busy' } as const;

/** A `Retry-After` of seconds (Discord's may have a fraction) as milliseconds. */
function retryAfterMs(header: string | null): number {
  const seconds = header === null || header.trim() === '' ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : NO_RETRY_AFTER_MS;
}

/**
 * The real exchange (OAuth2 authorization code flow) with `fetch`: the code for a token
 * (form-encoded, the application's id and secret in the body), the token for `/users/@me`.
 * Each answer is read up to `MAX_ANSWER_BYTES` (`readLimitedJson`); a larger one fails. Every
 * failure is an answer saying why in a few words, never with the code, the token or the
 * secret; the token is used once and not kept.
 *
 * Discord limits this application's token asks, and a flood of logins must not get it stopped
 * (plan 8Z): at most one `exchange` in `EXCHANGE_SPACING_MS` across the process. An `exchange`
 * takes the next free slot as it arrives (plan 8Z-2: now, or `EXCHANGE_SPACING_MS` after the
 * slot taken last) and waits for it, so that two logins a moment apart both go through; one
 * whose slot is more than `EXCHANGE_WAIT_MS` away takes none and fails at once
 * (`{ failed: 'busy' }`, without asking), so at most five wait at a time. A 429 on either ask
 * stops both for as long as its `Retry-After` says (`NO_RETRY_AFTER_MS` when it says nothing
 * readable), also an `exchange` that was waiting for its slot meanwhile. The clock and the wait
 * are the caller's (`now`, `wait`; a timer by default).
 */
export class DiscordOAuth implements OAuthGateway {
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;
  /** The slot the last `exchange` that was let in took: its own time, now or still to come. */
  private lastSlot: number | undefined;
  private stoppedUntil: number | undefined;

  constructor(
    private readonly options: {
      appId: string;
      secret: string;
      fetch: Fetch;
      now?: () => number;
      /** Resolves once `ms` have passed: the wait for an exchange's slot. */
      wait?: (ms: number) => Promise<void>;
    },
  ) {
    this.now = options.now ?? (() => Date.now());
    this.wait =
      options.wait ??
      ((ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
  }

  async exchange(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string } | { failed: string }> {
    const now = this.now();
    if (this.stopped(now)) return BUSY;
    const slot =
      this.lastSlot === undefined ? now : Math.max(now, this.lastSlot + EXCHANGE_SPACING_MS);
    if (slot - now > EXCHANGE_WAIT_MS) return BUSY;
    this.lastSlot = slot;
    if (slot > now) {
      await this.wait(slot - now);
      // A 429 may have come while this one waited.
      if (this.stopped(this.now())) return BUSY;
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.options.appId,
      client_secret: this.options.secret,
    });
    const answer = await this.ask(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if ('failed' in answer) return answer;
    const token = (answer.json as { access_token?: unknown }).access_token;
    return typeof token === 'string' && token !== ''
      ? { accessToken: token }
      : { failed: 'no access token' };
  }

  async who(accessToken: string): Promise<OAuthUser | { failed: string }> {
    if (this.stopped(this.now())) return BUSY;
    const answer = await this.ask(`${API}/users/@me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if ('failed' in answer) return answer;
    const user = answer.json as { id?: unknown; username?: unknown; global_name?: unknown };
    const name =
      typeof user.global_name === 'string' && user.global_name !== ''
        ? user.global_name
        : user.username;
    if (typeof user.id !== 'string' || !isSnowflake(user.id) || typeof name !== 'string') {
      return { failed: 'no user in the answer' };
    }
    return { id: user.id, name };
  }

  private stopped(now: number): boolean {
    return this.stoppedUntil !== undefined && now < this.stoppedUntil;
  }

  private async ask(
    url: string,
    init: RequestInit,
  ): Promise<{ json: object } | { failed: string }> {
    try {
      const response = await this.options.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        if (response.status === 429) {
          this.stoppedUntil = this.now() + retryAfterMs(response.headers.get('retry-after'));
        }
        discardBody(response);
        return { failed: `status ${response.status}` };
      }
      const read = await readLimitedJson(response, MAX_ANSWER_BYTES);
      if (!read.ok) return { failed: read.reason };
      const json = read.value;
      return typeof json === 'object' && json !== null ? { json } : { failed: 'no object' };
    } catch (err) {
      return { failed: err instanceof Error ? err.name : 'failed' };
    }
  }
}
