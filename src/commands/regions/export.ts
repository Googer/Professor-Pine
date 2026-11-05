import { AttachmentBuilder, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { kmlFiles, MAX_KML_AREAS, MAX_KML_CORNERS, writeKml } from '@pine/wayspot-core/kml';
import { count } from '../../render/text.js';
import {
  allRegionsAsked,
  chosenRegion,
  respondWithRegionsOrAll,
  withRegionOption,
} from './region-option.js';
import { regionInSentence, regionLabel, regionStaff } from './shared.js';

/** The name of the file `/region export` attaches for all regions of a server. */
export const EXPORT_FILE = 'regions.kml';

/** The name of the `index`th file of an export of all regions: `regions.kml`, `regions-2.kml`. */
export function exportFileName(index: number): string {
  return index === 0 ? EXPORT_FILE : `regions-${index + 1}.kml`;
}

/** How many files Discord takes in one message. */
const FILES_PER_MESSAGE = 10;

/**
 * `/region export`: the outline of a region as a KML file, to change it in a map editor and
 * import it again; or, without a region and outside a region's channel, the outlines of all
 * regions of the server in one file (or several, each one an import takes), as a backup that
 * imports again as it is.
 */
export const exportRegions: SubcommandPart = {
  data: withRegionOption(
    new SlashCommandSubcommandBuilder()
      .setName('export')
      .setDescription('Get the outline of a region, or of all regions, as a KML file'),
    'The region, or "all"; without it, the region of this channel, or all regions',
    false,
  ),
  help: {
    details:
      `With a region, or in the channel of one: the outline of that region as a file. Anywhere ` +
      `else: all regions of this server in one file, \`${EXPORT_FILE}\` (split into ` +
      '`regions-2.kml` and so on when there are more than one import takes).\n\nEach area is named ' +
      'after its channel, with the category of the channel as its description, so that ' +
      '`/region import` puts every outline back where it was. Open the file in a map editor ' +
      '(Google My Maps: Import) to change an outline. A region without an outline is left out.',
    examples: ['/region export', '/region export region:#north-hills'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const staff = await regionStaff(interaction, ctx);
    const region = allRegionsAsked(interaction) ? undefined : chosenRegion(interaction, ctx, staff);
    const channels = ctx.regionAdmin.channelsOf(staff);
    if (region) {
      const { areas } = ctx.regionAdmin.exported(staff, region.id);
      const [area] = areas;
      if (!area) {
        throw new UserError(
          `${regionLabel(region, channels)} has no outline yet, so there is nothing to export.`,
        );
      }
      const gone = !channels.some((channel) => channel.id === region.channelId);
      await interaction.editReply({
        content: gone
          ? `The outline of ${regionInSentence(region, channels)}. Its channel is gone: to give ` +
            'the outline to another channel, use `/region import` with `channel:`.'
          : `The outline of ${regionLabel(region, channels)}.`,
        files: [
          new AttachmentBuilder(Buffer.from(writeKml(areas), 'utf8'), {
            name: `${area.name}.kml`,
          }),
        ],
      });
      return;
    }
    const { areas, skipped } = ctx.regionAdmin.exported(staff);
    if (areas.length === 0) {
      throw new UserError(
        skipped === 0
          ? 'This server has no regions yet.'
          : 'No region of this server has both an outline and a channel, so there is nothing ' +
              'to export. `/region list` shows what each one lacks.',
      );
    }
    // Each file is one that `/region import` takes whole.
    const files = kmlFiles(areas).map(
      (text, index) =>
        new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: exportFileName(index) }),
    );
    const left =
      skipped > 0
        ? ` ${count(skipped, 'region')} without an outline or without a channel ` +
          `${skipped === 1 ? 'is' : 'are'} left out (\`/region list\` shows which).`
        : '';
    await interaction.editReply({
      content:
        files.length === 1
          ? `The outlines of ${count(areas.length, 'region')} of this server.${left}`
          : `The outlines of ${count(areas.length, 'region')} of this server, in ` +
            `${files.length} files: \`/region import\` takes at most ${MAX_KML_AREAS} areas ` +
            `and ${MAX_KML_CORNERS} corners from one file, so import them one after the ` +
            `other.${left}`,
      files: files.slice(0, FILES_PER_MESSAGE),
    });
    for (let first = FILES_PER_MESSAGE; first < files.length; first += FILES_PER_MESSAGE) {
      const last = Math.min(first + FILES_PER_MESSAGE, files.length);
      await interaction.followUp({
        content:
          last === first + 1
            ? `File ${last} of ${files.length} of the export.`
            : `Files ${first + 1} to ${last} of ${files.length} of the export.`,
        files: files.slice(first, last),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
  autocomplete: respondWithRegionsOrAll,
};
