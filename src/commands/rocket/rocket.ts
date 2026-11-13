import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type SlashCommandStringOption,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard } from '../../discord/command.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, dialog, readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { answer, showInPlace, v2Answer } from '../../discord/late-reply.js';
import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
import { isHideout, parseRocketKey, type RocketChoice } from '../../domain/rocket/lineups.js';
import type { ReportedStop, RocketReport } from '../../domain/stops/report.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { distanceWords } from '../../render/distance-words.js';
import { postLink } from '../../render/notify-dm.js';
import { DISCORD_CHANNEL } from '../../render/research.js';
import {
  alreadyReported,
  ROCKET_ACTIONS,
  ROCKET_COLOUR,
  ROCKET_KIND,
  rocketAnswer,
  rocketLabel,
} from '../../render/rocket.js';
import { plain } from '../../render/text.js';
import { textMessage } from '../../render/v2.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { isHideoutReport, type ReportRef } from '../../services/stop-reports.js';
import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
import { MORE_STOPS_METRES, reporterOf } from '../research/research.js';
import { namedStop, NO_STOPS_HERE, requireStopsOpen } from '../research/research-input.js';
import {
  NOT_YOUR_REPORT,
  NOTHING_LEFT,
  REPORT_CHANGED,
  takeBackAs,
  tookBackWords,
} from '../research/research-report.js';
import { hideoutQuestion, reportRocketAs } from './rocket-report.js';
import {
  GIOVANNI_ONLY_WHEN_SURE,
  NOT_A_ROCKET_STOP,
  readWho,
  ROCKET_FROM_A_REGION,
  rocketThrottle,
  rocketWindow,
  whoChoices,
} from './rocket-input.js';

/*
 * `/rocket` (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): Team GO Rocket at
 * PokéStops, offered on every server (Matt's answer 7). `report who: stop:` reports a grunt (a
 * message in the region channels for half an hour) or a hideout (the posts of the stops, until
 * midnight), one Rocket report per stop and day; a grunt where a hideout stands asks first, in a
 * dialog. `remove stop:` takes back the stop's report: one's own, any for staff.
 */

/** Said where no Rocket report stands at a stop. */
export const NOTHING_AT_STOP = 'No Team GO Rocket is reported at that PokéStop now.';

/** Said at the dialog's Submit where the hideout it asked about is no longer what stands. */
export const HIDEOUT_CHANGED =
  'The report at that PokéStop changed while I asked: nothing was reported. Look again with ' +
  '`/rocket report`.';

/** What a use's guard read: who, where, and what stands there (a hideout asks first). */
interface RocketAsk {
  choice: RocketChoice;
  stop: ReportedStop;
  /** The hideout that stands at the stop today, which a grunt asks about first. */
  hideout: RocketReport | undefined;
}

/** A question waiting for its Submit: the use it carries on, counted when and where. */
interface WaitingAsk extends RocketAsk {
  hideout: RocketReport;
  countedAt: number;
  throttle: Throttle;
  window: string;
}

/** What each use's guard read: the command takes it (one reading in all). */
const asked = new WeakMap<ChatInputCommandInteraction, RocketAsk>();

/** The reports that wait for the dialog's Submit. */
const pending = new PendingRequests<WaitingAsk>();

/**
 * Refuses what can be known before anything is reported, so that it does not count: no region
 * here, no stops known, who and the stop (`readWho`, `namedStop`); and reads what stands at the
 * stop, so that a grunt where a hideout stands opens the dialog (no deferral before it).
 */
const requireRocketReport: Guard = async (interaction, ctx) => {
  if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(ROCKET_FROM_A_REGION);
  const row = await ctx.guilds.idFor(guildIdOf(interaction));
  if (row === undefined || !ctx.placeFinder.hasStops(row)) throw new UserError(NO_STOPS_HERE);
  if (!interaction.isChatInputCommand()) return;
  const choice = readWho(ctx, interaction.options.getString('who', true));
  const stop = await namedStop(
    interaction,
    ctx,
    interaction.options.getString('stop', true),
    NOT_A_ROCKET_STOP,
  );
  // Not at a stop of a region the member is kept out of (plan 8Z-2), before anything is asked.
  await requireStopsOpen(interaction, ctx, [stop]);
  const who = parseRocketKey(choice.key);
  const standing = await ctx.stopReports.rocketAt(guildIdOf(interaction), stop.key);
  const hideout =
    who !== undefined && !isHideout(who) && standing && isHideoutReport(standing)
      ? standing
      : undefined;
  asked.set(interaction, { choice, stop, hideout });
};

