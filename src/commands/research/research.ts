import {
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AnySelectMenuInteraction,
  type APIModalInteractionResponseCallbackData,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard, LocatedInteraction } from '../../discord/command.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import {
  deferSubmit,
  dialog,
  DIALOG_READ_MS,
  readInTime,
  SLOW_READ,
} from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { answer, answerApart, showInPlace, v2Answer } from '../../discord/late-reply.js';
import { memberInfo } from '../../discord/member-info.js';
import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
import { holdsSubject, isOneOf } from '../../domain/research/reports.js';
import { rewardsInShort, type TaskReward } from '../../domain/research/task.js';
import {
  isResearchReport,
  type Reporter,
  type ReportedStop,
  type ResearchReport,
} from '../../domain/stops/report.js';
import { streetOf } from '../../domain/search/wayspot-index.js';
import {
  RESEARCH_ACTIONS,
  RESEARCH_COLOUR,
  RESEARCH_KIND,
  reportSubject,
  researchAnswer,
  stopLine,
  type MoreStop,
} from '../../render/research.js';
import { distanceWords } from '../../render/distance-words.js';
import { clockText, endSentence, truncate } from '../../render/text.js';
import { textMessage } from '../../render/v2.js';
import { PendingRequests } from '../../services/pending-requests.js';
import type { ResearchSubject } from '../../services/stop-reports.js';
import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
import {
  MAX_TYPED,
  namedStop,
  namedStops,
  NO_STOPS_HERE,
  readTask,
  RESEARCH_FROM_A_REGION,
  researchThrottle,
  researchWindow,
  rewardChoices,
  STOP_OPTIONS,
  TASK_LIST_CHANGED,
  taskChoices,
  versionSubject,
} from './research-input.js';
import {
  NOT_YOUR_REPORT,
  NOTHING_LEFT,
  PERIOD_ENDED,
  REPORT_CHANGED,
  REPORT_ENDED,
  replaceQuestion,
  reporterNamed,
  reportResearchAs,
  stopsByKey,
  takeBackAs,
  type ResearchReported,
} from './research-report.js';

/** "Same task at more stops…" offers the stops within this many meters of the first one. */
export const MORE_STOPS_METRES = 2_000;

/** How many stops it offers: a menu's 25. */
const MORE_STOPS = 25;

/** Said where no field research is reported at a stop now. */
export const NOTHING_AT_STOP = 'No field research is reported at that PokéStop now.';

export { NOT_YOUR_REPORT, PERIOD_ENDED, REPORT_CHANGED, REPORT_ENDED } from './research-report.js';

/** The reporter of a use, by name as shown (cut to what is kept; also `/rocket`'s). */
export function reporterOf(interaction: LocatedInteraction): Reporter {
  return reporterNamed(
    interaction.user.id,
    memberInfo(interaction).name,
    interaction.user.username,
  );
}

/**
 * The stops "Same task at more stops…" offers (design 4.3): the server's PokéStops within
 * `MORE_STOPS_METRES` of the first stop, nearest first, without a report of this version in the
 * period (for a "one of", without a report of any version of its task: plan 8R-5, R8), 25 at
 * most.
 */
async function moreStops(
  interaction: LocatedInteraction,
  ctx: AppContext,
  first: ReportedStop,
  subject: ResearchSubject,
  periodKey: string,
): Promise<MoreStop[]> {
  const row = await ctx.guilds.idFor(guildIdOf(interaction));
  const ours = new Set(
    ctx.regions
      .all()
      .filter((region) => row !== undefined && region.guildId === row)
      .map((region) => region.channelId),
  );
  // The stops that hold the subject already, by the one rule the map's offers use too.
  const held = { subjectKey: subject.subjectKey, oneOf: isOneOf(subject) };
  const reported = new Set(
    (await ctx.stopReports.standing(guildIdOf(interaction)))
      .filter(
        (report) =>
          report.kind === 'research' &&
          report.periodKey === periodKey &&
          holdsSubject(report.subjectKey, held),
      )
      .map((report) => report.stop.key),
  );
  return ctx.wayspots
    .near(first, MORE_STOPS_METRES, ['stop'])
    .filter(
      ({ wayspot }) =>
        wayspot.title.trim() !== '' &&
        !reported.has(wayspot.id) &&
        ctx.wayspots.regionsOf(wayspot.id).some((id) => ours.has(id)),
    )
    .slice(0, MORE_STOPS)
    .map(({ wayspot, metres }) => ({
      key: wayspot.id,
      name: wayspot.title,
      metres,
      where: streetOf(wayspot.address),
    }));
}

