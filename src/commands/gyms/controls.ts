import type { ComponentHandler } from '../../discord/command.js';
import type { CustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { requireBotManagement } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { addAnswers, addForms, addOpeners } from './add.js';
import { editForms, editOpeners } from './edit.js';
import { importButton, isImportAction } from './import.js';
import { moveAnswers } from './move.js';
import {
  EXPIRED,
  GYM_KIND,
  markAnswered,
  NOT_YOURS,
  pendingGyms,
  sayGym,
  wasAnswered,
  type ButtonAnswer,
  type FormAnswer,
  type FormOpener,
  type PendingGym,
} from './shared.js';

/** What a question says once it was answered with Cancel. */
const CANCELLED: Readonly<Record<PendingGym['what'], string>> = {
  add: 'Nothing was added.',
  edit: 'Nothing was changed.',
  move: 'The gym stays where it is.',
};

/**
 * What the controls of `/gym` do, by what their request is about and their action
 * (`add:add`, `edit:reopen`); each subcommand brings its own. A button either answers its
 * question (`ANSWERS`: the request is taken, the question is answered once) or opens a form
 * (`OPENERS`: the request stays); a form that was sent is answered by `FORMS`.
 */
const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...addAnswers, ...moveAnswers };
const OPENERS: Readonly<Record<string, FormOpener>> = { ...addOpeners, ...editOpeners };
const FORMS: Readonly<Record<string, FormAnswer>> = { ...addForms, ...editForms };
/** The actions that open a form, whatever the request is about. */
const OPENING: ReadonlySet<string> = new Set(
  Object.keys(OPENERS).map((key) => key.split(':')[1] ?? ''),
);

/** The request of a control, for the member who made it; refused for anybody else. */
function requestOf(id: CustomId, userId: string, how: 'take' | 'peek'): PendingGym | undefined {
  const found = how === 'take' ? pendingGyms.take(id.id, userId) : pendingGyms.peek(id.id, userId);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  return found === 'expired' ? undefined : found.value;
}

/**
 * The buttons and forms of `/gym` (custom-id kind `gym`): each belongs to a pending request of
 * the staff member who used the command, by the token in its custom id, and nobody else may
 * answer it. The guard of `/gym` applies here as well: a control can be pressed by whoever sees
 * it, and a custom id can be sent by anybody.
 *
 * A question is answered once. A second press on it (a double click) is only acknowledged, so
 * that it does not write over the answer of the first; a press on a question that is older than
 * the bot remembers says that it has expired.
 */
export const gymControls: ComponentHandler = {
  kind: GYM_KIND,
  guards: [requireBotManagement],

  async button(interaction, id, ctx) {
    // The preview of `/gym import` keeps its exports in a store of its own.
    if (isImportAction(id.action)) {
      await importButton(interaction, id, ctx);
      return;
    }
    // A button that only opens a form: the question stays, and so does its request.
    if (OPENING.has(id.action)) {
      const request = requestOf(id, interaction.user.id, 'peek');
      const form = request && OPENERS[`${request.what}:${id.action}`]?.(id.id, request);
      if (form) {
        await interaction.showModal(form);
        return;
      }
    }
    const request = requestOf(id, interaction.user.id, 'take');
    if (!request) {
      if (wasAnswered(id.id)) await interaction.deferUpdate();
      else await sayGym(interaction, EXPIRED);
      return;
    }
    markAnswered(id.id);
    if (id.action === 'cancel') {
      await sayGym(interaction, CANCELLED[request.what]);
      return;
    }
    const answer = ANSWERS[`${request.what}:${id.action}`];
    if (!answer) throw new UserError(STALE_COMPONENT);
    // The answer takes the place of the question, also when it is a refusal: buttons that no
    // longer do anything must not stay under it.
    await interaction.deferUpdate();
    try {
      await answer(interaction, ctx, request);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      await sayGym(interaction, err.message);
    }
  },

  async modal(interaction, id, ctx) {
    // Looked at, not taken: a form that is refused can be opened again with what was typed.
    const request = requestOf(id, interaction.user.id, 'peek');
    if (!request) throw new UserError(EXPIRED);
    const answer = FORMS[`${request.what}:${id.action}`];
    if (!answer) throw new UserError(STALE_COMPONENT);
    await answer(interaction, ctx, id.id, request);
  },
};
