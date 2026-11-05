import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
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
import { memberInfo } from '../../discord/member-info.js';
import {
  isArchivedThread,
  isMissingPermission,
  type V2Message,
} from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE, type Throttle } from '../../discord/throttle.js';
import {
  TALLY_PERIODS,
  isTallyPeriod,
  PERIOD_LABELS,
  type TallyPeriod,
} from '../../domain/history/tally-periods.js';
import { tallyMessage, type TallyView } from '../../render/region-tally.js';
import { memberByName } from '../../render/text.js';
import { actionRow, textDisplay } from '../../render/v2.js';
import type { ShownTally } from '../../services/region-tallies.js';

/**
 * The controls of `/stats`' answers: `stats:regions:show:<period>:<note|none>` switches the
 * region tally's period in the private answer (with the note under Share or without it, as the
 * command decided), `stats:regions:share:<period>` posts that period's tally in the channel.
 */
export const STATS_KIND = 'stats';
const TALLY_ID = 'regions';
const SHOW = 'show';
const SHARE = 'share';

/** A tally as Discord names its regions: by their channels (`RegionTallies.regionText`). */
export function tallyView(ctx: AppContext, shown: ShownTally): TallyView {
  return {
    period: shown.period,
    rows: shown.tally.rows.map((row) => {
      const region = shown.regions.get(row.regionId);
      return {
        ...row,
        name:
          region === undefined ? `Region ${row.regionId}` : ctx.regionTallies.regionText(region),
      };
    }),
    gone: shown.tally.gone,
    total: shown.tally.total,
  };
}

/**
 * The last argument of a period button (8H5-4): whether the answer says under Share that a
 * share here leaves regions out (`note`) or not (`none`), decided once at the command and
 * carried, so that a period's press asks nothing of who sees the channel.
 */
const NOTE = 'note';
const NO_NOTE = 'none';

/** A button of the tally's controls. */
function tallyButton(
  action: string,
  args: readonly string[],
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success,
  disabled = false,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    label,
    custom_id: encodeCustomId({ kind: STATS_KIND, id: TALLY_ID, action, args: [...args] }),
    ...(disabled ? { disabled: true } : {}),
  };
}

/**
 * The private answer: the tally as the member may see it, the periods to switch to and Share;
 * `channelId` where it was asked, which a Share posts into. `carried`: whether a share there
 * would leave out a region of the member's own tally, as the command found (a period's press
 * carries it); found here where not given.
 */
async function privateTally(
  ctx: AppContext,
  serverId: string,
  period: TallyPeriod,
  memberId: string,
  channelId: string,
  carried?: boolean,
): Promise<V2Message> {
  const shown = await ctx.regionTallies.forMember(serverId, period, memberId, Date.now());
  // A tally shared here leaves out a region somebody who sees this channel may not see: said
  // where it would drop one of the member's own (R-A). The member's regions are the same in
  // every period (zero rows too), so the command's finding holds for the others.
  const leavesOut = carried ?? (await sharesLeaveOut(ctx, shown, channelId));
  const note = leavesOut ? NOTE : NO_NOTE;
  const periods = TALLY_PERIODS.map((one) =>
    one === period
      ? tallyButton(SHOW, [one, note], PERIOD_LABELS[one], ButtonStyle.Primary, true)
      : tallyButton(SHOW, [one, note], PERIOD_LABELS[one], ButtonStyle.Secondary),
  );
  const share = tallyButton(SHARE, [period], 'Share in this channel', ButtonStyle.Success);
  const more: APIComponentInContainer[] = [
    actionRow([...periods, share]),
    ...(leavesOut ? [textDisplay(SHARE_LEAVES_OUT)] : []),
  ];
  return tallyMessage(tallyView(ctx, shown), more);
}

/** Whether a tally shared into a channel would leave out a row of the member's own tally. */
async function sharesLeaveOut(
  ctx: AppContext,
  shown: ShownTally,
  channelId: string,
): Promise<boolean> {
  const dropped = await ctx.regionTallies.notShared([...shown.regions.values()], channelId);
  return shown.tally.rows.some((row) => dropped?.has(row.regionId) === true);
}

/** What the private answer says under Share where a shared tally would leave regions out. */
const SHARE_LEAVES_OUT =
  '-# Shared here, the list leaves out the regions not everyone who sees this channel can see.';

/**
 * The refusal of a Share into a channel of which nothing can be said (not in the cache, or a
 * post whose channel is not, R3): who sees it is not known.
 */
export const SHARE_UNKNOWN =
  'I cannot tell who sees this channel just now, so I cannot share the list here. Try again ' +
  'in a moment.';

/** The refusal of a Share where the bot may not post. */
export const SHARE_REFUSED =
  'I may not post in this channel, so I cannot share the list here. Try it in a channel ' +
  'where I can post.';

/**
 * The refusal of a Share whose channel is gone (or, in rehearsal mode, outside the posts of
 * parties: the gateway posts nothing there).
 */
const SHARE_GONE = 'I could not post the list in this channel.';

