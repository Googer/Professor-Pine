import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { editRegions } from './edit.js';
import { exportRegions } from './export.js';
import { importRegions } from './import.js';
import { listRegions } from './list.js';
import { removeRegion } from './remove.js';
import { staffParts } from '../staff-parts.js';

/**
 * The subcommands of `/region`, each in a file of its own in this folder; `edit` only with the
 * web pages (`settings.web`).
 */
const parts: readonly SubcommandPart[] = staffParts(
  [importRegions, editRegions, listRegions, exportRegions, removeRegion],
  // The ways to a server's first region its setup's checklist sends to (plan 19C-2): also for
  // the server's owner and who may manage it. Every other part is staff's.
  [importRegions, editRegions],
);

/**
 * `/region`: the regions of a server, for staff. Discord offers it only to members who may
 * manage the server (or to whom a server admin grants it), and the bot's own check applies on
 * top, each part's (plan 19C-2): admins, moderators and bot developers; for `import` and `edit`
 * also the server's owner and who may manage it (`requireServerAdmin`). It is tied to no channel,
 * and every answer is for the staff member alone. Staff touch only the regions whose row belongs
 * to their server and the channels of their server (`RegionAdminService`). What members ask about
 * a region is `/bounds`.
 */
export const region = commandGroup({
  data: new SlashCommandBuilder()
    .setName('region')
    .setDescription('Look after the regions of this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  parts,
});
