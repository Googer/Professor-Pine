import { ChannelType, PermissionFlagsBits, type Guild } from 'discord.js';
import type { ServerNames } from '../services/server-fill.js';

/** What the bot needs in a channel to post there (as `findChannel` asked before plan 19A-1). */
const CAN_POST = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

/**
 * A server's channels, categories and roles by name, from the client's cache, for the fill
 * (plan 19A-1): found as the readers before 2.1 found them by the file's names. A text channel or
 * forum of a name: of several, one the bot may post in before one it may not, the oldest first
 * (`findChannel`); a category as written (`channelContext` compared its name); a role trimmed and
 * whatever its letter case (the Unown role and the map's member role were compared so).
 */
export function serverNamesOf(guild: Guild): ServerNames {
  const me = guild.members.me;
  const named = (name: string, type: ChannelType) =>
    guild.channels.cache.filter((one) => one.type === type && one.name === name);
  const typeOf = (kind: 'text' | 'forum' | 'category') =>
    kind === 'forum'
      ? ChannelType.GuildForum
      : kind === 'category'
        ? ChannelType.GuildCategory
        : ChannelType.GuildText;
  const channelOf = (name: string, type: ChannelType) =>
    named(name, type)
      .sort((a, b) => {
        const posts = (one: typeof a) =>
          me === null || (one.permissionsFor(me)?.has(CAN_POST) ?? false) ? 0 : 1;
        // The older by its id, a snowflake: its time first, made in one millisecond its count.
        return posts(a) - posts(b) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);
      })
      .first()?.id;
  const roleKey = (name: string) => name.trim().toLowerCase();
  return {
    serverId: guild.id,
    channel: (name, kind) => channelOf(name, typeOf(kind)),
    category: (name) => channelOf(name, ChannelType.GuildCategory),
    role: (name) => guild.roles.cache.find((role) => roleKey(role.name) === roleKey(name))?.id,
    howMany: (name, kind) => named(name, typeOf(kind)).size,
  };
}
