import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { gymWithId } from '../../render/gym-view.js';
import { isEliteGym } from '../../domain/party/raid.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { answerGym, GYM_GONE, gymViewMessage, staffPlace } from './shared.js';
import { serverValuesOf } from '../../discord/server-values.js';

/** What a change of the elite mark says: what it is now, or that it was so already. */
export function eliteLine(
  was: boolean,
  eligible: boolean,
  gym: { id: number; name: string; nickname: string | null },
): string {
  return was === eligible
    ? `${gymWithId(gym)} ${eligible ? 'was an elite raid gym already' : 'was no elite raid gym'}.`
    : `${gymWithId(gym)} is ${eligible ? 'now marked as an elite raid gym' : 'no longer marked as an elite raid gym'}.`;
}

/**
 * `/gym elite`: whether a gym is an elite raid gym, as the game now calls what was an EX gym
 * (Matt, 2026-10-13). One answer, yes or no: the two flags the legacy bot kept (tagged, has
 * hosted) both mean yes, and no clears both. Elite raids are rare, so this is all there is.
 */
export const eliteGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('elite')
      .setDescription('Say whether a gym is an elite raid gym'),
  ).addBooleanOption((option) =>
    option
      .setName('eligible')
      .setDescription('True: it is an elite raid gym. False: it is none')
      .setRequired(true),
  ),
  help: {
    details:
      'Marks a gym as an elite raid gym, or takes the mark away with `eligible:False`.\n\n' +
      'Members are not shown the mark (the posts, train routes and `/find-gym` say nothing of ' +
      'it); a raid at an elite raid gym is also shown in the channel for raids at elite raid ' +
      'gyms, where the server has one, and staff see the mark in `/gym show`.',
    examples: ['/gym elite gym:Big Fountain eligible:True'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const before = await chosenGym(interaction, ctx);
    const eligible = interaction.options.getBoolean('eligible', true);
    const place = await staffPlace(interaction, ctx);
    const gym = await ctx.gymAdmin.setElite(before.id, eligible, place.staffId);
    if (!gym) throw new UserError(GYM_GONE);
    await answerGym(
      interaction,
      await gymViewMessage(ctx, serverValuesOf(interaction, ctx).distanceUnits, place, gym, [
        eliteLine(isEliteGym(before), eligible, gym),
      ]),
    );
  },
  autocomplete: respondWithGyms,
};
