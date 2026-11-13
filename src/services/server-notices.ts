import { BoundedMap } from '../bounded-map.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { Logger } from '../log.js';
import type { ServerSettingsLookup } from './server-settings.js';

/** How many notices (server and key) are remembered as said; the oldest go first. */
const REMEMBERED = 10_000;

export interface ServerNoticesOptions {
  /** Each server's values: its moderators' bot lab (`channels['mod-bot-lab']`, by id). */
  servers: Pick<ServerSettingsLookup, 'of'>;
  /**
   * Sends a plain message into a channel; rejects where nothing was sent (Discord refused it, or
   * the channel is gone: `noticeSender`).
   */
  send: (channelId: string, text: string) => Promise<void>;
  log: Logger;
}

/**
 * What is wrong with one server's setup, told to that server's own staff (plan 19B-1; spec "Alerts
 * and logs"): a channel gone, a permission missing. Never the owner's: the owner's alerts are
 * about the instance (`OwnerAlerts`, the stale boss feed). A notice goes into the server's
 * moderators' bot lab, at most once per server and key while the bot runs (a `BoundedMap`: a
 * restart says it again, as the logs did), plain text that names no member and pings nobody. It
 * counts as said only once it was sent: where the server has no lab, or the lab refuses it, it is
 * logged with the server's id (once per server, key and reason) and told at the next occasion,
 * so a lab set or fixed later hears of it.
 */
export class ServerNotices {
  private readonly said = new BoundedMap<string, true>(REMEMBERED);
  /** What was logged as not said, by server, key and why: logged once. */
  private readonly logged = new BoundedMap<string, true>(REMEMBERED);
  /** The notices on their way, by server and key. */
  private readonly sending = new Map<string, Promise<void>>();

  constructor(private readonly options: ServerNoticesOptions) {}

  /**
   * Tells the server's staff `text` under `key` (what it is about, such as
   * `meetup-safety:gone`), unless it was said already while the bot runs or is on its way.
   * Returns at once and never throws: the message goes on the side.
   */
  tell(serverId: string, key: string, text: string): void {
    const { servers, send } = this.options;
    const told = `${serverId}:${key}`;
    if (this.said.has(told) || this.sending.has(told)) return;
    const about = { server: serverId, notice: key, text };
    let lab: string | undefined;
    try {
      lab = servers.of(serverId).channels['mod-bot-lab'];
    } catch (err) {
      this.logOnce(told, 'settings', { err, ...about }, 'could not read a server’s settings');
      return;
    }
    if (lab === undefined) {
      this.logOnce(
        told,
        'no-lab',
        about,
        'a server has no moderators’ bot lab: a notice for its staff is only logged',
      );
      return;
    }
    // Asked at once (the function runs to its first await), awaited by nobody.
    const sent: Promise<void> = (async () => {
      try {
        await send(lab, text);
        this.said.set(told, true);
      } catch (err) {
        this.logOnce(
          told,
          'refused',
          { err, ...about },
          'could not tell a server’s staff in its moderators’ bot lab',
        );
      }
    })().finally(() => this.sending.delete(told));
    this.sending.set(told, sent);
  }

  /** Waits for the notices on their way. For tests and the shutdown, before the client goes. */
  async flush(): Promise<void> {
    while (this.sending.size > 0) await Promise.allSettled([...this.sending.values()]);
  }

  private logOnce(told: string, why: string, fields: object, msg: string): void {
    const key = `${told}:${why}`;
    if (this.logged.has(key)) return;
    this.logged.set(key, true);
    this.options.log.warn(fields, msg);
  }
}

/**
 * The notices' `send` over the party gateway (`app.ts`): plain text into the lab. A lab the bot
 * may not send to (`mayShare`: View Channel and Send Messages; plain text needs no Embed Links)
 * is not asked, a send Discord would refuse (fix round 3, J3). The gateway answers a channel that
 * is gone, or one that takes no messages, with no id rather than an error, and so does rehearsal
 * mode's; nothing was sent then. Either way it rejects, and the notice is logged and told at the
 * next occasion (fix round 2, G1).
 */
export function noticeSender(
  gateway: Pick<PartyGateway, 'sendMessage' | 'mayShare'>,
): ServerNoticesOptions['send'] {
  return async (channelId, content) => {
    if (!gateway.mayShare(channelId)) {
      throw new Error(
        'the bot may not send messages in the moderators’ bot lab (View Channel, Send Messages)',
      );
    }
    const sent = await gateway.sendMessage(channelId, { content });
    if (sent === undefined) {
      throw new Error('nothing was sent (the lab gone, takes no messages, or rehearsal mode)');
    }
  };
}
