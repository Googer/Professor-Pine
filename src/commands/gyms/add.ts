import { namesakeNote } from './duplicates.js';
import {
  ButtonStyle,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { GYM_TEXT_LIMITS, tidyLine, type GymTexts } from '../../domain/gyms/gym-text.js';
import { gymLabel, gymWithId, regionsSentence } from '../../render/gym-view.js';
import { gymForm, sentForm } from './form.js';
import {
  answerForm,
  answerGym,
  APPROXIMATE,
  assertGymTexts,
  button,
  content,
  HOW_TO_LOCATE,
  LOCATION_OPTION,
  EXPIRED,
  fetchNote,
  foreignPlace,
  gymQuestion,
  gymViewMessage,
  markAnswered,
  nameNote,
  nearLines,
  pendingGyms,
  placeOrRefuse,
  pointLink,
  refuseForm,
  staffPlace,
  textRefusal,
  type ButtonAnswer,
  type FormAnswer,
  type FormOpener,
  type GivenPlace,
  type PendingGym,
  type TypedTexts,
} from './shared.js';

type PendingAdd = Extract<PendingGym, { what: 'add' }>;

const FOREIGN_PLACE = foreignPlace('add a gym');

/** The fields of the form behind "Add with details…": everything but the name, which is given. */
const DETAIL_FIELDS = ['nickname', 'description', 'notice', 'keywords'] as const;

/**
 * The question of `/gym add`: what was understood (the name, the place as a link, the regions
 * of this server it lies in), that the place is only the middle of a map when it is, and, when
 * other gyms lie within ten metres, which. It is kept as a pending request of the staff member;
 * the buttons carry its token. `before` is a line above the question, for one that is asked a
 * second time; `typed` is what the form for the details was sent with then, so that "Add with
 * details…" opens with it.
 */
function addQuestion(
  ctx: AppContext,
  userId: string,
  guildId: number | undefined,
  name: string,
  place: GivenPlace,
  before?: string,
  typed?: TypedTexts,
) {
  const { point, approximate } = place;
  const near = ctx.gymAdmin.near(point);
  const regions = ctx.gymAdmin.regionsAt(point, guildId);
  const token = pendingGyms.put(userId, {
    what: 'add',
    name,
    point,
    approximate,
    nearIds: near.map(({ gym }) => gym.id),
    typed,
  });
  return gymQuestion(
    [
      content([
        before,
        `Add **${gymLabel({ name })}** at ${pointLink(point)}?`,
        approximate ? APPROXIMATE : undefined,
        regionsSentence(regions).replace(/^It lies/, 'It would lie'),
        ...nearLines(near, ctx.config.settings.distanceUnits),
      ]),
    ],
    [
      button(token, 'add', near.length === 0 ? 'Add' : 'Add anyway', ButtonStyle.Primary),
      button(token, 'details', 'Add with details…', ButtonStyle.Secondary),
      button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
    ],
  );
}

/**
 * Adds the gym of a question that was answered with Add, or with the form (`details`), and
 * shows it in the place of the question. The interaction has been acknowledged: storing the
 * gym and settling its neighbours can take more than a moment.
 */
async function addAnswered(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  ctx: AppContext,
  request: PendingAdd,
  details: Partial<GymTexts> = {},
  typed?: TypedTexts,
): Promise<void> {
  const place = await staffPlace(interaction, ctx);
  // The question may be minutes old, and somebody else may press Add for the same place in
  // this moment: the service looks for a gym the question did not name, under its lock.
  const outcome = await ctx.gymAdmin.add(
    {
      name: request.name,
      lat: request.point.lat,
      lon: request.point.lon,
      nickname: details.nickname ?? null,
      description: details.description ?? null,
      notice: details.notice ?? null,
      keywords: details.keywords ?? [],
    },
    place,
    request.nearIds,
  );
  if (outcome.kind === 'foreign') throw new UserError(FOREIGN_PLACE);
  if (outcome.kind === 'near') {
    await answerGym(
      interaction,
      addQuestion(
        ctx,
        interaction.user.id,
        place.guildId,
        request.name,
        request,
        'A gym was added at that place since I asked, so nothing was added yet.',
        // The details are not lost with the question: its form opens with them.
        typed ?? request.typed,
      ),
    );
    return;
  }
  const { gym } = outcome;
  await answerGym(
    interaction,
    await gymViewMessage(ctx, place, gym, [
      `Added ${gymWithId(gym)}.`,
      fetchNote(ctx),
      nameNote(ctx, gym),
      namesakeNote(ctx, gym),
    ]),
  );
}

/** The form behind "Add with details…", filled with what was typed when it is opened again. */
function detailsForm(token: string, request: PendingAdd) {
  return gymForm({
    token,
    action: 'form',
    title: `Add ${request.name}`,
    fields: DETAIL_FIELDS,
    texts: {},
    typed: request.typed,
  });
}

const openDetails: FormOpener = (token, request) =>
  request.what === 'add' ? detailsForm(token, request) : undefined;

/** The buttons of the question of `/gym add` that open its form, also again after a refusal. */
export const addOpeners: Readonly<Record<string, FormOpener>> = {
  'add:details': openDetails,
  'add:reopen': openDetails,
};

/** The Add button of the question. */
export const addAnswers: Readonly<Record<string, ButtonAnswer>> = {
  'add:add': async (interaction, ctx, request) => {
    if (request.what === 'add') await addAnswered(interaction, ctx, request);
  },
};

/**
 * The form behind "Add with details…" was sent. Its texts are checked first: a refusal leaves
 * the question to answer, keeps what was typed and offers the form again.
 */
export const addForms: Readonly<Record<string, FormAnswer>> = {
  'add:form': async (interaction, ctx, token, request) => {
    if (request.what !== 'add') return;
    const { typed, texts: details } = sentForm(interaction, DETAIL_FIELDS);
    const refusal = textRefusal(details);
    if (refusal !== undefined) {
      request.typed = typed;
      await refuseForm(interaction, token, refusal);
      return;
    }
    // Answered once: the Add button under the question no longer works either.
    if (pendingGyms.take(token, interaction.user.id) === 'expired') throw new UserError(EXPIRED);
    markAnswered(token);
    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await answerForm(interaction, () => addAnswered(interaction, ctx, request, details, typed));
  },
};

/**
 * `/gym add`: a new gym, by its place and its name. The place is read (a short link is
 * followed), then the staff member is asked with what was understood; nothing is stored before
 * they press Add.
 */
export const addGym: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Add a gym to the gym list')
    .addStringOption((option) =>
      option
        .setName('location')
        .setDescription(LOCATION_OPTION)
        .setRequired(true)
        .setMaxLength(1_000),
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The name of the gym, as in the game')
        .setRequired(true)
        .setMaxLength(GYM_TEXT_LIMITS.name),
    ),
  help: {
    details:
      `${HOW_TO_LOCATE} A link to the place from Google Maps (also the short link its app ` +
      'shares), Apple Maps or the Ingress intel map is read as well.\n\nI show ' +
      'what I understood and ask before anything is stored; "Add with details…" opens a form ' +
      'for a nickname, a description, a notice and keywords.\n\nA gym may lie outside every ' +
      'region. Its address and the places around it are fetched from Google afterwards.',
    examples: [
      '/gym add location:https://maps.google.com/?q=40.4406,-79.9959… name:Big Fountain',
      '/gym add location:40.4406, -79.9959 name:Big Fountain',
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const name = tidyLine(interaction.options.getString('name', true));
    assertGymTexts({ name });
    const place = placeOrRefuse(
      await ctx.gymAdmin.readLocation(interaction.options.getString('location', true)),
    );
    const { guildId } = await staffPlace(interaction, ctx);
    // Refused before anything is asked; the service decides again when Add is pressed.
    if (!ctx.gymAdmin.mayPlace(place.point, guildId)) throw new UserError(FOREIGN_PLACE);
    await answerGym(interaction, addQuestion(ctx, interaction.user.id, guildId, name, place));
  },
};
