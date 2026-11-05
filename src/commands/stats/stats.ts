import {
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { guildIdOf } from '../../discord/guards.js';
import {
  answer,
  answerPress,
  pressAnswer,
  readOrDeferPress,
  v2Answer,
} from '../../discord/late-reply.js';
import { UserError } from '../../discord/errors.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import {
  BOARD_PERIODS,
  isBoardPeriod,
  PERIOD_LABELS,
  type BoardPeriod,
} from '../../domain/history/board-periods.js';
import { boardMessage, type BoardView } from '../../render/region-board.js';
import { actionRow } from '../../render/v2.js';
import type { ShownBoard } from '../../services/region-boards.js';

/**
 * The controls of `/stats`' answers: `stats:regions:show:<period>` switches the region board's
 * period in the private answer.
 */
export const STATS_KIND = 'stats';
const BOARD_ID = 'regions';
const SHOW = 'show';

/** A board as Discord names its regions: by their channels (`RegionBoards.regionText`). */
export function boardView(ctx: AppContext, shown: ShownBoard): BoardView {
  return {
    period: shown.period,
    rows: shown.board.rows.map((row) => {
      const region = shown.regions.get(row.regionId);
      return {
        ...row,
        name: region === undefined ? `Region ${row.regionId}` : ctx.regionBoards.regionText(region),
      };
    }),
    gone: shown.board.gone,
    total: shown.board.total,
  };
}

/** A button of the board's controls. */
function boardButton(
  action: string,
  period: BoardPeriod,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success,
  disabled = false,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    label,
    custom_id: encodeCustomId({ kind: STATS_KIND, id: BOARD_ID, action, args: [period] }),
    ...(disabled ? { disabled: true } : {}),
  };
}

/** The private answer: the board as the member may see it, and the periods to switch to. */
async function privateBoard(
  ctx: AppContext,
  serverId: string,
  period: BoardPeriod,
  memberId: string,
): Promise<V2Message> {
  const shown = await ctx.regionBoards.forMember(serverId, period, memberId, Date.now());
  const periods = BOARD_PERIODS.map((one) =>
    one === period
      ? boardButton(SHOW, one, PERIOD_LABELS[one], ButtonStyle.Primary, true)
      : boardButton(SHOW, one, PERIOD_LABELS[one], ButtonStyle.Secondary),
  );
  const more: APIComponentInContainer[] = [actionRow(periods)];
  return boardMessage(boardView(ctx, shown), more);
}

const regionsPart: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('regions')
    .setDescription('Raids and max battles by region')
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription('Which period (this month unless you choose)')
        .addChoices(
          BOARD_PERIODS.map((period) => ({
            name: PERIOD_LABELS[period],
            value: period,
          })),
        ),
    ),
  help: {
    details:
      'How many raids and max battles took place in each region of this server, the busiest ' +
      'first: this month, this year or all time. Only you see the answer.\n\n' +
      'A raid or max battle counts whether or not anybody marked it done, unless it was ' +
      'deleted. Those of regions that are gone are counted on one line, "No longer a region".',
    examples: ['/stats regions', '/stats regions period:This year'],
  },
  defer: 'late',
  throttle: MEMBER_READ_THROTTLE,
  async execute(interaction, ctx) {
    const asked = interaction.options.getString('period');
    const period = isBoardPeriod(asked ?? undefined) ? (asked as BoardPeriod) : 'month';
    await answer(
      interaction,
      v2Answer(await privateBoard(ctx, guildIdOf(interaction), period, interaction.user.id)),
    );
  },
};

/**
 * `/stats` (plan 8H-5, design Parts C and E): what Pine's history of this server says. `regions`
 * is the region board, answered privately with the periods to switch to; Part E adds `me`.
 */
export const stats = commandGroup({
  data: new SlashCommandBuilder().setName('stats').setDescription('Pine’s history of this server'),
  help: {
    category: 'util',
    details:
      'What Pine’s history of this server says: how many raids and max battles each region had. ' +
      'Nobody is named.',
    examples: ['/stats regions'],
  },
  parts: [regionsPart],
});

/**
 * The controls of `/stats`' answers (plan 8H-5): another period of the region board, read again
 * at the press and shown in the private answer itself (`pressAnswer`: a private answer is always
 * changed in place). Everything is in the custom id. Counted as the command's reads are, in a
 * window of its own.
 */
export const statsControls: ComponentHandler = {
  kind: STATS_KIND,
  throttle: MEMBER_READ_THROTTLE,
  async button(interaction, id, ctx) {
    const [period, ...more] = id.args;
    if (id.id !== BOARD_ID || id.action !== SHOW || !isBoardPeriod(period) || more.length > 0) {
      throw new UserError(STALE_COMPONENT);
    }
    const how = pressAnswer(interaction);
    const reading = privateBoard(ctx, guildIdOf(interaction), period, interaction.user.id);
    await answerPress(interaction, how, await readOrDeferPress(interaction, how, reading));
  },
};
