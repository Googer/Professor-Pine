import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { IN_A_PARTY_POST, partyOf, requireManagement } from '../../discord/guards.js';
import { partyWord } from '../../domain/party/party.js';
import { fitItems } from '../../render/text.js';
import { actingMember, partyOver } from '../parties/reply.js';

/**
 * `/admin save-party` (spec 5.2): the post it is used in is kept from the clock, which then
 * neither warns nor archives it, until staff let it go again or close it with `/delete`. Used
 * anywhere else without an option, it lists the posts of this server that are kept: nothing
 * else reminds staff of them. For admins and moderators, like `/delete`, not for bot developers
 * (Matt, 2026-10-11).
 */
export const saveParty: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('save-party')
    .setDescription('Keep this post from being archived by itself, or let it go again')
    .addBooleanOption((option) =>
      option.setName('keep').setDescription('False lets the post be archived as usual again'),
    ),
  help: {
    details:
      'In the post of a raid, max battle, train or meetup: keeps the post open after the ' +
      'raid, max battle, train or meetup has ended. Nothing warns that it will be archived and nothing archives it, until you run ' +
      'this with `keep:False` or close it with `/delete`. The post says who kept it.\n\nUsed ' +
      'anywhere else without an option, it lists the kept posts. For admins and moderators.',
    examples: ['/admin save-party', '/admin save-party keep:False'],
  },
  guards: [requireManagement],
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const party = partyOf(interaction, ctx);
    const option = interaction.options.getBoolean('keep');
    if (!party) {
      if (option !== null) {
        throw new UserError(IN_A_PARTY_POST);
      }
      // The kept posts of this server: those in a forum this server has.
      const channels = interaction.inCachedGuild() ? interaction.guild.channels.cache : undefined;
      const kept = ctx.parties
        .active()
        .filter(
          (other) =>
            other.saved &&
            other.forumPostId !== null &&
            other.forumChannelId !== null &&
            (channels?.has(other.forumChannelId) ?? false),
        )
        .map((other) => `<#${other.forumPostId ?? ''}>`);
      await interaction.editReply({
        content:
          kept.length === 0
            ? 'No post is kept. Use this in the post of a raid, max battle, train or meetup to keep it.'
            : `Kept posts, which I will not archive by myself:\n${fitItems(kept, 1_900, '\n')}`,
      });
      return;
    }
    const keep = option ?? true;
    const outcome = await ctx.partyService.keep(party.id, keep, actingMember(interaction));
    if (outcome === 'gone') throw new UserError(partyOver(party));
    const answers = {
      kept:
        'This post is kept: I will not archive it by myself. `/delete` closes it, and ' +
        '`/admin save-party keep:False` lets it be archived as usual again.',
      'let-go': `This post is no longer kept: it is archived as usual once the ${partyWord(party)} is over.`,
      unchanged: keep ? 'This post was kept already.' : 'This post was not kept.',
    };
    await interaction.editReply({ content: answers[outcome] });
  },
};