/**
 * The answer of a report: its words (`reportResearchAs`'s view) with "Same task at more stops…"
 * worked out for this use.
 */
async function answerOf(
  interaction: LocatedInteraction,
  ctx: AppContext,
  { outcome, view }: ResearchReported,
  subject: ResearchSubject,
) {
  const [first] = outcome.saved;
  return researchAnswer({
    ...view,
    units: ctx.config.settings.distanceUnits,
    more:
      first === undefined
        ? []
        : await moreStops(interaction, ctx, first.report.stop, subject, outcome.period.key),
  });
}

/** Why a use is given back after its answer: every stop was reported already (plan 8R-6). */
const ALREADY_REPORTED = 'Already reported';

/**
 * Gives a use back that reported nothing (plan 8R-6, Matt: "Already reported" does not count
 * against the throttle): thrown after the answer, a `UserError` the router says no more and whose
 * use goes back. A use that reports at any stop counts, also when others were reported already.
 */
function givenBackWhenNothingReported({ outcome }: ResearchReported): void {
  if (outcome.saved.length === 0) {
    throw new UserError(ALREADY_REPORTED, { givesBack: true, said: true });
  }
}

/**
 * The version "Same task at more stops…" reports (R14): the one its custom id carries, as the
 * list has it, else as a report of the period keeps it (a typed task; one gone from the list), so
 * that the first report narrowed or replaced meanwhile does not stop it; refused with
 * `REPORT_ENDED` (the use given back) where the first report is of an ended period, where it is
 * gone and the answer (`shownAt`, its message's time) was made in another period than now
 * (review L1: yesterday's task is not reported into today), or where nothing has the version
 * now. An answer of before plan 8R-5 carries none: its first report's.
 */
async function moreSubject(
  ctx: AppContext,
  serverId: string,
  baseId: number,
  version: string | undefined,
  shownAt: number,
): Promise<ResearchSubject> {
  const period = ctx.stopReports.period().key;
  const ended = new UserError(REPORT_ENDED, { givesBack: true });
  const base = await ctx.stopReports.kept(serverId, baseId);
  if (base !== undefined && (base.kind !== 'research' || base.periodKey !== period)) throw ended;
  if (base?.kind === 'research' && (version === undefined || base.subjectKey === version)) {
    return { subjectKey: base.subjectKey, research: base.research };
  }
  if (version === undefined) throw ended;
  if (base === undefined && ctx.stopReports.period(shownAt).key !== period) throw ended;
  const found = ctx.researchTasks.byVersion(version);
  if (found) return versionSubject(found.task, found.version);
  const same = (await ctx.stopReports.standing(serverId))
    .filter(isResearchReport)
    .find((report) => report.periodKey === period && report.subjectKey === version);
  if (!same) throw ended;
  return { subjectKey: same.subjectKey, research: same.research };
}

/**
 * What a report of a use is: the version, the stops, the contradicted reports of other members
 * standing at them (plan 8R-5, R7: asked about first, in a dialog), and whether it is "Same task
 * at more stops…" (`also`); `listed` where the version is the task list's (its Submit refuses
 * one gone from the list since: review L8).
 */
interface ResearchUse {
  subject: ResearchSubject;
  stops: ReportedStop[];
  contested: ResearchReport[];
  also: boolean;
  listed: boolean;
}

/** A use of these stops and this version, as read. */
function useOf(
  ctx: Pick<AppContext, 'researchTasks'>,
  subject: ResearchSubject,
  stops: ReportedStop[],
  contested: ResearchReport[],
  also: boolean,
): ResearchUse {
  const listed = ctx.researchTasks.byVersion(subject.subjectKey) !== undefined;
  return { subject, stops, contested, also, listed };
}

/**
 * A question waiting for its Submit: the use it carries on, counted when and where, and the key
 * of the research period it was asked in (review W2: its Submit reports into no later one).
 */
interface WaitingUse extends ResearchUse {
  countedAt: number;
  throttle: Throttle;
  window: string;
  periodKey: string;
}

/** What each use's guard read: the command takes it (one reading in all). */
const asked = new WeakMap<ChatInputCommandInteraction, ResearchUse>();

/** The reports that wait for the dialog's Submit. */
const pending = new PendingRequests<WaitingUse>();

