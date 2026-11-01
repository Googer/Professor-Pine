import {
  SlashCommandSubcommandBuilder,
  type APIModalInteractionResponseCallbackData,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Region } from '../../db/repositories/region-repository.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import {
  channelInDialog,
  deferSubmit,
  dialog,
  openToken,
  pickedOf,
  readInTime,
  withoutOpenToken,
} from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { answerApart } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { partyWord } from '../../domain/party/party.js';
import type { ServerChannel } from '../../domain/regions/region-import.js';
import { count } from '../../render/text.js';
import type { RemovalOutcome } from '../../services/region-admin-service.js';
import { chosenRegion, respondWithRegions, withRegionOption } from './region-option.js';
import {
  content,
  regionQuestion,
  REGION_GONE,
  REGION_KIND,
  REHEARSAL_CHANNELS,
  regionInSentence,
  regionStaff,
  selfRoleReminder,
} from './shared.js';

const parties = (n: number): string =>
  count(
    n,
    'active raid, max battle, train or meetup',
    'active raids, max battles, trains and meetups',
  );

/** "1 of its raids, max battles, trains and meetups was", "2 of … were". */
const ofIts = (n: number): string =>
  `${n} of its raids, max battles, trains and meetups ${n === 1 ? 'was' : 'were'}`;

/**
 * What goes with a region, as lines; `tense` words them for the question or for the answer.
 * Also the region editor's (plan 8M-2).
 */
export function goesWith(
  counted: { parties: number; strandedGyms: number; routes: number },
  tense: 'will' | 'did',
): string[] {
  const will = tense === 'will';
  return [
    ...(counted.parties > 0
      ? [
          `- ${parties(counted.parties)} ` +
            `${will ? 'will be' : counted.parties === 1 ? 'was' : 'were'} ended; ` +
            `${counted.parties === 1 ? 'its post says' : 'their posts say'} why`,
        ]
      : []),
    ...(counted.strandedGyms > 0
      ? [
          `- ${count(counted.strandedGyms, 'gym')} ${will ? 'will lie' : 'now lie'} in no ` +
            'region of this server: no raid can be reported there until a region covers ' +
            `${counted.strandedGyms === 1 ? 'it' : 'them'}`,
        ]
      : []),
    ...(counted.routes > 0
      ? [
          `- ${count(counted.routes, 'saved route')} of members ` +
            `${will ? 'will go' : 'went'} with it`,
        ]
      : []),
  ];
}

/** The action of the dialog of `/region remove`: `region:<region id>:remove[:keep]`. */
export const REMOVE_FORM = 'remove';

/** The custom id of the radio group of that dialog: `keep` or `delete` the forum. */
export const FORUM_INPUT = 'forum';

/** A region as a dialog names it: `the region #west`, or of the deleted channel `1234`. */
function regionInDialog(region: Region, channels: readonly ServerChannel[]): string {
  const channel = channels.find((one) => one.id === region.channelId);
  return channel
    ? `the region ${channelInDialog(channel.name)}`
    : `the region of the deleted channel ${region.channelId}`;
}

/**
 * The dialog of `/region remove` (plan 8Q), titled `Remove a region`: what goes with the region,
 * counted, the text channel's line, and the forum's: with a forum the staff member may delete,
 * the required radio group `Its forum` with nothing picked (Keep it as history, Delete it); with
 * one they may not (no Manage Channels, or rehearsal mode), no choice and the line that says it
 * stays and why; without one, that line; then `Submit removes it.`. Channels are named, not
 * mentioned (`channelInDialog`). Its custom id is `region:<region id>:remove`, or
 * `region:<region id>:remove:keep` where only keeping is possible: nothing is kept in memory.
 */
