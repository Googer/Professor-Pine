import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { count } from '../../render/text.js';

/**
 * `/admin clear-image-cache`: deletes the map pictures the bot keeps of gyms and regions. A
 * picture is named by what it shows, so a moved gym or a redrawn region gets a new one by
 * itself; what this removes is what nothing names any more (pictures of deleted and moved gyms
 * and of old outlines), at the cost of downloading the others once more.
 */
export const clearImageCache: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear-image-cache')
    .setDescription('Delete the map pictures I keep of gyms and regions'),
  help: {
    details:
      'Deletes the map pictures I keep. I keep every map picture I download, and pictures of ' +
      'gyms that were deleted or moved and of regions that were redrawn are never used again: ' +
      'they stay until this is run. The pictures still in use are downloaded again when they ' +
      'are next shown.',
    examples: ['/admin clear-image-cache'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const deleted = await ctx.maps.clear();
    await interaction.editReply({
      content:
        deleted === 0
          ? 'There were no cached map pictures to delete.'
          : `Deleted ${count(deleted, 'cached map picture')}.`,
    });
  },
};
