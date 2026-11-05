import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireParty } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import { partyWord } from '../../domain/party/party.js';
import { problemText } from '../../render/activity.js';
import { count } from '../../render/text.js';
import { actingMember, commandParty, partyOver } from './reply.js';

/** As the legacy bot allowed: a shout pings everybody who is signed up. */
export const SHOUT_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };

/** A shout is one line in the post; the mentions of those it pings need room after it. */
export const MAX_SHOUT = 500;

/**
 * `/shout` (spec 4.2): a member's message to everybody else who is signed up for the raid or
 * train or meetup and not done, said by the bot in the post so that it can ping them.
 */
export const shout: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('shout')
    .setDescription('Tell everybody who is signed up here something, with a ping')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('What to tell them')
        .setRequired(true)
        .setMaxLength(MAX_SHOUT),
    )
    .addBooleanOption((option) =>
      option
        .setName('group')
        .setDescription('Ping only the others of your own group (default: everybody)'),
    ),
  help: {
    category: 'basic-raid',
    details:
      'Posts your message and pings everybody else who is signed up and not done yet, in every ' +
      'group, unless they switched such pings off. With `group:True` it pings only the others ' +
      'of your own group.\n\nEverybody is pinged, however many they are (in several messages ' +
      'if needed), so keep it for what cannot wait: the lobby is starting, the gym was ' +
      'wrong.\n\nYou must be signed up. Use it in the post of the raid, max battle, train or ' +
      'meetup.',
    examples: [
      '/shout message:Starting the lobby in two minutes',
      '/shout message:Our lobby is up, join now group:True',
    ],
  },
  guards: [requireParty],
  defer: 'ephemeral',
  throttle: SHOUT_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('message', true).trim();
    if (text === '') throw new UserError('Say what you want to tell them.');
    const group = interaction.options.getBoolean('group') ?? false;
    const word = partyWord(party);
    const outcome = await ctx.attendance.shout(party.id, actingMember(interaction), text, {
      group,
    });
    if (outcome.kind === 'gone') {
      // Cut short after some of its messages: who was pinged before it ended.
      const before = outcome.pinged ?? 0;
      throw new UserError(
        before > 0
          ? `${partyOver(party)} I pinged ${count(before, 'trainer')} before it ended.`
          : partyOver(party),
      );
    }
    if (outcome.kind === 'moved') {
      // Its post is another now (a raid moved to another region's forum): the rest go there. A
      // shout that pinged nobody was none of the member's doing, so its use goes back.
      const moved = `This ${word} moved to another post`;
      throw new UserError(
        outcome.pinged > 0
          ? `${moved}: I pinged ${count(outcome.pinged, 'trainer')} before it moved. Shout again there.`
          : `${moved}. Shout again there.`,
        { givesBack: outcome.pinged === 0 },
      );
    }
    if (outcome.kind === 'refused') {
      throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), word));
    }
    if (outcome.kind === 'one-group') {
      throw new UserError(
        `This ${word} has one group: \`/shout\` without \`group\` pings everybody.`,
      );
    }
    await interaction.editReply({
      content:
        outcome.kind === 'nobody'
          ? outcome.group === undefined
            ? `Nobody else is signed up for this ${word}, so I said nothing.`
            : `Nobody else is in group ${outcome.group} of this ${word}, so I said nothing.`
          : `Your message is in the post. I pinged ${count(outcome.pinged, 'trainer')}.`,
    });
  },
};
