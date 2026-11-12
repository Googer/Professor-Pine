import type { GuildMember } from 'discord.js';
import type { MemberInfo } from '../domain/party/attendance.js';
import { teamOfRoles } from '../domain/party/party.js';
import type { LocatedInteraction } from './command.js';

/**
 * What an interaction says about the member who made it: their name in the server and their team
 * (a role named instinct, mystic or valor). The bot keeps no member list (that needs a privileged
 * intent), so this is the one moment it learns either; nothing for an interaction outside a
 * server the bot is in.
 */
export function memberInfo(interaction: LocatedInteraction): MemberInfo {
  if (!interaction.inCachedGuild()) return {};
  return guildMemberInfo(interaction.member);
}

/**
 * Who made an interaction, as a log names them (the staff's log of a server's settings, plan
 * 19A-1): their id, and their name in the server where the interaction says it.
 */
export function actorOf(interaction: LocatedInteraction): { id: string; name?: string } {
  const { name } = memberInfo(interaction);
  return name === undefined ? { id: interaction.user.id } : { id: interaction.user.id, name };
}

/**
 * A member's name in the server and their team, as `memberInfo` reads them from an
 * interaction: also for a member fetched from Discord (a press on the live map, plan 8M-3).
 */
export function guildMemberInfo(member: Pick<GuildMember, 'displayName' | 'roles'>): MemberInfo {
  const team = teamOfRoles(member.roles.cache.map((role) => role.name));
  return { name: member.displayName, ...(team ? { team } : {}) };
}
