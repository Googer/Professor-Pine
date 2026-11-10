import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { DATE_EXAMPLE, type SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { notARaid, requireParty, requireRaid } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import { isMax, isRaid, isTimed, type RaidParty } from '../../domain/party/party.js';
import { changeMaxEnd } from '../max/max-changes.js';
import { requireMeetupChanger } from '../meetups/meetup-changes.js';
import type { Member } from '../../services/attendance-service.js';
import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
import { commandParty, commandRaid } from '../parties/reply.js';
import { changeEnd } from '../parties/timed.js';
import {
  changeRaidTime,
  raidChangeAnswer,
  timesText,
  type RaidChangeAnswer,
} from './raid-changes.js';

export { timesText } from './raid-changes.js';

/** How often one member may change a raid: each change edits the post and says a line in it. */
export const CHANGE_THROTTLE: Throttle = { uses: 10, perSeconds: 60 };

export const IN_A_RAID_POST = 'Use it in the post of the raid.';

type Changing = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

/** The member who changes a raid, as the services want them. */
export function changingMember(interaction: Changing): Member {
  return { id: interaction.user.id, ...memberInfo(interaction) };
}

/**
 * Tells the member, privately, what came of a change (`raidChangeAnswer`, `changeRaidTime` and
 * the like): a refusal and a raid that has ended are thrown as `UserError`s.
 */
export async function replyRaidChange(
  interaction: Changing,
  answer: RaidChangeAnswer,
): Promise<void> {
  if (answer.kind !== 'ok') throw new UserError(answer.text);
  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
}

/**
 * Tells the member, privately, what came of a change to the raid: `said` when it changed, `same`
 * when the raid already was so. A refusal and a raid that has ended are thrown as `UserError`s;
 * a gym that is taken names the post of the raid that holds it.
 */
export async function answerRaidChange(
  interaction: Changing,
  ctx: AppContext,
  outcome: RaidChangeOutcome,
  said: (party: RaidParty) => string,
  same: string,
): Promise<void> {
  await replyRaidChange(
    interaction,
    raidChangeAnswer(ctx.attendance.limits(), outcome, said, same),
  );
}

/** What the "Set time" button and its form answer for a raid that has its times by now. */
export function timesAlready(party: RaidParty): string {
  return `This raid has its times already. ${timesText(party)} Use \`/hatch\` or \`/end\` to correct them.`;
}

/**
 * Sets the hatch or the end time of a raid from what a member typed, and answers. For `/hatch`,
 * `/end` and the "Set time" form of a post (`changeRaidTime`, which the map calls too).
 */
export async function changeTime(
  interaction: Changing,
  ctx: AppContext,
  party: RaidParty,
  parameter: 'hatch' | 'end',
  text: string,
): Promise<void> {
  await replyRaidChange(
    interaction,
    await changeRaidTime(ctx, party, changingMember(interaction), parameter, text),
  );
}

export const hatch: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('hatch')
    .setDescription('Set when the egg of this raid hatches')
    .addStringOption((o) =>
      o
        .setName('time')
        .setDescription('Minutes from now (20) or a clock time (6:15pm)')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    category: 'raid-crud',
    details:
      'Sets the hatch time; the end follows from it. Give the minutes from now or a clock time. ' +
      IN_A_RAID_POST,
    examples: ['/hatch time:20', '/hatch time:6:15pm'],
  },
  guards: [requireRaid],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandRaid(interaction, ctx);
    await changeTime(interaction, ctx, party, 'hatch', interaction.options.getString('time', true));
  },
};

/**
 * `/end`: when a raid ends (its hatch time follows), or when a train or meetup ends, where `none`
 * removes it (`changeEnd`). Anybody in a train's post may set it; a meetup's end is for its maker
 * and staff, a blocked maker refused (`requireMeetupChanger`, plan 8Z-2).
 */
export const end: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('end')
    .setDescription('Set when this raid, max battle, train or meetup ends')
    .addStringOption((o) =>
      o
        .setName('time')
        .setDescription(
          'Raid: minutes left (20) or 6:15pm. Train or meetup: 6:15pm, month-day and time, in 90, none',
        )
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    category: 'raid-crud',
    alsoIn: ['train', 'meetup'],
    details:
      'In the post of a raid: sets when it ends, and the hatch time with it. Give the minutes ' +
      'that are left or a clock time.\n\nIn the post of a max battle: sets when it ends, ' +
      'within its day and never after the last battle time.\n\nIn the post of a train or ' +
      'meetup: sets when it ends. Give a clock time (`noon` and `midnight` too), a date and a ' +
      'time, or `in 90` for minutes from now (a number alone, such as `9`, is a clock hour); ' +
      '`none` removes the end.\n\nA time without a date is on the day it starts, or else the ' +
      'day it ends, while that day is still to come, and otherwise today; `tomorrow 1am` is ' +
      'tomorrow. A date comes first, month-day ' +
      `(\`${DATE_EXAMPLE} 9pm\`).\n\nA train or meetup without an end is over a day after it ` +
      'started. One without any time is archived a day after it was made, or after its last ' +
      'time was removed.\n\nOnly its maker or a moderator can set when a meetup ends.',
    examples: [
      '/end time:20',
      '/end time:6:15pm',
      `/end time:${DATE_EXAMPLE} 9pm`,
      '/end time:none',
    ],
  },
  guards: [requireParty, requireMeetupChanger],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('time', true);
    if (isTimed(party)) await changeEnd(interaction, ctx, party, text);
    // A max battle's end, within its day (plan 8X-3).
    else if (isMax(party)) await changeMaxEnd(interaction, ctx, party, text);
    else if (!isRaid(party)) throw new UserError(notARaid(party));
    else await changeTime(interaction, ctx, party, 'end', text);
  },
};

export const duration: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('duration')
    .setDescription('Set how long this raid lasts once it has hatched')
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('How many minutes the boss stays')
        .setRequired(true)
        .setMinValue(1),
    ),
  help: {
    category: 'raid-crud',
    details:
      'For a raid that lasts longer or shorter than usual. The hatch time stays and the end ' +
      `moves. ${IN_A_RAID_POST}`,
    examples: ['/duration minutes:30'],
  },
  guards: [requireRaid],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandRaid(interaction, ctx);
    const minutes = interaction.options.getInteger('minutes', true);
    const longest = ctx.config.settings.maxRaidHatchedDuration;
    if (minutes < 1 || minutes > longest) {
      throw new UserError(`Give the length in minutes, from 1 to ${longest}.`);
    }
    const outcome = await ctx.raids.setDuration(party.id, changingMember(interaction), minutes);
    await answerRaidChange(
      interaction,
      ctx,
      outcome,
      (changed) => `This raid now lasts ${minutes} minutes. ${timesText(changed)}`,
      `This raid already lasts ${minutes} minutes.`,
    );
  },
};
