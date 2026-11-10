import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { requireBotManagement } from '../../discord/guards.js';
import { BOSS_DESCRIPTION, BOSS_GROUP } from './boss-input.js';
import { listBosses, syncBosses } from './boss-list.js';
import { overrideParts } from './boss-overrides.js';
import { cleanupLegacy } from './cleanup-legacy.js';
import { clearImageCache } from './clear-image-cache.js';
import { EVENT_WINDOW_DESCRIPTION, EVENT_WINDOW_GROUP, eventWindowParts } from './event-window.js';
import { memberSettings } from './member-settings.js';
import { NICKNAME_DESCRIPTION, NICKNAME_GROUP, nicknameParts } from './nicknames.js';
import { saveParty } from './save-party.js';
import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
import { setupForums } from './setup-forums.js';
import { tutorial } from './tutorial.js';

/**
 * The subcommands of `/admin`. Each lives in a file of its own in this folder; a later plan
 * adds one by appending it here (and its group, if it has one, to `groups` below).
 */
const parts: readonly SubcommandPart[] = [
  setupForums,
  saveParty,
  clearImageCache,
  ...selfRoleParts,
  listBosses,
  ...overrideParts,
  syncBosses,
  ...nicknameParts,
  memberSettings,
  cleanupLegacy,
  tutorial,
  ...eventWindowParts,
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
    [BOSS_GROUP]: BOSS_DESCRIPTION,
    [NICKNAME_GROUP]: NICKNAME_DESCRIPTION,
    [EVENT_WINDOW_GROUP]: EVENT_WINDOW_DESCRIPTION,
  },
  parts,
});
