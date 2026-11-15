import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireManagement } from '../../discord/guards.js';
import { answer } from '../../discord/late-reply.js';
import { count, fitItems, memberText, plain } from '../../render/text.js';
import { legacyLine } from '../settings/panel.js';
import { settingsLines } from '../settings/settings-lines.js';
import { wantLineNames } from '../notifications/wants.js';
import { serverGyms } from '../util/server-gym.js';

/** How many wants and gym targets are named before the rest is counted. */
const NAMED = 5;
/** As many characters as the names of one list may take. */
const NAMES_LIMIT = 400;

/** `5 (A, B, C, …and 2 more)`, with the rows that cannot be read. */
function listLine(label: string, names: readonly string[], unreadable: number): string {
  const shownNames =
    names.length === 0
      ? ''
      : ` (${fitItems(
          names.length > NAMED
            ? [...names.slice(0, NAMED), `…and ${String(names.length - NAMED)} more`]
            : names,
          NAMES_LIMIT,
        )})`;
  const broken = unreadable === 0 ? '' : `, and ${count(unreadable, 'row')} I cannot read`;
  return `${label}: **${String(names.length)}**${shownNames}${broken}`;
}

/** What Pine knows of a member in a server, on lines, for staff. */
export async function memberSettingsLines(
  ctx: AppContext,
  memberId: string,
  guildId: string,
): Promise<string[]> {
  const [settings, newTrain, history, leaderboard, fillIn, hasFile, wants, targets] =
    await Promise.all([
      ctx.users.get(memberId),
      ctx.newTrains.isOn(memberId, guildId),
      ctx.historyOptIns.isOptedIn(memberId, guildId),
      ctx.historyOptIns.isOnBoards(memberId, guildId),
      // The old bot's history (plan 8H-10), as the member's panel reads it.
      ctx.legacyFillIns.stateOf(memberId, guildId),
      ctx.legacyIndex?.hasFile(memberId, guildId) ?? false,
      // Named as the member's own `/wants` names its lines: costumes, both tables (8R-4).
      wantLineNames(ctx, memberId, guildId),
      ctx.gymTargets.list(memberId, guildId),
    ]);
  const legacy = legacyLine(fillIn, { indexed: ctx.legacyIndex !== undefined, hasFile, history });
  const gyms = await serverGyms({ guildId }, ctx);
  const gymNames = targets.gymIds.map((id) => {
    const gym = gyms.get(id);
    return gym ? plain(gym.name) : `gym #${String(id)} (gone)`;
  });
  return [
    ...settingsLines(settings, {
      newTrain,
      history,
      leaderboard,
      ...(legacy === undefined ? {} : { legacy }),
    }).map((line) => line.text),
    listLine(
      'Wants in this server',
      wants.names.map((name) => plain(name)),
      wants.unreadable,
    ),
    listLine('Gym targets in this server', gymNames, targets.unreadable),
  ];
}

/**
 * `/admin member-settings`: for the server's own staff alone (`requireManagement`: admins,
 * moderators, the owner), not for bot developers, whom the rest of `/admin` takes (plan 8Z-2, the
 * audit's L-D6: a member's opt-ins, friend code and wants are no part of running the bot).
 */
export const memberSettings: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('member-settings')
    .setDescription('Show what a member has set, for you alone')
    .addUserOption((option) =>
      option.setName('member').setDescription('The member').setRequired(true),
    ),
  help: {
    details:
      'Everything I keep about the member in this server: their settings, friend code and ' +
      'in-game name, and how many wants and gym targets they have here (the first few by ' +
      'name). Only for members of this server. Only you see the answer; the member is not ' +
      'told.\n\nOnly admins and moderators can use it.',
    examples: ['/admin member-settings member:@Ash'],
  },
  guards: [requireManagement],
  defer: 'late',
  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const user = interaction.options.getUser('member', true);
    if (user.bot) throw new UserError('Bots have no settings.');
    // Discord sends the member with the option only when the account is in this server: the
    // settings of an account elsewhere are none of this server's staff's business.
    const member = interaction.options.getMember('member');
    if (member === null) {
      throw new UserError(
        `**${plain(user.globalName ?? user.username)}** is not a member of this server.`,
      );
    }
    // The name in this server (a member object of discord.js, or the raw one of the API with its
    // server nickname), else the name of the account.
    const inServer = 'displayName' in member ? member.displayName : (member.nick ?? null);
    const name = inServer ?? user.globalName ?? user.username;
    const lines = await memberSettingsLines(ctx, user.id, guildId);
    await answer(interaction, {
      content: [
        `Settings of ${memberText({ id: user.id, name })}:`,
        ...lines.map((line) => `- ${line}`),
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  },
};