async function removalDialog(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<APIModalInteractionResponseCallbackData> {
  const staff = await regionStaff(interaction, ctx);
  const region = chosenRegion(interaction, ctx, staff);
  const question = region && (await ctx.regionAdmin.removalQuestion(region.id, staff));
  if (!question) throw new UserError(REGION_GONE);
  const channels = ctx.regionAdmin.channelsOf(staff);
  const going = goesWith(question, 'will');
  const forumId = question.region.forumChannelId;
  const hasForum = question.forum === 'there' && forumId !== null;
  const forum = channelInDialog(channels.find((one) => one.id === forumId)?.name);
  // Deleting a channel through the bot takes what deleting it by hand takes; in rehearsal mode
  // the bot deletes no channel at all.
  const mayDelete = hasForum && staff.mayManageChannels && !ctx.rehearsal;
  const stays = `Its forum ${forum} stays as history (its posts are archived and locked): `;
  const forumLine = mayDelete
    ? `Its forum ${forum} can stay as history or be deleted, as you pick below.`
    : hasForum
      ? stays +
        (staff.mayManageChannels
          ? 'rehearsal mode is on, and I delete no channel now.'
          : 'deleting it takes the Manage Channels permission, which you lack.')
      : question.forum === 'gone'
        ? 'Its forum is gone already.'
        : 'It has no forum.';
  const id = String(question.region.id);
  return dialog({
    customId: encodeCustomId({
      kind: REGION_KIND,
      id,
      action: REMOVE_FORM,
      args: [...(mayDelete ? [] : ['keep']), openToken(Date.now())],
    }),
    title: 'Remove a region',
    text: [
      `Remove ${regionInDialog(question.region, channels)}? This cannot be undone.`,
      ...(going.length === 0 ? ['Nothing goes with it.'] : going),
      question.channel === 'there'
        ? 'Its text channel stays as it is, and no gym is deleted.'
        : 'No gym is deleted.',
      forumLine,
      '',
      'Submit removes it.',
    ].join('\n'),
    ...(mayDelete
      ? {
          choice: {
            id: FORUM_INPUT,
            label: 'Its forum',
            options: [
              {
                value: 'keep',
                label: 'Keep it as history',
                description: 'Its posts are archived and locked.',
              },
              {
                value: 'delete',
                label: 'Delete it',
                description: 'Deletes every post in it for good.',
              },
            ],
          },
        }
      : {}),
  });
}

/**
 * `/region remove`: takes a region off the server, explicitly (a region is never removed by
 * itself). The staff member is asked first in a dialog (`removalDialog`), with what the removal
 * does, counted (read within `DIALOG_READ_MS`), and what becomes of the region's forum is theirs
 * to choose. The dialog is the first answer: no `defer`.
 */
export const removeRegion: SubcommandPart = {
  data: withRegionOption(
    new SlashCommandSubcommandBuilder()
      .setName('remove')
      .setDescription('Remove a region, with what goes with it'),
    'The region: pick it from the list, or name its channel',
    true,
  ),
  help: {
    details:
      'For a region that is given up, or whose channel was deleted.\n\nI ask first, in a dialog, ' +
      'and say what goes with it: its active raids, max battles, trains and meetups are ended (their posts ' +
      'say why), the routes members saved for it are deleted, and its gyms lie in no region of ' +
      'this server afterwards (they are never deleted).\n\nIts text channel is not touched. You ' +
      'choose what becomes of its forum: it can stay as history, with its posts archived and ' +
      'locked, or be deleted with every post in it (if you may manage channels).\n\nA region is ' +
      'never removed by itself, also not when its channel is gone: `/region list` shows ' +
      'such a region as a deleted channel, and it can be picked here.',
    examples: ['/region remove region:#north-hills'],
  },
  async execute(interaction, ctx) {
    await interaction.showModal(
      await readInTime(ctx.log, interaction, () => removalDialog(interaction, ctx)),
    );
  },
  autocomplete: respondWithRegions,
};

/** What a removal did, as lines; also the region editor's (plan 8M-2). */
export function outcomeLines(
  outcome: Exclude<RemovalOutcome, { kind: 'gone' }>,
  label: string,
  reminder: string | undefined,
): string[] {
  if (outcome.kind === 'stuck') {
    const post = outcome.party.forumPostId;
    const which =
      post === null ? `a ${partyWord(outcome.party)} that has no post yet` : `<#${post}>`;
    return [
      `I could not end ${which}, so the region was not removed. Try again in a moment; the ` +
        'log says what failed.',
      ...(outcome.ended > 0 ? [`${ofIts(outcome.ended)} ended already.`] : []),
    ];
  }
  if (outcome.kind === 'failed') {
    return [
      'I could not remove the region, and it is still there (the log says what failed). Try ' +
        'again in a moment.',
      ...(outcome.ended > 0 ? [`${ofIts(outcome.ended)} ended before that.`] : []),
    ];
  }
  // The forum of the row as it was deleted: what the service decided about.
  const forumId = outcome.forumChannelId;
  const forumName = forumId === null ? 'its forum' : `its forum <#${forumId}>`;
  const forum: Readonly<Record<typeof outcome.forum, string | undefined>> = {
    none: undefined,
    gone: undefined,
    kept: forumId === null ? undefined : `Its forum <#${forumId}> stays as history.`,
    deleted: 'Its forum was deleted, with every post in it.',
    'not-deleted':
      `I could not delete ${forumName}` +
      (outcome.forumDenied === true ? ' (I need Manage Channels there)' : ' (the log says why)') +
      ': delete it by hand. The region is gone all the same.',
  };
  return [
    `Removed ${label}.`,
    ...(outcome.reloaded
      ? []
      : [
          'The region is removed, but I could not load the regions again: members see the ' +
            'change after the next restart.',
        ]),
    ...goesWith({ ...outcome, parties: outcome.ended }, 'did'),
    forum[outcome.forum],
    reminder,
  ].filter((line): line is string => line !== undefined);
}

/**
 * The Submit of the dialog of `/region remove` (`region:<region id>:remove[:keep]:~<token>`): acknowledged
 * privately, then everything is decided again now (the dialog may be minutes old), by the
 * service, and what the answer counts is what really went. Deleting the forum is refused in
 * rehearsal mode and to a staff member without Manage Channels (lost since the dialog opened),
 * and nothing is removed then. The answer is a private message of its own.
 */
export async function submitRemoval(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  id: CustomId,
): Promise<void> {
  const regionId = /^\d{1,9}$/.test(id.id) ? Number(id.id) : undefined;
  const [fixed] = withoutOpenToken(id.args);
  const forum =
    fixed === undefined
      ? pickedOf(interaction, FORUM_INPUT, ['keep', 'delete'] as const)
      : fixed === 'keep'
        ? 'keep'
        : undefined;
  if (regionId === undefined || forum === undefined) throw new UserError(STALE_COMPONENT);
  await deferSubmit(interaction);
  if (forum === 'delete' && ctx.rehearsal) throw new UserError(REHEARSAL_CHANNELS);
  const staff = await regionStaff(interaction, ctx);
  if (forum === 'delete' && !staff.mayManageChannels) {
    throw new UserError(
      'Deleting the forum of a region takes the Manage Channels permission, which you lack. ' +
        'Nothing was removed.',
    );
  }
  const before = ctx.regionAdmin.regionOf(regionId, staff.guildId);
  // Named by what the server has before the removal: the channel does not go with it.
  const label = before
    ? regionInSentence(before, ctx.regionAdmin.channelsOf(staff))
    : 'that region';
  const outcome = await ctx.regionAdmin.remove(regionId, staff, forum);
  const lines =
    outcome.kind === 'gone'
      ? [REGION_GONE]
      : outcomeLines(outcome, label, selfRoleReminder(ctx, 'removed'));
  await answerApart(interaction, regionQuestion([content(lines)]));
}
