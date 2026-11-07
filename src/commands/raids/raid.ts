import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type Attachment,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import type { ComponentHandler } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, regionChannelOf, requireRegion } from '../../discord/guards.js';
import { whenCounted } from '../../discord/router.js';
import { memberInfo } from '../../discord/member-info.js';
import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
import { storedReport, type StoredReport } from '../../domain/ocr/screenshot-record.js';
import type { ReportDoubt } from '../../domain/ocr/screenshot-report.js';
import {
  doubtLines,
  MAX_SCREEN_FOR_RAID,
  readingLines,
  refusalWords,
} from '../../render/screenshot-reading.js';
import { plain, truncate } from '../../render/text.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { feedbackRow, showRow } from '../screenshots/feedback.js';
import { gymCandidates, gymMenuOptions, gymNamerOf } from '../screenshots/gym-question.js';
import { readAttachedOutcome, sayBeside } from '../screenshots/read-screenshot.js';
import { unreadWords } from '../../services/screenshot-service.js';
import {
  bossChoices,
  gymChoices,
  reportedBoss,
  reportedGym,
  reportedTime,
  readableTime,
  screenshotBoss,
  stageOnly,
  type ReportedBoss,
} from './raid-input.js';
import {
  DISCORD_NAMES,
  mayJoinAs,
  RAID_COMMAND,
  RAID_THROTTLE,
  REPORT_BARRED,
  reportAccessOf,
  reportBarred,
  reportRaidAs,
  reportWords,
} from './report.js';

/**
 * The custom-id kind of the controls this command shows. It belongs to `/raid`'s own controls
 * alone: the buttons of a party post (plan 2D) get a kind of their own.
 */
const KIND = 'raid';
const EXPIRED = 'That choice has expired. Use `/raid` again.';
/** A message's text stays within Discord's 2,000 characters. */
const MESSAGE = 2_000;

/** What a report from a screenshot carries beside the raid itself. */
interface FromScreenshot {
  /** The kept screenshot; undefined when it could not be kept. */
  id: string | undefined;
  /** Its times were guessed from the upload, or it was taken a while before. */
  timeUncertain: boolean;
  /** What was not sure, for the member's answer. */
  doubts: ReportDoubt[];
  /** The phone's clock as read, which the words of a guessed time name. */
  clock: StoredReport['clock'];
}

/** A report that waits for the member to choose a gym or to confirm one in another region. */
interface PendingReport {
  reported: ReportedBoss;
  time: { hatch: number } | { end: number } | undefined;
  /** The region the command was used in. */
  regionChannelId: string | undefined;
  /** The gyms offered in the menu; for a confirmation, the one gym. */
  gymIds: number[];
  /** Seen hatched without a boss anybody could tell (from a screenshot). */
  hatched?: boolean;
  screenshot?: FromScreenshot;
  /** Said before what came of the report. */
  note?: string;
  /**
   * When `/raid` counted the use (`whenCounted`): a report refused for none of the member's doing
   * (no post made) gives it back to that window, also from the menu (`carriesOn`).
   */
  countedAt: number;
}

const pending = new PendingRequests<PendingReport>();

/**
 * The tokens of questions answered a while ago (as the mention's controls keep them): a second
 * press (a double click, or one made while the first was being reported) is only acknowledged,
 * never written over the answer.
 */
const answered = new BoundedMap<string, true>(1_000);

/** When the router counted this use of `/raid` (`whenCounted`; now where it counted none). */
const usedAt = (interaction: ChatInputCommandInteraction): number =>
  whenCounted(interaction) ?? Date.now();

type Answerable = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;

const gymName = (gym: Gym): string => plain(gym.nickname ?? gym.name);

