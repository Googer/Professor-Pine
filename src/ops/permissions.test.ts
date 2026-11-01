import { OverwriteType, PermissionFlagsBits as P } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  basePermissions,
  channelPermissions,
  missingNeeds,
  REGION_CHANNEL_NEEDS,
  SERVER_NEEDS,
} from './permissions.js';

const GUILD = '100000000000000001';
const BOT = '200000000000000001';
const BOT_ROLE = '300000000000000001';
const MOD_ROLE = '300000000000000002';

const bits = (...flags: bigint[]): string => String(flags.reduce((all, flag) => all | flag, 0n));

const roles = [
  { id: GUILD, name: '@everyone', permissions: bits(P.ViewChannel, P.SendMessages), position: 0 },
  { id: BOT_ROLE, name: 'Pine', permissions: bits(P.ManageChannels, P.ManageRoles), position: 5 },
  { id: MOD_ROLE, name: 'Mods', permissions: bits(P.Administrator), position: 9 },
];
const guild = { id: GUILD, ownerId: '200000000000000099' };
const bot = { id: BOT, roleIds: [BOT_ROLE] };

describe('basePermissions', () => {
  it("joins the everyone role's permissions with the member's roles", () => {
    const base = basePermissions(guild, roles, bot);
    expect(base).toBe(P.ViewChannel | P.SendMessages | P.ManageChannels | P.ManageRoles);
  });

  it('gives everything to an administrator and to the owner', () => {
    const all = basePermissions(guild, roles, { id: BOT, roleIds: [MOD_ROLE] });
    expect(all & P.ManageThreads).toBe(P.ManageThreads);
    const owner = basePermissions(guild, roles, { id: guild.ownerId, roleIds: [] });
    expect(owner & P.BanMembers).toBe(P.BanMembers);
  });
});

describe('channelPermissions', () => {
  const base = basePermissions(guild, roles, bot);

  it('applies the overwrites of everyone, then the roles, then the member', () => {
    const overwrites = [
      {
        id: GUILD,
        type: OverwriteType.Role,
        allow: '0',
        deny: bits(P.ViewChannel, P.SendMessages),
      },
      { id: BOT_ROLE, type: OverwriteType.Role, allow: bits(P.ViewChannel), deny: '0' },
      { id: BOT, type: OverwriteType.Member, allow: bits(P.EmbedLinks), deny: bits(P.ManageRoles) },
    ];
    const channel = channelPermissions(base, GUILD, bot, overwrites);
    expect(channel & P.ViewChannel).toBe(P.ViewChannel);
    expect(channel & P.SendMessages).toBe(0n);
    expect(channel & P.EmbedLinks).toBe(P.EmbedLinks);
    expect(channel & P.ManageRoles).toBe(0n);
  });

  it("lets a role's allowance beat another role's denial", () => {
    const overwrites = [
      { id: BOT_ROLE, type: OverwriteType.Role, allow: bits(P.SendMessages), deny: '0' },
      { id: MOD_ROLE, type: OverwriteType.Role, allow: '0', deny: bits(P.SendMessages) },
    ];
    const both = { id: BOT, roleIds: [BOT_ROLE, MOD_ROLE] };
    // The administrator role makes everything allowed whatever the overwrites say.
    expect(channelPermissions(basePermissions(guild, roles, both), GUILD, both, overwrites)).toBe(
      basePermissions(guild, roles, both),
    );
    const plain = roles.map((role) =>
      role.id === MOD_ROLE ? { ...role, permissions: '0' } : role,
    );
    const base2 = basePermissions(guild, plain, both);
    expect(channelPermissions(base2, GUILD, both, overwrites) & P.SendMessages).toBe(
      P.SendMessages,
    );
  });
});

describe('missingNeeds', () => {
  it('names what the bot lacks, required and optional apart', () => {
    const missing = missingNeeds(P.ViewChannel | P.SendMessages, REGION_CHANNEL_NEEDS);
    expect(missing.required.map((need) => need.name)).toEqual([
      'Embed Links',
      'Attach Files',
      'Read Message History',
    ]);
    // Nothing is pinned in a region's channel since plan 8R-9: Pin Messages is not asked.
    expect(missing.optional.map((need) => need.name)).toEqual(['Add Reactions', 'Manage Messages']);
  });

  it('finds nothing missing for an administrator', () => {
    const all = basePermissions(guild, roles, { id: BOT, roleIds: [MOD_ROLE] });
    expect(missingNeeds(all, SERVER_NEEDS)).toEqual({ required: [], optional: [] });
  });
});
