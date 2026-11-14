import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { count } from '../../render/text.js';
import { tellOwnerOfSharedChange } from './shared-change.js';

/**
 * `/operator clear-image-cache` (the shared-data tier, plan 19B-1): deletes the map pictures the
 * bot keeps of gyms and regions, every server's. A picture is named by what it shows, so a moved
 * gym or a redrawn region gets a new one by itself; what this removes is what nothing names any
 * more (pictures of deleted and moved gyms and of old outlines), at the cost of downloading the
 * others once more.
 */
export const clearImageCache: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear-image-cache')
    .setDescription('Delete the map pictures I keep of gyms and regions'),
  help: {
    details:
      'Deletes the map pictures I keep of gyms and regions. I keep every map picture I ' +
      'download, so pictures of gyms that were moved or deleted, and of regions that were ' +
      'redrawn, stay until this is run, though they are never used again.\n\n' +
      'Pictures still in use are downloaded again the next time they are shown.\n\n' +
      'The pictures are every server’s: my owner is told who cleared them, and from where.',
    examples: ['/operator clear-image-cache'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const deleted = await ctx.maps.clear();
    // The pictures are every server's (plan 19B-1): the owner is told of a clear that took any.
    if (deleted > 0) {
      tellOwnerOfSharedChange(
        interaction,
        ctx,
        `Cleared the image cache, for every server: deleted ${count(deleted, 'cached map picture')}.`,
      );
    }
    await interaction.editReply({
      content:
        deleted === 0
          ? 'There were no cached map pictures to delete.'
          : `Deleted ${count(deleted, 'cached map picture')}.`,
    });
  },
};
