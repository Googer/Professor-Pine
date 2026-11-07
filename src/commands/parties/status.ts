import { SlashCommandBuilder } from 'discord.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { v2Answer } from '../../discord/late-reply.js';
import {
  partyOf,
  regionChannelOf,
  requireGuild,
  requireRaidOrTrain,
} from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import { UNLISTED_SPOT } from '../../domain/party/max.js';
import { isMax, isMeetup, isTrain, partyWord } from '../../domain/party/party.js';
import { currentStop } from '../../domain/party/train.js';
import { stopInWords, stopsFrom } from '../../render/train-stops.js';
import { problemText } from '../../render/activity.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { plain } from '../../render/text.js';
import { ACTION_THROTTLE, commandParty, partyOver } from './reply.js';

/** Every use in a post sends a components-v2 message into it. */
export const STATUS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };

/**
 * `/status` (spec 4.2). In the post of a party: its message once more at the bottom
 * of the post, with its buttons, where the lines of the bot and the chat have pushed the first
 * message out of sight; the copy of an earlier `/status` is deleted. In a region's channel or
 * forum: the list of that region's raids, max battles, trains and meetups, for the member alone.
 */
export const status: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription(
      'Repost this raid, max battle, train or meetup at the bottom, or list what is going on in a region',
    ),
  help: {
    category: 'basic-raid',
    alsoIn: ['train', 'meetup'],
    details:
      'In the post of a raid, max battle, train or meetup: shows it again at the bottom of the ' +
      'post, with who is coming and the buttons, so nobody has to scroll up.\n\nIn the channel ' +
      'of a region: shows you the raids, max battles, trains and meetups going on there, as the ' +
      'pinned list of its forum does. Only you see that list.',
    examples: ['/status'],
  },
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: STATUS_THROTTLE,
  async execute(interaction, ctx) {
    const party = partyOf(interaction, ctx);
    if (party) {
      if (!(await ctx.partyService.showStatus(party.id))) throw new UserError(partyOver(party));
      await interaction.editReply({
        content: `The ${partyWord(party)} is at the bottom of the post again, with its buttons.`,
      });
      return;
    }
    const channelId = regionChannelOf(interaction, ctx);
    const region = channelId === undefined ? undefined : ctx.regions.byChannel(channelId);
    if (!region) {
      throw new UserError(
        'Use this in the channel of a region, or in the post of a raid, max battle, train or meetup.',
      );
    }
    await interaction.editReply(v2Answer(ctx.partyService.summaryMessage(region.id)));
  },
};

/**
 * For `/where`: the post of a party that is at a gym, which is a raid, and a train at the stop
 * it has reached. A meetup is at none, and the member is told that rather than that the command
 * is for raids.
 */
const requireGym: Guard = (interaction, ctx) => {
  const party = partyOf(interaction, ctx);
  if (party && isMeetup(party)) {
    throw new UserError(`A ${partyWord(party)} is at no gym, so there is no place to show.`);
  }
  return requireRaidOrTrain(interaction, ctx);
};

/**
 * `/where` (spec 4.2): where the gym of the raid is, or the stop a train is at, as a link and a
 * map, for the member alone.
 */
export const where: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('where')
    .setDescription(
      'Show where the gym of this raid is, the spot of this max battle, or the stop of this train',
    ),
  help: {
    category: 'basic-raid',
    alsoIn: ['train'],
    details:
      'Shows you where it is, with a link to Google Maps: the gym of a raid or the gym a train ' +
      'is at, with a map of the area; or the Power Spot of a max battle or train. Only you see ' +
      'the answer. ' +
      'Use it in the post of the raid, max battle or train.',
    examples: ['/where'],
  },
  guards: [requireGym],
  defer: 'ephemeral',
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    if (isMeetup(party)) {
      throw new UserError(`A ${partyWord(party)} is at no gym, so there is no place to show.`);
    }
    if (isMax(party)) {
      // A max battle's spot (plan 8X-3): its name and Map; no map picture of a gym. A pin is no
      // power spot Pine knows (review B, B11): its name alone says so. A power spot is named as
      // its post names it, as it is now while it is the same place (`spotNow`, review X3-F3).
      const spot = ctx.partyService.spotOf(party);
      const name =
        spot.kind === 'pin' ? `📍 **${UNLISTED_SPOT}**` : `**${plain(spot.title)}** (Power Spot)`;
      await interaction.editReply({
        content: `${name}\n[Open in Google Maps](<${gymMapsUrl(spot)}>)`,
      });
      return;
    }
    let gymId: number | null | undefined;
    if (isTrain(party)) {
      // The gym of a train is the stop it is at; before its route and after it, it is at none.
      const at = currentStop(party);
      if (at === undefined) {
        throw new UserError(
          party.train.route.length === 0
            ? problemText('no-route', ctx.attendance.limits(), 'train')
            : 'This train has finished its route: it is at no gym.',
        );
      }
      if (at.kind === 'powerspot') {
        // A power spot of its route (plan 8X-4), as a max battle's spot is shown.
        const shown = stopsFrom(ctx.gyms, ctx.wayspots)(at);
        const spot = shown.kind === 'powerspot' ? shown.spot : undefined;
        if (!spot) throw new UserError('I no longer know the Power Spot this train is at.');
        await interaction.editReply({
          content: `${stopInWords(shown)}\n[Open in Google Maps](<${gymMapsUrl(spot)}>)`,
        });
        return;
      }
      gymId = at.id;
    } else {
      gymId = party.gymId;
    }
    const gym = gymId === null ? undefined : ctx.gyms.get(gymId);
    if (!gym) {
      throw new UserError(
        isTrain(party)
          ? 'I no longer know the gym this train is at.'
          : 'I no longer know the gym of this raid.',
      );
    }
    // A nickname that was cleared to an empty text names nothing, so it is tested for truth.
    const name = gym.nickname
      ? `**${plain(gym.nickname)}** (${plain(gym.name)})`
      : `**${plain(gym.name)}**`;
    // Without the map the message goes out all the same (no API key, or the download failed).
    const map = await ctx.maps.gym(gym);
    await interaction.editReply({
      content: `${name}\n[Open in Google Maps](<${gymMapsUrl(gym)}>)`,
      files: map === undefined ? [] : [map],
    });
  },
};
