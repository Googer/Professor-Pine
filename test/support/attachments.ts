import type {
  AttachmentGateway,
  Download,
  DownloadLimits,
} from '../../src/services/attachment-gateway.js';

/** The address of an attachment of a fake interaction, as Discord would give it. */
export function attachmentUrl(name: string): string {
  return `https://cdn.discordapp.com/attachments/1/2/${encodeURIComponent(name)}`;
}

/**
 * The attachments of a test, kept in memory: nothing leaves the process. `files` holds what
 * each address gives (text is given as its UTF-8 bytes); an address it does not know fails,
 * as does every address while `failing` is set. Like the real one it never throws, never
 * answers in the same turn of the event loop, and refuses what is longer than the limit.
 * `asked` records every download with its limits.
 */
export class FakeAttachments implements AttachmentGateway {
  readonly files = new Map<string, Uint8Array | string>();
  failing = false;
  readonly asked: { url: string; limits: DownloadLimits }[] = [];

  /** Puts a file under the address of an attachment with this name, and gives the address. */
  add(name: string, content: Uint8Array | string): string {
    const url = attachmentUrl(name);
    this.files.set(url, content);
    return url;
  }

  download(url: string, limits: DownloadLimits): Promise<Download> {
    this.asked.push({ url, limits });
    return new Promise((resolve) => {
      setImmediate(() => {
        const found = this.files.get(url);
        if (this.failing || found === undefined) {
          resolve({ ok: false, reason: 'failed' });
          return;
        }
        const bytes = typeof found === 'string' ? new TextEncoder().encode(found) : found;
        resolve(
          bytes.byteLength > limits.maxBytes
            ? { ok: false, reason: 'too-large' }
            : { ok: true, bytes },
        );
      });
    });
  }
}