/** Reports the raid and tells the member what came of it. The interaction is acknowledged. */
async function finish(
  interaction: Answerable,
  ctx: AppContext,
  request: PendingReport,
  gym: Gym,
): Promise<void> {
  const shot = request.screenshot;
  const member = { id: interaction.user.id, ...memberInfo(interaction) };
  const result = await reportRaidAs(ctx, member, gym, {
    reported: request.reported,
    time: request.time,
    regionChannelId: request.regionChannelId,
    ...(request.hatched ? { hatched: true } : {}),
    // The screenshot's id when it was kept, and whether the time is a guess either way.
    ...(shot ? { screenshot: { id: shot.id ?? null, timeUncertain: shot.timeUncertain } } : {}),
    mayJoin: mayJoinAs(reportAccessOf(ctx), member.id),
  });
  const content = reportWords(result, gym, request.reported.label, DISCORD_NAMES);
  // Its post shows the screenshot as long as the raid lasts.
  if (result.outcome.kind === 'created' && shot?.id !== undefined) {
    await ctx.screenshots.inUse(shot.id);
  }
  // What a screenshot left unsure is said, and its feedback is a button away.
  const unsure =
    shot && shot.doubts.length > 0
      ? ['', 'From the screenshot I was not sure of this:', ...doubtLines(shot.doubts, shot.clock)]
      : [];
  const said = truncate(
    [...(request.note ? [request.note] : []), content, ...unsure].join('\n'),
    MESSAGE,
  );
  await interaction.editReply({
    content: said,
    components: shot?.id === undefined ? [] : [showRow(shot.id)],
  });
  // No post (the bot may not make posts in the forum, or it was lost while it was made): none of
  // the member's doing, so that the router gives the use back, and says nothing more (plan 8S-3).
  if (result.outcome.kind === 'no-post') {
    throw new UserError(said, { givesBack: true, said: true });
  }
}

/**
 * Refuses a report at this gym that would put the member in a forum somebody keeps them out of
 * (`reportBarred`, the map's own check, plan 8M-6), in the map's words.
 */
async function refuseBarred(
  ctx: AppContext,
  guildId: string,
  memberId: string,
  gym: Gym,
  regionChannelId: string | undefined,
): Promise<void> {
  const guildRow = await ctx.guilds.idFor(guildId);
  if (guildRow === undefined) return;
  if (
    await reportBarred(reportAccessOf(ctx), gym, regionChannelId, guildRow, memberId, Date.now())
  ) {
    throw new UserError(REPORT_BARRED);
  }
}

/**
 * Goes on with a report once its gym is known: one that would put the member in a forum they
 * are kept out of is refused (`refuseBarred`: for a gym typed outright the guard asked it before
 * the throttle; a gym chosen from a menu or read from a screenshot is known only now), a gym
 * outside the region the command was used in is confirmed first, otherwise the raid is reported.
 */
async function withGym(
  interaction: Answerable,
  ctx: AppContext,
  request: PendingReport,
  gym: Gym,
): Promise<void> {
  await refuseBarred(
    ctx,
    guildIdOf(interaction),
    interaction.user.id,
    gym,
    request.regionChannelId,
  );
  const here = request.regionChannelId;
  // The service knows which region of this server the raid would go to; no such region at all is
  // answered by the report itself, at once.
  const { region, any } = ctx.partyService.regionFor(gym, here);
  const target = region ?? any;
  if (here === undefined || target === undefined || target.channelId === here) {
    await finish(interaction, ctx, request, gym);
    return;
  }
  const token = pending.put(interaction.user.id, { ...request, gymIds: [gym.id] });
  const button = (action: string, label: string, style: ButtonStyle) =>
    new ButtonBuilder()
      .setCustomId(encodeCustomId({ kind: KIND, id: token, action }))
      .setLabel(label)
      .setStyle(style);
  // A gym that lies in this region goes to another forum only because this region has none.
  const content = ctx.gyms.regionsOf(gym.id).includes(here)
    ? `${gymName(gym)} will be posted in <#${target.channelId}> (this region has no raid forum). Report it there?`
    : `${gymName(gym)} is in <#${target.channelId}>, not in this region. Report the raid there?`;
  await interaction.editReply({
    content,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button('yes', 'Report it there', ButtonStyle.Primary),
        button('no', 'Cancel', ButtonStyle.Secondary),
      ),
    ],
  });
}