/** The input of the dialog: a checkbox per contested stop, by the report's id. */
const CONTESTED_INPUT = 'replace';

/** A version's rewards as a choice's description says them (no markdown there). */
function rewardsAsText(rewards: readonly TaskReward[]): string {
  const short = rewardsInShort(rewards);
  return rewards.length > 1 ? `one of ${short}` : short;
}

/** A description's room (Discord's 100 characters). */
const DESCRIPTION_ROOM = 100;

/**
 * What stands at a contested stop, as its checkbox describes it: `Make 3 Excellent Throws in a
 * row · Gible, by Misty at 10:05 AM`. Who and when are always kept (review L3): the name cut to
 * 32 characters, the rewards to 40, and the task's text to the room left; the clock as plain
 * text (`clockText`: a description shows no Discord timestamp).
 */
function contestedDescription(report: ResearchReport, zone: string): string {
  const who = `, by ${truncate(report.reporter.name, 32)} at ${clockText(report.madeAt, zone)}`;
  const rewards = truncate(rewardsAsText(report.research.rewards), 40);
  const after = `${rewards === '' ? '' : ` · ${rewards}`}${who}`;
  // At most 92 characters after the task's text (the name and the rewards cut, a clock of eight):
  // the text has the room left, never more, so that the cut never reaches the time (review F2).
  return `${truncate(report.research.text, DESCRIPTION_ROOM - after.length)}${after}`;
}

/**
 * The dialog that asks before a report contradicts other members' reports (R7): a checkbox per
 * contested stop, unticked (the member must go out of their way to overrule one), saying what
 * stands there, who reported it and when; Submit reports at every stop, the ticked ones replaced.
 */
function replaceDialog(token: string, use: WaitingUse, zone: string) {
  const question = replaceQuestion(
    use.subject.research,
    use.contested.length > 1,
    use.also ? 'picked' : 'named',
  );
  const shown = dialog({
    customId: encodeCustomId({ kind: RESEARCH_KIND, id: token, action: RESEARCH_ACTIONS.replace }),
    title: 'Replace field research?',
    // The other stops only where there are any (review L4).
    text:
      use.stops.length > use.contested.length
        ? `${question}\n\nSubmit reports at the other stops as well.`
        : question,
  });
  return {
    ...shown,
    components: [
      ...shown.components,
      {
        type: ComponentType.Label,
        label: 'Replace the report at',
        component: {
          type: ComponentType.CheckboxGroup,
          custom_id: CONTESTED_INPUT,
          required: false,
          min_values: 0,
          max_values: use.contested.length,
          options: use.contested.map((report) => ({
            label: truncate(report.stop.name, 100),
            value: String(report.id),
            description: contestedDescription(report, zone),
          })),
        },
      },
    ],
  } satisfies APIModalInteractionResponseCallbackData;
}

/**
 * Asks in the dialog before contradicting other members' reports (R7), as the first answer of
 * the use: nothing more is read, but what was read must have left Discord's three seconds.
 */
async function askToReplace(
  interaction: ChatInputCommandInteraction | AnySelectMenuInteraction,
  ctx: AppContext,
  use: ResearchUse,
): Promise<void> {
  await readInTime(ctx.log, interaction, () => Promise.resolve());
  const { settings } = ctx.config;
  const countedAt = whenCounted(interaction) ?? Date.now();
  const waiting: WaitingUse = {
    ...use,
    countedAt,
    throttle: researchThrottle(settings),
    window: researchWindow(settings),
    periodKey: ctx.stopReports.period(countedAt).key,
  };
  const token = pending.put(interaction.user.id, waiting);
  await interaction.showModal(replaceDialog(token, waiting, settings.timezone));
}

/**
 * A read whose answer decides whether a dialog opens, raced against `DIALOG_READ_MS` of the
 * interaction (review F1, the slow-read rule): back in time, as it is (`deferred` false, nothing
 * answered yet); past the budget, the press is deferred privately at once and the read awaited
 * (`deferred` true: no dialog can open any more). A read that fails passes its error on, before
 * or after the deferral.
 */
async function readOrDefer<T>(
  interaction: AnySelectMenuInteraction,
  work: Promise<T>,
): Promise<{ value: T; deferred: boolean }> {
  const age = Math.max(0, Date.now() - interaction.createdTimestamp);
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), Math.max(0, DIALOG_READ_MS - age));
  });
  try {
    const first = await Promise.race([work.then((value) => ({ value })), late]);
    if (first !== 'late') return { value: first.value, deferred: false };
  } finally {
    clearTimeout(timer);
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return { value: await work, deferred: true };
}

