import type { PartyGateway } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import { LIMITS } from '../render/text.js';
import { Coalescer } from './coalescer.js';

export interface PartyLinesOptions {
  gateway: PartyGateway;
  /**
   * Runs the sending of a post's lines only while the post belongs to an active party, and has
   * the closing of that party wait for it (`PartyService.whileOpenPost`): a message after the
   * archiving would open the post again. Lines for a post of no active party are dropped.
   */
  whileOpen: (postId: string, work: () => Promise<void>) => Promise<unknown>;
  log: Logger;
  /** How long the lines of one post are gathered into one message. Default two seconds. */
  delayMs?: number;
}

interface Line {
  text: string;
  /** A later line with the same key takes this one's place while it has not been sent. */
  key?: string;
}

/**
 * What the bot says in a party's post about what happened there ("<@id> is coming."), in lines
 * that ping nobody. The first line after a quiet time goes out at once; lines that follow within
 * the delay are gathered into one message. A line can have a key: of several unsent lines with
 * one key only the newest is said, in the place of the first, so a member who presses +1 five
 * times is one line with the final count.
 */
export class PartyLines {
  private readonly waiting = new Map<string, Line[]>();
  private readonly speaker: Coalescer<string>;

  constructor(private readonly options: PartyLinesOptions) {
    this.speaker = new Coalescer({
      delayMs: options.delayMs ?? 2_000,
      work: (postId) => this.speak(postId),
      onError: (err, post) => options.log.warn({ err, post }, 'could not post a party line'),
    });
  }

  /** Adds a line to what is said next in this post. Returns at once. */
  say(postId: string, text: string, key?: string): void {
    const lines = this.waiting.getOrInsertComputed(postId, () => []);
    const earlier = key === undefined ? undefined : lines.find((line) => line.key === key);
    if (earlier) earlier.text = text;
    else lines.push({ text, ...(key === undefined ? {} : { key }) });
    this.speaker.request(postId);
  }

  /** Sends the lines gathered for a post as one message, or as few as they fit into. */
  private async speak(postId: string): Promise<void> {
    const lines = this.waiting.get(postId) ?? [];
    this.waiting.delete(postId);
    // A message into the post of a party that has ended would open an archived post again.
    await this.options.whileOpen(postId, async () => {
      let content = '';
      for (const { text } of lines) {
        if (content !== '' && content.length + 1 + text.length > LIMITS.content) {
          await this.options.gateway.sendMessage(postId, { content });
          content = '';
        }
        content = content === '' ? text : `${content}\n${text}`;
      }
      if (content !== '') await this.options.gateway.sendMessage(postId, { content });
    });
  }

  /** Sends what is waiting. For shutdown and for tests. */
  async flush(): Promise<void> {
    await this.speaker.flush();
  }

  /** Posts with a message waiting or on its way. */
  get pending(): number {
    return this.speaker.pending;
  }
}