/**
 * How often a member may share a tally: three times in ten minutes, in a window of its own (a
 * share is a message in a channel for all, not a read).
 */
export const SHARE_THROTTLE: Throttle = { uses: 3, perSeconds: 600 };

/**
 * Share: the tally computed again at the press, as it may be shown in the channel the answer was
 * asked in (`forShare`: without a region somebody who sees that channel may not see, whatever the
 * sharer sees; R-A), posted there by the bot, its sharer named in the small print
 * (`memberByName`, P7), mentions off as every send is. Refused in words where the bot may not
 * post there (`mayShare` before, a refused permission or an ended post after: no doing of the
 * member's, the use given back); an ended post is never opened for it.
 */
async function share(
  interaction: ButtonInteraction,
  ctx: AppContext,
  period: TallyPeriod,
): Promise<void> {
  const { channelId } = interaction;
  if (!ctx.regionTallies.mayShare(channelId)) {
    throw new UserError(SHARE_REFUSED, { givesBack: true });
  }
  // Sending to the channel comes before the answer: acknowledged first, the answer left as it is.
  await interaction.deferUpdate();
  const shown = await ctx.regionTallies.forShare(
    guildIdOf(interaction),
    period,
    channelId,
    Date.now(),
  );
  // Nothing can be said of who sees a channel the cache lacks: nothing is shared there (R3).
  if (shown === undefined) throw new UserError(SHARE_UNKNOWN, { givesBack: true });
  const sharer = memberByName({ id: interaction.user.id, name: memberInfo(interaction).name });
  const message = tallyMessage(tallyView(ctx, shown), [textDisplay(`-# Shared by ${sharer}`)]);
  let posted: string | undefined;
  try {
    posted = await ctx.regionTallies.post(channelId, message);
  } catch (err) {
    // A post that ended since the check (archived and locked) refuses it as well (50083).
    if (!isMissingPermission(err) && !isArchivedThread(err)) throw err;
    throw new UserError(SHARE_REFUSED, { givesBack: true });
  }
  if (posted === undefined) throw new UserError(SHARE_GONE, { givesBack: true });
  await interaction.followUp({ content: 'Shared in this channel.', flags: MessageFlags.Ephemeral });
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
          TALLY_PERIODS.map((period) => ({
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
      'deleted. Those of regions that are gone are counted on one line, "No longer a region".' +
      '\n\n"Share in this channel" posts the list where you asked, for everybody, with your ' +
      'name. It leaves out the regions not everyone who sees that channel can see.',
    examples: ['/stats regions', '/stats regions period:This year'],
  },
  defer: 'late',
  throttle: MEMBER_READ_THROTTLE,
  async execute(interaction, ctx) {
    const asked = interaction.options.getString('period');
    const period = isTallyPeriod(asked ?? undefined) ? (asked as TallyPeriod) : 'month';
    await answer(
      interaction,
      v2Answer(
        await privateTally(
          ctx,
          guildIdOf(interaction),
          period,
          interaction.user.id,
          interaction.channelId,
        ),
      ),
    );
  },
};

/**
 * `/stats` (plan 8H-5, design Parts C and E): what Pine's history of this server says. `regions`
 * is the region tally, answered privately with the periods to switch to; Part E adds `me`.
 */
export const stats = commandGroup({
  data: new SlashCommandBuilder().setName('stats').setDescription('Pine’s history of this server'),
  help: {
    category: 'util',
    details:
      'Numbers from my history of this server: how many raids and max battles each region ' +
      'had. Nobody is named.',
    examples: ['/stats regions'],
  },
  parts: [regionsPart],
});

/**
 * The controls of `/stats`' answers (plan 8H-5): another period of the region tally, read again
 * at the press and shown in the private answer itself (`pressAnswer`: a private answer is always
 * changed in place), counted as the command's reads are in a window of its own; and Share
 * (`share`), three in ten minutes (`SHARE_THROTTLE`), counted apart. Everything is in the custom
 * id. Only the answer's member can press them: the answer is private.
 */
export const statsControls: ComponentHandler = {
  kind: STATS_KIND,
  throttle: (_interaction, id) => (id.action === SHARE ? SHARE_THROTTLE : MEMBER_READ_THROTTLE),
  async button(interaction, id, ctx) {
    const [period, ...more] = id.args;
    const [note, ...rest] = more;
    const known =
      (id.action === SHARE && more.length === 0) ||
      (id.action === SHOW && (note === NOTE || note === NO_NOTE) && rest.length === 0);
    if (id.id !== TALLY_ID || !known || !isTallyPeriod(period)) {
      throw new UserError(STALE_COMPONENT);
    }
    if (id.action === SHARE) {
      await share(interaction, ctx, period);
      return;
    }
    const how = pressAnswer(interaction);
    const reading = privateTally(
      ctx,
      guildIdOf(interaction),
      period,
      interaction.user.id,
      interaction.channelId,
      note === NOTE,
    );
    await answerPress(interaction, how, await readOrDeferPress(interaction, how, reading));
  },
};