/** The name of a region channel, from the cache of the interaction's server. */
function regionNameOf(interaction: ChatInputCommandInteraction) {
  return (channelId: string): string | undefined =>
    interaction.guild?.channels.cache.get(channelId)?.name;
}

/**
 * Asks the member which of these gyms they mean, with a menu (each gym told apart by its
 * nickname, region and description), and the rest of the report kept for the answer.
 */
async function askGym(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  request: PendingReport,
  gyms: readonly Gym[],
  content: string,
  cancel = false,
): Promise<void> {
  const token = pending.put(interaction.user.id, {
    ...request,
    gymIds: gyms.map((gym) => gym.id),
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(encodeCustomId({ kind: KIND, id: token, action: 'gym' }))
    .setPlaceholder('Choose the gym')
    .addOptions(gymMenuOptions(ctx, request.regionChannelId, gyms, regionNameOf(interaction)));
  const rows: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
  ];
  if (cancel) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCustomId({ kind: KIND, id: token, action: 'no' }))
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }
  await interaction.editReply({ content: truncate(content, MESSAGE), components: rows });
}

/** The report of a raid a screenshot was decided as, with what the member typed in its place. */
function screenshotRequest(
  raid: ScreenshotRaid,
  typed: ReportedBoss | undefined,
  regionChannelId: string | undefined,
  screenshot: FromScreenshot,
  countedAt: number,
): PendingReport {
  return {
    reported: typed ?? screenshotBoss(raid.tier, raid.boss, raid.hatched),
    time: raid.time,
    regionChannelId,
    gymIds: [raid.gymId],
    ...(typed === undefined && raid.hatched && raid.boss === null ? { hatched: true } : {}),
    screenshot,
    countedAt,
  };
}

/**
 * `/raid` with a screenshot: read it in the place of what was not typed, then report the raid
 * unasked, ask only which gym when the gym read is not clear, or say why nothing is reported.
 * What the member typed (boss, gym, time) stands in the place of what was read.
 */
async function reportFromScreenshot(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  regionChannelId: string | undefined,
  attachment: Attachment,
): Promise<void> {
  // A max battle beside the raid of a split screenshot (plan 7P) is named once the raid is.
  const seen: { beside?: 'raid' | 'max' } = {};
  await answerScreenshot(interaction, ctx, regionChannelId, attachment, seen);
  if (seen.beside) await sayBeside(interaction, ctx, seen.beside);
}

