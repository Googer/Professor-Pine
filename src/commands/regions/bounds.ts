import { SlashCommandBuilder } from 'discord.js';
import { channelContext } from '../../discord/channel-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { regionChannelOf, requireGuild } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { Throttle } from '../../discord/throttle.js';
import { container, mapPicture, textDisplay } from '../../render/v2.js';
import { mapOrNothing } from '../../services/static-maps.js';
import { REGION_COLOUR } from './shared.js';

/** A picture is attached to every answer: a member looks at a region now and then, not often. */
export const BOUNDS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };

/** How many gyms a region has, as the legacy bot said it. */
export function gymCountSentence(gyms: number): string {
  if (gyms === 0) return 'There are currently no gyms within this region.';
  return gyms === 1
    ? 'There is 1 gym within this region.'
    : `There are ${gyms} gyms within this region.`;
}

/**
 * The answer of `/bounds` as a components-v2 message (plan 8B-4): the region's channel as the
 * heading, how many gyms lie in it, and the map of its outline at full width (`map`; without
 * one, none).
 */
export function boundsMessage(channelId: string, gyms: number, map?: string): V2Message {
  const picture = mapPicture(map, 'The outline of the region');
  return {
    v2: true,
    components: [
      container(REGION_COLOUR, [
        textDisplay(`### The area of <#${channelId}>\n${gymCountSentence(gyms)}`),
        ...picture.gallery,
      ]),
    ],
    ...(picture.files.length === 0 ? {} : { files: picture.files }),
  };
}

/**
 * `/bounds`: what area a region covers, for any member (Matt, 2026-10-13: ordinary members
 * used the legacy command). In the channel of a region, its forum or a post in it: a picture
 * of the outline and how many gyms lie in it, for the member alone. Without a picture (no map
 * key, or the download failed) the answer goes out all the same.
 */
export const bounds: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('bounds')
    .setDescription('Show the area the region of this channel covers'),
  help: {
    category: 'util',
    details:
      'Use it in the channel of a region, in its forum or in a post there: I show you a map ' +
      'with the outline of the region and say how many gyms lie in it.',
    examples: ['/bounds'],
  },
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: BOUNDS_THROTTLE,
  async execute(interaction, ctx) {
    const channelId = regionChannelOf(interaction, ctx);
    const region = channelId === undefined ? undefined : ctx.regions.byChannel(channelId);
    if (!region) {
      // A region whose outline was never imported is no region for `regionChannelOf`.
      const { baseChannelId } = channelContext(interaction);
      const unbounded =
        baseChannelId === undefined
          ? undefined
          : (ctx.regions.byChannel(baseChannelId) ?? ctx.regions.byForum(baseChannelId));
      if (unbounded) throw new UserError('This region has no outline yet.');
      throw new UserError(
        'This channel is not a region. Use /bounds in the channel of a region, in its forum or ' +
          'in a post there.',
      );
    }
    const map = await mapOrNothing(ctx.maps.region(region), ctx.log, 'a region', {
      region: region.id,
    });
    const gyms = ctx.gyms.inRegion(region.channelId).length;
    await interaction.editReply(v2Answer(boundsMessage(region.channelId, gyms, map)));
  },
};