/** The dialog that asks before a grunt replaces a hideout (design 5.2, 9.4). */
function replaceDialog(token: string, ask: WaitingAsk) {
  return dialog({
    customId: encodeCustomId({ kind: ROCKET_KIND, id: token, action: ROCKET_ACTIONS.replace }),
    title: 'Replace a hideout?',
    text: `${hideoutQuestion(ask.hideout.rocket.name, rocketLabel(ask.choice))}\n\nSubmit replaces it.`,
  });
}

/**
 * Reports as the member and answers (`answer`: directly, or the acknowledgement's edit). A
 * hideout that came between the read and the report is none of the member's doing: the use goes
 * back.
 */
async function report(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  ctx: AppContext,
  ask: RocketAsk,
  replacing: number | undefined,
): Promise<void> {
  const serverId = guildIdOf(interaction);
  const outcome = await reportRocketAs(
    ctx,
    serverId,
    {
      choice: ask.choice,
      stop: ask.stop,
      reporter: reporterOf(interaction),
      ...(replacing === undefined ? {} : { replacing }),
    },
    DISCORD_CHANNEL,
  );
  switch (outcome.kind) {
    case 'asks':
      throw new UserError(
        replacing === undefined
          ? `**${plain(outcome.standing.rocket.name)}** was reported at that PokéStop just now, ` +
              'and a hideout keeps grunts away all day. Use `/rocket report` again to replace it.'
          : HIDEOUT_CHANGED,
        { givesBack: true },
      );
    case 'unposted':
    case 'overtaken':
      // None of the member's doing: the use goes back.
      throw new UserError(outcome.text, { givesBack: true });
    case 'already': {
      const [message] = outcome.posted;
      const link =
        message === undefined
          ? undefined
          : postLink(serverId, message.channelId, message.messageId);
      await answer(interaction, { content: alreadyReported(outcome.standing, link) });
      // "Already reported" does not count (plan 8R-6, Matt): answered, the use given back.
      throw new UserError('Already reported', { givesBack: true, said: true });
    }
    case 'reported':
      await answer(interaction, v2Answer(rocketAnswer(outcome.view)));
  }
}

/**
 * The report a Take back means where its id is gone (fix S3): the presser's own Rocket report of
 * the same who made at the same moment (`args`: the stop's key, the `rocketKey` with `.` for
 * every `:` (plan 8R-4L, S9: a lineup's key has two) and `madeAt` in base 36) at the same stop,
 * standing now: a hideout put back keeps its time, a newer report of the same who has its own
 * (fix F1). Undefined for none, a button without them, or one with more.
 */
async function sameReportNow(
  ctx: AppContext,
  serverId: string,
  args: readonly string[],
  memberId: string,
): Promise<RocketReport | undefined> {
  const [stopKey, who, made, ...more] = args;
  if (stopKey === undefined || who === undefined || made === undefined) return undefined;
  if (more.length > 0 || !/^[0-9a-z]{1,12}$/.test(made)) return undefined;
  const standing = await ctx.stopReports.rocketAt(serverId, stopKey);
  return standing?.subjectKey === who.replaceAll('.', ':') &&
    standing.reporter.id === memberId &&
    standing.madeAt === parseInt(made, 36)
    ? standing
    : undefined;
}

/**
 * The version of the report a Take back means (review L1): its id, and the `madeAt` its button
 * carries (`args`, as `sameReportNow` reads them), which a report refined in place since no
 * longer has. A button without them, or with more, means the id alone.
 */
function versionOf(id: number, args: readonly string[]): ReportRef {
  const [, , made, ...more] = args;
  if (made === undefined || more.length > 0 || !/^[0-9a-z]{1,12}$/.test(made)) return id;
  return { id, madeAt: parseInt(made, 36) };
}

/** The `stop` option of both subcommands. */
const stopOption = (option: SlashCommandStringOption) =>
  option
    .setName('stop')
    .setDescription('The PokéStop: pick from the list, or paste a maps link')
    .setRequired(true)
    .setMaxLength(MAX_PLACE_TEXT)
    .setAutocomplete(true);

/**
 * `/rocket report who: stop:` (design 5.2): a grunt (its message in the region channels of the
 * stop for `settings.rocket.gruntMinutes`) or a hideout (the post of the stops, until midnight), in the
 * place of the stop's Rocket report of the day; the same grunt again is reported already; a grunt
 * where a hideout stands asks first. Its own throttle window (design 9.12).
 */
