import { stopsFrom } from '../../render/train-stops.js';
import {
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { deferSubmit, readInTime, withoutOpenToken } from '../../discord/dialog.js';
import type { ControlThrottle } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, notATrain } from '../../discord/guards.js';
import { commandRefusal, STALE_COMPONENT } from '../../discord/router.js';
import { waitText } from '../../discord/throttle.js';
import { MAX_OPEN_PARTIES } from '../../domain/party/open-parties.js';
import { isGroupId, isTrain, type GroupId, type TrainParty } from '../../domain/party/party.js';
import { RaidPrivacy } from '../../domain/party/status.js';
import { mayNotSplit, splittableGroups } from '../../domain/party/train.js';
import { SPLIT_GROUP_INPUT, splitChoice, splitDialog } from '../../render/train-split.js';
import {
  ACTION_THROTTLE,
  actingMember,
  commandParty,
  partyOver,
  respondWithGroupsOf,
  typedGroup,
} from '../parties/reply.js';
import { DISCORD_NAMES } from '../raids/report.js';
import { OPEN_PARTIES_FULL, openPartiesFull } from '../parties/open-parties.js';
import { TRAIN_COMMAND, TRAIN_THROTTLE } from './train.js';
import {
  GROUPS_CHANGED,
  SPLIT_FAILED,
  splitGroupAs,
  splitRefusal,
  splitRefusalFor,
} from './train-changes.js';

/*
 * Splitting a group off a train (plans 8T, 8T-H) on Discord: the post's "Split…" and
 * `/group split` open a dialog (`splitDialog`), whose Submit splits (`splitGroupAs`); Discord's
 * own Cancel closes it. The button and the dialog are the party's controls (`party:<id>:split`,
 * `party:<id>:splitform[:<group>:<mark>]`), with the party controls' guards and
 * `ACTION_THROTTLE`: opening counts as a press, and so does a Submit.
 */

const A_TRAIN = { type: 'train' } as const;

/**
 * `/train`'s window, in which a split made counts (plan 8Z, for staff too: a split makes a train).
 * The press and the command that open the dialog only ask it, and its Submit counts.
 */
export const SPLIT_WINDOW: ControlThrottle = { ...TRAIN_THROTTLE, as: TRAIN_COMMAND };

/**
 * Refuses a dialog of the split past the cap of open trains and meetups (`openPartiesFull`, read
 * within `DIALOG_READ_MS`), which the Submit asks again.
 */
async function requireRoomForSplit(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  ctx: AppContext,
  staff: boolean,
): Promise<void> {
  const full = await readInTime(ctx.log, interaction, () =>
    openPartiesFull(ctx, guildIdOf(interaction), interaction.user.id, staff),
  );
  if (full) throw new UserError(OPEN_PARTIES_FULL);
}

/**
 * The dialog for this member, of these groups, as things stand now; who leads the new train as
 * their privacy says (the privacy of `/settings`, as the split itself reads it; the Submit reads it
 * anew, so a privacy changed in between counts as it is then), read within `DIALOG_READ_MS` of
 * the interaction (`readInTime`: past it no dialog, and the member is told `SLOW_READ`).
 */
async function dialogFor(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  ctx: AppContext,
  party: TrainParty,
  memberId: string,
  staff: boolean,
  groups: readonly [GroupId, ...GroupId[]],
): Promise<ReturnType<typeof splitDialog>> {
  const settings = await readInTime(ctx.log, interaction, () => ctx.users.get(memberId));
  const anonymous = settings.raidPrivacy === RaidPrivacy.Anonymous;
  return splitDialog(
    { party, stop: stopsFrom(ctx.gyms, ctx.wayspots), memberId, staff, anonymous, now: Date.now() },
    groups,
  );
}

/**
 * "Split…" of a train's post: the dialog of the one group the member may split, or the
 * one that asks which when they may split several (the conductor, staff: `splittableGroups`, in
 * the post's order); why not, privately, when they may split none. The dialog is the first
 * answer: nothing is deferred before it.
 */
export async function openSplit(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = ctx.parties.get(partyId);
  if (!party) throw new UserError(partyOver(A_TRAIN));
  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
  const staff = isStaff(interaction, ctx);
  const groups = splittableGroups(party, interaction.user.id, staff);
  // In letter order, as every list of groups (plan 8X-G, Matt 2026-10-22). None is marked: it
  // is picked on purpose (Android picks a radio group's first choice by itself).
  // `splittableGroups` keeps the party's order, which is the letters' (review r0 A3).
  const [first, ...rest] = groups;
  if (first === undefined) {
    throw new UserError(splitRefusalFor(ctx, party, interaction.user.id, staff));
  }
  await requireRoomForSplit(interaction, ctx, staff);
  await interaction.showModal(
    await dialogFor(interaction, ctx, party, interaction.user.id, staff, [first, ...rest]),
  );
}

/**
 * The group a Submit asks for: the one its dialog names (`<group>:<mark>` of the custom id), or
 * the choice picked (`<group>:<mark>`, `splitChoice`); a dialog of neither is no longer active.
 */