async function answerScreenshot(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  regionChannelId: string | undefined,
  attachment: Attachment,
  seen: { beside?: 'raid' | 'max' },
): Promise<void> {
  const typedBoss = interaction.options.getString('boss')?.trim() ?? '';
  const typedGymText = interaction.options.getString('gym')?.trim() ?? '';
  const typedTime = interaction.options.getString('time');
  const reported = typedBoss === '' ? undefined : reportedBoss(ctx, typedBoss);
  const gymAnswer =
    typedGymText === '' ? undefined : reportedGym(ctx, regionChannelId, typedGymText);
  if (gymAnswer?.kind === 'none') {
    throw new UserError(
      `I found no gym for "${plain(truncate(typedGymText, 80))}". Type part of its name and pick it from the list.`,
    );
  }
  // Several gyms fit what was typed: the one the screenshot names, if it is one of them.
  const typedHits = gymAnswer?.kind === 'several' ? gymAnswer.gyms : undefined;
  const now = Date.now();
  // When the router counted the use, before the screenshot was read (which may take minutes).
  const countedAt = usedAt(interaction);
  // Not read, or not a raid screen, but the member typed the boss and the gym: what they typed
  // is reported, or, when several gyms fit what they typed, they choose among those.
  const typedOnly = async (): Promise<boolean> => {
    if (!reported || gymAnswer === undefined) return false;
    const time = reportedTime(ctx, reported, typedTime, now);
    const request: PendingReport = {
      reported,
      time,
      regionChannelId,
      gymIds: [],
      note: 'I could not read the screenshot, so I used what you typed.',
      countedAt,
    };
    if (gymAnswer.kind === 'gym') {
      await withGym(interaction, ctx, { ...request, gymIds: [gymAnswer.gym.id] }, gymAnswer.gym);
    } else if (typedHits) {
      await askGym(
        interaction,
        ctx,
        request,
        typedHits,
        `I could not read the screenshot. Several gyms fit "${plain(truncate(typedGymText, 80))}". Which one do you mean?`,
        true,
      );
    }
    return true;
  };
  const outcome = await readAttachedOutcome(interaction, ctx, attachment, {
    use: 'raid',
    screen: 'raid',
    beside: (screen) => {
      seen.beside = screen;
    },
    typed: (report) => {
      // No time typed: the screenshot's countdown counts (an Elite egg's too, review 8E-1).
      const time =
        typedTime === null || typedTime.trim() === ''
          ? undefined
          : reportedTime(
              ctx,
              reported ?? stageOnly(report.tier, report.stage === 'hatched'),
              typedTime,
              now,
            );
      // Only a gym the screenshot named clearly, never its guess.
      const readGym = report.gym.clear ? report.gym.gymId : null;
      const gymId =
        gymAnswer?.kind === 'gym'
          ? gymAnswer.gym.id
          : typedHits?.some((gym) => gym.id === readGym)
            ? (readGym ?? undefined)
            : undefined;
      return {
        ...(gymId === undefined ? {} : { gymId }),
        ...(reported
          ? { boss: { tier: reported.tier, boss: null, hatched: reported.boss !== null } }
          : {}),
        ...(time ? { time } : {}),
      };
    },
  });
  if (outcome.kind !== 'read') {
    if (await typedOnly()) return;
    throw new UserError(unreadWords(outcome));
  }
  if (outcome.screen === 'max') {
    // A max battle's screen is the wrong picture, whatever was typed beside it (plan 8X-S).
    await interaction.editReply({
      content: MAX_SCREEN_FOR_RAID,
      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id, true)],
    });
    return;
  }
  const { report, decision, id } = outcome;
  const read = readingLines(storedReport(report), gymNamerOf(ctx));
  const feedback = id === undefined ? [] : [feedbackRow(id)];

  if (
    decision.kind === 'refuse' &&
    decision.reason === 'not-a-raid-screen' &&
    (await typedOnly())
  ) {
    return;
  }
  // Several gyms fit what was typed and the screenshot named none of them: the member chooses.
  const mustAsk =
    typedHits !== undefined &&
    !typedHits.some((gym) => gym.id === report.gym.gymId) &&
    !(decision.kind === 'refuse' && decision.reason !== 'no-gym');
  if (decision.kind === 'refuse' && !mustAsk) {
    await interaction.editReply({
      content: truncate(
        [
          refusalWords(decision.reason),
          'Nothing was reported. This is what I read:',
          '',
          ...read,
        ].join('\n'),
        MESSAGE,
      ),
      components: feedback,
    });
    return;
  }
  const guildRow = await ctx.guilds.idFor(guildIdOf(interaction));
  const gyms =
    typedHits ??
    (guildRow === undefined ? [] : gymCandidates(ctx, regionChannelId, guildRow, report.gym));
  const [first] = gyms;
  const assumed =
    decision.kind === 'report' && !mustAsk
      ? decision
      : first
        ? outcome.withGym(first.id)
        : decision;
  if (assumed.kind === 'ask') {
    // A raid screen always shows its tier; this one did not, and no menu can settle that.
    await interaction.editReply({
      content: truncate(
        [
          'I could not tell the tier of this raid, so nothing was reported. Use `/raid` again and pick the boss or the egg.',
          '',
          ...read,
        ].join('\n'),
        MESSAGE,
      ),
      components: feedback,
    });
    return;
  }
  if (assumed.kind === 'refuse') {
    await interaction.editReply({
      content: truncate(
        [
          refusalWords(assumed.reason),
          'Nothing was reported. This is what I read:',
          '',
          ...read,
        ].join('\n'),
        MESSAGE,
      ),
      components: feedback,
    });
    return;
  }
  const request = screenshotRequest(
    assumed.raid,
    reported,
    regionChannelId,
    {
      id,
      timeUncertain: assumed.raid.timeUncertain,
      doubts: assumed.doubts.filter((doubt) => doubt !== 'gym-unclear'),
      clock: report.clock,
    },
    countedAt,
  );
  if (decision.kind === 'report' && !mustAsk) {
    const gym = ctx.gyms.get(decision.raid.gymId);
    if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
    await withGym(interaction, ctx, request, gym);
    return;
  }
  if (gyms.length === 0) {
    await interaction.editReply({ content: refusalWords('no-gym'), components: feedback });
    return;
  }
  const what = report.gym.read ? `"${plain(truncate(report.gym.read, 80))}"` : 'no gym name';
  await askGym(
    interaction,
    ctx,
    request,
    gyms,
    typedHits
      ? `Several gyms fit "${plain(truncate(typedGymText, 80))}". Which one do you mean?`
      : `Which gym is this? I read ${what}, and more than one gym fits.`,
    true,
  );
}

