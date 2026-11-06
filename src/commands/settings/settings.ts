import {
  InteractionContextType,
  SlashCommandBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
import { decodeCustomId, encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import { dialog, openToken, readInTime, withoutOpenToken } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import {
  answer,
  answerApart,
  answerPress,
  deferPress,
  pressAnswer,
  readOrDeferPress,
  v2Answer,
  type Press,
} from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import {
  MEMBER_READ_THROTTLE,
  MEMBER_WRITE_THROTTLE,
  type Throttle,
} from '../../discord/throttle.js';
import { RaidPrivacy } from '../../domain/party/status.js';
import { targetsAnswer } from '../notifications/targets.js';
import { wantsAnswer } from '../notifications/wants.js';
import {
  ASK,
  LISTS,
  OFF,
  ON,
  panelNow,
  POKEBATTLER,
  SET,
  SETTINGS_KIND,
  SHOW,
  type ListName,
} from './panel.js';
import { AUTO_STATUS, FLAGS, PRIVACY, autoStatusName, type FlagSetting } from './settings-lines.js';

/** The Submit of the question before the history goes off: `settings:history:forget`. */
const FORGET = 'forget';

/**
 * How often a member may turn their history off through its question: five times in ten
 * minutes (S13), each Submit a transaction over the server's history.
 */
export const HISTORY_OFF_THROTTLE: Throttle = { uses: 5, perSeconds: 600 };

/** What a press says where the setting was so already (the panel was drawn before a change). */
const already = (on: boolean): string => `That was ${on ? ON : OFF} already.`;

/** What is added when a DM is switched on where this bot sends none. */
const NOTIFICATIONS_OFF = ' This bot sends no such DMs for now, though.';

/** What is added when a kind of ping is turned on while pings in posts are off. */
const MENTIONS_OFF =
  ' Pings in posts are off, though, so these stay quiet until you turn pings in posts on.';

const NEW_TRAIN_ON =
  'You will get a DM when a train is announced in a region of this server you can see.';
const NEW_TRAIN_OFF = 'No more DMs for new trains in this server.';

/** The history opt-in turned on (S4: two sentences; `/help settings` says the rest). */
const HISTORY_ON =
  'Your history is on: from now on I keep your Discord id with the raids, max battles, ' +
  'trains and meetups you join, including those going on now, and with the reports you make ' +
  'at stops. `/stats me` shows your numbers.';
const HISTORY_OFF = 'Your history is off.';

/** What turning the history off took the member's name off, where it did. */
export function forgottenIn(records: number): string {
  return records === 1
    ? ' I took your Discord id off the one record; it still counts.'
    : ` I took your Discord id off ${String(records)} records; they still count.`;
}

/** Added where turning the history off took the member off the boards too. */
const LEFT_BOARDS = ' You are off the boards too.';

const BOARDS_ON =
  'You are on this server’s boards: `/stats boards` ranks you by what others confirmed.';
/** Added where turning the boards on turned the history on with them. */
const HISTORY_TOO = ' Your history was off, so I turned it on: the boards count what it keeps.';
/** Added where the member's posts are anonymous (W6). */
const ANONYMOUS_BOARDS =
  ' Your raids, max battles and trains are anonymous, so they count on no board, only in ' +
  '`/stats me`.';
const BOARDS_OFF = 'You are off this server’s boards. Your history stays on.';

/** The largest id the legacy column (`User.pokebattlerId`, a signed `int`) holds. */
export const MAX_POKEBATTLER_ID = 2_147_483_647;

const POKEBATTLER_REFUSED = `A Pokebattler user id is a whole number from 1 to ${MAX_POKEBATTLER_ID.toLocaleString('en-US')}.`;

/** The line of text in the Pokebattler id's dialog. */
const POKEBATTLER_FIELD = 'id';

/**
 * What a press of the panel does: `work` changes what it changes and says what (`already` where
 * it was so), then the panel is read afresh and shown in its place with that line (`pressAnswer`:
 * a private answer is changed in place), the press acknowledged as it will be answered where
 * that takes longer than `LATE_DEFER_MS`. `slow`: a write that is acknowledged first (S9).
 */
async function changed(
  interaction: Press,
  ctx: AppContext,
  work: () => Promise<string>,
  slow = false,
): Promise<void> {
  const how = pressAnswer(interaction);
  if (slow) {
    // Acknowledged once, before the write: the answer is the edit of that, however long it takes.
    await deferPress(interaction, how);
    await answerPress(interaction, how, await panelNow(interaction, ctx, await work()));
    return;
  }
  const drawing = (async () => panelNow(interaction, ctx, await work()))();
  await answerPress(interaction, how, await readOrDeferPress(interaction, how, drawing));
}

/** An on/off setting of the member as a whole set to `on`. */
function setFlag(
  interaction: ButtonInteraction,
  ctx: AppContext,
  setting: FlagSetting,
  on: boolean,
): Promise<void> {
  return changed(interaction, ctx, async () => {
    const memberId = interaction.user.id;
    const before = await ctx.users.get(memberId);
    if (before[setting.flag] === on) return already(on);
    await ctx.users.update(memberId, { [setting.flag]: on });
    let said = on ? setting.on : setting.off;
    if (on && setting.underMentions && !before.mentions) said += MENTIONS_OFF;
    if (on && setting.dm && !ctx.config.settings.features.notifications) {
      said += NOTIFICATIONS_OFF;
    }
    return said;
  });
}

/** The DM for a new train in this server set to `on`. */
function setNewTrain(interaction: ButtonInteraction, ctx: AppContext, on: boolean): Promise<void> {
  return changed(interaction, ctx, async () => {
    const guildId = guildIdOf(interaction);
    if (!(await ctx.newTrains.set(interaction.user.id, guildId, on, Date.now()))) {
      return already(on);
    }
    if (!on) return NEW_TRAIN_OFF;
    return ctx.config.settings.features.notifications
      ? NEW_TRAIN_ON
      : NEW_TRAIN_ON + NOTIFICATIONS_OFF;
  });
}

/**
 * The history opt-in of this server set to `on`. Off asks first in a dialog where it takes
 * something away (S1, S2): the member's name off records, or the member off the boards; what it
 * needs is read in time (`readInTime`), and with nothing to take away it is off at once.
 */
async function setHistory(
  interaction: ButtonInteraction,
  ctx: AppContext,
  on: boolean,
): Promise<void> {
  const memberId = interaction.user.id;
  const guildId = guildIdOf(interaction);
  if (on) {
    await changed(interaction, ctx, async () =>
      (await ctx.historyOptIns.optIn(memberId, guildId, Date.now())) ? HISTORY_ON : already(on),
    );
    return;
  }
  const [records, boards, optedIn] = await readInTime(ctx.log, interaction, () =>
    Promise.all([
      ctx.historyOptIns.namedIn(memberId, guildId),
      ctx.historyOptIns.isOnBoards(memberId, guildId),
      ctx.historyOptIns.isOptedIn(memberId, guildId),
    ]),
  );
  if (records > 0 || boards) {
    await interaction.showModal(historyDialog(records, boards));
    return;
  }
  await changed(
    interaction,
    ctx,
    async () => (optedIn ? historyOff(ctx, memberId, guildId) : already(on)),
    true,
  );
}

/** The records a question names: `3 records (they still count)`, `the one record (…)`. */
function recordsWords(records: number): string {
  return records === 1
    ? 'the one record (it still counts)'
    : `${String(records)} records (they still count)`;
}

/** The question before the history goes off: what it takes away, and what Submit does. */
function historyDialog(records: number, boards: boolean) {
  const takes = [
    ...(records > 0 ? [`takes your Discord id off ${recordsWords(records)}`] : []),
    ...(boards ? ['takes you off the boards'] : []),
  ].join(' and ');
  return dialog({
    customId: encodeCustomId({ kind: SETTINGS_KIND, id: 'history', action: FORGET }),
    title: 'Turn your history off',
    text: `This ${takes}. Submit turns it off.`,
  });
}

/** Turns the history off and says what that took away, `already` where it was off. */
async function historyOff(ctx: AppContext, memberId: string, guildId: string): Promise<string> {
  const { changed: was, forgotten, leftBoards } = await ctx.historyOptIns.optOut(memberId, guildId);
  if (!was && forgotten === 0) return already(false);
  return (
    HISTORY_OFF + (forgotten > 0 ? forgottenIn(forgotten) : '') + (leftBoards ? LEFT_BOARDS : '')
  );
}

/**
 * The Submit of the question (S1): acknowledged in the panel's place at once (a slow write,
 * `deferUpdate`), the history turned off, the panel drawn again saying what the opt-out took
 * away, by its own count.
 */
function forgetSubmitted(interaction: ModalSubmitInteraction, ctx: AppContext): Promise<void> {
  const guildId = guildIdOf(interaction);
  return changed(interaction, ctx, () => historyOff(ctx, interaction.user.id, guildId), true);
}

/** The boards of this server set to `on`: on turns the history on with them where it was off. */
function setBoards(interaction: ButtonInteraction, ctx: AppContext, on: boolean): Promise<void> {
  const memberId = interaction.user.id;
  const guildId = guildIdOf(interaction);
  if (!on) {
    return changed(interaction, ctx, async () =>
      (await ctx.historyOptIns.leaveBoards(memberId, guildId)) ? BOARDS_OFF : already(on),
    );
  }
  return changed(
    interaction,
    ctx,
    async () => {
      const [{ joined, historyOn }, settings] = await Promise.all([
        ctx.historyOptIns.joinBoards(memberId, guildId, Date.now()),
        ctx.users.get(memberId),
      ]);
      if (!joined) return already(on);
      const anonymous = settings.raidPrivacy === RaidPrivacy.Anonymous;
      return BOARDS_ON + (historyOn ? HISTORY_TOO : '') + (anonymous ? ANONYMOUS_BOARDS : '');
    },
    true,
  );
}

/** A pick of the status menu or the privacy menu. */
function pickSetting(
  interaction: AnySelectMenuInteraction,
  ctx: AppContext,
  setting: string,
): Promise<void> {
  const [value, ...rest] = interaction.values;
  const memberId = interaction.user.id;
  if (rest.length === 0 && setting === 'auto-status') {
    const choice = AUTO_STATUS.find((status) => status.value === value);
    if (choice !== undefined) {
      return changed(interaction, ctx, async () => {
        const before = await ctx.users.get(memberId);
        if (before.autoStatus === choice.status) {
          return `Your status was ${autoStatusName(choice.status)} already.`;
        }
        await ctx.users.update(memberId, { autoStatus: choice.status });
        return choice.says;
      });
    }
  }
  if (rest.length === 0 && setting === 'privacy') {
    const choice = PRIVACY.find((entry) => entry.value === value);
    if (choice !== undefined) {
      return changed(interaction, ctx, async () => {
        const before = await ctx.users.get(memberId);
        if (before.raidPrivacy === choice.privacy) return `Your posts were ${choice.name} already.`;
        await ctx.users.update(memberId, { raidPrivacy: choice.privacy });
        return choice.says;
      });
    }
  }
  throw new UserError(STALE_COMPONENT);
}

/**
 * The Pokebattler id's dialog (S10): the id saved, read in time, in its one line, so that it is
 * changed rather than typed again; its custom id ends in a per-open token, as a dialog with a
 * value to start with must (Discord's client keeps what was submitted per custom id).
 */
async function askPokebattler(interaction: ButtonInteraction, ctx: AppContext): Promise<void> {
  const saved = await readInTime(ctx.log, interaction, () => ctx.users.get(interaction.user.id));
  await interaction.showModal(
    dialog({
      customId: encodeCustomId({
        kind: SETTINGS_KIND,
        id: POKEBATTLER,
        action: SET,
        args: [openToken(Date.now())],
      }),
      title: 'Your Pokebattler user id',
      text:
        'The number of your Pokebattler account, so that `/counters level:My Pokébox on ' +
        'Pokebattler` uses the Pokémon you entered there. Leave it empty to clear it.',
      field: {
        id: POKEBATTLER_FIELD,
        label: 'Pokebattler user id',
        maxLength: 10,
        placeholder: 'Empty clears it',
        ...(saved.pokebattlerId === null ? {} : { value: String(saved.pokebattlerId) }),
      },
    }),
  );
}

/**
 * The id a Submit of the Pokebattler id's dialog carries, null to clear it; refused when it is
 * no id (`POKEBATTLER_REFUSED`) or the Submit has no such line (a dialog of another shape, A2).
 * Asked by the guard, before the Submit counts (A1), and again by the Submit.
 */
function submittedPokebattler(interaction: ModalSubmitInteraction): number | null {
  if (!interaction.fields.fields.has(POKEBATTLER_FIELD)) throw new UserError(STALE_COMPONENT);
  const typed = interaction.fields.getTextInputValue(POKEBATTLER_FIELD).trim();
  const id = typed === '' ? null : /^\d{1,10}$/u.test(typed) ? Number(typed) : Number.NaN;
  if (id !== null && (!Number.isSafeInteger(id) || id < 1 || id > MAX_POKEBATTLER_ID)) {
    throw new UserError(POKEBATTLER_REFUSED);
  }
  return id;
}

/** The Submit of the Pokebattler id's dialog, whose id the guard has checked. */
function setPokebattler(interaction: ModalSubmitInteraction, ctx: AppContext): Promise<void> {
  const id = submittedPokebattler(interaction);
  return changed(interaction, ctx, async () => {
    await ctx.users.update(interaction.user.id, { pokebattlerId: id });
    return id === null
      ? 'Your Pokebattler user id is cleared.'
      : `Your Pokebattler user id is ${String(id)}: \`/counters level:My Pokébox on ` +
          'Pokebattler` uses its Pokémon.';
  });
}

/**
 * Show of a list (S8): exactly what `/wants` or `/targets` answers, in a private message of its
 * own (`answerApart`), the panel left as it is; a late read acknowledged with a private
 * `deferReply`, never `deferUpdate`.
 */
async function showList(
  interaction: ButtonInteraction,
  ctx: AppContext,
  list: ListName,
): Promise<void> {
  const reading =
    list === 'wants' ? wantsAnswer(interaction, ctx) : targetsAnswer(interaction, ctx);
  await answerApart(interaction, await readOrDeferPress(interaction, 'copy', reading));
}

/** The settings of the panel that are per server: their controls work in a server only. */
const PER_SERVER: ReadonlySet<string> = new Set(['new-train', 'history', 'leaderboard', ...LISTS]);

/**
 * The guards of the panel's controls: those of a server's settings and lists only in a server,
 * Show only where this installation notifies (the guards of `/wants` and `/targets`, S8), so
 * that a refusal is said before anything counts.
 */
const requirePanelServer: Guard = async (interaction, ctx) => {
  const id = 'customId' in interaction ? decodeCustomId(interaction.customId) : undefined;
  // The Pokebattler id is checked before its Submit counts (A1).
  if (id?.id === POKEBATTLER && id.action === SET && interaction.isModalSubmit()) {
    submittedPokebattler(interaction);
    return;
  }
  if (id === undefined || !PER_SERVER.has(id.id)) return;
  await requireGuild(interaction, ctx);
  if (id.action === SHOW && !ctx.config.settings.features.notifications) {
    throw new UserError(STALE_COMPONENT);
  }
};

/** The on/off state a control sets: `on` or `off`, the only argument. */
function stateOf(id: CustomId): boolean | undefined {
  const [state, ...rest] = id.args;
  if (rest.length > 0) return undefined;
  return state === ON ? true : state === OFF ? false : undefined;
}

/** Whether a control is the button that may ask before the history goes off. */
const asksHistoryOff = (id: CustomId): boolean =>
  id.id === 'history' && id.action === SET && stateOf(id) === false;

/**
 * The controls of the panel (plan 8S-5): only its member sees it (a private answer), so only
 * they press it. Every press counts in one window, a setting's write (`MEMBER_WRITE_THROTTLE`,
 * S13), the Submit that turns the history off in a tighter one of its own
 * (`HISTORY_OFF_THROTTLE`), whose button is refused while that is full (`checks`, before the
 * question opens); every press reads what it changes afresh and draws the panel again after it.
 */
export const settingsControls: ComponentHandler = {
  kind: SETTINGS_KIND,
  guards: [requirePanelServer],
  // Opening the Pokebattler id's dialog writes nothing: only its Submit counts (A1).
  throttle: (_interaction, id) =>
    id.action === ASK
      ? undefined
      : id.action === FORGET
        ? HISTORY_OFF_THROTTLE
        : MEMBER_WRITE_THROTTLE,
  checks: (_interaction, id) => (asksHistoryOff(id) ? HISTORY_OFF_THROTTLE : undefined),
  async button(interaction, id, ctx) {
    if (
      id.action === SHOW &&
      id.args.length === 0 &&
      (LISTS as readonly string[]).includes(id.id)
    ) {
      await showList(interaction, ctx, id.id as ListName);
      return;
    }
    if (id.action === ASK && id.id === POKEBATTLER && id.args.length === 0) {
      await askPokebattler(interaction, ctx);
      return;
    }
    const on = id.action === SET ? stateOf(id) : undefined;
    if (on === undefined) throw new UserError(STALE_COMPONENT);
    const flag = FLAGS.find((setting) => setting.name === id.id);
    if (flag !== undefined) await setFlag(interaction, ctx, flag, on);
    else if (id.id === 'new-train') await setNewTrain(interaction, ctx, on);
    else if (id.id === 'history') await setHistory(interaction, ctx, on);
    else if (id.id === 'leaderboard') await setBoards(interaction, ctx, on);
    else throw new UserError(STALE_COMPONENT);
  },
  async select(interaction, id, ctx) {
    if (id.action !== SET || id.args.length > 0) throw new UserError(STALE_COMPONENT);
    await pickSetting(interaction, ctx, id.id);
  },
  async modal(interaction, id, ctx) {
    if (id.id === 'history' && id.action === FORGET && id.args.length === 0) {
      await forgetSubmitted(interaction, ctx);
      return;
    }
    if (id.id !== POKEBATTLER || id.action !== SET || withoutOpenToken(id.args).length > 0) {
      throw new UserError(STALE_COMPONENT);
    }
    await setPokebattler(interaction, ctx);
  },
};

/** The subcommands of `/settings` before plan 8S-5: a client that still has them opens the panel. */
const FORMER_SUBCOMMANDS = [
  'show',
  'mentions',
  'mentions-groups',
  'mentions-shouts',
  'mentions-train-stops',
  'boss-set',
  'new-train',
  'history',
  'leaderboard',
  'auto-status',
  'privacy',
  'pokebattler-id',
];

/**
 * `/settings` (spec 4.2, plan 8S-5): what a member sets for themself, as one private panel that
 * changes in place. It works in any channel and in a DM with the bot, where it shows what is
 * set for the member as a whole. The party code reads these settings where it pings or signs
 * somebody up.
 */
export const settings: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('See and change your settings: pings, DMs, your history')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'notifications',
    details:
      'Shows your settings, only to you, with buttons and menus to change them: which pings ' +
      'and DMs you get, how you are signed up for what you report, and whether posts name you.' +
      '\n\nIn a server it also has what is set per server: DMs for new trains, your history, ' +
      'the boards, and how many wants and gyms you have there.' +
      '\n\n**Your history.** I keep a history of every raid, max battle, train and meetup that ' +
      'ends: what it was, where and when, and how many signed up, came and completed it. You ' +
      'always count in it, without your Discord id.' +
      '\n\nI keep every field research and Team GO Rocket report that ends too: what was ' +
      'reported, when, how it ended and how many others reported the same.' +
      '\n\nWith your history on, I also keep your Discord id with what you do from then on: ' +
      'what you sign up for and when, how far you get, and what you report. `/stats me` shows ' +
      'your numbers. Turning it off takes your id out of everything kept so far; it all still ' +
      'counts.' +
      '\n\nWhile a raid, max battle, train or meetup is going on, or a report stands, I keep ' +
      'who signed up or reported, to run it. When it ends, I keep only the ids of members ' +
      'whose history is on and delete the rest.' +
      '\n\nA report at a stop is kept by its area and region, never the stop itself. The old ' +
      'bot’s history is never tied to you.' +
      '\n\n**The boards.** `/stats boards` ranks members by what others confirmed, and only ' +
      'those who turned the boards on; they are off until you do. Turning them on turns your ' +
      'history on too, and turning your history off takes you off the boards. A raid or train ' +
      'you report anonymously counts on no board.',
    examples: ['/settings'],
  },
  formerSubcommands: FORMER_SUBCOMMANDS,
  defer: 'late',
  throttle: MEMBER_READ_THROTTLE,
  async execute(interaction, ctx) {
    await answer(interaction, v2Answer(await panelNow(interaction, ctx)));
  },
};
