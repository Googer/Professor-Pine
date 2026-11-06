import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
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
import {
  BOARD_LABELS,
  BOARDS,
  isBoardName,
  type BoardName,
} from '../../domain/history/board-words.js';
import { boardMessage, viewerText } from '../../render/boards.js';
import {
  memberStatsTexts,
  memberStatsTitle,
  notOptedIn,
  nothingInYear,
} from '../../render/member-stats.js';
import { IN_SETTINGS } from '../../render/settings-words.js';
import { tallyMessage, type TallyView } from '../../render/region-tally.js';
import { memberByName } from '../../render/text.js';
import { actionRow, container, LIST_COLOUR, textDisplay } from '../../render/v2.js';
import type { ShownTally } from '../../services/region-tallies.js';
import { NamesUnavailable, type ShownBoard } from '../../services/boards.js';

/**
 * The controls of `/stats`' answers: `stats:regions:show:<period>:<note|none>` switches the
 * region tally's period in the private answer (with the note under Share or without it, as the
 * command decided), `stats:regions:share:<period>` posts that period's tally in the channel.
 */
export const STATS_KIND = 'stats';
const TALLY_ID = 'regions';
/** The boards' controls (plan 8H-6): `stats:boards:show|share:<board>:<period>`. */
const BOARDS_ID = 'boards';
/** The member's own card's Share (plan 8H-6): `stats:me:share:<year|all>`. */
const ME_ID = 'me';
const SHOW = 'show';
const SHARE = 'share';

