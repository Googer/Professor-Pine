import { MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { isStaff, requireTrain } from '../../discord/guards.js';
import { actingMember, commandTrain } from '../parties/reply.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { clearConductorAs, DISCORD_CONDUCTOR, setConductorAs } from './train-changes.js';

const setConductor: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('set')
    .setDescription('Become the conductor of this train: the one who moves it'),
  help: {
    details:
      'Makes you the conductor. While a train has a conductor, only they and the moderators ' +
      'can move it along its route, so nobody moves it by accident. You can take over from ' +
      'another conductor (who may have gone offline); the post says so. You must be signed up.',
    examples: ['/conductor set'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const answer = await setConductorAs(ctx, party, actingMember(interaction), DISCORD_CONDUCTOR);
    if (answer.kind !== 'ok') throw new UserError(answer.text);
    await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
  },
};

const clearConductor: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear')
    .setDescription('Stop being the conductor of this train (moderators: take the conductor off)'),
  help: {
    details:
      'Leaves the train without a conductor: anybody who is signed up can move it again. For ' +
      'the conductor themself, and for moderators. A conductor who leaves the train is no ' +
      'longer its conductor.',
    examples: ['/conductor clear'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const answer = await clearConductorAs(
      ctx,
      party,
      actingMember(interaction),
      isStaff(interaction, ctx),
    );
    if (answer.kind !== 'ok') throw new UserError(answer.text);
    await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
  },
};

/** `/conductor` (spec 4.2): who leads the train of this post, and with that who may move it. */
export const conductor = commandGroup({
  data: new SlashCommandBuilder()
    .setName('conductor')
    .setDescription('The conductor of this train: the one who moves it'),
  help: {
    category: 'train',
    details: 'Use it in the post of the train.',
  },
  guards: [requireTrain],
  parts: [setConductor, clearConductor],
});
