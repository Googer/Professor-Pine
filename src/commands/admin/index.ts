import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { cleanupLegacy } from './cleanup-legacy.js';
import { memberSettings } from './member-settings.js';
import { NEIGHBORS_DESCRIPTION, NEIGHBORS_GROUP, neighborParts } from './neighbors.js';
import { NICKNAME_DESCRIPTION, NICKNAME_GROUP, nicknameParts } from './nicknames.js';
import { saveParty } from './save-party.js';
import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
import { serverSettings } from './server-settings.js';
import { staffParts } from '../staff-parts.js';
import { serverSetup } from './setup.js';
import { setupForums } from './setup-forums.js';
import { tutorial } from './tutorial.js';

/**
 * The subcommands of `/admin`: what is a server's own. Each lives in a file of its own in this
 * folder; a later plan adds one by appending it here (and its group, if it has one, to `groups`
 * below). What every server shares is `/operator`'s (plan 19B-1, `src/commands/operator/`).
 */
const parts: readonly SubcommandPart[] = staffParts(
  [
    serverSetup,
    serverSettings,
    setupForums,
    saveParty,
    ...selfRoleParts,
    ...nicknameParts,
    ...neighborParts,
    memberSettings,
    cleanupLegacy,
    tutorial,
  ],
  // The parts that set a server up (plan 19C-2), which its checklist sends to: also for the
  // server's owner and who may manage it, without a staff role. Every other part is staff's.
  [serverSetup, serverSettings, setupForums],
);

/**
 * `/admin`: for staff. Discord offers it only to members who may manage the server. Each part
 * has its guard (`staffParts`): staff's, or for the setup parts also whoever may set the server
 * up.
 */
export const admin = commandGroup({
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Set up and look after Professor Pine')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  groups: {
    [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION,
    [NICKNAME_GROUP]: NICKNAME_DESCRIPTION,
    [NEIGHBORS_GROUP]: NEIGHBORS_DESCRIPTION,
  },
  parts,
});