/**
 * Without a screenshot, a report needs the boss and the gym; refused here, before the work, so
 * that it does not count against the throttle.
 */
const requireWhatToReport: Guard = (interaction, ctx) => {
  if (!interaction.isChatInputCommand()) return;
  const screenshot =
    ctx.config.settings.ocr.enabled && interaction.options.getAttachment('screenshot') !== null;
  if (screenshot) {
    // Beside a screenshot the time is read once the screenshot is: a text that is no time at
    // all is refused now.
    const time = interaction.options.getString('time');
    if (time !== null && time.trim() !== '' && !readableTime(ctx, time, Date.now())) {
      throw new UserError(
        `I could not read "${plain(truncate(time, 80))}" as a time. Try \`20\` (minutes from now) or \`6:15pm\`.`,
      );
    }
    return;
  }
  const missing = ['boss', 'gym'].filter(
    (name) => (interaction.options.getString(name)?.trim() ?? '') === '',
  );
  if (missing.length > 0) {
    throw new UserError(
      `Give the ${missing.join(' and the ')} of the raid (or attach a screenshot of it).`,
    );
  }
};

/**
 * A report at a gym typed outright (one clear gym, no screenshot) that would put the member in a
 * forum somebody keeps them out of (the forum the raid would go to, or that of a raid already at
 * the gym, which may stand in another region's), refused here, before the throttle, as the map
 * refuses it (plan 8M-6). The gym is looked up again in `execute`, as `/wild` does.
 */
const requireForumAccess: Guard = async (interaction, ctx) => {
  if (!interaction.isChatInputCommand()) return;
  if (ctx.config.settings.ocr.enabled && interaction.options.getAttachment('screenshot') !== null) {
    return;
  }
  const typed = interaction.options.getString('gym')?.trim() ?? '';
  if (typed === '') return;
  const regionChannelId = regionChannelOf(interaction, ctx);
  const answer = reportedGym(ctx, regionChannelId, typed);
  if (answer.kind !== 'gym') return;
  await refuseBarred(ctx, guildIdOf(interaction), interaction.user.id, answer.gym, regionChannelId);
};

