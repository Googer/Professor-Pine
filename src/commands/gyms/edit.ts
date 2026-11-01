import { namesakeNote } from './duplicates.js';
import {
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { answerApart, showInPlace, v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import {
  changedGymTexts,
  GYM_TEXT_FIELDS,
  gymFormTexts,
  type GymTextField,
} from '../../domain/gyms/gym-text.js';
import { gymWithId } from '../../render/gym-view.js';
import { gymForm, sentForm } from './form.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import {
  answerForm,
  content,
  EXPIRED,
  GYM_GONE,
  gymQuestion,
  gymViewMessage,
  markAnswered,
  nameNote,
  pendingGyms,
  refuseForm,
  staffPlace,
  textRefusal,
  type FormAnswer,
  type FormOpener,
  type PendingGym,
} from './shared.js';

type PendingEdit = Extract<PendingGym, { what: 'edit' }>;

/** "the name", "the name and the notice", "the name, the notice and the keywords". */
function fieldList(fields: readonly GymTextField[]): string {
  const words = fields.map((field) => `the ${field}`);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/**
 * What staff are told about texts the form could not show: a text longer than its field would
 * come back cut and be saved cut, so it was left out and is as it was. Undefined when the form
 * had every field.
 */
function tooLongNote(fields: readonly GymTextField[]): string | undefined {
  if (fields.length === 0) return undefined;
  // "The keywords are", "The name and the notice are", "The notice is".
  const several = fields.length > 1 || fields[0] === 'keywords';
  const [is, it] = several ? ['are', 'them'] : ['is', 'it'];
  return (
    `${fieldList(fields).replace(/^t/, 'T')} of this gym ${is} too long for the form and ${is} ` +
    `unchanged. An admin has to shorten ${it} in the database first.`
  );
}

/** The fields the form of an edit has: those it could show when it was first opened. */
function formFields(request: PendingEdit): GymTextField[] {
  return GYM_TEXT_FIELDS.filter((field) => Object.hasOwn(request.shown, field));
}

/** The form of an edit: filled with the gym's texts, or with what was typed when it is opened again. */
function editForm(token: string, request: PendingEdit, name: string) {
  return gymForm({
    token,
    action: 'edit',
    title: `Edit ${name}`,
    fields: formFields(request),
    texts: request.shown,
    typed: request.typed,
  });
}

/**
 * `/gym edit`: the texts of a gym in one form, filled with what they are. Only what the staff
 * member changes is written, so two people who each change another field do not undo each
 * other. It opens at once, without a deferral: the gym comes from memory.
 */
export const editGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('edit')
      .setDescription('Change the name, nickname, description, notice and keywords of a gym'),
  ),
  help: {
    details:
      'A form opens with the texts as they are: change what you want and send it. A nickname, ' +
      'description or notice that you empty is removed; the keywords you leave are the ' +
      'keywords it has. Only the fields you changed are written.\n\nThe notice is shown in ' +
      'every raid post at the gym. To move a gym use `/gym move`, to mark it as an elite raid ' +
      'gym `/gym elite`.',
    examples: ['/gym edit gym:Big Fountain'],
  },
  async execute(interaction, ctx) {
    await openEditForm(interaction, ctx, await chosenGym(interaction, ctx), false);
  },
  autocomplete: respondWithGyms,
};

/**
 * Opens the form of an edit of `gym`, filled with its texts: for `/gym edit`, and for Edit… of
 * the view of `/gym show` (`fromView`: its answer is a message of its own, and the view stays).
 */
export async function openEditForm(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
  gym: Gym,
  fromView: boolean,
): Promise<void> {
  const { shown, tooLong } = gymFormTexts(gym);
  if (tooLong.length > 0) {
    ctx.log.warn(
      { gym: gym.id, fields: tooLong },
      'texts of a gym are too long for the form of /gym edit',
    );
  }
  const request: PendingEdit = {
    what: 'edit',
    gymId: gym.id,
    shown,
    tooLong,
    ...(fromView ? { fromView } : {}),
  };
  if (formFields(request).length === 0) throw new UserError(tooLongNote(tooLong) ?? EXPIRED);
  const token = pendingGyms.put(interaction.user.id, request);
  await interaction.showModal(editForm(token, request, gym.name));
}

/** "Open the form again", under a form that was refused: the form with what was typed. */
export const editOpeners: Readonly<Record<string, FormOpener>> = {
  'edit:reopen': (token, request) =>
    request.what === 'edit' ? editForm(token, request, request.shown.name ?? 'gym') : undefined,
};

/**
 * The form of `/gym edit` was sent. What differs from what the form was first filled with is
 * checked and written; nothing else is touched. A refusal keeps what was typed and offers the
 * form again. The first form comes from the command and gets a message of its own; one that was
 * opened again is answered in the place of the refusal it was opened from.
 */
export const editForms: Readonly<Record<string, FormAnswer>> = {
  'edit:edit': async (interaction, ctx, token, request) => {
    if (request.what !== 'edit') return;
    const { typed, texts: sent } = sentForm(interaction, formFields(request));
    const changed = changedGymTexts(request.shown, sent);
    const refusal = textRefusal(changed);
    // A form that was opened again from the refusal of an earlier one is answered in the place
    // of that refusal: its button must not stay under an edit that is done. One that the
    // command or "Edit…" of `/gym show` opened gets a message of its own (the view stays).
    const again = interaction.isFromMessage() && request.fromView !== true;
    if (refusal !== undefined) {
      request.typed = typed;
      // The next form comes from the refusal, which it is then answered in the place of.
      request.fromView = undefined;
      await refuseForm(interaction, token, refusal, !again);
      return;
    }
    if (pendingGyms.take(token, interaction.user.id) === 'expired') throw new UserError(EXPIRED);
    markAnswered(token);
    const names = GYM_TEXT_FIELDS.filter((field) => Object.hasOwn(changed, field));
    const note = tooLongNote(request.tooLong);
    if (names.length === 0) {
      const nothing = gymQuestion([content(['Nothing was changed.', note])]);
      if (again) await showInPlace(interaction, nothing);
      else
        await interaction.reply({
          ...v2Answer(nothing),
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        });
      return;
    }
    if (again) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    /** The answer: in the place of a refusal, or the private answer just deferred. */
    const show = (message: V2Message): Promise<unknown> =>
      again ? showInPlace(interaction, message) : answerApart(interaction, message);
    await answerForm(interaction, async () => {
      const place = await staffPlace(interaction, ctx);
      // The form may have been open for hours: a gym that has come to lie only in another
      // server's regions meanwhile is no longer this server's to change.
      if (!ctx.gymAdmin.mayTouch(request.gymId, place.guildId)) throw new UserError(GYM_GONE);
      const gym = await ctx.gymAdmin.edit(request.gymId, changed, place.staffId);
      if (!gym) throw new UserError(GYM_GONE);
      // Said when the name was just made so, or while nothing else finds the gym either: not
      // again with every later change of a gym that has a nickname or keywords.
      const findable = gym.nickname !== null || gym.keywords.length > 0;
      await show(
        await gymViewMessage(ctx, place, gym, [
          `Changed ${fieldList(names)} of ${gymWithId(gym)}.`,
          note,
          names.includes('name') || !findable ? nameNote(ctx, gym) : undefined,
          names.includes('name') || names.includes('nickname') ? namesakeNote(ctx, gym) : undefined,
        ]),
      );
    });
  },
};