function submittedGroup(
  interaction: ModalSubmitInteraction,
  args: readonly string[],
): { group: GroupId; mark: string } {
  const [group, mark] = args;
  if (group !== undefined) {
    if (!isGroupId(group) || mark === undefined) throw new UserError(STALE_COMPONENT);
    return { group, mark };
  }
  // A Submit without the picker (a dialog of an older shape, a forged one) is no longer active:
  // discord.js would throw for the missing field, whatever `required` says.
  if (!interaction.fields.fields.has(SPLIT_GROUP_INPUT)) throw new UserError(STALE_COMPONENT);
  const picked = splitChoice(interaction.fields.getRadioGroup(SPLIT_GROUP_INPUT) ?? '');
  if (!picked) throw new UserError(STALE_COMPONENT);
  return picked;
}

/**
 * Submit of the dialog (`party:<id>:splitform[:<group>:<mark>]:~<token>`): acknowledged privately (the
 * new post can take more than three seconds), then the group is split off (`splitGroupAs`, with
 * the mark the dialog was drawn with) and the answer says `Split off: <post>` (also for a
 * second Submit, or when somebody else split that very group off first); for a group called
 * otherwise or gone by now `GROUPS_CHANGED`; any other refusal its reason; a train that is over
 * `partyOver`. A refusal that is none of the member's doing (the new post could not be made)
 * gives the use back (`UserError` `givesBack`, `said`). When the split throws, the answer is
 * `SPLIT_FAILED` and the error goes on to the router, which says what went wrong.
 */
export async function submitSplit(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  const { group, mark } = submittedGroup(interaction, withoutOpenToken(args));
  const party = ctx.parties.get(partyId);
  if (!party) throw new UserError(partyOver(A_TRAIN));
  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
  const member = actingMember(interaction);
  const staff = isStaff(interaction, ctx);
  await deferSubmit(interaction);
  if (await openPartiesFull(ctx, guildIdOf(interaction), member.id, staff)) {
    throw new UserError(OPEN_PARTIES_FULL);
  }
  // A split makes a train: it counts in `/train`'s window, here where the train is made, on top
  // of the controls' own. Whatever comes of it but a train gives this use back (plan 8Z).
  const countedAt = Date.now();
  const wait = ctx.throttles.use(TRAIN_COMMAND, member.id, TRAIN_THROTTLE, countedAt);
  if (wait !== undefined) throw new UserError(commandRefusal(TRAIN_COMMAND, waitText(wait)));
  const giveBack = () => {
    ctx.throttles.giveBack(TRAIN_COMMAND, member.id, TRAIN_THROTTLE, Date.now(), countedAt);
  };
  let answer;
  try {
    answer = await splitGroupAs(ctx, { party, member, group, staff, drawn: mark }, DISCORD_NAMES);
  } catch (err) {
    giveBack();
    // The answer must not leave the member waiting: the router says what went wrong below it.
    // An answer that cannot be given is logged, so that the router gets the split's own failure.
    await interaction.editReply({ content: SPLIT_FAILED }).catch((noteErr: unknown) => {
      ctx.log.warn({ err: noteErr }, 'could not say that the split did not work');
    });
    throw err;
  }
  if (answer.kind !== 'split') giveBack();
  const text =
    answer.kind === 'refused' && answer.reason === 'group-changed' ? GROUPS_CHANGED : answer.text;
  await interaction.editReply({ content: text });
  // Said in the answer; none of the member's doing, so the use goes back.
  if (answer.kind === 'refused' && answer.givesBack === true) {
    throw new UserError(text, { givesBack: true, said: true });
  }
}

/** `/group split letter:B`: the dialog of that group, also for those who may split several. */
async function splitByCommand(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<void> {
  const party = commandParty(interaction, ctx);
  if (!isTrain(party)) throw new UserError(notATrain(party));
  const group = typedGroup(ctx, party, interaction.options.getString('letter', true));
  const staff = isStaff(interaction, ctx);
  const problem = mayNotSplit(party, interaction.user.id, staff, group);
  if (problem) throw new UserError(splitRefusal(ctx, party, problem, group));
  const wait = ctx.throttles.wait(TRAIN_COMMAND, interaction.user.id, TRAIN_THROTTLE, Date.now());
  if (wait !== undefined) throw new UserError(commandRefusal(TRAIN_COMMAND, waitText(wait)));
  await requireRoomForSplit(interaction, ctx, staff);
  await interaction.showModal(
    await dialogFor(interaction, ctx, party, interaction.user.id, staff, [group]),
  );
}

/** The part `split` of `/group`. */
export const splitGroupPart: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('split')
    .setDescription('Split a group off this train into a train of its own')
    .addStringOption((option) =>
      option
        .setName('letter')
        .setDescription('The group to split off')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Makes a group of this train a train of its own, for those who want to go at their own ' +
      'pace: the same route and stop, doing the same at its end, with the same boss and start, ' +
      "and the group's members moved there. Both posts link the other, and the " +
      'members who moved are pinged in the new one.\n\nA dialog asks first. A member of the ' +
      'group may split it off, unless the conductor is in it; the conductor and the moderators ' +
      'may split any group.\n\nA split makes a train, so it counts toward the limit of ' +
      '`/train` (two in a quarter of an hour, for moderators too), and the new train is one ' +
      `of your open trains and meetups, of which you may have ${MAX_OPEN_PARTIES}.\n\nThe ` +
      'same as the button "Split…" on the post. Only in the post of a train.',
    examples: ['/group split letter:B'],
  },
  throttle: ACTION_THROTTLE,
  execute: splitByCommand,
  autocomplete: (interaction, ctx) =>
    respondWithGroupsOf(interaction, ctx, (party) =>
      isTrain(party) ? splittableGroups(party, interaction.user.id, isStaff(interaction, ctx)) : [],
    ),
};
