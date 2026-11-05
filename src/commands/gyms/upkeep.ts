import { AttachmentBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import type { Throttle } from '../../discord/throttle.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { googleMonth } from '../../domain/geo/google-line.js';
import { gymsTsv } from '../../domain/gyms/gym-export.js';
import { gymWithId } from '../../render/gym-view.js';
import { count, timestamp } from '../../render/text.js';
import type { FetchOutcome } from '../../services/gym-upkeep.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { answerGym, GYM_GONE, gymViewMessage, staffPlace } from './shared.js';

/** How often one member may ask Google about a gym by hand (plan 8Z); the cap is the instance's. */
const GYM_REFRESH_THROTTLE: Throttle = { uses: 10, perSeconds: 600 };

/** The name of the file `/gym export` attaches. */
export const EXPORT_FILE = 'gyms.tsv';

/** What came of fetching one thing about a gym, as a sentence. */
function fetched(what: 'address' | 'nearby places', api: string, outcome: FetchOutcome): string {
  const several = what === 'nearby places';
  switch (outcome) {
    case 'updated':
      return `Its ${what} ${several ? 'were' : 'was'} fetched anew.`;
    case 'unchanged':
      return `Its ${what} ${several ? 'are' : 'is'} as before: Google says the same.`;
    case 'no-key':
      return `Its ${what} could not be fetched: no Google API key is configured.`;
    case 'denied':
      return (
        `Its ${what} could not be fetched: Google refuses the API key for the ${api}, which ` +
        'has to be enabled for the key’s project. It keeps what it had.'
      );
    case 'failed':
      return `Its ${what} could not be fetched (the log says why). It keeps what it had.`;
    case 'capped':
      return `Its ${what} could not be fetched: this month's lookups by hand are used.`;
    case 'count-unread':
      return `Its ${what} could not be fetched: I could not read this month's lookups by hand.`;
  }
}

/**
 * `/gym refresh`: asks Google about one gym again, now: its address and the places around it
 * (the legacy `geocode` and `gym-places` in one). Says what it got, for each of the two.
 */
export const refreshGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('refresh')
      .setDescription('Fetch the address and the nearby places of a gym from Google again'),
  ),
  help: {
    details:
      'A gym is also found by the street it is on and by the names of places around it, ' +
      'which I fetch from Google when a gym is added or moved. Use this when that failed, or ' +
      'when the surroundings of a gym have changed.\n\nEach member may use this ten times in ten ' +
      'minutes, and I may look up only so many gyms this way in a month: `/gym google` says ' +
      'how many are used.',
    examples: ['/gym refresh gym:Big Fountain'],
  },
  throttle: GYM_REFRESH_THROTTLE,
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const chosen = await chosenGym(interaction, ctx);
    const refreshed = await ctx.gymAdmin.refresh(chosen.id);
    if (!refreshed) throw new UserError(GYM_GONE);
    const { gym, geodata, places } = refreshed;
    const lines =
      geodata === 'capped'
        ? [
            `I did not ask Google: this instance has used its ` +
              `${ctx.config.settings.googleByHandPerMonth} lookups by hand for this month. They ` +
              `start again ${timestamp(googleMonth(Date.now()).nextReset, 'f')}. The gym keeps ` +
              'what it has.',
          ]
        : geodata === 'count-unread'
          ? [
              'I did not ask Google: I could not read how many lookups by hand this month has ' +
                'used. Try again in a moment. The gym keeps what it has.',
            ]
          : geodata === 'no-key' && places === 'no-key'
            ? ['No Google API key is configured, so there is nothing to fetch.']
            : [
                fetched('address', 'Geocoding API', geodata),
                fetched('nearby places', 'Places API (New)', places),
              ];
    const place = await staffPlace(interaction, ctx);
    await answerGym(
      interaction,
      await gymViewMessage(ctx, place, gym, [`${gymWithId(gym)}:`, ...lines]),
    );
  },
  autocomplete: respondWithGyms,
};

/**
 * `/gym export`: the gyms that lie in a region of this server as one file of tab-separated
 * values (name, longitude, latitude), for laying them over a map (Matt, 2026-10-13: one file,
 * without the legacy split by EX status).
 */
export const exportGyms: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('export')
    .setDescription('Get the gyms of this server as a file, for laying them over a map'),
  help: {
    details:
      `One file, \`${EXPORT_FILE}\`: a line per gym that lies in a region of this server, ` +
      'with its name, longitude and latitude, separated by tabs and sorted by name.',
    examples: ['/gym export'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const { guildId } = await staffPlace(interaction, ctx);
    const regions = ctx.regions
      .all()
      .filter((region) => guildId !== undefined && region.guildId === guildId);
    if (regions.length === 0) throw new UserError('This server has no regions yet.');
    // A gym in two regions that overlap is one line.
    const gyms = new Map<number, Gym>();
    for (const region of regions) {
      for (const gym of ctx.gyms.inRegion(region.channelId)) gyms.set(gym.id, gym);
    }
    if (gyms.size === 0) throw new UserError('No gym lies in a region of this server.');
    const file = new AttachmentBuilder(Buffer.from(gymsTsv([...gyms.values()]), 'utf8'), {
      name: EXPORT_FILE,
    });
    await interaction.editReply({
      content:
        gyms.size === 1
          ? 'The one gym that lies in a region of this server.'
          : `The ${count(gyms.size, 'gym')} that lie in a region of this server.`,
      files: [file],
    });
  },
};
