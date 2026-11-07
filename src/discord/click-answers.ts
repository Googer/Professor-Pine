import { MessageFlags, type MessageComponentInteraction } from 'discord.js';
import type { Logger } from '../log.js';
import { lateSettled } from './late-reply.js';

export interface ClickAnswersOptions {
  log: Logger;
  /**
   * How long after a click a further click counts as part of the same burst. Default two
   * seconds; zero answers every click by itself.
   */
  windowMs?: number;
}

interface Burst {
  /** The click that was answered with a message; its answer is what a later one replaces. */
  first: MessageComponentInteraction;
  /** The answer to the latest click after the first, not shown yet. */
  pending?: { content: string; latest: MessageComponentInteraction };
  timer: NodeJS.Timeout;
}

/**
 * Private answers to clicks on controls, gathered like the lines in a post: the first click of a
 * member is answered at once; clicks that follow within the window are only acknowledged, and
 * when the member has stopped for the length of the window the first answer is replaced by the
 * answer to the last click, which says how things stand after all of them. A member who presses
 * +1 five times reads one answer, not five.
 *
 * A burst is known by a key (the party and the member). An error is never gathered: the caller
 * shows it at once.
 */
export class ClickAnswers {
  private readonly bursts = new Map<string, Burst>();
  private readonly closing = new Set<Promise<void>>();
  private readonly windowMs: number;

  constructor(private readonly options: ClickAnswersOptions) {
    this.windowMs = options.windowMs ?? 2_000;
  }

  /** Answers a click privately, at once or as part of the burst it belongs to. */
  async answer(
    key: string,
    interaction: MessageComponentInteraction,
    content: string,
  ): Promise<void> {
    // A click acknowledged late (its write was slow, `ComponentHandler.defer`) shows "thinking…"
    // for the member alone: its answer takes that place.
    await lateSettled(interaction);
    const burst = this.windowMs > 0 ? this.bursts.get(key) : undefined;
    if (burst && interaction.deferred) {
      // Its "thinking…" must not stay: answered by itself, the burst goes on as it was.
      await interaction.editReply({ content });
      return;
    }
    if (burst) {
      clearTimeout(burst.timer);
      burst.pending = { content, latest: interaction };
      burst.timer = this.timer(key);
      await interaction.deferUpdate();
      return;
    }
    if (this.windowMs > 0) {
      this.bursts.set(key, { first: interaction, timer: this.timer(key) });
    }
    try {
      if (interaction.deferred) await interaction.editReply({ content });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (err) {
      // Nothing to replace later: the next click starts anew. A click that joined the burst
      // meanwhile was only acknowledged, so its answer is said under it now.
      const failed = this.bursts.get(key);
      if (failed?.first === interaction) {
        clearTimeout(failed.timer);
        this.bursts.delete(key);
        if (failed.pending) this.track(this.show(undefined, failed.pending));
      }
      throw err;
    }
  }

  private timer(key: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.close(key);
    }, this.windowMs);
    timer.unref();
    return timer;
  }

  /** Ends a burst: what was gathered is shown. */
  private close(key: string): void {
    const burst = this.bursts.get(key);
    if (!burst) return;
    clearTimeout(burst.timer);
    this.bursts.delete(key);
    const { pending } = burst;
    if (pending) this.track(this.show(burst.first, pending));
  }

  private track(work: Promise<void>): void {
    const shown = work.finally(() => this.closing.delete(shown));
    this.closing.add(shown);
  }

  /**
   * Replaces the first answer; when there is none, or it cannot be replaced (it was dismissed),
   * says it under the last click.
   */
  private async show(
    first: MessageComponentInteraction | undefined,
    pending: { content: string; latest: MessageComponentInteraction },
  ): Promise<void> {
    try {
      if (!first) throw new Error('there is no first answer');
      await first.editReply({ content: pending.content });
    } catch {
      try {
        await pending.latest.followUp({ content: pending.content, flags: MessageFlags.Ephemeral });
      } catch (err) {
        this.options.log.warn({ err }, 'could not show the answer to a burst of clicks');
      }
    }
  }

  /** Shows what is gathered now and waits for it. For shutdown and for tests. */
  async flush(): Promise<void> {
    for (const key of [...this.bursts.keys()]) this.close(key);
    await Promise.all(this.closing);
  }
}
