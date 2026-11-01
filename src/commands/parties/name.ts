import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { requireTimed } from '../../discord/guards.js';
import { MAX_PARTY_NAME } from '../../domain/party/party.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { actingMember, commandTimed } from './reply.js';
import { renameAs, replyTimed } from './timed.js';

/**
 * `/name` (spec 4.2): another name for the party of this post, when it is a party that has a
 * name: a train or a meetup. Anybody in the post may; the post says who did it,
 * and its title follows (within what Discord allows: two renames of a post in ten minutes, the
 * newest name wins).
 */
export const name: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('name')
    .setDescription('Rename this train or meetup')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The new name')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    ),
  help: {
    category: 'meetup',
    details:
      'Use it in the post of the train or meetup. The post says who renamed it. The title of the post ' +
      'follows; Discord lets a post be renamed twice in ten minutes, so a third name within ' +
      'that time shows a little later.',
    examples: ['/name name:Community Day picnic, by the lake'],
  },
  guards: [requireTimed],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTimed(interaction, ctx);
    const text = interaction.options.getString('name', true);
    await replyTimed(interaction, await renameAs(ctx, party, actingMember(interaction), text));
  },
};
