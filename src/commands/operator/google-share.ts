import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { isInstanceOperatorOf, requireInstanceOperator } from '../../discord/guards.js';
import { isSnowflake } from '../../db/snowflake.js';
import { googleMonth } from '../../domain/geo/google-line.js';
import { timestamp } from '../../render/text.js';
import { NOT_A_SERVER_ID } from './servers.js';
import { tellOwnerOfShareRaise } from './shared-change.js';

/** The subcommand group of `/operator` about Google (plan 19B-5). */
export const GOOGLE_GROUP = 'google';
export const GOOGLE_DESCRIPTION = 'Google’s monthly budget, shared between the servers';

/** The most an operator adds to a server's share in one month. */
const MOST_EXTRA = 1_000_000;

/** A number as a sentence writes it: `4,500`. */
function amount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * `/operator google share server: extra:` (plan 19B-5; spec "Fairness and limits"): an instance
 * operator raises one server's share of Google's month (`GoogleShares`) by `extra` questions of
 * each kind (places searches and addresses), on top of its share by need, past the half of the
 * month and `googleServerShareMax`. For this month only: the raise lapses when the month starts
 * again (Pacific), so that none is forgotten; set again it replaces the month's raise, and 0 takes
 * it back. The server's rows of the line are ranked by its new share at once. Answers privately
 * with the server's share as it is now (where the shares cannot be worked out now, that the raise
 * is written and worked out at the line's next turn); another operator's raise is told to the owner by DM, who
 * and from where (`tellOwnerOfShareRaise`).
 */
export const googleShare: SubcommandPart = {
  group: GOOGLE_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('share')
    .setDescription('Raise one server’s share of Google’s budget for this month')
    .addStringOption((option) =>
      option.setName('server').setDescription('The server’s ID').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('extra')
        .setDescription(
          'How many places searches and addresses to add this month (0 takes it back)',
        )
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(MOST_EXTRA),
    ),
  help: {
    details:
      'I ask Google about the places of gyms, PokéStops and Power Spots within a monthly ' +
      'budget. The servers share it by how much each has waiting, and none takes more than ' +
      'half of a month while the others still need theirs.\n\n' +
      'This raises one server’s share for this month, past those limits: for a server that has ' +
      'just imported its gyms, say. Setting it again replaces the earlier raise, and `extra:0` ' +
      'takes it back. A raise ends when the month starts again.\n\n' +
      'Only the operators of this Pine can use it, also in a direct message with me. My owner ' +
      'is told who raised a share, and from where.',
    examples: ['/operator google share server:412345678901234567 extra:500'],
  },
  guards: [requireInstanceOperator],
  seenBy: (asker, ctx) => isInstanceOperatorOf(asker.user.id, ctx),
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const server = interaction.options.getString('server', true).trim();
    const extra = interaction.options.getInteger('extra', true);
    if (!isSnowflake(server)) throw new UserError(NOT_A_SERVER_ID);
    const guildId = await ctx.guilds.idFor(server);
    if (guildId === undefined) throw new UserError('I am not in a server with that ID.');
    const now = await ctx.gymAdmin.raiseGoogleShare(guildId, extra);
    const named = `the server \`${server}\``;
    const raise = `${amount(extra)} places searches and ${amount(extra)} addresses`;
    tellOwnerOfShareRaise(
      interaction,
      ctx,
      (extra === 0
        ? `Took back this month’s raise of the Google share of ${named}`
        : `Raised the Google share of ${named} this month: ${raise} on top of its share`) +
        ' (`/operator google share`).',
    );
    const reset = timestamp(googleMonth(Date.now()).nextReset, 'f');
    const lasts = `A raise lasts until the month starts again, ${reset}.`;
    const set =
      extra === 0
        ? `The Google share of ${named} has no raise this month.`
        : `The Google share of ${named} has ${raise} on top of it this month.`;
    await interaction.editReply({
      content:
        now === undefined
          ? `${set} ${lasts}`
          : now === 'later'
            ? // Written, but the shares could not be read now (fix round 3, T10).
              `${set} I work out the new share at the next round of lookups. ${lasts}`
            : `The Google share of ${named} this month is now:\n` +
              `- ${amount(now.share.places)} places searches, ${amount(now.used.places)} used\n` +
              `- ${amount(now.share.geocodes)} addresses, ${amount(now.used.geocodes)} used\n\n` +
              (now.raise > 0
                ? `That includes ${amount(now.raise)} of each added by an operator. `
                : '') +
              lasts,
    });
  },
};