/** The definition: with the option `screenshot` where screenshots are read. */
function raidData(screenshots: boolean) {
  const data = new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Report a raid or an egg at a gym')
    .addStringOption((option) =>
      option
        .setName('boss')
        .setDescription('The boss, or the tier of an egg: pick from the list')
        .setRequired(!screenshots)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('The gym: type part of its name and pick from the list')
        .setRequired(!screenshots)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription(
          'For an egg: when it hatches. For a boss: when the raid ends. E.g. 20 or 6:15pm',
        )
        .setMaxLength(40),
    );
  if (screenshots) {
    data.addAttachmentOption((option) =>
      option
        .setName('screenshot')
        .setDescription(
          'A screenshot of the raid screen; I read it. Others can see it from the post',
        ),
    );
  }
  return data;
}

const DETAILS =
  "Creates a post for the raid in the raid forum of the gym's region. Pick the boss (or the " +
  'tier, for an egg) and the gym from the lists that appear while you type.\n\nThe time is ' +
  'optional, except for an Elite egg, which needs its hatch time: minutes from now (`20`) or a ' +
  'clock time (`6:15pm`); for an egg it is when the egg hatches, for a boss when the raid ends. ' +
  'An Elite egg that hatches after midnight: `tomorrow 12am`.\n\n' +
  'If the gym already has a raid, you are shown its post instead.';

const SCREENSHOT_DETAILS =
  'Or attach a screenshot of the raid instead: I read the gym, the time, the tier and the ' +
  'boss from it, and ask only when I am not sure which gym it is. What you type beside it ' +
  'counts instead of what I read.\n\nThe screenshot is kept for a while: others can see it from ' +
  'the post of the raid, and it may be used to improve the reader. A screenshot of a max ' +
  'battle goes to `/max`.';

function raidCommand(screenshots: boolean): SimpleCommand {
  return {
    data: raidData(screenshots),
    help: {
      category: 'raid-crud',
      details: screenshots ? `${DETAILS}\n\n${SCREENSHOT_DETAILS}` : DETAILS,
      examples: [
        '/raid boss:t5 gym:Big Fountain time:25',
        '/raid boss:yveltal gym:Library time:6:15pm',
        ...(screenshots ? ['/raid screenshot:(a raid screenshot)'] : []),
      ],
    },
    guards: [requireRegion, requireWhatToReport, requireForumAccess],
    defer: 'ephemeral',
    throttle: RAID_THROTTLE,

    async execute(interaction, ctx) {
      const regionChannelId = regionChannelOf(interaction, ctx);
      const attachment = ctx.config.settings.ocr.enabled
        ? interaction.options.getAttachment('screenshot')
        : null;
      if (attachment) {
        await reportFromScreenshot(interaction, ctx, regionChannelId, attachment);
        return;
      }
      const reported = reportedBoss(ctx, interaction.options.getString('boss', true));
      const time = reportedTime(ctx, reported, interaction.options.getString('time'), Date.now());
      const typedGym = interaction.options.getString('gym', true);
      const answer = reportedGym(ctx, regionChannelId, typedGym);
      const request: PendingReport = {
        reported,
        time,
        regionChannelId,
        gymIds: [],
        countedAt: usedAt(interaction),
      };
      if (answer.kind === 'none') {
        throw new UserError(
          `I found no gym for "${plain(truncate(typedGym, 80))}". Type part of its name and pick it from the list.`,
        );
      }
      if (answer.kind === 'gym') {
        await withGym(interaction, ctx, request, answer.gym);
        return;
      }
      const several = `Several gyms fit "${plain(truncate(typedGym, 80))}". Which one do you mean?`;
      await askGym(
        interaction,
        ctx,
        request,
        answer.gyms,
        answer.gyms.length === 1 ? 'Did you mean this gym?' : several,
      );
    },

    async autocomplete(interaction, ctx) {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'boss') {
        await interaction.respond(bossChoices(ctx, focused.value));
        return;
      }
      const regionName = (channelId: string): string | undefined =>
        interaction.guild?.channels.cache.get(channelId)?.name;
      await interaction.respond(
        gymChoices(ctx, regionChannelOf(interaction, ctx), focused.value, regionName),
      );
    },
  };
}

