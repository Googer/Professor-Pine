import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { alsoAs, type SimpleCommand } from '../../discord/command.js';
import { requireParty } from '../../discord/guards.js';
import type { AttendanceOptions } from '../../domain/party/attendance.js';
import type { Party } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import {
  ACTION_THROTTLE,
  actingMember,
  answerOutcome,
  commandParty,
  doneWords,
  leftWords,
  remoteWords,
  respondWithGroups,
  typedGroup,
} from './reply.js';

/** The commands of this file do what the buttons of a post do; these add a head count and a group. */
function withCountAndGroup(name: string, description: string): SlashCommandBuilder {
  const builder = new SlashCommandBuilder().setName(name).setDescription(description);
  builder
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many trainers you are, yourself included')
        .setMinValue(1),
    )
    .addStringOption((option) =>
      option
        .setName('group')
        .setDescription('The group to be in, when a raid, max battle or train has several')
        .setAutocomplete(true),
    );
  return builder;
}

/** The head count and the group a member gave with a command; what was left out stays as it is. */
function countAndGroup(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: Party,
): Omit<AttendanceOptions, 'remote'> {
  const number = interaction.options.getInteger('count');
  const group = interaction.options.getString('group');
  return {
    ...(number === null ? {} : { number }),
    ...(group === null ? {} : { group: typedGroup(ctx, party, group) }),
  };
}

const IN_A_POST = 'Use it in the post of the raid, max battle, train or meetup.';

function signUpCommand(
  name: string,
  description: string,
  status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
  details: string,
): SimpleCommand {
  return {
    data: withCountAndGroup(name, description),
    help: {
      category: 'basic-raid',
      details:
        `${details} ${IN_A_POST}\n\nIt does what the button on the post does, and you can add ` +
        'how many you are (`count`) and which group to be in (`group`).\n\nWhere there are ' +
        'several groups, the button asks a newcomer which one; without `group`, the command ' +
        'puts a newcomer in the newest group, or in another with room when that one is full. ' +
        'Once you are signed up, you stay in your group (`/group join` moves you), unless you ' +
        'were interested and it has no room when you come.',
      examples: [`/${name}`, `/${name} count:3`],
    },
    guards: [requireParty],
    throttle: ACTION_THROTTLE,
    async execute(interaction: ChatInputCommandInteraction, ctx: AppContext) {
      const party = commandParty(interaction, ctx);
      const outcome = await ctx.attendance.signUp(
        party.id,
        actingMember(interaction),
        status,
        countAndGroup(interaction, ctx, party),
      );
      await answerOutcome(interaction, ctx, party, outcome);
    },
    autocomplete: respondWithGroups,
  };
}

function remoteCommand(name: string, description: string, remote: boolean): SimpleCommand {
  return {
    data: withCountAndGroup(name, description),
    help: {
      category: 'basic-raid',
      details:
        `Marks you as taking part ${remote ? 'remotely' : 'in person'}. Whether you are ` +
        'interested, coming or here stays as it is; if you were not signed up, you are marked ' +
        `as interested. ${IN_A_POST}`,
      examples: [`/${name}`],
    },
    guards: [requireParty],
    throttle: ACTION_THROTTLE,
    async execute(interaction: ChatInputCommandInteraction, ctx: AppContext) {
      const party = commandParty(interaction, ctx);
      const outcome = await ctx.attendance.setRemote(
        party.id,
        actingMember(interaction),
        remote,
        countAndGroup(interaction, ctx, party),
      );
      await answerOutcome(interaction, ctx, party, outcome, remoteWords);
    },
    autocomplete: respondWithGroups,
  };
}

export const interested = signUpCommand(
  'interested',
  'Say that you are interested in this raid, max battle, train or meetup',
  PartyStatus.Interested,
  'Marks you as interested.',
);

/** `/interested` by a shorter name (Matt, 2026-10-15). */
export const hmm = alsoAs(interested, 'hmm');

export const join = signUpCommand(
  'join',
  'Say that you are coming to this raid, max battle, train or meetup',
  PartyStatus.Coming,
  'Marks you as coming.',
);

/** `/join` by the name of its status, as the legacy bot had it (Matt, 2026-10-15). */
export const coming = alsoAs(join, 'coming');

export const here = signUpCommand(
  'here',
  'Say that you have arrived at this raid, max battle or meetup, or at the stop a train is at',
  PartyStatus.Present,
  'Marks you as here.',
);

export const remote = remoteCommand(
  'remote',
  'Say that you take part remotely (in a raid: with a remote raid pass)',
  true,
);

export const local = remoteCommand('local', 'Say that you take part in person', false);

export const notHere: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('not-here')
    .setDescription('Say that you are not there after all'),
  help: {
    category: 'basic-raid',
    details: `Marks you as interested again after you said you were here. ${IN_A_POST}`,
  },
  guards: [requireParty],
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.notHere(party.id, actingMember(interaction));
    await answerOutcome(interaction, ctx, party, outcome);
  },
};

export const leave: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Take yourself off this raid, max battle, train or meetup'),
  help: { category: 'basic-raid', details: `Removes you from the list. ${IN_A_POST}` },
  guards: [requireParty],
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.leave(party.id, actingMember(interaction));
    await answerOutcome(interaction, ctx, party, outcome, leftWords);
  },
};

export const done: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('done')
    .setDescription(
      'Say that you have completed this raid or max battle (in a train or meetup: that you leave)',
    ),
  help: {
    category: 'basic-raid',
    details:
      'Marks you as done. The others of your group who are here are asked whether they are done ' +
      'too; without an answer they count as done after a few minutes.\n\nA train or meetup has nothing to ' +
      `complete: there it takes you off the list, like \`/leave\`. ${IN_A_POST}`,
  },
  guards: [requireParty],
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const outcome = await ctx.attendance.done(party.id, actingMember(interaction));
    await answerOutcome(interaction, ctx, party, outcome, doneWords);
  },
};