/**
 * Refuses what can be known before anything is reported, so that it does not count; and reads
 * what stands at the stops, so that a contradiction opens the dialog (no deferral before it).
 */
const requireResearchReport: Guard = async (interaction, ctx) => {
  if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(RESEARCH_FROM_A_REGION);
  const row = await ctx.guilds.idFor(guildIdOf(interaction));
  if (row === undefined || !ctx.placeFinder.hasStops(row)) throw new UserError(NO_STOPS_HERE);
  if (interaction.isChatInputCommand()) {
    const subject = readTask(
      ctx,
      interaction.options.getString('task', true),
      interaction.options.getString('reward'),
    );
    const stops = await namedStops(interaction, ctx);
    const contested = await ctx.stopReports.contested(
      guildIdOf(interaction),
      stops,
      subject,
      interaction.user.id,
    );
    asked.set(interaction, useOf(ctx, subject, stops, contested, false));
  }
};

const stopOption = (name: string, required: boolean) => (option: SlashCommandStringOption) =>
  option
    .setName(name)
    .setDescription(
      required
        ? 'The PokéStop: pick from the list, or paste a maps link'
        : 'Another PokéStop with the same task',
    )
    .setRequired(required)
    .setMaxLength(MAX_PLACE_TEXT)
    .setAutocomplete(true);

/**
 * The choices of the options of `/research`. A stop's are nearby stops first (Matt, 2026-10-27):
 * the other stop options already picked from the list are its anchors, and an empty one lists
 * the PokéStops within `MORE_STOPS_METRES` of the nearest of them (`nearChoices`).
 */
async function researchChoices(interaction: AutocompleteInteraction, ctx: AppContext) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === 'task') return taskChoices(ctx, focused.value);
  if (focused.name === 'reward') return rewardChoices(ctx, focused.value);
  const others = STOP_OPTIONS.filter((name) => name !== focused.name).map((name) =>
    interaction.options.getString(name),
  );
  return nearChoices(interaction, ctx, focused.value, ['stop'], {
    values: others,
    within: MORE_STOPS_METRES,
  });
}

/**
 * `/research report task: stop: [stop2:] … [stop5:] [reward:]` (plan 8R-1; design 4.3): a task
 * at up to five PokéStops, each in the place of the stop's report of the period. No message of
 * its own: the post of the stops of the region shows it, and who wants a reward is told by DM.
 */
const reportResearch: SubcommandPart = {
  data: (() => {
    const builder = new SlashCommandSubcommandBuilder()
      .setName('report')
      .setDescription('Report the field research task of PokéStops')
      .addStringOption((option) =>
        option
          .setName('task')
          .setDescription('The task: pick from the list (or type it in full if it is missing)')
          .setRequired(true)
          .setMaxLength(MAX_TYPED)
          .setAutocomplete(true),
      )
      .addStringOption(stopOption('stop', true));
    for (const name of STOP_OPTIONS.slice(1)) builder.addStringOption(stopOption(name, false));
    return builder.addStringOption((option) =>
      option
        .setName('reward')
        .setDescription(
          'The reward: of a task you typed, or of a listed task picked without one (Pokémon, item…)',
        )
        .setMaxLength(MAX_TYPED)
        .setAutocomplete(true),
    );
  })(),
  help: {
    details: (settings) =>
      'Reports the field research task of up to five PokéStops at once. Pick the task from the ' +
      'list that appears while you type: a task has a choice for each of its rewards, and one ' +
      'of several Pokémon also "one of" its Pokémon, for a task not done yet (the game shows ' +
      'which only then).\n\nThe list finds tasks by their rewards too (`dratini`). Pick the stops ' +
      'from theirs (your region’s first, then those nearest the stops you picked already; ' +
      'with nothing typed, the stops within ' +
      `${distanceWords(MORE_STOPS_METRES, settings.distanceUnits)} of them, nearest first), ` +
      'or paste a maps link to a stop.\n\nA report replaces ' +
      'your own at a stop today, and a "one of" by one of its Pokémon. Another member’s report ' +
      'is asked about first: tick the stops whose report you replace. The same report again, ' +
      'or one that says less, is "Already reported".\n\n"Today’s Stops" on the region’s board ' +
      '(its forum’s pinned post, where you can report too) shows every task of the day, a ' +
      'task new today gets a line in ' +
      'the region’s channel, and members who want a reward get a direct message.\n\nA task ' +
      'missing from the list can be typed in full, with its ' +
      '`reward`. Your answer offers the same task at more stops nearby and takes the report ' +
      `back. You can make ${String(settings.research.throttle.uses)} reports in ` +
      `${String(settings.research.throttle.minutes)} minutes; up to ` +
      `${String(settings.research.throttle.uses)} answers of "Already reported" in that time do not count.`,
    examples: [
      '/research report task:Make 2 Excellent Throws stop:Yellow Mural stop2:Paititi Inti',
      '/research report task:Catch 3 Pokémon in the rain stop:Fountain Square reward:Rare Candy',
    ],
  },
  guards: [requireResearchReport],
  // The dialog is the first answer where one opens: nothing is deferred before it.
  defer: (interaction) =>
    (asked.get(interaction)?.contested.length ?? 0) > 0 ? undefined : 'late',
  throttle: (_interaction, ctx) => researchThrottle(ctx.config.settings),
  async execute(interaction, ctx) {
    const use = asked.get(interaction);
    if (!use) throw new UserError('Use `/research report` again.');
    if (use.contested.length > 0) {
      await askToReplace(interaction, ctx, use);
      return;
    }
    const reported = await reportResearchAs(ctx, guildIdOf(interaction), {
      stops: use.stops,
      subject: use.subject,
      reporter: reporterOf(interaction),
    });
    await answer(interaction, v2Answer(await answerOf(interaction, ctx, reported, use.subject)));
    givenBackWhenNothingReported(reported);
  },
  autocomplete: async (interaction, ctx) => {
    await interaction.respond(await researchChoices(interaction, ctx));
  },
};

