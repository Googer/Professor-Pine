/** One request the owner's alerts made of Discord's REST API. */
export interface RestRequest {
  route: string;
  body: unknown;
}

/** Discord's limit on a message's text. */
const CONTENT_LIMIT = 2_000;

/**
 * Discord's REST API as the owner's alerts use it (`src/ops/owner-alerts.ts`): opening a DM
 * channel and posting into it. Records every request and refuses what Discord refuses (a
 * message without text or over 2,000 characters, a route it does not know). `failWith` makes
 * every request from then on fail with that error, or never answer (`'hang'`).
 */
export class FakeAlertRest {
  readonly requests: RestRequest[] = [];
  failWith: Error | 'hang' | undefined;

  post(route: `/${string}`, options: { body: unknown }): Promise<unknown> {
    this.requests.push({ route, body: options.body });
    if (this.failWith === 'hang') return new Promise(() => undefined);
    if (this.failWith) return Promise.reject(this.failWith);
    const body = options.body as Record<string, unknown>;
    if (route === '/users/@me/channels') {
      return Promise.resolve({ id: `dm-of-${String(body.recipient_id)}` });
    }
    const message = /^\/channels\/([^/]+)\/messages$/.exec(route);
    if (message) {
      const content = body.content;
      if (typeof content !== 'string' || content.length === 0 || content.length > CONTENT_LIMIT) {
        return Promise.reject(new Error('Invalid Form Body: content'));
      }
      return Promise.resolve({ id: `message-${this.requests.length}`, channel_id: message[1] });
    }
    return Promise.reject(new Error(`404: Not Found (${route})`));
  }

  /** The texts of the messages posted, in order. */
  messages(): string[] {
    return this.requests
      .filter((request) => request.route.endsWith('/messages'))
      .map((request) => String((request.body as { content: unknown }).content));
  }
}
