import { DiscordAPIError, Routes } from 'discord.js';
import type { Logger } from '../log.js';
import type { ServerInvites } from '../services/server-neighbors.js';

/** Discord's error for an invite it does not know (or one that expired). */
const UNKNOWN_INVITE = 10006;

/** What the invites ask of the bot's REST client. */
export interface InviteRest {
  get(route: `/${string}`): Promise<unknown>;
}

/**
 * The server an invite link leads to (plan 19E, `/admin neighbors`): Discord's invite endpoint
 * (`GET /invites/{code}`) through the client the login keeps (`rest`, none before it). An invite
 * Discord does not know answers nothing, unlogged; any other failure answers nothing too and is
 * logged at warn: `/admin neighbors` answers either as any request.
 */
export function discordInvites(rest: () => InviteRest | undefined, log: Logger): ServerInvites {
  return {
    async serverOfInvite(code) {
      const api = rest();
      if (api === undefined) return undefined;
      try {
        const invite = (await api.get(Routes.invite(code))) as { guild?: { id?: unknown } };
        const id = invite.guild?.id;
        return typeof id === 'string' ? id : undefined;
      } catch (err) {
        if (!(err instanceof DiscordAPIError && err.code === UNKNOWN_INVITE)) {
          log.warn({ err }, 'could not read the server of an invite');
        }
        return undefined;
      }
    },
  };
}
