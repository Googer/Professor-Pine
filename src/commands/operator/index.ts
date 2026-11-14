import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { isSharedDataOperatorAt, requireSharedDataOperator } from '../../discord/guards.js';
import { BOSS_DESCRIPTION, BOSS_GROUP } from './boss-input.js';
import { listBosses, syncBosses } from './boss-list.js';
import { overrideParts } from './boss-overrides.js';
import { clearImageCache } from './clear-image-cache.js';
import { EVENT_WINDOW_DESCRIPTION, EVENT_WINDOW_GROUP, eventWindowParts } from './event-window.js';
import { forget } from './forget.js';
import { GOOGLE_DESCRIPTION, GOOGLE_GROUP, googleShare } from './google-share.js';
import { serverParts, SERVERS_DESCRIPTION, SERVERS_GROUP } from './servers.js';

/**
 * The subcommands of `/operator` (plan 19B-1): what every server shares, moved from `/admin`.
 * Each lives in a file of its own in this folder.
 */
const parts: readonly SubcommandPart[] = [
  clearImageCache,
  listBosses,
  ...overrideParts,
  syncBosses,
  forget,
  ...eventWindowParts,
  googleShare,
  ...serverParts,
];

/**
 * `/operator` (plan 19B-1; spec "Operators"): what every server of this Pine shares, changed only
 * by its operators: the boss list's overrides and its sync, the event window and the image cache
 * (the shared-data tier, `requireSharedDataOperator`: on an instance that is not open, the staff
 * of an allowed server too, where they ask), and, for the instance operators alone, a member's
 * data removed on request (`forget`) and the servers this Pine serves (`servers`, plan 19C-1). Offered in servers and in a DM with the bot, so that an operator need not be
 * in the server they run it from. Discord offers it in a server only to members who may manage
 * it, and ignores that in a DM: there the guard alone keeps it, also for its autocomplete (the
 * router runs a staff command's guards for it). `/help` shows it only to whoever passes the
 * shared-data tier where they ask (`seenBy`).
 */
export const operator = commandGroup({
  data: new SlashCommandBuilder()
    .setName('operator')
    .setDescription('Look after what every server of this Pine shares (its operators)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'admin',
    details:
      'What every server of this Pine shares: the boss list’s overrides, the event window and ' +
      'the map pictures it keeps.\n\n' +
      'Its operators change them, from any server or a direct message with me. Unless this ' +
      'Pine is open to every server, the admins, moderators and bot developers of the servers ' +
      'it serves may too, from their server.' +
      '\n\nMy owner is told by direct message of every change, by whom and from where.',
  },
  seenBy: isSharedDataOperatorAt,
  guards: [requireSharedDataOperator],
  groups: {
    [BOSS_GROUP]: BOSS_DESCRIPTION,
    [EVENT_WINDOW_GROUP]: EVENT_WINDOW_DESCRIPTION,
    [GOOGLE_GROUP]: GOOGLE_DESCRIPTION,
    [SERVERS_GROUP]: SERVERS_DESCRIPTION,
  },
  parts,
});