/** `/research remove stop:`: takes back the report at a stop; one's own, or any for staff. */
const removeResearch: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Take back the field research reported at a PokéStop')
    .addStringOption(stopOption('stop', true)),
  help: {
    details:
      'Takes back the task reported at a PokéStop today: your own report, or any for staff. ' +
      'The report it replaced does not come back.',
    examples: ['/research remove stop:Yellow Mural'],
  },
  guards: [requireGuild],
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const stop = await namedStop(interaction, ctx, interaction.options.getString('stop', true));
    const serverId = guildIdOf(interaction);
    const report = await ctx.stopReports.at(serverId, stop.key);
    if (!report) throw new UserError(NOTHING_AT_STOP);
    // By its id, which never changes what it is (a replacement is a report of its own): one
    // replaced since it was read is gone, and nothing is taken back.
    const taken = await takeBackAs(
      ctx,
      serverId,
      report.id,
      interaction.user.id,
      isStaff(interaction, ctx),
    );
    if (taken.kind !== 'removed') {
      throw new UserError(taken.kind === 'not-yours' ? NOT_YOUR_REPORT : REPORT_CHANGED);
    }
    await answer(interaction, { content: taken.text });
  },
  autocomplete: async (interaction, ctx) => {
    await interaction.respond(await researchChoices(interaction, ctx));
  },
};

/** `/research` (plan 8R-1): field research at PokéStops, offered on every server (Matt's answer 7). */
export const research = commandGroup({
  data: new SlashCommandBuilder()
    .setName('research')
    .setDescription('Report the field research tasks of PokéStops'),
  help: { category: 'notifications' },
  parts: [reportResearch, removeResearch],
});

/**
 * The controls of `/research report`'s answer (kind `research`): "Same task at more stops…"
 * (`research:<report id>:more`, a menu of stop keys: the task of that report at the stops picked,
 * a report counted in `/research report`'s window, answered apart) and "Take back"
 * (`research:<id>:back[:<id>…]`: those reports, the presser's own or any for staff, answered in
 * the answer's place). Nothing is kept in memory: a report is read again by its id.
 */
