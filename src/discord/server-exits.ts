import { PermissionFlagsBits, Routes, type Client } from 'discord.js';
import type { ServerExits } from '../services/server-admission.js';

/**
 * What Pine does on Discord to a server it refuses (plan 19C-1, `ServerAdmission`): one plain-text
 * message in the server's system channel, only where the cache knows that channel and Pine may
 * view it and send there (plain text needs no Embed Links), mentions off; then it leaves the
 * server through the REST API (`DELETE /users/@me/guilds/{id}`, what `Guild.leave()` sends), which
 * needs no server in the cache, so that a server Discord says is unavailable is left too.
 */
export class DiscordServerExits implements ServerExits {
  private current: Client | undefined;

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  async tell(serverId: string, text: string): Promise<boolean> {
    const guild = this.current?.guilds.cache.get(serverId);
    const channel = guild?.systemChannel;
    const me = guild?.members.me;
    if (!channel || !me) return false;
    const may = channel.permissionsFor(me);
    if (!may.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return false;
    await channel.send({ content: text, allowedMentions: { parse: [] } });
    return true;
  }

  async leave(serverId: string): Promise<void> {
    if (!this.current) throw new Error('no client to leave a server with');
    await this.current.rest.delete(Routes.userGuild(serverId));
  }
}
