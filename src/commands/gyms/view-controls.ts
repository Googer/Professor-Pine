import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  TextInputStyle,
  type APIButtonComponent,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { ComponentHandler, GuardableInteraction } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { requireBotManagement } from '../../discord/guards.js';
import { readInTime } from '../../discord/dialog.js';
import { showInPlace } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { tidyLine } from '../../domain/gyms/gym-text.js';
import { isEliteGym } from '../../domain/party/raid.js';
import { truncate } from '../../render/text.js';
import { DELETE_ACTION, deleteDialog, deleteGymNow } from './delete.js';
import { openEditForm } from './edit.js';
import { eliteLine } from './elite.js';
import { moveGymTo } from './move.js';
import { gymViewMessage, LOCATION_OPTION, placeOrRefuse, sayGym, staffPlace } from './shared.js';
import { serverValuesOf } from '../../discord/server-values.js';

/**
 * The custom-id kind of the buttons of the view of `/gym show` (documented in `custom-id.ts`):
 * `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0`, the form of Move…
 * `gymview:<gym id>:place`, and the dialog of a deletion (of Delete… and of `/gym delete`)
 * `gymview:<gym id>:delete`.
 * Nothing is kept in memory: the gym's number is in the custom id.
 */
export const GYM_VIEW_KIND = 'gymview';

/** What a press on the view of a gym that is gone (or another server's now) is told. */
export const VIEW_GONE = 'That gym is no longer in the gym list.';

/** The id of the one input of the form of Move…. */
const LOCATION_INPUT = 'location';

const viewButton = (
  gymId: number,
  action: string,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Danger,
  args: string[] = [],
): APIButtonComponent => ({
  type: ComponentType.Button,
  custom_id: encodeCustomId({ kind: GYM_VIEW_KIND, id: String(gymId), action, args }),
  label,
  style,
});

/**
 * The buttons of the view of `/gym show` beside its Map link (Matt, 2026-10-15): Edit…, Make
 * elite or Not elite, Move…, Delete…. Make elite carries what it sets (`elite:1`, Not elite
 * `elite:0`), so that a view drawn before somebody else changed the mark does what its label
 * says. Only on the answer of `/gym show`, never on the answer of a change.
 */
export function viewControls(
  gym: Pick<Gym, 'id' | 'taggedEx' | 'confirmedEx'>,
): APIButtonComponent[] {
  return [
    viewButton(gym.id, 'edit', 'Edit…', ButtonStyle.Secondary),
    isEliteGym(gym)
      ? viewButton(gym.id, 'elite', 'Not elite', ButtonStyle.Secondary, ['0'])
      : viewButton(gym.id, 'elite', 'Make elite', ButtonStyle.Secondary, ['1']),
    viewButton(gym.id, 'move', 'Move…', ButtonStyle.Secondary),
    viewButton(gym.id, 'delete', 'Delete…', ButtonStyle.Danger),
  ];
}

/**
 * The form of Move…: one input for the new place, read as `/gym move` reads its option. Its
 * title names the gym as text (a title shows no Markdown), tidied and cut to the 45 characters
 * of a title; a name that shows as nothing is the gym's number.
 */
export function moveForm(gym: {
  id: number;
  name: string;
}): APIModalInteractionResponseCallbackData {
  const name = tidyLine(gym.name);
  return {
    custom_id: encodeCustomId({ kind: GYM_VIEW_KIND, id: String(gym.id), action: 'place' }),
    title: `Move ${name === '' ? `gym #${gym.id}` : truncate(name, 38)}`,
    components: [
      {
        type: ComponentType.Label,
        label: 'The new place of the gym',
        description: LOCATION_OPTION,
        component: {
          type: ComponentType.TextInput,
          custom_id: LOCATION_INPUT,
          style: TextInputStyle.Short,
          required: true,
          max_length: 1_000,
        },
      },
    ],
  };
}

/**
 * The gym of a control's custom id, as the staff member may touch it: refused when it is gone,
 * or lies only in regions of another server now (for this server's staff it then does not
 * exist, as for the commands).
 */
async function viewedGym(
  interaction: GuardableInteraction,
  ctx: AppContext,
  id: string,
): Promise<Gym> {
  const gymId = Number(id);
  const gym = Number.isSafeInteger(gymId) ? ctx.gyms.get(gymId) : undefined;
  const { guildId } = await staffPlace(interaction, ctx);
  if (!gym || !ctx.gymAdmin.mayTouch(gym.id, guildId)) throw new UserError(VIEW_GONE);
  return gym;
}

/**
 * The buttons of the view of `/gym show` (kind `gymview`), with the guard of `/gym`: a control
 * can be pressed by whoever sees it, and a custom id can be sent by anybody. No throttle, as
 * `/gym` has none: they are staff's.
 *
 * Edit… opens the form of `/gym edit`, whose answer is a message of its own; Make elite / Not
 * elite changes the mark and shows the view anew in place, with what it did above it and the
 * buttons as they now are; Move… opens a form for the new place and answers, in a message of
 * its own, as `/gym move` does (the question, or the moved gym); Delete… opens the dialog of
 * `/gym delete` (plan 8Q), whose Submit (`gymview:<gym id>:delete`) answers in a message of its
 * own. The view itself stays.
 */
export const gymViewControls: ComponentHandler = {
  kind: GYM_VIEW_KIND,
  guards: [requireBotManagement],

  async button(interaction, id, ctx) {
    switch (id.action) {
      case 'edit':
        await openEditForm(interaction, ctx, await viewedGym(interaction, ctx, id.id), true);
        return;
      case 'move': {
        const gym = await viewedGym(interaction, ctx, id.id);
        await interaction.showModal(moveForm(gym));
        return;
      }
      case 'elite': {
        const before = await viewedGym(interaction, ctx, id.id);
        // What the label said when the view was drawn: not the opposite of the gym as it is.
        const eligible = id.args[0] === undefined ? !isEliteGym(before) : id.args[0] === '1';
        // Drawing the view anew asks for its map.
        await interaction.deferUpdate();
        const place = await staffPlace(interaction, ctx);
        const gym = await ctx.gymAdmin.setElite(before.id, eligible, place.staffId);
        if (!gym) {
          // Gone during the press: said in the place of the view, whose buttons lead nowhere.
          await sayGym(interaction, VIEW_GONE);
          return;
        }
        await showInPlace(
          interaction,
          await gymViewMessage(
            ctx,
            serverValuesOf(interaction, ctx).distanceUnits,
            place,
            gym,
            [eliteLine(isEliteGym(before), eligible, gym)],
            viewControls(gym),
          ),
        );
        return;
      }
      case DELETE_ACTION: {
        // The dialog of `/gym delete`, read in time; the view stays.
        const dialog = await readInTime(ctx.log, interaction, async () =>
          deleteDialog(ctx, await viewedGym(interaction, ctx, id.id)),
        );
        await interaction.showModal(dialog);
        return;
      }
      default:
        throw new UserError(STALE_COMPONENT);
    }
  },

  async modal(interaction, id, ctx) {
    // The dialog of a deletion (`/gym delete`, Delete…): its Submit deletes.
    if (id.action === DELETE_ACTION) return deleteGymNow(interaction, ctx, id.id);
    if (id.action !== 'place') throw new UserError(STALE_COMPONENT);
    const gym = await viewedGym(interaction, ctx, id.id);
    // Following a short link takes a moment; the answer is a message of its own.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const given = placeOrRefuse(
      await ctx.gymAdmin.readLocation(interaction.fields.getTextInputValue(LOCATION_INPUT)),
    );
    await moveGymTo(interaction, ctx, gym, given);
  },
};
