import { PermissionFlagsBits, type Client } from 'discord.js';
import type { Logger } from '../log.js';
import {
  regionStaffAnswer,
  type RegionStaffSource,
  type StaffAnswer,
} from '../web/region-staff.js';
import { fetchGuildMember } from './member-directory.js';

/**
 * Who may edit a server's regions on the web pages, asked of Discord (plan 8M-2): the member is
 * fetched fresh every time (`fetchGuildMember(…, true)`: roles given or taken a minute ago
 * count), and `regionStaffAnswer` decides. A failure of Discord is `unreachable`: the pages are
 * then read-only.
 */
export class DiscordRegionStaff implements RegionStaffSource {
  constructor(
    private readonly options: {
      client: Client;
      guilds: { idFor(snowflake: string): Promise<number | undefined> };
      ownerId: string;
      log: Logger;
    },
  ) {}

  async check(guildId: string, userId: string): Promise<StaffAnswer> {
    const { client, guilds, ownerId, log } = this.options;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { kind: 'not-member' };
    let member;
    try {
      member = await fetchGuildMember(guild, userId, true);
    } catch (err) {
      log.warn({ err, guild: guildId, user: userId }, 'could not fetch a member for the web pages');
      return { kind: 'unreachable' };
    }
    if (!member) return { kind: 'not-member' };
    const facts = {
      roleNames: member.roles.cache.map((role) => role.name),
      manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
      manageChannels: member.permissions.has(PermissionFlagsBits.ManageChannels),
    };
    return regionStaffAnswer(facts, userId, ownerId, guildId, await guilds.idFor(guildId));
  }
}
