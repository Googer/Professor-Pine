/**
 * A request of the pages that the server answered with a failure (plan 8M-10, C2): its status, and
 * the server's own words where it said them (`{ error }`, `sendFailure` and the routes' refusals),
 * so that the page can say them. Its message is the status, as `getJson` threw before.
 */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    /** The server's words, or undefined where the answer said none. */
    readonly words: string | undefined,
  ) {
    super(`${status}`);
    this.name = 'RequestError';
  }
}

/** The failure of an answer of this status and body (read as text). */
export function requestError(status: number, body: string): RequestError {
  let words: string | undefined;
  try {
    const read = JSON.parse(body) as unknown;
    if (typeof read === 'object' && read !== null && 'error' in read) {
      const { error } = read;
      if (typeof error === 'string' && error.trim() !== '') words = error;
    }
  } catch {
    // No JSON: no words.
  }
  return new RequestError(status, words);
}

/** How long a request of the region editor waits for its answer (review 2, R2). */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * A request's options with the editor's time limit: an answer that stalls fails as one that never
 * came (no words of the server's), so that "Back to the map" is not kept off until a reload.
 */
export function timed(init: RequestInit): RequestInit {
  return { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

/** What the page says of a request that failed: the server's words, or its own. */
export function failureWords(err: unknown, fallback: string): string {
  return err instanceof RequestError && err.words !== undefined ? err.words : fallback;
}
