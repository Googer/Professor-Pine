import { PermissionFlagsBits } from 'discord.js';

/**
 * The permissions of moderation and administration, with the names Discord's settings show.
 * A role that grants any of them is never handed out by `/iam`, and is refused when staff try
 * to make it self-assignable: whoever may give themself such a role has made themself staff.
 * This is the whole list; a permission that is not here counts as harmless (seeing and writing
 * in channels, reactions, voice, threads of one's own, and the like). The test beside this file
 * sorts every permission of the installed discord.js into one of the two, and fails when
 * discord.js brings one that is in neither.
 *
 * Pin Messages and Bypass Slowmode were parts of Manage Messages and Manage Channels until
 * Discord made them permissions of their own, so they are here with those. The two insights
 * show what members do not see of a server; Priority Speaker talks over the others in a voice
 * channel.
 */
export const MODERATION_PERMISSIONS: ReadonlyArray<readonly [flag: bigint, name: string]> = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageThreads, 'Manage Threads'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.PinMessages, 'Pin Messages'],
  [PermissionFlagsBits.BypassSlowmode, 'Bypass Slowmode'],
  [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
  [PermissionFlagsBits.ManageGuildExpressions, 'Manage Expressions'],
  [PermissionFlagsBits.ManageEvents, 'Manage Events'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.ModerateMembers, 'Timeout Members'],
  [PermissionFlagsBits.MentionEveryone, 'Mention @everyone, @here and All Roles'],
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log'],
  [PermissionFlagsBits.MuteMembers, 'Mute Members'],
  [PermissionFlagsBits.DeafenMembers, 'Deafen Members'],
  [PermissionFlagsBits.MoveMembers, 'Move Members'],
  [PermissionFlagsBits.PrioritySpeaker, 'Priority Speaker'],
  [PermissionFlagsBits.ViewGuildInsights, 'View Server Insights'],
  [PermissionFlagsBits.ViewCreatorMonetizationAnalytics, 'View Creator Monetization Analytics'],
];

/** The moderation permissions a role's permissions contain, by name; empty for a harmless role. */
export function moderationPermissions(permissions: bigint): string[] {
  return MODERATION_PERMISSIONS.filter(([flag]) => (permissions & flag) !== 0n).map(
    ([, name]) => name,
  );
}

/**
 * The moderation permissions a role adds to what every member has anyway, by name. Discord
 * makes a new role with the permissions of `@everyone`, which by default include Mention
 * Everyone: such a role gives nobody anything, and what `@everyone` grants is the server's own
 * decision. Both bit fields are read at the moment of asking.
 */
export function addedModeration(role: bigint, everyone: bigint): string[] {
  return moderationPermissions(role & ~everyone);
}

/**
 * The moderation permissions that the settings of channels allow a role (`allowed`: the allow
 * bits of every overwrite for the role, of all channels together) beyond what the role grants
 * anyway and what every member has in the server, by name. An overwrite that allows a role to
 * manage messages, the channel, its webhooks or its threads, or to mention everyone, in one
 * channel makes its holder a moderator there just as the permission of the server would. The
 * bit of Manage Roles is "Manage Permissions" in a channel.
 */
export function channelModeration(role: bigint, allowed: bigint, everyone: bigint): string[] {
  const manageRoles = MODERATION_PERMISSIONS.find(
    ([flag]) => flag === PermissionFlagsBits.ManageRoles,
  )?.[1];
  return addedModeration(allowed & ~role, everyone).map((name) =>
    name === manageRoles ? 'Manage Permissions' : name,
  );
}
