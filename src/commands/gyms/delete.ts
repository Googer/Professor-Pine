import {
  SlashCommandSubcommandBuilder,
  type APIModalInteractionResponseCallbackData,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { answerApart } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import type { RaidParty } from '../../domain/party/party.js';
import { gymWithId } from '../../render/gym-view.js';
import { count } from '../../render/text.js';
import type { DeleteOutcome } from '../../services/gym-admin-service.js';
import { actingMember } from '../parties/reply.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { content, GYM_GONE, gymQuestion, staffPlace } from './shared.js';
import { GYM_VIEW_KIND } from './view-controls.js';

/** Why a gym with a raid stays, with the raid's post (also the answer of `/gym review`). */
export function raidThere(gym: string, raid: RaidParty, when: string): string {
  const post = raid.forumPostId === null ? '' : `: <#${raid.forumPostId}>`;
  return (
    `A raid ${when} at ${gym}${post}. A gym cannot be deleted while a raid is there: wait ` +
    'until the raid is over, or close it with `/delete` in its post.'
  );
}

/** What goes with a gym, as lines under `heading`; none when nothing does (also `/gym review`). */
export function goesWith(
  references: { trains: number; routes: number; targets: number },
  heading: string,
): string[] {
  const lines = [
    ...(references.trains > 0
      ? [`- its stop on the route of ${count(references.trains, 'active train')}`]
      : []),
    ...(references.routes > 0 ? [`- its stop on ${count(references.routes, 'saved route')}`] : []),
    ...(references.targets > 0
      ? [`- the gym target of ${count(references.targets, 'member')}`]
      : []),
  ];
  return lines.length === 0 ? [] : [heading, ...lines];
}

/**
 * What a deletion did, as lines: the gym, what went with it, and the trains that still have it
 * on their route because they could not be changed, each with its post (also the answer of
 * `/gym review`).
 */
export function deletedLines(outcome: Extract<DeleteOutcome, { kind: 'deleted' }>): string[] {
  return [
    `Deleted ${gymWithId(outcome.gym)}.`,
    ...goesWith(outcome, 'With it went:'),
    ...outcome.unmended.map((train) =>
      train.forumPostId === null
        ? 'I could not take it off the route of a train that has no post yet.'
        : `I could not take it off the route of <#${train.forumPostId}>: use ` +
          '`/route remove` in its post.',
    ),
  ];
}

/**
 * `/gym delete`: takes a gym out of the gym list, with what refers to it. Refused while an
 * active raid is there; otherwise the staff member is asked in a dialog (plan 8Q,
 * `deleteDialog`), with what goes with the gym. The dialog is the first answer: no `defer`.
 */
export const deleteGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('delete')
      .setDescription('Delete a gym from the gym list, with what refers to it'),
  ),
  help: {
    details:
      'For a gym that no longer exists in the game. I ask first, in a dialog, and say what ' +
      'goes with it: it is taken off the route of every active train (the train’s post says ' +
      'why) and off every saved route, and members who have it as a gym target lose that ' +
      'target.\n\nIt cannot be deleted while a raid is there. A gym that was only put down ' +
      'wrongly is moved with `/gym move` instead.',
    examples: ['/gym delete gym:Big Fountain'],
  },
  async execute(interaction, ctx) {
    const dialog = await readInTime(ctx.log, interaction, async () =>
      deleteDialog(ctx, await chosenGym(interaction, ctx)),
    );
    await interaction.showModal(dialog);
  },
  autocomplete: respondWithGyms,
};

/** The action of Delete… of a gym view, and of the dialog both open: `gymview:<gym id>:delete`. */
export const DELETE_ACTION = 'delete';

/**
 * The dialog of `/gym delete` (also of Delete… of the view of `/gym show`), titled `Delete a
 * gym`, with what goes with the gym and `Submit deletes it.`; refused while a raid is there. Its
 * custom id is `gymview:<gym id>:delete`: nothing is kept in memory, and its Submit
 * (`deleteGymNow`) decides everything again.
 */
export async function deleteDialog(
  ctx: AppContext,
  gym: Gym,
): Promise<APIModalInteractionResponseCallbackData> {
  const references = await ctx.gymAdmin.references(gym.id);
  const [raid] = references.raids;
  if (raid) throw new UserError(raidThere(gymWithId(gym), raid, 'is'));
  const going = goesWith(references, 'With it go:');
  return dialog({
    customId: encodeCustomId({ kind: GYM_VIEW_KIND, id: String(gym.id), action: DELETE_ACTION }),
    title: 'Delete a gym',
    text: [
      `Delete ${gymWithId(gym)}? This cannot be undone.`,
      ...(going.length === 0 ? ['Nothing refers to it.'] : going),
      '',
      'Submit deletes it.',
    ].join('\n'),
  });
}

/**
 * The Submit of the dialog of a gym's deletion: acknowledged privately, then everything is
 * decided again now (the dialog may be minutes old), by the service, and what the answer counts
 * is what really went. A gym that is gone, or lies only in another server's regions, is `That
 * gym no longer exists.`; a train that still has the gym on its route, because it could not be
 * changed, is named with its post. The answer is a private message of its own.
 */
export async function deleteGymNow(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  id: string,
): Promise<void> {
  const gymId = /^\d{1,9}$/.test(id) ? Number(id) : undefined;
  if (gymId === undefined) throw new UserError(STALE_COMPONENT);
  await deferSubmit(interaction);
  const before = ctx.gyms.get(gymId);
  const place = await staffPlace(interaction, ctx);
  const outcome = await ctx.gymAdmin.delete(gymId, actingMember(interaction), place);
  let lines: string[];
  switch (outcome.kind) {
    case 'gone':
    case 'withdrawn':
      lines = [GYM_GONE];
      break;
    case 'raid-there':
      lines = [raidThere(before ? gymWithId(before) : 'that gym', outcome.raid, 'was reported')];
      break;
    case 'failed':
      lines = ['I could not delete the gym, and nothing was changed. Try again in a moment.'];
      break;
    case 'deleted':
      lines = deletedLines(outcome);
      break;
  }
  await answerApart(interaction, gymQuestion([content(lines)]));
}
