import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { guildIdOf, requireTimed } from '../../discord/guards.js';
import { MAX_PARTY_NAME } from '../../domain/party/party.js';
import { requireMeetupChanger } from '../meetups/meetup-changes.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { actingMember, commandTimed } from './reply.js';
import { renameAs, replyTimed } from './timed.js';

/**
 * `/name` (spec 4.2): another name for the party of this post, when it is a party that has a
 * name: a train or a meetup. Anybody in a train's post may; a meetup's name is for its maker and
 * staff, a blocked maker refused (`requireMeetupChanger`, plan 8Z). The post says who did it, and
 * its title follows (within what Discord allows: two renames of a post in ten minutes, the newest
 * name wins).
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
    alsoIn: ['train'],
    details:
      'Renames the train or meetup and the title of its post; the post says who renamed it. Use ' +
      'it in the post of the train or meetup. Only its maker or a moderator can rename a ' +
      'meetup.\n\nDiscord lets a post be renamed twice in ten minutes, so a third name within ' +
      'that time shows a little later.',
    examples: ['/name name:Community Day picnic, by the lake'],
  },
  guards: [requireTimed, requireMeetupChanger],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTimed(interaction, ctx);
    const text = interaction.options.getString('name', true);
    const member = actingMember(interaction);
    const serverId = guildIdOf(interaction);
    await replyTimed(interaction, await renameAs(ctx, serverId, party, member, text));
  },
};