const reportRocket: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('report')
    .setDescription('Report a Team GO Rocket grunt, leader or Giovanni at a PokéStop')
    .addStringOption((option) =>
      option
        .setName('who')
        .setDescription('Who you met: pick from the list (Giovanni only once you are sure)')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption(stopOption),
  help: {
    details: (settings, facts) =>
      'Reports who of Team GO Rocket is at a PokéStop. Pick them from the list that appears ' +
      'while you type (it finds them by what can be caught too: `dratini`), and the stop from ' +
      'its list, or paste a maps link to a stop. The stops list puts your region’s stops ' +
      'first.\n\nThose near the stop where you last reported today (research or Team GO ' +
      'Rocket, also a report that has ended or changed since, but not one you took back) ' +
      'come first among stops that fit what you type equally well. With nothing typed, it lists the PokéStops within ' +
      `${distanceWords(MORE_STOPS_METRES, facts?.server?.distanceUnits ?? 'imperial')} of that stop, nearest ` +
      `first.\n\nA grunt is posted in the region’s channel for ` +
      `${String(settings.rocket.gruntMinutes)} minutes. A leader, Giovanni or a decoy grunt ` +
      'goes in "Today’s Stops" on the region’s board until midnight and keeps grunts away from ' +
      'the stop all day; a leader or Giovanni new today also gets a line in the region’s ' +
      `channel. You can report from the board too.\n\n${GIOVANNI_ONLY_WHEN_SURE}\n\nA ` +
      'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
      'first), and the same grunt twice is answered with the report that stands. Members who ' +
      'want it get a direct message. The answer you get can take the report back.\n\nYou can make ' +
      `${String(settings.rocket.throttle.uses)} reports in ` +
      `${String(settings.rocket.throttle.minutes)} minutes; up to ` +
      `${String(settings.rocket.throttle.uses)} answers of "Already reported" in that time do not count.`,
    examples: [
      '/rocket report who:Water-type grunt stop:Yellow Mural',
      '/rocket report who:Arlo stop:Fountain Square',
    ],
  },
  guards: [requireRocketReport],
  // The dialog is the first answer where one opens: nothing is deferred before it.
  defer: (interaction) => (asked.get(interaction)?.hideout ? undefined : 'late'),
  throttle: (_interaction, ctx) => rocketThrottle(ctx.config.settings),
  async execute(interaction, ctx) {
    const ask = asked.get(interaction);
    if (!ask) throw new UserError('Use `/rocket report` again.');
    const { hideout } = ask;
    if (!hideout) {
      await report(interaction, ctx, ask, undefined);
      return;
    }
    // Nothing more is read for the dialog, but the guard's reads must have left Discord's three
    // seconds for it (the slow-read rule).
    await readInTime(ctx.log, interaction, () => Promise.resolve());
    const { settings } = ctx.config;
    const waiting: WaitingAsk = {
      ...ask,
      hideout,
      countedAt: whenCounted(interaction) ?? Date.now(),
      throttle: rocketThrottle(settings),
      window: rocketWindow(settings),
    };
    const token = pending.put(interaction, waiting);
    await interaction.showModal(replaceDialog(token, waiting));
  },
  autocomplete: async (interaction, ctx) => {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(
      focused.name === 'who'
        ? whoChoices(ctx, focused.value)
        : await nearChoices(interaction, ctx, focused.value, ['stop'], {
            points: () => lastReportedAt(interaction, ctx),
            within: MORE_STOPS_METRES,
          }),
    );
  },
};

/** How long `/rocket report stop:`'s list waits for the member's last report (review P1). */
const LAST_REPORT_BUDGET_MS = 1_000;

/**
 * Where the member last reported in this server today, research or Team GO Rocket
 * (`StopReportService.latestToday`: the record of their reports, standing, ended or changed by
 * another since, not one they took back, review S1; Matt, 2026-10-27: the next grunt is almost always near the last stop; "Last
 * today"): `/rocket report stop:` offers the stops near it first. None without one, where the
 * reports cannot be read, or where they do not answer within `LAST_REPORT_BUDGET_MS` (the list as
 * before).
 */