const withScreenshots = raidCommand(true);
const withoutScreenshots = raidCommand(false);

/**
 * `/raid`: as an installation that reads screenshots offers it (`ocr.enabled`), with the option
 * `screenshot` and the boss and the gym optional; otherwise without it, both required.
 */
export const raid: SimpleCommand = {
  ...withScreenshots,
  forConfig: (config) => (config.settings.ocr.enabled ? withScreenshots : withoutScreenshots),
};

/** The request a control of this command belongs to; answers the member when there is none. */
async function claimed(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
): Promise<PendingReport | undefined> {
  const taken = pending.take(token, interaction.user.id);
  if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
  if (taken === 'expired') {
    if (answered.has(token)) await interaction.deferUpdate().catch(() => undefined);
    else await interaction.update({ content: EXPIRED, components: [] });
    return undefined;
  }
  return taken.value;
}

/**
 * The press of a question taken by `claimed` is acknowledged now: a later press is only
 * acknowledged. A refusal thrown before (the press answered privately) marks nothing, so that a
 * later press says the question expired (review S4).
 */
function acknowledging(token: string): void {
  answered.set(token, true);
}

/**
 * Runs what follows `deferUpdate` of a control. When that fails, the used-up controls are
 * removed from the message (best effort) before the error goes on to the router; a refusal the
 * work said in the message already (`UserError.said`) stays as it was said.
 */
async function afterDeferral(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof UserError && err.said) throw err;
    try {
      await interaction.editReply({ content: 'Nothing was reported.', components: [] });
    } catch {
      // The message may be gone or the token expired; the error below is what matters.
    }
    throw err;
  }
}

/** The gym menu and the confirmation buttons of `/raid`. */
export const raidControls: ComponentHandler = {
  kind: KIND,
  // The menu and the buttons go on with a use `/raid` counted: a failure gives it back there.
  carriesOn: (interaction, id) => {
    const asked = pending.peek(id.id, interaction.user.id);
    return typeof asked === 'object'
      ? { ...RAID_THROTTLE, as: RAID_COMMAND, countedAt: asked.value.countedAt }
      : undefined;
  },

  async select(interaction, id, ctx) {
    if (id.action !== 'gym' || !interaction.isStringSelectMenu()) throw new UserError(EXPIRED);
    const request = await claimed(interaction, id.id);
    if (!request) return;
    const gymId = Number(interaction.values[0]);
    const gym = request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
    if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
    acknowledging(id.id);
    await interaction.deferUpdate();
    // The screenshot's record keeps which gym its member chose.
    const shot = request.screenshot?.id;
    if (shot !== undefined && request.gymIds.length > 1) await ctx.screenshots.picked(shot, gym.id);
    await afterDeferral(interaction, () =>
      withGym(interaction, ctx, { ...request, gymIds: [gym.id] }, gym),
    );
  },

  async button(interaction, id, ctx) {
    const request = await claimed(interaction, id.id);
    if (!request) return;
    if (id.action !== 'yes') {
      acknowledging(id.id);
      await interaction.update({ content: 'Nothing was reported.', components: [] });
      return;
    }
    const gym = ctx.gyms.get(request.gymIds[0] ?? -1);
    if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
    acknowledging(id.id);
    await interaction.deferUpdate();
    await afterDeferral(interaction, async () => {
      // Who is kept out of which forum may have changed since the question was asked.
      await refuseBarred(
        ctx,
        guildIdOf(interaction),
        interaction.user.id,
        gym,
        request.regionChannelId,
      );
      await finish(interaction, ctx, request, gym);
    });
  },
};