/** A tally as Discord names its regions: by their channels (`RegionTallies.regionText`). */
export function tallyView(ctx: AppContext, shown: ShownTally): TallyView {
  const nameOf = (regionId: number): string => {
    const region = shown.regions.get(regionId);
    return region === undefined ? `Region ${regionId}` : ctx.regionTallies.regionText(region);
  };
  return {
    period: shown.period,
    rows: shown.tally.rows.map((row) => ({ ...row, name: nameOf(row.regionId) })),
    quiet: shown.tally.quiet.map(nameOf),
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
  // every period (quiet ones too), so the command's finding holds for the others.
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

/**
 * Whether a tally shared into a channel would leave out a region of the member's own tally, a
 * row or a quiet one.
 */
async function sharesLeaveOut(
  ctx: AppContext,
  shown: ShownTally,
  channelId: string,
): Promise<boolean> {
  const dropped = await ctx.regionTallies.notShared([...shown.regions.values()], channelId);
  const own = [...shown.tally.rows.map((row) => row.regionId), ...shown.tally.quiet];
  return own.some((regionId) => dropped?.has(regionId) === true);
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

/** How a Share is refused, in the words of what it shares (B8). */
interface ShareWords {
  /** Where the bot may not post. */
  refused: string;
  /** Where the channel is gone. */
  gone: string;
}

const TALLY_SHARE: ShareWords = { refused: SHARE_REFUSED, gone: SHARE_GONE };

/** The refusal of a board's Share where the bot may not post (B8). */
export const BOARD_SHARE_REFUSED =
  'I may not post in this channel, so I cannot share the board here. Try it in a channel ' +
  'where I can post.';

const BOARD_SHARE: ShareWords = {
  refused: BOARD_SHARE_REFUSED,
  gone: 'I could not post the board in this channel.',
};

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
  await shareMessage(
    interaction,
    TALLY_SHARE,
    (channelId) => ctx.regionTallies.mayShare(channelId),
    async (channelId, sharedBy) => {
      const shown = await ctx.regionTallies.forShare(
        guildIdOf(interaction),
        period,
        channelId,
        Date.now(),
      );
      return shown === undefined ? undefined : tallyMessage(tallyView(ctx, shown), [sharedBy]);
    },
    (channelId, message) => ctx.regionTallies.post(channelId, message),
  );
}

/**
 * A Share of any of `/stats`' answers (`discord-framework.md`, "Share"): refused in words where
 * the bot may not post (`mayShare`), acknowledged before the send, the message made at the press
 * (`made`, with its sharer's small print; undefined where nothing can be said of who sees the
 * channel, R3), posted by the bot (`post`) and said privately. A refused permission, an ended
 * post or a channel that is gone are refused in words, the use given back.
 */
async function shareMessage(
  interaction: ButtonInteraction,
  words: ShareWords,
  mayShare: (channelId: string) => boolean,
  made: (channelId: string, sharedBy: APIComponentInContainer) => Promise<V2Message | undefined>,
  post: (channelId: string, message: V2Message) => Promise<string | undefined>,
): Promise<void> {
  const { channelId } = interaction;
  if (!mayShare(channelId)) throw new UserError(words.refused, { givesBack: true });
  // Sending to the channel comes before the answer: acknowledged first, the answer left as it is.
  await interaction.deferUpdate();
  const sharer = memberByName({ id: interaction.user.id, name: memberInfo(interaction).name });
  const message = await made(channelId, textDisplay(`-# Shared by ${sharer}`));
  // Nothing can be said of who sees a channel the cache lacks: nothing is shared there (R3).
  if (message === undefined) throw new UserError(SHARE_UNKNOWN, { givesBack: true });
  let posted: string | undefined;
  try {
    posted = await post(channelId, message);
  } catch (err) {
    // A post that ended since the check (archived and locked) refuses it as well (50083).
    if (!isMissingPermission(err) && !isArchivedThread(err)) throw err;
    throw new UserError(words.refused, { givesBack: true });
  }
  if (posted === undefined) throw new UserError(words.gone, { givesBack: true });
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

/** What a board says where Discord cannot name its members just now (W5). */
export const BOARDS_UNNAMED =
  'Discord is not giving me the names of members just now, so I cannot show the board. ' +
  'Try again in a moment.';

/**
 * A board, or the refusal in words where its members could not be named (W5: Discord away, or
 * the names' share of its minute spent, W1), the use given back.
 */
async function namedBoard(ctx: AppContext, shown: Promise<ShownBoard>): Promise<ShownBoard> {
  try {
    return await shown;
  } catch (err) {
    if (!(err instanceof NamesUnavailable)) throw err;
    ctx.log.warn({ err }, 'could not name the members of a board');
    throw new UserError(BOARDS_UNNAMED, { givesBack: true });
  }
}

/** A button of a board's controls: `stats:boards:<action>:<board>:<period>`. */
function boardButton(
  action: string,
  board: BoardName,
  period: TallyPeriod,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success,
  disabled = false,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    label,
    custom_id: encodeCustomId({ kind: STATS_KIND, id: BOARDS_ID, action, args: [board, period] }),
    ...(disabled ? { disabled: true } : {}),
  };
}

/**
 * The private answer of a board: the board as the boards rank it, the viewer's own place where
 * it does not show them (Q-H), the periods to switch to (none for the most wanted, which goes by
 * the latest day) and Share.
 */
async function privateBoard(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
  board: BoardName,
  asked: TallyPeriod,
): Promise<V2Message> {
  // The most wanted goes by the latest day of want counts: no period to choose.
  const period = board === 'wanted' ? 'month' : asked;
  const view = await namedBoard(
    ctx,
    ctx.boards.board(guildIdOf(interaction), board, period, Date.now(), {
      id: interaction.user.id,
      name: memberInfo(interaction).name ?? interaction.user.username,
    }),
  );
  const place =
    view.kind === 'people' && view.viewer !== undefined
      ? [textDisplay(`-# ${viewerText(board, view.viewer)}`)]
      : [];
  const periods =
    board === 'wanted'
      ? []
      : TALLY_PERIODS.map((one) =>
          one === period
            ? boardButton(SHOW, board, one, PERIOD_LABELS[one], ButtonStyle.Primary, true)
            : boardButton(SHOW, board, one, PERIOD_LABELS[one], ButtonStyle.Secondary),
        );
  const share = boardButton(SHARE, board, period, 'Share in this channel', ButtonStyle.Success);
  return boardMessage(view, [...place, actionRow([...periods, share])]);
}

/**
 * Share of a board: the board computed again at the press with nobody's own place, the members
 * on the board only (both switches on), posted in the channel the answer was asked in.
 */
function shareBoard(
  interaction: ButtonInteraction,
  ctx: AppContext,
  board: BoardName,
  period: TallyPeriod,
): Promise<void> {
  return shareMessage(
    interaction,
    BOARD_SHARE,
    (channelId) => ctx.boards.mayShare(channelId),
    async (_channelId, sharedBy) =>
      boardMessage(
        await namedBoard(ctx, ctx.boards.board(guildIdOf(interaction), board, period, Date.now())),
        [sharedBy],
      ),
    (channelId, message) => ctx.boards.post(channelId, message),
  );
}

const boardsPart: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('boards')
    .setDescription('Who did the most that others confirmed, and the most wanted and reported')
    .addStringOption((option) =>
      option
        .setName('board')
        .setDescription('Which board (raids reported unless you choose)')
        .addChoices(BOARDS.map((board) => ({ name: BOARD_LABELS[board], value: board }))),
    )
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
      'The top ten of this server for this month, this year or all time, on one of these ' +
      'boards: raids reported that others completed, trains conducted and meetups hosted that ' +
      'others came to, and reports at stops that counted. Only you see the answer.\n\n' +
      'Only members who turned the boards on in `/settings` are ranked, and an anonymous raid ' +
      'or train counts for nobody. If you are not in the top ten, the answer says where you ' +
      'are, or where you would be.\n\n' +
      'A report at a stop counts unless another member said it was wrong. If more of your ' +
      'reports were said to be wrong than were confirmed, only the confirmed ones count.\n\n' +
      'Three boards name nobody: the most wanted Pokémon, the bosses whose raids were sent to ' +
      'the most members, and the field research tasks reported most.\n\n' +
      '"Share in this channel" posts the board where you asked, for everybody, with your name. ' +
      'It is a snapshot: it shows the board as it was when you shared it.',
    examples: ['/stats boards', '/stats boards board:Trains conducted period:This year'],
  },
  defer: 'late',
  throttle: MEMBER_READ_THROTTLE,
  async execute(interaction, ctx) {
    const askedBoard = interaction.options.getString('board') ?? undefined;
    const askedPeriod = interaction.options.getString('period') ?? undefined;
    const board = isBoardName(askedBoard) ? askedBoard : 'raids';
    const period = isTallyPeriod(askedPeriod) ? askedPeriod : 'month';
    await answer(interaction, v2Answer(await privateBoard(interaction, ctx, board, period)));
  },
};

