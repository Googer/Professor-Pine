import { SlashCommandBuilder } from 'discord.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { requireGuild } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { Throttle } from '../../discord/throttle.js';
import { isRaid } from '../../domain/party/party.js';
import { raidTierLabel } from '../../domain/pogo/raid-tier.js';
import { renderMemberGymView } from '../../render/gym-view.js';
import { raidLine } from '../../render/summary.js';
import { mapPicture } from '../../render/v2.js';
import { gymRegionsInGuild } from '../../services/region-directory.js';
import { mapOrNothing } from '../../services/static-maps.js';
import { respondWithServerGyms, serverGym, serverGymOption, serverOf } from './server-gym.js';

/**
 * A map picture comes with every answer, as with `/bounds`, but a look-up is asked for more
 * often.
 */
export const FIND_GYM_THROTTLE: Throttle = { uses: 10, perSeconds: 60 };

/**
 * A gym that cannot be shown is refused before the answer is deferred and before the use counts
 * against the limit.
 */
const requireFoundGym: Guard = async (interaction, ctx) => {
  if (interaction.isChatInputCommand()) {
    await serverGym(ctx, interaction, interaction.options.getString('gym', true));
  }
};

/**
 * `/find-gym` (the legacy `!find-gym`, `!fort`; decided in plan 6A): a member's look-up of a
 * gym of this server: what a member needs of it, the regions it lies in, the raids there now and
 * the map, for the member alone. `/gym show` is the staff's view.
 */
export const findGym: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('find-gym')
    .setDescription('Look up a gym: where it is, its regions and its raids now')
    .addStringOption(
      serverGymOption('The gym: type part of its name and pick from the list', true),
    ),
  help: {
    category: 'util',
    details:
      'Shows a gym of this server: its name and nickname with a link to the place, its ' +
      'description and notice, the regions it lies in, the ' +
      'raids there now and a map. Pick the gym from the list that appears while you type ' +
      '(the gyms of the region you are in come first), or give its number (`#123`). Only you ' +
      'see the answer.',
    examples: ['/find-gym gym:Big Fountain', '/find-gym gym:#123'],
  },
  guards: [requireGuild, requireFoundGym],
  defer: 'ephemeral',
  throttle: FIND_GYM_THROTTLE,
  async execute(interaction, ctx) {
    const guildRow = await serverOf(interaction, ctx);
    const gym = await serverGym(ctx, interaction, interaction.options.getString('gym', true));
    const now = Date.now();
    const raids = ctx.parties
      .active()
      .filter(isRaid)
      .filter((party) => party.gymId === gym.id && party.guildId === guildRow)
      .map((party) => raidLine({ party, title: `${raidTierLabel(party.raid.tier)} raid` }, now));
    const map = await mapOrNothing(ctx.maps.gym(gym), ctx.log, 'a gym', { gym: gym.id });
    const view = renderMemberGymView({
      gym,
      regions:
        guildRow === undefined ? [] : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, guildRow),
      raids,
      map: mapPicture(map, 'Map of the gym'),
    });
    await interaction.editReply(v2Answer(view));
  },
  autocomplete: respondWithServerGyms,
};
