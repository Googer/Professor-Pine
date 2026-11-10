import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';

/** The hosts Discord serves the attachments of interactions from. */
const ATTACHMENT_HOSTS: ReadonlySet<string> = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net',
]);

/**
 * What came of downloading an attachment. `refused-address`: not an `https` address of one of
 * Discord's attachment hosts; nothing was asked. `too-large`: longer than the limit; what came
 * until then is thrown away. `failed`: anything else (a status that is not 200, a redirect, a
 * broken connection, the time limit); it was logged.
 */
export type Download =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'refused-address' | 'too-large' | 'failed' };

export interface DownloadLimits {
  /** The download is given up when it has more bytes than this. */
  maxBytes: number;
  /** How long the whole download may take. */
  timeoutMs: number;
}

/**
 * Downloads a file a member attached to a command (`/region import`; Phase 7 will read
 * screenshots through it). It never throws: a failure is an answer. Tests use
 * `FakeAttachments` (`test/support/attachments.ts`); nothing in a test touches the network.
 */
export interface AttachmentGateway {
  download(url: string, limits: DownloadLimits): Promise<Download>;
}

/** What is used of an answer: its status, what it says of its length, and its body in pieces. */
export interface AttachmentResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
      cancel(): Promise<void>;
    };
  } | null;
}

export type AttachmentFetch = (
  url: string,
  init: { method: 'GET'; redirect: 'manual'; signal: AbortSignal },
) => Promise<AttachmentResponse>;

/** The address as one an attachment may be downloaded from; undefined for any other. */
function requestable(address: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  const plain = url.protocol === 'https:' && url.port === '' && url.username === '';
  return plain && url.password === '' && ATTACHMENT_HOSTS.has(url.hostname) ? url : undefined;
}

/**
 * The gateway over `fetch`: `https` only, only Discord's attachment hosts, no redirect followed
 * (an attachment is served where its address says), the body read piece by piece and given up
 * the moment it passes the limit, whatever the answer said of its length. The address of an
 * attachment carries a signature and is never logged; a failure is logged by its host and why.
 */
export class FetchAttachments implements AttachmentGateway {
  constructor(private readonly options: { fetch: AttachmentFetch; log: Logger }) {}

  async download(address: string, limits: DownloadLimits): Promise<Download> {
    const { fetch, log } = this.options;
    const url = requestable(address);
    if (!url) return { ok: false, reason: 'refused-address' };
    const failed = (why: string): Download => {
      log.warn({ host: url.hostname, reason: why }, 'could not download an attachment');
      return { ok: false, reason: 'failed' };
    };
    try {
      const response = await fetch(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(limits.timeoutMs),
      });
      const reader = response.body?.getReader();
      const giveUp = (): void => {
        void reader?.cancel().catch(() => undefined);
      };
      if (response.status !== 200) {
        giveUp();
        return failed(`status ${response.status}`);
      }
      const declared = Number(response.headers.get('content-length') ?? '');
      if (Number.isFinite(declared) && declared > limits.maxBytes) {
        giveUp();
        return { ok: false, reason: 'too-large' };
      }
      if (!reader) return failed('an answer without a body');
      const pieces: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        length += value.byteLength;
        if (length > limits.maxBytes) {
          giveUp();
          return { ok: false, reason: 'too-large' };
        }
        pieces.push(value);
      }
      const bytes = new Uint8Array(length);
      let at = 0;
      for (const piece of pieces) {
        bytes.set(piece, at);
        at += piece.byteLength;
      }
      return { ok: true, bytes };
    } catch (err) {
      return failed(failureReason(err));
    }
  }
}