/** How a card's Share is refused (B8). */
const CARD_SHARE: ShareWords = {
  refused:
    'I may not post in this channel, so I cannot share your numbers here. Try it in a ' +
    'channel where I can post.',
  gone: 'I could not post your numbers in this channel.',
};

/** A card's Share refused because the member opted out of the history since (R-B3). */
const CARD_OPTED_OUT =
  'Your history is off in this server now, so I did not share your numbers. Turn it on again ' +
  `${IN_SETTINGS}.`;

/** A year of `/stats me`'s Share, or all time: `stats:me:share:<year|all>`. */
const ALL_TIME = 'all';

/** A busiest region as a card names it: its channel; undefined for a region that is gone. */
function regionWords(ctx: AppContext, regionId: number | undefined): string | undefined {
  const region = regionId === undefined ? undefined : ctx.regions.byId(regionId);
  return region === undefined ? undefined : ctx.regionTallies.regionText(region);
}

/** A boss of a card by the catalogue's name. */
const bossNameOf = (ctx: AppContext) => (key: string) => ctx.gameData.catalogue.byKey(key)?.name;

/** A private answer of sentences alone, in one container. */
const sentence = (text: string): V2Message => ({
  v2: true,
  components: [container(LIST_COLOUR, [textDisplay(text)])],
});

/**
 * The private card of `/stats me`: the member's numbers, all time or of a year, with Share;
 * without the opt-in what would be counted and how to turn it on, and of a year with nothing,
 * that it has nothing.
 */
async function privateCard(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  year: number | undefined,
): Promise<V2Message> {
  const shown = await ctx.memberStats.stats(
    guildIdOf(interaction),
    interaction.user.id,
    year === undefined ? {} : { year },
  );
  if (!shown.optedIn) return sentence(notOptedIn());
  if (year !== undefined && !shown.years.includes(year)) return sentence(nothingInYear(year));
  const { stats: counted } = shown;
  const region = regionWords(ctx, counted.busiestRegion?.regionId);
  const texts = memberStatsTexts({
    stats: counted,
    title: memberStatsTitle(counted.year),
    own: true,
    ...(region === undefined ? {} : { region }),
    bossName: bossNameOf(ctx),
  });
  const share: APIButtonComponentWithCustomId = {
    type: ComponentType.Button,
    style: ButtonStyle.Success,
    label: 'Share in this channel',
    custom_id: encodeCustomId({
      kind: STATS_KIND,
      id: ME_ID,
      action: SHARE,
      args: [year === undefined ? ALL_TIME : String(year)],
    }),
  };
  return {
    v2: true,
    components: [
      container(LIST_COLOUR, [...texts.map((text) => textDisplay(text)), actionRow([share])]),
    ],
  };
}

/**
 * Share of a member's card (design Part E): computed again at the press without anything
 * anonymous (B2, B3), its busiest region only where everyone who sees the channel sees it
 * (`notShared`, Q-G; left out where that cannot be said), titled and signed with its sharer's
 * name (`memberByName`). Refused in words where the member opted out meanwhile.
 */
