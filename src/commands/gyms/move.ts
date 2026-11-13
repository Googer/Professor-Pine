import { namesakeNote } from './duplicates.js';
import {
  ButtonStyle,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { raidOf } from '../../discord/guards.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { distanceWords } from '../../render/distance-words.js';
import { gymWithId } from '../../render/gym-view.js';
import { count } from '../../render/text.js';
import { FAR_MOVE_METRES, type MoveAsked } from '../../services/gym-admin-service.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import {
  answerGym,
  APPROXIMATE,
  button,
  content,
  fetchNote,
  GYM_GONE,
  gymQuestion,
  gymViewMessage,
  HOW_TO_LOCATE,
  LOCATION_OPTION,
  nearLines,
  pendingGyms,
  placeOrRefuse,
  pointLink,
  staffPlace,
  type ButtonAnswer,
  type GivenPlace,
} from './shared.js';
import { serverValuesOf } from '../../discord/server-values.js';

/** What asks for a move: the command, a button of its question, the form of Move… of a view. */
type MoveInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

/** What staff are told who move a gym in the post of a raid: that is not how a raid moves. */
export const USE_LOCATION = 'To change this raid’s gym, use `/location`.';

/**
 * The question before a move that needs one: another gym lies within ten metres of the new
 * place, the new place is far from the old one (a wrong paste), or it was only read from the
 * middle of a map. One question for all of them. It is kept as a pending request.
 */
function moveQuestion(
  interaction: MoveInteraction,
  ctx: AppContext,
  gym: Gym,
  point: LatLon,
  approximate: boolean,
  guildId: number | undefined,
  before?: string,
) {
  const near = ctx.gymAdmin.near(point, guildId, gym.id);
  const metres = metresBetween(gym, point);
  const far = metres > FAR_MOVE_METRES;
  const token = pendingGyms.put(interaction, {
    what: 'move',
    gymId: gym.id,
    from: { lat: gym.lat, lon: gym.lon },
    point,
    approximate,
    nearIds: near.map((found) => found.gym.id),
  });
  return gymQuestion(
    [
      content([
        before,
        `Move ${gymWithId(gym)} from ${pointLink(gym)} to ${pointLink(point)}?`,
        far
          ? `That is ${distanceWords(metres, serverValuesOf(interaction, ctx).distanceUnits)} from where it is now.`
          : undefined,
        approximate ? APPROXIMATE : undefined,
        ...nearLines(near, serverValuesOf(interaction, ctx).distanceUnits),
        raidOf(interaction, ctx) ? USE_LOCATION : undefined,
      ]),
    ],
    [
      button(token, 'move', near.length > 0 || far ? 'Move anyway' : 'Move', ButtonStyle.Primary),
      button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
    ],
  );
}

/**
 * Moves a gym and shows it, as the answer to the command or in the place of its question: from
 * where to where and how far, and what the move means for what is at the gym. A move is never
 * refused for a raid or a train (Matt, 2026-10-13: it is a correction of a few metres); when
 * the regions of this server the gym lies in are others than before, the answer says that the
 * raid there stays in its post and the trains keep their stop, and when the gym now lies in no
 * region at all, that no raid can be reported there. The interaction has been acknowledged.
 *
 * The service decides under its lock whether what the staff member knew still holds (`asked`:
 * where the gym was, and the gyms near the new place the question named; none for a move
 * without a question). When a gym was put within ten metres of the new place meanwhile, or the
 * gym itself is no longer where it was (somebody else moved it), nothing is moved and the
 * question is asked, anew with everything it said the first time when there was one
 * (`questioned`).
 */
