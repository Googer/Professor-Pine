import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { requireBotManagement } from '../../discord/guards.js';
import { cleanupLegacy } from './cleanup-legacy.js';
import { memberSettings } from './member-settings.js';
import { NICKNAME_DESCRIPTION, NICKNAME_GROUP, nicknameParts } from './nicknames.js';
import { saveParty } from './save-party.js';
import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
import { serverSettings } from './server-settings.js';
import { setupForums } from './setup-forums.js';
import { tutorial } from './tutorial.js';

/**
 * The subcommands of `/admin`: what is a server's own. Each lives in a file of its own in this
 * folder; a later plan adds one by appending it here (and its group, if it has one, to `groups`
 * below). What every server shares is `/operator`'s (plan 19B-1, `src/commands/operator/`).
 */
const parts: readonly SubcommandPart[] = [
  serverSettings,
  setupForums,
  saveParty,
  ...selfRoleParts,
  ...nicknameParts,
  memberSettings,
  cleanupLegacy,
  tutorial,
];

/** `/admin`: for staff. Discord offers it only to members who may manage the server. */
export const admin = commandGroup({
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Set up and look after Professor Pine')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  guards: [requireBotManagement],
  groups: {
    [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION,
    [NICKNAME_GROUP]: NICKNAME_DESCRIPTION,
  },
  parts,
});
