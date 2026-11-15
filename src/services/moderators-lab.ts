import {
  isMissingPermission,
  type PartyGateway,
  type V2Message,
} from '../discord/party-gateway.js';
import type { ServerSettingsLookup } from './server-settings.js';

/**
 * What came of a post in a server's moderators' bot lab: `sent`; `no-lab` where the server's
 * staff chose none; `not-allowed` where the bot may not send there (View Channel and Send
 * Messages: `mayShare`, or Discord's refusal of a permission); `not-sent` where nothing was sent
 * (the channel gone or taking no messages, or rehearsal mode keeping it from the channel).
 */
export type LabPost = 'sent' | 'no-lab' | 'not-allowed' | 'not-sent';

/** Posts a message into a server's own moderators' bot lab (`channels['mod-bot-lab']`). */
export interface ModeratorsLabPoster {
  post(serverId: string, message: V2Message): Promise<LabPost>;
}

/**
 * A server's moderators' bot lab, by the id its staff chose (plan 19B-4: the gym requests of a
 * server the instance's repository does not serve). Nobody is pinged: a message pings only whom
 * its `mention` names, and nothing here names anybody. A failure other than a refused permission
 * rejects, for the caller to say.
 */
export class ModeratorsLab implements ModeratorsLabPoster {
  constructor(
    private readonly options: {
      gateway: Pick<PartyGateway, 'sendMessage' | 'mayShare'>;
      servers: Pick<ServerSettingsLookup, 'of'>;
    },
  ) {}

  async post(serverId: string, message: V2Message): Promise<LabPost> {
    const { gateway, servers } = this.options;
    const lab = servers.of(serverId).channels['mod-bot-lab'];
    if (lab === undefined) return 'no-lab';
    if (!gateway.mayShare(lab)) return 'not-allowed';
    let sent: string | undefined;
    try {
      sent = await gateway.sendMessage(lab, message);
    } catch (err) {
      if (isMissingPermission(err)) return 'not-allowed';
      throw err;
    }
    return sent === undefined ? 'not-sent' : 'sent';
  }
}
