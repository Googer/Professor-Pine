import type { LimitedResponse } from '../../src/services/limited-json.js';

/**
 * An answer of a server as `readLimitedJson` reads it, made in the test: the body in pieces of
 * `pieceBytes`, a `content-length` header only when given, other headers by their lower-case
 * names in `headers`. `cancelled` says whether the reader let go of the rest.
 */
export function jsonResponse(
  body: unknown,
  options: {
    status?: number;
    contentLength?: number;
    pieceBytes?: number;
    raw?: string;
    headers?: Record<string, string>;
  } = {},
): LimitedResponse & { cancelled: () => boolean; readBytes: () => number } {
  return bytesResponse(new TextEncoder().encode(options.raw ?? JSON.stringify(body)), options);
}

/**
 * A text answer that a fake may give again and again: its body is read from the start each time.
 * Headers by their lower-case names; a `content-length` there is refused by what reads with a limit.
 */
export function textAnswer(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): LimitedResponse & { ok: boolean } {
  return {
    ok: status >= 200 && status <= 299,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    get body() {
      return jsonResponse(null, { raw: body }).body;
    },
  };
}

/** `jsonResponse` of bytes as they are: a picture (plan 8R-6). */
export function bytesResponse(
  bytes: Uint8Array,
  options: {
    status?: number;
    contentLength?: number;
    pieceBytes?: number;
    headers?: Record<string, string>;
  } = {},
): LimitedResponse & { cancelled: () => boolean; readBytes: () => number } {
  const pieceBytes = options.pieceBytes ?? 64 * 1024;
  let at = 0;
  let cancelled = false;
  return {
    status: options.status ?? 200,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'content-length' && options.contentLength !== undefined
          ? String(options.contentLength)
          : (options.headers?.[name.toLowerCase()] ?? null),
    },
    body: {
      getReader: () => ({
        read: () => {
          if (cancelled || at >= bytes.length) return Promise.resolve({ done: true });
          const value = bytes.slice(at, at + pieceBytes);
          at += value.byteLength;
          return Promise.resolve({ done: false, value });
        },
        cancel: () => {
          cancelled = true;
          return Promise.resolve();
        },
      }),
    },
    cancelled: () => cancelled,
    readBytes: () => at,
  };
}