function shareCard(
  interaction: ButtonInteraction,
  ctx: AppContext,
  year: number | undefined,
): Promise<void> {
  return shareMessage(
    interaction,
    CARD_SHARE,
    (channelId) => ctx.boards.mayShare(channelId),
    // Its sharer is named in its title: no "Shared by" under it (B8).
    async (channelId) => {
      const shown = await ctx.memberStats.stats(guildIdOf(interaction), interaction.user.id, {
        ...(year === undefined ? {} : { year }),
        shared: true,
      });
      if (!shown.optedIn) throw new UserError(CARD_OPTED_OUT, { givesBack: true });
      const { stats: counted } = shown;
      const regionId = counted.busiestRegion?.regionId;
      const region = regionId === undefined ? undefined : ctx.regions.byId(regionId);
      const dropped =
        region === undefined ? undefined : await ctx.regionTallies.notShared([region], channelId);
      const kept = region !== undefined && dropped?.has(region.id) === false;
      const sharer = memberByName({
        id: interaction.user.id,
        name: memberInfo(interaction).name,
      });
      const texts = memberStatsTexts({
        stats: counted,
        title: memberStatsTitle(counted.year, `Pine of ${sharer}`),
        own: false,
        ...(kept ? { region: ctx.regionTallies.regionText(region) } : {}),
        bossName: bossNameOf(ctx),
      });
      return {
        v2: true,
        components: [
          container(
            LIST_COLOUR,
            texts.map((text) => textDisplay(text)),
          ),
        ],
      };
    },
    (channelId, message) => ctx.boards.post(channelId, message),
  );
}

const mePart: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('me')
    .setDescription('Your own numbers in this server, all time or of a year')
    .addIntegerOption((option) =>
      option
        .setName('year')
        .setDescription('A calendar year (all time unless you choose)')
        .setMinValue(2016)
        .setMaxValue(9999)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Your own numbers in this server: the raids and max battles you reported that others ' +
      'completed, the trains you conducted and the meetups you hosted that others came to, ' +
      'and your reports at stops that counted.\n\nBeside them: the raids and max battles you ' +
      'completed, the trains and meetups you came to, the region you were busiest in, the ' +
      'bosses you beat most, and how many members were told of what you reported. Only you ' +
      'see the answer.\n\nChoose a year to see that year alone; without one you see all ' +
      'time.\n\nI count only what you did while your history was on (`/settings`). Raids and trains ' +
      'you reported anonymously count here, but on no board.\n\n"Share in this channel" ' +
      'posts your numbers where you asked, under your name. It leaves out what you reported ' +
      'anonymously, and your busiest region unless everyone who sees the channel can see that ' +
      'region.',
    examples: ['/stats me', '/stats me year:2026'],
  },
  defer: 'late',
  throttle: MEMBER_READ_THROTTLE,
  async execute(interaction, ctx) {
    const year = interaction.options.getInteger('year') ?? undefined;
    await answer(interaction, v2Answer(await privateCard(interaction, ctx, year)));
  },
  async autocomplete(interaction, ctx) {
    const years = await ctx.memberStats.years(guildIdOf(interaction), interaction.user.id);
    const typed = String(interaction.options.getFocused());
    await interaction.respond(
      years
        .filter((year) => String(year).startsWith(typed))
        .slice(0, 25)
        .map((year) => ({ name: String(year), value: year })),
    );
  },
};

/**
 * `/stats` (plan 8H-5, design Parts C, D and E): what Pine's history of this server says.
 * `regions` is the region tally, `boards` the boards (plan 8H-6), each answered privately with
 * the periods to switch to and Share; `me` the member's own card, with Share.
 */
export const stats = commandGroup({
  data: new SlashCommandBuilder().setName('stats').setDescription('Pine’s history of this server'),
  help: {
    category: 'util',
    details:
      'Numbers from my history of this server: how many raids and max battles each region ' +
      'had, boards of who did the most that others confirmed, among the members who asked to ' +
      'be ranked, and your own numbers.',
    examples: ['/stats regions', '/stats boards', '/stats me'],
  },
  parts: [regionsPart, boardsPart, mePart],
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
    if (id.id === ME_ID) {
      const [year, ...rest] = id.args;
      const known = id.action === SHARE && rest.length === 0;
      if (!known || year === undefined || (year !== ALL_TIME && !/^\d{4}$/u.test(year))) {
        throw new UserError(STALE_COMPONENT);
      }
      await shareCard(interaction, ctx, year === ALL_TIME ? undefined : Number(year));
      return;
    }
    if (id.id === BOARDS_ID) {
      const [board, period, ...rest] = id.args;
      const known = (id.action === SHARE || id.action === SHOW) && rest.length === 0;
      if (!known || !isBoardName(board) || !isTallyPeriod(period)) {
        throw new UserError(STALE_COMPONENT);
      }
      if (id.action === SHARE) {
        await shareBoard(interaction, ctx, board, period);
        return;
      }
      const how = pressAnswer(interaction);
      const reading = privateBoard(interaction, ctx, board, period);
      await answerPress(interaction, how, await readOrDeferPress(interaction, how, reading));
      return;
    }
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
