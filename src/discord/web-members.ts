import { PermissionFlagsBits, type Client } from 'discord.js';
import type { ActingAnswer } from '../web/party-routes.js';
import { fetchGuildMember, memberStanding } from './member-directory.js';
import { guildMemberInfo } from './member-info.js';

/**
 * Who presses a button of a party on the live map (plan 8M-3), as a button of the post would
 * carry them (`actingMember`: their name in the server and their team), with their roles and
 * whether they are an administrator (for the map's member role), fetched fresh from
 * Discord every time (`fetchGuildMember(…, true)`): a member who left a minute ago, or whose
 * roles changed, is seen as they are now. `not-member` for somebody who is not in the server;
 * `timed-out` for a member Discord has timed out and `pending` for one who has not finished the
 * server's membership screening, neither of whom may act there now, unless an administrator;
 * rejects when Discord cannot be asked (nothing is written then).
 */
export class DiscordWebMembers {
  constructor(private readonly client: Client) {}

  async acting(guildId: string, userId: string): Promise<ActingAnswer> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return { kind: 'not-member' };
    const member = await fetchGuildMember(guild, userId, true);
    if (!member) return { kind: 'not-member' };
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      if (member.isCommunicationDisabled()) return { kind: 'timed-out' };
      if (member.pending === true) return { kind: 'pending' };
    }
    return {
      kind: 'member',
      member: { id: member.id, ...guildMemberInfo(member) },
      standing: memberStanding(member),
    };
  }
}
