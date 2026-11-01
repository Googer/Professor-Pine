import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  addedModeration,
  channelModeration,
  MODERATION_PERMISSIONS,
  moderationPermissions,
} from './role-permissions.js';

describe('moderationPermissions', () => {
  it('finds nothing in what an ordinary member may do', () => {
    const ordinary =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.SendMessagesInThreads |
      PermissionFlagsBits.CreatePublicThreads |
      PermissionFlagsBits.EmbedLinks |
      PermissionFlagsBits.AttachFiles |
      PermissionFlagsBits.AddReactions |
      PermissionFlagsBits.UseExternalEmojis |
      PermissionFlagsBits.ReadMessageHistory |
      PermissionFlagsBits.UseApplicationCommands |
      PermissionFlagsBits.Connect |
      PermissionFlagsBits.Speak |
      PermissionFlagsBits.ChangeNickname |
      PermissionFlagsBits.CreateInstantInvite;
    expect(moderationPermissions(ordinary)).toEqual([]);
    expect(moderationPermissions(0n)).toEqual([]);
  });

  it('names each permission of moderation a role grants', () => {
    expect(
      moderationPermissions(
        PermissionFlagsBits.SendMessages |
          PermissionFlagsBits.ModerateMembers |
          PermissionFlagsBits.KickMembers,
      ),
    ).toEqual(['Kick Members', 'Timeout Members']);
    expect(moderationPermissions(PermissionFlagsBits.Administrator)).toEqual(['Administrator']);
  });

  it.each([
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageThreads',
    'ManageMessages',
    'ManageNicknames',
    'ManageWebhooks',
    'ManageGuildExpressions',
    'ManageEvents',
    'KickMembers',
    'BanMembers',
    'ModerateMembers',
    'MentionEveryone',
    'ViewAuditLog',
    'MuteMembers',
    'DeafenMembers',
    'MoveMembers',
    'PrioritySpeaker',
    'ViewGuildInsights',
    'ViewCreatorMonetizationAnalytics',
    'PinMessages',
    'BypassSlowmode',
  ] as const)('counts %s as moderation', (flag) => {
    expect(moderationPermissions(PermissionFlagsBits[flag])).toHaveLength(1);
  });

  it('has every permission with a single bit, each once', () => {
    const flags = MODERATION_PERMISSIONS.map(([flag]) => flag);
    expect(new Set(flags).size).toBe(flags.length);
    for (const flag of flags) expect(flag & (flag - 1n)).toBe(0n);
    // Everything a server could grant at once contains them all.
    expect(moderationPermissions(PermissionsBitField.All)).toHaveLength(flags.length);
  });

  /**
   * What a self-assigned role may grant. Whoever adds a name here has decided that anybody may
   * give themself a role with that permission.
   */
  const HARMLESS = [
    'CreateInstantInvite',
    'AddReactions',
    'Stream',
    'ViewChannel',
    'SendMessages',
    'SendTTSMessages',
    'EmbedLinks',
    'AttachFiles',
    'ReadMessageHistory',
    'UseExternalEmojis',
    'Connect',
    'Speak',
    'UseVAD',
    'ChangeNickname',
    'UseApplicationCommands',
    'RequestToSpeak',
    'CreatePublicThreads',
    'CreatePrivateThreads',
    'UseExternalStickers',
    'SendMessagesInThreads',
    'UseEmbeddedActivities',
    'UseSoundboard',
    'CreateGuildExpressions',
    'CreateEvents',
    'UseExternalSounds',
    'SendVoiceMessages',
    'SetVoiceChannelStatus',
    'SendPolls',
    'UseExternalApps',
  ] as const satisfies readonly (keyof typeof PermissionFlagsBits)[];

  it('sorts every permission discord.js knows into moderation or harmless, and none into both', () => {
    const harmless = new Set<bigint>(HARMLESS.map((name) => PermissionFlagsBits[name]));
    const moderation = new Set(MODERATION_PERMISSIONS.map(([flag]) => flag));
    const unsorted = Object.entries(PermissionFlagsBits)
      .filter(([, flag]) => !harmless.has(flag) && !moderation.has(flag))
      .map(([name]) => name);
    // A name here is a permission a newer discord.js brought: decide which list it belongs in.
    expect(unsorted).toEqual([]);
    expect([...harmless].filter((flag) => moderation.has(flag))).toEqual([]);
    for (const name of HARMLESS)
      expect(moderationPermissions(PermissionFlagsBits[name])).toEqual([]);
  });
});

describe('addedModeration', () => {
  const { MentionEveryone, KickMembers, SendMessages, Administrator } = PermissionFlagsBits;

  it('is what a role grants of moderation beyond what every member has', () => {
    const everyone = SendMessages | MentionEveryone;
    // A role as Discord makes it: with the permissions of @everyone.
    expect(addedModeration(everyone, everyone)).toEqual([]);
    expect(addedModeration(everyone | KickMembers, everyone)).toEqual(['Kick Members']);
    expect(addedModeration(MentionEveryone, SendMessages)).toEqual([
      'Mention @everyone, @here and All Roles',
    ]);
    expect(addedModeration(0n, everyone)).toEqual([]);
    expect(addedModeration(Administrator, 0n)).toEqual(['Administrator']);
  });
});

describe('channelModeration', () => {
  const { ManageMessages, ManageRoles, KickMembers, MentionEveryone, SendMessages, ViewChannel } =
    PermissionFlagsBits;

  it('is what the channels allow a role of moderation beyond the role itself and @everyone', () => {
    expect(channelModeration(0n, ManageMessages | SendMessages | ViewChannel, 0n)).toEqual([
      'Manage Messages',
    ]);
    // What the role grants anyway is the role's own, and what everybody may is nobody's.
    expect(channelModeration(KickMembers, KickMembers | ManageMessages, 0n)).toEqual([
      'Manage Messages',
    ]);
    expect(channelModeration(0n, MentionEveryone, MentionEveryone)).toEqual([]);
    expect(channelModeration(0n, 0n, 0n)).toEqual([]);
  });

  it('calls the bit of Manage Roles what a channel calls it', () => {
    expect(channelModeration(0n, ManageRoles, 0n)).toEqual(['Manage Permissions']);
  });
});
