import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { requireBotManagement } from '../../discord/guards.js';
import { addGym } from './add.js';
import { deleteGym } from './delete.js';
import { duplicateGyms } from './duplicates.js';
import { editGym } from './edit.js';
import { eliteGym } from './elite.js';
import { googleLine } from './google.js';
import { importGyms } from './import.js';
import { moveGym } from './move.js';
import { reviewGyms } from './review.js';
import { showGym } from './show.js';
import { exportGyms, refreshGym } from './upkeep.js';

/** The subcommands of `/gym`, each in a file of its own in this folder. */
const parts: readonly SubcommandPart[] = [
  showGym,
  addGym,
  editGym,
  moveGym,
  eliteGym,
  deleteGym,
  refreshGym,
  exportGyms,
  duplicateGyms,
  importGyms,
  reviewGyms,
  googleLine,
];

/**
 * `/gym`: the gym list, for staff. Discord offers it only to members who may manage the server
 * (or to whom a server admin grants it), and the bot's own check applies on top: admins,
 * moderators and bot developers. It is tied to no channel, and every answer is for the staff
 * member alone. Staff may touch the gyms that lie in a region of their own server and those
 * in no region of any server, never the gyms of another server (`GymAdminService.mayTouch`).
 */
export const gym = commandGroup({
  data: new SlashCommandBuilder()
    .setName('gym')
    .setDescription('Look after the gym list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  guards: [requireBotManagement],
  parts,
});
