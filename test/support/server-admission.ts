import type { ServerExits } from '../../src/services/server-admission.js';

/**
 * What Pine says to the servers it refuses and which it leaves (plan 19C-1), recorded: `said`
 * the messages in a system channel, `left` the servers left; `noChannel` servers have no system
 * channel Pine may write in; `failLeave` makes every leave reject.
 */
export class RecordingExits implements ServerExits {
  readonly said: { serverId: string; text: string }[] = [];
  readonly left: string[] = [];
  readonly noChannel = new Set<string>();
  failLeave: Error | undefined;

  tell(serverId: string, text: string): Promise<boolean> {
    if (this.noChannel.has(serverId)) return Promise.resolve(false);
    this.said.push({ serverId, text });
    return Promise.resolve(true);
  }

  leave(serverId: string): Promise<void> {
    if (this.failLeave) return Promise.reject(this.failLeave);
    this.left.push(serverId);
    return Promise.resolve();
  }
}
