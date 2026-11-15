import type { ComponentHandler, Guard, LocatedInteraction } from '../../discord/command.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { requireBotManagement, requireServerAdmin } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { count } from '../../render/text.js';
import { importAnswers } from './import.js';
import { REMOVE_FORM, submitRemoval } from './remove.js';
import {
  EXPIRED,
  markAnswered,
  NOT_YOURS,
  pendingRegions,
  REGION_KIND,
  sayRegion,
  wasAnswered,
  type ButtonAnswer,
  type PendingRegion,
} from './shared.js';

/** What a question says once it was answered with Cancel. */
const CANCELLED: Readonly<Record<PendingRegion['what'], string>> = {
  import: 'Nothing was imported.',
};

/**
 * What a question says while its answer is being carried out, which may take a while (an
 * import creates channels and forums): the buttons go at once, so that nobody presses again.
 */
function working(request: PendingRegion): string {
  return `Importing ${count(request.imports.length, 'area')}… this message changes when it is done.`;
}

/**
 * What the buttons of `/region` do, by what their request is about and their action
 * (`import:import`); each subcommand brings its own.
 */
const ANSWERS: Readonly<Record<string, ButtonAnswer>> = { ...importAnswers };

/**
 * Whether an action of a `/region` custom id is one of the import's questions: its Cancel, or one
 * of its answers (`importAnswers`, `import:<action>`).
 */
function isImportAction(action: string): boolean {
  return action === 'cancel' || Object.hasOwn(importAnswers, `import:${action}`);
}

/** Whether a control of `/region` is a button of the import's questions: by its custom id. */
function isImportQuestion(interaction: LocatedInteraction): boolean {
  if (!interaction.isButton()) return false;
  const id = decodeCustomId(interaction.customId);
  return id !== undefined && isImportAction(id.action);
}

/**
 * The guard of the part a control or dialog of `/region` belongs to (plan 19C-2): the import's
 * questions admit whoever may set the server up (`requireServerAdmin`, as `/region import`);
 * everything else, the dialog of `/region remove` and whatever is added, its staff alone
 * (`requireBotManagement`; fix round 3, R2-3: staff is the default, as for the parts).
 */
const partsGuard: Guard = (interaction, ctx) =>
  isImportQuestion(interaction)
    ? requireServerAdmin(interaction, ctx)
    : requireBotManagement(interaction, ctx);

/**
 * The buttons of `/region` (custom-id kind `region`): each belongs to a pending request of the
 * staff member who used the command, by the token in its custom id, and nobody else may answer
 * it. The guard of `/region` applies here as well: a control can be pressed by whoever sees
 * it, and a custom id can be sent by anybody.
 *
 * A question is answered once. A second press on it (a double click) is only acknowledged, so
 * that it does not write over the answer of the first; a press on a question that is older
 * than the bot remembers says that it has expired. The answer takes the place of the question,
 * also when it is a refusal: buttons that no longer do anything must not stay under it. The
 * dialog of `/region remove` (plan 8Q) is no pending request: its Submit,
 * `region:<region id>:remove[:keep]`, carries the region (`submitRemoval`).
 */
export const regionControls: ComponentHandler = {
  kind: REGION_KIND,
  // The import's questions, also in a server in setup (plan 19C-2); nothing else of `/region`
  // (fix round 1, S8: not `/region remove`'s dialog; fix round 3, R2-3: nor whatever is added).
  worksInSetup: (id) => isImportAction(id.action),
  guards: [partsGuard],

  async button(interaction, id, ctx) {
    const found = pendingRegions.take(id.id, interaction);
    if (found === 'not-yours') throw new UserError(NOT_YOURS);
    if (found === 'expired') {
      if (wasAnswered(id.id)) await interaction.deferUpdate();
      else await sayRegion(interaction, EXPIRED);
      return;
    }
    const request = found.value;
    markAnswered(id.id);
    if (id.action === 'cancel') {
      await sayRegion(interaction, CANCELLED[request.what]);
      return;
    }
    const answer = ANSWERS[`${request.what}:${id.action}`];
    if (!answer) throw new UserError(STALE_COMPONENT);
    await sayRegion(interaction, working(request));
    try {
      await answer(interaction, ctx, request);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      await sayRegion(interaction, err.message);
    }
  },

  async modal(interaction, id, ctx) {
    if (id.action !== REMOVE_FORM) throw new UserError(STALE_COMPONENT);
    await submitRemoval(interaction, ctx, id);
  },
};
