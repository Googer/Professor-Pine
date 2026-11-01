/** What is used of an answer whose body is read with a limit: its status, length and pieces. */
export interface LimitedResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
      cancel(): Promise<void>;
    };
  } | null;
}

/**
 * The body of an answer read as JSON. `too-large`: more bytes than the limit, whatever the
 * answer said of its length (reading stops there). `unreadable`: no body, or no JSON.
 */
export type LimitedJson =
  { ok: true; value: unknown } | { ok: false; reason: 'too-large' | 'unreadable' };

/** Lets go of a body that is not read: what it says is of no use. */
export function discardBody(response: LimitedResponse): void {
  void response.body
    ?.getReader()
    .cancel()
    .catch(() => undefined);
}

/** The body of an answer as bytes, or why it was not read (see `LimitedJson`). */
export type LimitedBytes =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too-large' | 'unreadable' };

/**
 * Reads the body of an answer piece by piece and gives it up the moment it passes `maxBytes`.
 * Throws only what reading throws (a broken connection, the end of the time limit of the
 * request's signal).
 */
export async function readLimitedBytes(
  response: LimitedResponse,
  maxBytes: number,
): Promise<LimitedBytes> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    discardBody(response);
    return { ok: false, reason: 'too-large' };
  }
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: 'unreadable' };
  const pieces: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    length += value.byteLength;
    if (length > maxBytes) {
      void reader.cancel().catch(() => undefined);
      return { ok: false, reason: 'too-large' };
    }
    pieces.push(value);
  }
  return { ok: true, bytes: Buffer.concat(pieces, length) };
}

/** The body of an answer as text, or why it was not read (see `LimitedJson`). */
export type LimitedText =
  { ok: true; text: string } | { ok: false; reason: 'too-large' | 'unreadable' };

/** `readLimitedBytes`, then the bytes read as UTF-8 (a page, as Leek Duck's research page). */
export async function readLimitedText(
  response: LimitedResponse,
  maxBytes: number,
): Promise<LimitedText> {
  const read = await readLimitedBytes(response, maxBytes);
  if (!read.ok) return read;
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(read.bytes) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/** `readLimitedBytes`, then the bytes parsed as JSON. */
export async function readLimitedJson(
  response: LimitedResponse,
  maxBytes: number,
): Promise<LimitedJson> {
  const read = await readLimitedBytes(response, maxBytes);
  if (!read.ok) return read;
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(read.bytes)) as unknown };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
