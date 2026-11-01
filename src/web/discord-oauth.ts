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

/**
 * The real exchange (OAuth2 authorization code flow) with `fetch`: the code for a token
 * (form-encoded, the application's id and secret in the body), the token for `/users/@me`.
 * Each answer is read up to `MAX_ANSWER_BYTES` (`readLimitedJson`); a larger one fails. Every
 * failure is an answer saying why in a few words, never with the code, the token or the
 * secret; the token is used once and not kept.
 */
export class DiscordOAuth implements OAuthGateway {
  constructor(private readonly options: { appId: string; secret: string; fetch: Fetch }) {}

  async exchange(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string } | { failed: string }> {
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