async function lastReportedAt(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<LatLon[]> {
  if (!interaction.inGuild()) return [];
  // Within a budget (review P1): a slow pool must not cost the list Discord's three seconds.
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), LAST_REPORT_BUDGET_MS);
    timer.unref();
  });
  try {
    const latest = await Promise.race([
      ctx.stopReports.latestToday(interaction.guildId, interaction.user.id),
      late,
    ]);
    if (latest === 'late') {
      ctx.log.debug('the reports at stops did not answer in time for /rocket report’s list');
      return [];
    }
    return latest ? [{ lat: latest.lat, lon: latest.lon }] : [];
  } catch (err) {
    ctx.log.warn({ err }, 'could not read the reports at stops for /rocket report’s list');
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** `/rocket remove stop:`: takes back the Rocket report at a stop; one's own, or any for staff. */
const removeRocket: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Take back the Team GO Rocket report at a PokéStop')
    .addStringOption(stopOption),
  help: {
    details:
      'Takes back what of Team GO Rocket is reported at a PokéStop: your own report, or any ' +
      'for staff. A grunt’s message is deleted with it; the report it replaced does not come ' +
      'back.',
    examples: ['/rocket remove stop:Yellow Mural'],
  },
  guards: [requireGuild],
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const stop = await namedStop(
      interaction,
      ctx,
      interaction.options.getString('stop', true),
      NOT_A_ROCKET_STOP,
    );
    const serverId = guildIdOf(interaction);
    const standing = await ctx.stopReports.rocketAt(serverId, stop.key);
    if (!standing) throw new UserError(NOTHING_AT_STOP);
    // By the version read (F6; a replacement is a report of its own, a refine keeps the id with
    // another `madeAt`): one replaced or refined since is not taken back.
    const taken = await takeBackAs(
      ctx,
      serverId,
      { id: standing.id, madeAt: standing.madeAt },
      interaction.user.id,
      isStaff(interaction, ctx),
    );
    if (taken.kind !== 'removed') {
      throw new UserError(taken.kind === 'not-yours' ? NOT_YOUR_REPORT : REPORT_CHANGED);
    }
    await answer(interaction, { content: taken.text });
  },
  autocomplete: async (interaction, ctx) => {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(await nearChoices(interaction, ctx, focused.value, ['stop']));
  },
};

/** `/rocket` (plan 8R-2): Team GO Rocket at PokéStops, offered on every server (Matt's answer 7). */
export const rocket = commandGroup({
  data: new SlashCommandBuilder()
    .setName('rocket')
    .setDescription('Report Team GO Rocket at PokéStops'),
  help: { category: 'notifications' },
  parts: [reportRocket, removeRocket],
});

/**
 * The controls of `/rocket report` (kind `rocket`): "Take back" on its answer
 * (`rocket:<report id>:back`: the presser's own, any for staff, answered in the answer's place;
 * by its version, review L1: a report refined in place since is `REPORT_CHANGED` for anyone)
 * and the dialog's Submit (`rocket:<token>:replace`: the grunt reported in the place of the
 * hideout it asked about, decided again; it carries on the use `/rocket report` counted).
 */
export const rocketControls: ComponentHandler = {
  kind: ROCKET_KIND,
  guards: [requireGuild],
  throttle: (_interaction, id) =>
    id.action === ROCKET_ACTIONS.back ? MEMBER_WRITE_THROTTLE : undefined,
  carriesOn: (interaction, id) => {
    if (id.action !== ROCKET_ACTIONS.replace) return undefined;
    const waiting = pending.peek(id.id, interaction);
    return typeof waiting === 'object'
      ? { ...waiting.value.throttle, as: waiting.value.window, countedAt: waiting.value.countedAt }
      : undefined;
  },
  async button(interaction, id, ctx) {
    if (id.action !== ROCKET_ACTIONS.back || !/^\d{1,10}$/.test(id.id)) {
      throw new UserError(STALE_COMPONENT);
    }
    const serverId = guildIdOf(interaction);
    const as = isStaff(interaction, ctx) ? 'staff' : 'member';
    const taken = await ctx.stopReports.takeBack(
      serverId,
      [versionOf(Number(id.id), id.args)],
      interaction.user.id,
      as,
    );
    // Refined in place since the answer (review L1): its first reporter and staff alike are told.
    if (taken.changed.length > 0) throw new UserError(REPORT_CHANGED);
    let { removed, notYours } = taken;
    if (removed.length === 0 && notYours.length === 0) {
      // Gone by its id: a hideout put back under a new id (fix S3) is found by its meaning, the
      // presser's report of the same who at the same stop and day standing now.
      const meant = await sameReportNow(ctx, serverId, id.args, interaction.user.id);
      if (meant) {
        ({ removed, notYours } = await ctx.stopReports.takeBack(
          serverId,
          [meant.id],
          interaction.user.id,
          as,
        ));
      }
    }
    if (removed.length === 0 && notYours.length > 0) throw new UserError(NOT_YOUR_REPORT);
    const [first] = removed;
    await showInPlace(
      interaction,
      textMessage(ROCKET_COLOUR, [first === undefined ? NOTHING_LEFT : tookBackWords(first)]),
    );
  },
  async modal(interaction, id, ctx) {
    if (id.action !== ROCKET_ACTIONS.replace) throw new UserError(STALE_COMPONENT);
    const taken = pending.take(id.id, interaction);
    if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
    if (taken === 'expired') {
      throw new UserError('That question has expired. Use `/rocket report` again.');
    }
    await deferSubmit(interaction);
    const ask = taken.value;
    await report(interaction, ctx, ask, ask.hideout.id);
  },
};