async function moveAnswered(
  interaction: MoveInteraction,
  ctx: AppContext,
  gymId: number,
  place: GivenPlace,
  asked: MoveAsked,
  questioned: boolean,
): Promise<void> {
  const { point } = place;
  const staff = await staffPlace(interaction, ctx);
  const regionsNow = (): string[] =>
    ctx.gymAdmin
      .regionsOf(gymId, staff.guildId)
      .map((region) => region.channelId)
      .sort();
  const regionsBefore = regionsNow();
  const reportable = ctx.gymAdmin.inRegionOf(gymId, staff.guildId);
  const moved = await ctx.gymAdmin.move(gymId, point, staff, asked);
  if (!moved) throw new UserError(GYM_GONE);
  if (moved.kind !== 'moved') {
    const gym = moved.kind === 'elsewhere' ? moved.gym : ctx.gyms.of(staff.guildId).get(gymId);
    if (!gym) throw new UserError(GYM_GONE);
    const since =
      moved.kind === 'elsewhere'
        ? 'The gym was moved since I asked, so nothing was moved yet.'
        : 'A gym was added at that place since I asked, so nothing was moved yet.';
    await answerGym(
      interaction,
      moveQuestion(
        interaction,
        ctx,
        gym,
        point,
        place.approximate,
        staff.guildId,
        questioned ? since : undefined,
      ),
    );
    return;
  }
  const { gym, from, metres } = moved;
  const shown = ctx.gymAdmin.shownBy(gymId, staff.guildId);
  const elsewhere = regionsBefore.join() !== regionsNow().join();
  await answerGym(
    interaction,
    await gymViewMessage(ctx, serverValuesOf(interaction, ctx).distanceUnits, staff, gym, [
      `Moved ${gymWithId(gym)} from ${pointLink(from)} to ${pointLink(point)} (${distanceWords(metres, serverValuesOf(interaction, ctx).distanceUnits)}).`,
      fetchNote(ctx),
      namesakeNote(ctx.gyms.of(staff.guildId), gym),
      ...(elsewhere
        ? shown.raids.map((raid) =>
            raid.forumPostId === null
              ? 'The raid at it stays where it was reported.'
              : `The raid at it stays in <#${raid.forumPostId}>.`,
          )
        : []),
      elsewhere && shown.trains.length > 0
        ? `It stays a stop of ${count(shown.trains.length, 'train')}.`
        : undefined,
      reportable && !ctx.gymAdmin.inRegionOf(gymId, staff.guildId)
        ? 'It now lies in no region of this server: raids cannot be reported there.'
        : undefined,
      raidOf(interaction, ctx) ? USE_LOCATION : undefined,
    ]),
  );
}

/**
 * "Move" / "Move anyway" under the question. Like Add, the move looks again (`moveAnswered`):
 * when a gym was put within ten metres of the new place since the question, or the gym itself
 * is no longer where the question said it was, the question is asked anew.
 */
export const moveAnswers: Readonly<Record<string, ButtonAnswer>> = {
  'move:move': async (interaction, ctx, request) => {
    if (request.what !== 'move') return;
    await moveAnswered(interaction, ctx, request.gymId, request, request, true);
  },
};

/**
 * `/gym move`: a gym gets another place (it was put down wrongly, or the game moved it). The
 * staff member is asked first when another gym lies within ten metres of the new place, when
 * the new place is more than 500 metres from the old one, or when it was read from the middle
 * of a map.
 */
export const moveGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('move')
      .setDescription('Move a gym to another place on the map'),
  ).addStringOption((option) =>
    option
      .setName('location')
      .setDescription(LOCATION_OPTION)
      .setRequired(true)
      .setMaxLength(1_000),
  ),
  help: {
    details: (_settings, facts) =>
      `${HOW_TO_LOCATE} The location is read as for ` +
      '`/gym add`.\n\nThe gym keeps its texts, its raids and its ' +
      'place on train routes; its address and the places around it are fetched again, and ' +
      'the regions it lies in follow its new place. I ask first when the new place is more ' +
      `than ${distanceWords(FAR_MOVE_METRES, facts?.server?.distanceUnits ?? 'imperial')} away or right beside another gym.\n\nThis corrects where a gym is: to ` +
      'move a raid to another gym, use `/location` in the raid’s post.',
    examples: ['/gym move gym:Big Fountain location:40.4406, -79.9959'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const gym = await chosenGym(interaction, ctx);
    const given = placeOrRefuse(
      await ctx.gymAdmin.readLocation(interaction.options.getString('location', true)),
    );
    await moveGymTo(interaction, ctx, gym, given);
  },
  autocomplete: respondWithGyms,
};

/**
 * Moves `gym` to a place a staff member gave, or asks first (`moveQuestion`): `/gym move`, and
 * the form of Move… of the view of `/gym show`. The interaction has been acknowledged.
 */
export async function moveGymTo(
  interaction: MoveInteraction,
  ctx: AppContext,
  gym: Gym,
  { point, approximate }: GivenPlace,
): Promise<void> {
  const { guildId } = await staffPlace(interaction, ctx);
  const near = ctx.gymAdmin.near(point, guildId, gym.id);
  const far = metresBetween(gym, point) > FAR_MOVE_METRES;
  if (near.length === 0 && !far && !approximate) {
    // Nothing to ask about as things are now; should that change before the move has its
    // turn, the question is asked after all.
    const asked = { from: { lat: gym.lat, lon: gym.lon }, nearIds: [] };
    await moveAnswered(interaction, ctx, gym.id, { point, approximate }, asked, false);
    return;
  }
  await answerGym(interaction, moveQuestion(interaction, ctx, gym, point, approximate, guildId));
}
