import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { requireParty } from '../../discord/guards.js';
import { MAX_GROUP_LABEL } from '../../domain/party/attendance.js';
import { groupOf } from '../../domain/party/party.js';
import { groupWords } from '../../render/party-controls.js';
import { splitGroupPart } from '../trains/split.js';
import { newGroupRefusal } from './group-dialogs.js';
import {
  ACTION_THROTTLE,
  actingMember,
  answerOutcome,
  commandParty,
  respondWithGroups,
  typedGroup,
} from './reply.js';

const joinGroup: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('join')
    .setDescription('Move to another group of this raid, max battle or train')
    .addStringOption((option) =>
      option.setName('letter').setDescription('The group').setRequired(true).setAutocomplete(true),
    ),
  help: {
    details:
      'Moves you to that group; if you were not signed up, you are marked as coming. The same ' +
      'as Group… on the post.',
    examples: ['/group join letter:B'],
  },
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const letter = typedGroup(ctx, party, interaction.options.getString('letter', true));
    const outcome = await ctx.attendance.joinGroup(party.id, actingMember(interaction), letter);
    await answerOutcome(interaction, ctx, party, outcome);
  },
  autocomplete: respondWithGroups,
};

const newGroup: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('new')
    .setDescription('Open another group for this raid, max battle or train and move to it'),
  help: {
    details:
      'For more trainers than one lobby holds, or for trainers who want to raid apart from ' +
      "the others. The post's Interested, Join and Here then ask a newcomer which group; who " +
      'signs up without choosing (+1, Remote, the commands) lands in the newest group.\n\nA group ' +
      'nobody is in goes, unless it has a label or a meeting time, so a new group is refused ' +
      'while you are alone in such a group: it would change nothing. A raid, max battle or train has at ' +
      'most five groups.\n\nThe same as Group… on the post, which also takes a label.',
  },
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.newGroup(party.id, actingMember(interaction));
    const refusal = newGroupRefusal(ctx, party.id, interaction.user.id, outcome);
    if (refusal !== undefined) throw new UserError(refusal);
    await answerOutcome(
      interaction,
      ctx,
      party,
      outcome,
      (ok) => `You opened group ${ok.group} and are in it.`,
    );
  },
};

const labelGroup: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('label')
    .setDescription('Give your group a name, such as where it meets')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('The name; leave it out to remove the name')
        .setMaxLength(MAX_GROUP_LABEL),
    ),
  help: { examples: ['/group label text:by the fountain'] },
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('text') ?? '';
    const outcome = await ctx.attendance.labelGroup(party.id, actingMember(interaction), text);
    await answerOutcome(interaction, ctx, party, outcome, (ok) => {
      const group = groupOf(ok.party, ok.group);
      return group?.label
        ? `Your group is now ${groupWords(group)}.`
        : `Group ${ok.group} has no name any more.`;
    });
  },
};

/**
 * `/group`: the groups of a raid, a max battle or a train. A meetup has one group for good, so each part is
 * refused there with that sentence (`no-groups`): it is the party that says so, not a guard.
 */
export const group = commandGroup({
  data: new SlashCommandBuilder()
    .setName('group')
    .setDescription('The groups of this raid, max battle or train'),
  help: {
    category: 'basic-raid',
    details: 'Use it in the post of the raid, max battle or train. A meetup has no groups.',
  },
  guards: [requireParty],
  parts: [joinGroup, newGroup, labelGroup, splitGroupPart],
});