export const researchControls: ComponentHandler = {
  kind: RESEARCH_KIND,
  guards: [requireGuild],
  throttle: (_interaction, id, ctx) => {
    if (id.action === RESEARCH_ACTIONS.replace) return undefined;
    return id.action === RESEARCH_ACTIONS.more
      ? { ...researchThrottle(ctx.config.settings), as: researchWindow(ctx.config.settings) }
      : MEMBER_WRITE_THROTTLE;
  },
  carriesOn: (interaction, id) => {
    if (id.action !== RESEARCH_ACTIONS.replace) return undefined;
    const waiting = pending.peek(id.id, interaction.user.id);
    return typeof waiting === 'object'
      ? { ...waiting.value.throttle, as: waiting.value.window, countedAt: waiting.value.countedAt }
      : undefined;
  },
  async select(interaction, id, ctx) {
    const [arg, ...more] = id.args;
    if (id.action !== RESEARCH_ACTIONS.more || !/^\d{1,10}$/.test(id.id) || more.length > 0) {
      throw new UserError(STALE_COMPONENT);
    }
    const serverId = guildIdOf(interaction);
    const reading = (async () => {
      const subject = await moreSubject(
        ctx,
        serverId,
        Number(id.id),
        arg?.replaceAll('.', ':'),
        interaction.message.createdTimestamp,
      );
      const stops = await stopsByKey(ctx, serverId, interaction.values);
      if (stops.length === 0) throw new UserError(REPORT_ENDED, { givesBack: true });
      const contested = await ctx.stopReports.contested(
        serverId,
        stops,
        subject,
        interaction.user.id,
      );
      return useOf(ctx, subject, stops, contested, true);
    })();
    const { value: use, deferred } = await readOrDefer(interaction, reading);
    // Only a dialog must open within Discord's three seconds (`askToReplace` checks the clock,
    // review L2): a read past the budget deferred the press, and then a contest can only be
    // refused (review F1); otherwise the answer is deferred, and a contradiction met since is
    // said as reported already.
    if (use.contested.length > 0) {
      if (deferred) throw new UserError(SLOW_READ, { givesBack: true });
      await askToReplace(interaction, ctx, use);
      return;
    }
    if (!deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reported = await reportResearchAs(
      ctx,
      serverId,
      { stops: use.stops, subject: use.subject, reporter: reporterOf(interaction) },
      true,
    );
    await answerApart(interaction, await answerOf(interaction, ctx, reported, use.subject));
    givenBackWhenNothingReported(reported);
  },
  async modal(interaction, id, ctx) {
    if (id.action !== RESEARCH_ACTIONS.replace) throw new UserError(STALE_COMPONENT);
    const taken = pending.take(id.id, interaction.user.id);
    if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
    if (taken === 'expired') {
      throw new UserError('That question has expired. Use `/research report` again.');
    }
    const use = taken.value;
    // The period asked in ended since the dialog opened (review W2): nothing is reported.
    if (ctx.stopReports.period().key !== use.periodKey) {
      throw new UserError(PERIOD_ENDED, { givesBack: true });
    }
    // The version asked about left the list since the dialog opened (review L8).
    if (use.listed && !ctx.researchTasks.byVersion(use.subject.subjectKey)) {
      throw new UserError(TASK_LIST_CHANGED, { givesBack: true });
    }
    await deferSubmit(interaction);
    const ticked = interaction.fields.fields.has(CONTESTED_INPUT)
      ? interaction.fields.getCheckboxGroup(CONTESTED_INPUT)
      : [];
    // Only the reports it asked about: a stop ticked is replaced, one left unticked keeps its
    // report, and so does one contradicted since (said as reported already).
    const replacing = use.contested
      .map((report) => report.id)
      .filter((reportId) => ticked.includes(String(reportId)));
    const reported = await reportResearchAs(
      ctx,
      guildIdOf(interaction),
      { stops: use.stops, subject: use.subject, reporter: reporterOf(interaction), replacing },
      use.also,
    );
    await answerApart(interaction, await answerOf(interaction, ctx, reported, use.subject));
    givenBackWhenNothingReported(reported);
  },
  async button(interaction, id, ctx) {
    const ids = [id.id, ...id.args];
    if (id.action !== RESEARCH_ACTIONS.back || !ids.every((one) => /^\d{1,10}$/.test(one))) {
      throw new UserError(STALE_COMPONENT);
    }
    const { removed, notYours } = await ctx.stopReports.takeBack(
      guildIdOf(interaction),
      ids.map(Number),
      interaction.user.id,
      isStaff(interaction, ctx) ? 'staff' : 'member',
    );
    if (removed.length === 0 && notYours.length > 0) throw new UserError(NOT_YOUR_REPORT);
    const [first] = removed;
    await showInPlace(
      interaction,
      textMessage(RESEARCH_COLOUR, [
        first === undefined
          ? NOTHING_LEFT
          : endSentence(
              `Took back **${reportSubject(first)}** at ` +
                removed.map((report) => stopLine(report.stop)).join(', '),
            ),
      ]),
    );
  },
};
