import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { answerGym, gymViewMessage, staffPlace } from './shared.js';
import { viewControls } from './view-controls.js';

/**
 * `/gym show`: everything Pine knows of a gym (the spec's `find` and `detail` in one). The
 * same view is the answer of every change of a gym.
 */
export const showGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('show')
      .setDescription('Show everything I know of a gym'),
  ),
  help: {
    details:
      'A gym in full: its name, nickname and number, a link to the place, its ' +
      'description, notice and keywords, whether it is an elite raid gym, the regions of this ' +
      'server it lies in, the nearest gym, how many members have it as a gym target, the ' +
      'address and nearby places Google gave (by which it is also found), and its map.\n\n' +
      'Buttons under it edit its texts, mark it as an elite raid gym or take the mark away, ' +
      'move it and delete it, as the commands do. Pick the gym from the list, or give its ' +
      'number.',
    examples: ['/gym show gym:Big Fountain', '/gym show gym:#123'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const gym = await chosenGym(interaction, ctx);
    const place = await staffPlace(interaction, ctx);
    await answerGym(interaction, await gymViewMessage(ctx, place, gym, [], viewControls(gym)));
  },
  autocomplete: respondWithGyms,
};
