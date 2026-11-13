import { zoneOf } from '../../discord/server-values.js';
import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type Attachment,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import type { ControlThrottle } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, isStaff, regionChannelOf } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import { whenCounted } from '../../discord/router.js';
import {
  decideMax,
  missingSpotName,
  withSpot,
  type MaxDecision,
  type MaxTyped,
  type ScreenshotMax,
} from '../../domain/ocr/max-decision.js';
import type { MaxDoubt, MaxScreenshotReport } from '../../domain/ocr/max-report.js';
import type { SpotTitle } from '../../domain/ocr/power-spot-match.js';
import { maxSpotName } from '../../domain/party/max.js';
import { sameBoss, type MaxSpot } from '../../domain/party/party.js';
import { isMaxTier, type MaxTier } from '../../domain/pogo/max-tier.js';
import { MAX_KIND } from '../../render/max-dialog.js';
import {
  maxDoubtLines,
  maxReadingLines,
  maxRefusalWords,
  MAX_TIER_UNKNOWN,
  shortMaxReading,
  STAFF_TOLD,
} from '../../render/screenshot-reading.js';
import { plain, truncate } from '../../render/text.js';
import { PendingRequests, type Asker } from '../../services/pending-requests.js';
import { unreadWords, type MaxTypedUse } from '../../services/screenshot-service.js';
import { feedbackRow, showRow } from '../screenshots/feedback.js';
import { readAttachedOutcome, sayBeside } from '../screenshots/read-screenshot.js';
import {
  readMaxBoss,
  readSpot,
  reportedEnd,
  typedMaxTime,
  WHICH_TIER,
  type ReadMaxBoss,
} from './max-input.js';
import {
  MAX_BARRED,
  MAX_COMMAND,
  MAX_THROTTLE,
  maxBarred,
  maxReportWords,
  reportMaxAs,
} from './max-report.js';
import {
  maxShotGivesBack,
  maxShotRequest,
  maxShotWords,
  refusedAtBattle,
  reportMaxShot,
  SPOT_GONE,
  type MaxShotRequest,
} from './max-shot.js';

/*
 * `/max screenshot:` (plan 8X-S; design 2, review R1, R6, R7): the battle a max battle's
 * screenshot shows, read in the place of what was not typed, reported as a mention reports it
 * (`reportMaxShot`: a battle there joined, its boss changed by a newer screenshot, or refused);
 * a Power Spot that is not clear asked with a menu, a clear one of another region confirmed, as
 * `/raid` asks and confirms a gym. What the member typed stands in the place of what was read
 * (`withMaxTyped`); a screenshot that cannot be read, beside a typed boss and spot, reports what
 * was typed. No ending-soon question (design 5).
 */

const MESSAGE = 2_000;
const EXPIRED = 'That choice has expired. Use `/max` again.';
const NOT_YOURS = 'That is somebody else’s report.';

/** Said before what came of a report that could only use what was typed. */
const TYPED_ONLY = 'I could not read the screenshot, so I used what you typed.';

/** `/max screenshot:` given a raid's screen (plan 8X-S): the wrong picture. */
export const RAID_SCREEN_FOR_MAX =
  'That is a raid: use `/raid screenshot:`, or post it with a mention.';

/** `/max screenshot:` given a picture that is no screen of a raid or a max battle. */
const MAX_NO_SCREEN =
  'This does not look like the screen of a max battle, so I made nothing of it.';

/** A pin typed as `spot:` stands in the report as a title of its own. */
const PIN_TITLE_ID = 'pin';

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
type Answerable = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;

/** What was typed beside the screenshot that stands in the place of what was read. */
interface Typed {
  boss?: ReadMaxBoss;
  /** The boss typed is the very one the screen shows: it changes a battle's boss as read. */
  bossShown?: boolean;
  spot?: MaxSpot;
  end?: number;
}

/** A report from a screenshot that waits for the Power Spot menu or the other region's Yes. */
interface PendingShot {
  /** The report with what was typed put in (`withMaxTyped`). */
  report: MaxScreenshotReport;
  /** The spots offered in the menu. */
  spots: SpotTitle[];
  typed: Typed;
  regionChannelId: string;
  guildRow: number;
  screenshotId: string | undefined;
  /** When `/max` was used: what is over by then is over. */
  uploadedAt: number;
  /** When the router counted the use (`carriesOn`). */
  countedAt: number;
  /** For the other region's confirmation: the report to make. */
  request?: MaxShotRequest;
}

const pending = new PendingRequests<PendingShot>();

/**
 * The tokens of questions answered a while ago (as the mention's controls keep them): a second
 * press (a double click, or one made while the first was being reported) is only acknowledged,
 * never written over the answer.
 */
const answered = new BoundedMap<string, true>(1_000);

/** The screenshot given to `/max`, where screenshots are read. */
export function screenshotOf(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Attachment | null {
  return ctx.config.settings.ocr.enabled ? interaction.options.getAttachment('screenshot') : null;
}

/**
 * The guard of `/max` with a screenshot (review R1): nothing is read before the screenshot but
 * an end that is no time at all, which is refused now, before the throttle.
 */
export function requireReadableEnd(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): void {
  const text = interaction.options.getString('end');
  if (text !== null && text.trim() !== '') {
    typedMaxTime(ctx, 'end', text, Date.now(), zoneOf(interaction, ctx));
  }
}

/** The tier the screenshot gives a boss typed without one: its heads, or its form's. */
function tierOfScreen(report: MaxScreenshotReport): MaxTier | undefined {
  if (report.form === 'gigantamax' || report.form === 'eternamax') return 'G';
  const { heads } = report;
  return heads !== null && heads >= 1 && heads <= 5 ? (`D${String(heads)}` as MaxTier) : undefined;
}

/** The doubts said with the answer: what the member did not type over. */
function doubtsOf(report: MaxScreenshotReport): MaxDoubt[] {
  return report.doubts.filter((doubt) => doubt !== 'spot-unclear' && doubt !== 'no-spot');
}

/**
 * `/max` with a screenshot: what was typed is read first (a boss, a spot, an end), the
 * screenshot then, decided with what was typed in its place, and reported, asked about or
 * refused with what was read. The interaction is deferred.
 */
export async function reportMaxFromScreenshot(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  attachment: Attachment,
): Promise<void> {
  // A raid beside the max battle of a split screenshot (plan 7P) is named once it is answered.
  const seen: { beside?: 'raid' | 'max' } = {};
  await answerMaxScreenshot(interaction, ctx, attachment, seen);
  if (seen.beside) await sayBeside(interaction, ctx, seen.beside);
}

async function answerMaxScreenshot(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  attachment: Attachment,
  seen: { beside?: 'raid' | 'max' },
): Promise<void> {
  const now = Date.now();
  const countedAt = whenCounted(interaction) ?? now;
  const regionChannelId = regionChannelOf(interaction, ctx);
  const guildRow = await ctx.guilds.idFor(guildIdOf(interaction));
  if (regionChannelId === undefined || guildRow === undefined) {
    throw new UserError('Use `/max` in a region channel.');
  }
  const bossText = interaction.options.getString('boss')?.trim() ?? '';
  const tierText = interaction.options.getString('tier');
  const spotText = interaction.options.getString('spot')?.trim() ?? '';
  const endText = interaction.options.getString('end')?.trim() ?? '';
  const typed: Typed = {};
  // A boss on no list typed without a tier takes the screenshot's (`tierOfScreen`), else asks.
  let bossWithoutTier = false;
  if (bossText !== '') {
    try {
      typed.boss = readMaxBoss(ctx, bossText, tierText, now, zoneOf(interaction, ctx));
    } catch (err) {
      if (!(err instanceof UserError && err.message === WHICH_TIER)) throw err;
      bossWithoutTier = true;
    }
  }
  if (spotText !== '') typed.spot = await readSpot(interaction, ctx, spotText);
  if (endText !== '') {
    const end = typedMaxTime(ctx, 'end', endText, now, zoneOf(interaction, ctx));
    if (end !== 'unset') typed.end = end.at;
  }
  // What was typed, in the place of what is read, decided and kept by the service (review S-5);
  // a boss typed without a tier takes the screen's. What a typed boss cannot be is said below, and
  // the service keeps the record as a failed use (review F-3).
  let bossRefused: Error | undefined;
  const maxTypedOf = (read: MaxScreenshotReport | null): MaxTypedUse => {
    // Nothing read (two screens it could not tell apart): no tier of the screen (review S1).
    const tier = bossWithoutTier && read ? tierOfScreen(read) : undefined;
    if (tier !== undefined) {
      try {
        typed.boss = readMaxBoss(ctx, bossText, tier, now, zoneOf(interaction, ctx));
      } catch (err) {
        if (!(err instanceof Error)) throw err;
        bossRefused = err;
      }
    }
    const refused =
      bossRefused !== undefined
        ? ('boss' as const)
        : bossWithoutTier && !typed.boss
          ? ('tier' as const)
          : undefined;
    const out: MaxTyped = {
      ...(typed.spot ? { spot: typedTitle(typed.spot) } : {}),
      ...(typed.boss
        ? { boss: { ref: typed.boss.boss, name: typed.boss.label, tier: typed.boss.tier } }
        : {}),
      // `tier:` beside the screenshot without `boss:` counts too (review r4 B1).
      ...(bossText === '' && tierText !== null && isMaxTier(tierText) ? { tier: tierText } : {}),
      ...(typed.end === undefined ? {} : { end: typed.end }),
    };
    return {
      ...(Object.keys(out).length > 0 ? { typed: out } : {}),
      ...(refused === undefined ? {} : { refused }),
    };
  };
  const outcome = await readAttachedOutcome(interaction, ctx, attachment, {
    use: 'max',
    screen: 'max',
    beside: (screen) => {
      seen.beside = screen;
    },
    maxTyped: maxTypedOf,
  });
  // Not read, or a picture that is no screen at all, but the boss and the spot were typed: those
  // are reported (as `/raid`'s `typedOnly`).
  const typedOnly = async (): Promise<boolean> => {
    if (bossText === '' || !typed.spot) return false;
    if (!typed.boss) throw new UserError(WHICH_TIER);
    await reportTyped(interaction, ctx, { ...typed, boss: typed.boss, spot: typed.spot }, now);
    return true;
  };
  if (outcome.kind !== 'read') {
    if (await typedOnly()) return;
    throw new UserError(unreadWords(outcome, 'max'));
  }
  if (outcome.screen === 'raid') {
    const { decision } = outcome;
    if (decision.kind === 'refuse' && decision.reason === 'not-a-raid-screen') {
      // No screen of either kind: unreadable, as `/raid` takes it.
      if (await typedOnly()) return;
      await interaction.editReply({
        content: MAX_NO_SCREEN,
        components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
      });
      return;
    }
    // A raid's screen is the wrong picture, whatever was typed beside it.
    await interaction.editReply({
      content: RAID_SCREEN_FOR_MAX,
      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
    });
    return;
  }
  const feedback = outcome.id === undefined ? [] : [feedbackRow(outcome.id, true)];
  if (bossRefused !== undefined) throw bossRefused;
  if (bossWithoutTier && !typed.boss) throw new UserError(WHICH_TIER);
  const { report, decision } = outcome;
  const shown = outcome.read.boss;
  if (
    typed.boss &&
    shown !== null &&
    sameBoss(shown.ref, typed.boss.boss) &&
    outcome.read.tier === typed.boss.tier
  ) {
    typed.bossShown = true;
  }
  const shot: PendingShot = {
    report,
    spots: [],
    typed,
    regionChannelId,
    guildRow,
    screenshotId: outcome.id,
    uploadedAt: interaction.createdTimestamp,
    countedAt,
  };
  // A spot typed is the battle's, whatever was read (a pin stands as a title of its own).
  const read = maxReadingLines(outcome.read);
  if (decision.kind === 'ask' && decision.about === 'spot') {
    await askSpot(interaction, ctx, { ...shot, spots: decision.spots.slice(0, 25) });
    return;
  }
  if (decision.kind !== 'report') {
    const words = refusal(interaction, ctx, decision, report);
    await interaction.editReply({
      content: truncate(
        [words, 'Nothing was reported. This is what I read:', '', ...read].join('\n'),
        MESSAGE,
      ),
      components: feedback,
    });
    return;
  }
  await goOn(interaction, ctx, shot, decision.battle);
}

/** A typed spot as the report's Power Spot. */
function typedTitle(spot: MaxSpot): SpotTitle {
  return {
    id: spot.kind === 'powerspot' ? spot.id : PIN_TITLE_ID,
    title: maxSpotName(spot),
    local: true,
  };
}

/**
 * What a refusal or the tier's question says; a Power Spot not known whose name was read surely,
 * on a screen with a countdown (`missingSpotName`),
 * tells the moderators (`ModerationReports.missingSpot`), and then says so (review R13).
 */
function refusal(
  interaction: Answerable,
  ctx: AppContext,
  decision: Exclude<MaxDecision, { kind: 'report' } | { kind: 'ask'; about: 'spot' }>,
  report: MaxScreenshotReport,
): string {
  if (decision.kind === 'ask') return MAX_TIER_UNKNOWN;
  const times = ctx.config.settings.maxBattles;
  if (decision.reason !== 'no-spot') return maxRefusalWords(decision.reason, times);
  const words = maxRefusalWords('no-spot', times, decision.read);
  // Only a name read surely on a screen with a countdown (review S-1).
  const missing = missingSpotName(decision, report);
  const told =
    missing !== null &&
    ctx.reports.missingSpot({
      serverId: guildIdOf(interaction),
      channelId: interaction.channelId,
      name: missing,
    });
  return told ? `${words} ${STAFF_TOLD}` : words;
}

/** Asks which of the spots the screenshot shows, with a menu, the region's first (R7). */
async function askSpot(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  shot: PendingShot,
): Promise<void> {
  const token = pending.put(interaction, shot);
  const { report } = shot;
  const read = report.spot.read ? ` I read "${plain(truncate(report.spot.read, 80))}".` : '';
  const regionName = (channelId: string) => interaction.guild?.channels.cache.get(channelId)?.name;
  const options = shot.spots.map((spot) => {
    const [elsewhere] = spot.local ? [] : ctx.wayspots.regionsOf(spot.id);
    const region = elsewhere === undefined ? undefined : regionName(elsewhere);
    return {
      label: truncate(spot.title, 100),
      value: spot.id,
      ...(region === undefined ? {} : { description: truncate(region, 100) }),
    };
  });
  await interaction.editReply({
    content: truncate(
      `${shortMaxReading(report, shot.typed.boss?.label)}. Which Power Spot is it?${read}`,
      MESSAGE,
    ),
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: encodeCustomId({ kind: MAX_KIND, id: token, action: 'spot' }),
            placeholder: 'Choose the Power Spot',
            options,
          },
        ],
      },
      buttons(token, 'Cancel'),
    ],
  });
}

/** "Report it there" (when `yes` is given) and "Cancel" of a waiting report. */
function buttons(token: string, cancel: string, yes?: string): Row {
  const button = (
    action: string,
    label: string,
    style: ButtonStyle.Primary | ButtonStyle.Secondary,
  ) => ({
    type: ComponentType.Button as const,
    custom_id: encodeCustomId({ kind: MAX_KIND, id: token, action }),
    label,
    style,
  });
  return {
    type: ComponentType.ActionRow,
    components: [
      ...(yes === undefined ? [] : [button('yes', yes, ButtonStyle.Primary)]),
      button('no', cancel, ButtonStyle.Secondary),
    ],
  };
}

/**
 * Goes on with a battle decided: a Power Spot read in another region than the one `/max` was
 * used in is confirmed first, as `/raid` confirms a gym (one typed is the member's own word);
 * otherwise it is reported.
 */
async function goOn(
  interaction: Answerable,
  ctx: AppContext,
  shot: PendingShot,
  battle: ScreenshotMax,
): Promise<void> {
  const request = maxShotRequest(
    ctx,
    shot.guildRow,
    battle,
    shot.report.boss?.name ?? '',
    shot.regionChannelId,
    shot.screenshotId,
    shot.typed,
  );
  if (!request) throw new UserError(SPOT_GONE);
  const here = shot.regionChannelId;
  const { region, any } = ctx.partyService.regionForSpot(request.spot, here);
  const target = region ?? any;
  if (
    !shot.typed.spot &&
    request.spot.kind === 'powerspot' &&
    target &&
    target.channelId !== here
  ) {
    const token = pending.put(interaction, { ...shot, request });
    const name = plain(maxSpotName(request.spot));
    const content = ctx.wayspots.regionsOf(request.spot.id).includes(here)
      ? `${name} will be posted in <#${target.channelId}> (this region has no raid forum). Report it there?`
      : `${name} is in <#${target.channelId}>, not in this region. Report the max battle there?`;
    await interaction.editReply({
      content,
      components: [buttons(token, 'Cancel', 'Report it there')],
    });
    return;
  }
  await finish(interaction, ctx, shot, request);
}

/**
 * Reports the battle (`reportMaxShot`) and tells the member what came of it, with what the
 * screenshot left unsure and the button that shows the screenshot (R6: as `/raid` answers). No
 * post made, a battle there that ended twice while it waited, one of another boss there that
 * refused it (`refusedAtBattle`), a forum the member is kept out of (`barred`) or one Discord
 * could not say of (`unknown-access`) gives the use back, as `/max`'s guard refuses those
 * uncounted.
 */
async function finish(
  interaction: Answerable,
  ctx: AppContext,
  shot: PendingShot,
  request: MaxShotRequest,
): Promise<void> {
  const member = { id: interaction.user.id, ...memberInfo(interaction) };
  const answer = await reportMaxShot(ctx, request, {
    member,
    serverId: guildIdOf(interaction),
    guildRow: shot.guildRow,
    staff: isStaff(interaction, ctx),
  });
  const doubts = doubtsOf(shot.report);
  const unsure =
    doubts.length > 0
      ? [
          '',
          'From the screenshot I was not sure of this:',
          ...maxDoubtLines(doubts, shot.report.clock),
        ]
      : [];
  const said = truncate([maxShotWords(ctx, answer, request), ...unsure].join('\n'), MESSAGE);
  const id = request.screenshot.id;
  await interaction.editReply({ content: said, components: id === null ? [] : [showRow(id)] });
  // Another boss there and a forum the member is kept out of are refused uncounted, as `/max`'s
  // guard refuses them (review F-1); so is a forum Discord could not say of, as its guard's error.
  if (
    maxShotGivesBack(answer) ||
    refusedAtBattle(answer) ||
    answer.kind === 'barred' ||
    answer.kind === 'unknown-access'
  ) {
    throw new UserError(said, { givesBack: true, said: true });
  }
}

/**
 * What was typed, reported as `/max` reports it, where the screenshot could not be read at all
 * (busy, unavailable): with a note that says so, without the ending-soon question.
 */
async function reportTyped(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  typed: { boss: ReadMaxBoss; spot: MaxSpot; end?: number },
  now: number,
): Promise<void> {
  const regionChannelId = regionChannelOf(interaction, ctx) ?? '';
  const ask = {
    boss: typed.boss,
    spot: typed.spot,
    end: typed.end ?? reportedEnd(ctx, typed.boss.tier, null, now, zoneOf(interaction, ctx)),
    regionChannelId,
  };
  const guild = await ctx.guilds.idFor(guildIdOf(interaction));
  const joins = guild === undefined ? undefined : ctx.parties.maxAt(guild, typed.spot, now);
  const memberAccess = (forumId: string, memberId: string) =>
    ctx.partyService.memberAccess(forumId, memberId);
  if (
    await maxBarred(
      { partyService: ctx.partyService, memberAccess },
      { ...ask, joins },
      interaction.user.id,
    )
  ) {
    // Uncounted, as `/max`'s guard refuses it.
    throw new UserError(MAX_BARRED, { givesBack: true });
  }
  const member = { id: interaction.user.id, ...memberInfo(interaction) };
  const { outcome, autoStatus } = await reportMaxAs(ctx, member, guildIdOf(interaction), ask, {
    mayJoin: async (forumId) => (await memberAccess(forumId, member.id)) !== 'barred',
    staff: isStaff(interaction, ctx),
  });
  const content = `${TYPED_ONLY}\n${maxReportWords(ctx, outcome, ask, autoStatus)}`;
  await interaction.editReply({ content });
  // As `/max` gives these back; another boss there too, as its guard refuses it (review F-1).
  if (
    outcome.kind === 'no-post' ||
    outcome.kind === 'ended' ||
    outcome.kind === 'pin-blocked' ||
    outcome.kind === 'taken'
  ) {
    throw new UserError(content, { givesBack: true, said: true });
  }
}

/** The use `/max` counted, for a waiting report's controls (`carriesOn`). */
export function shotCarriesOn(
  asker: Asker,
  token: string,
): (ControlThrottle & { countedAt: number }) | undefined {
  const waiting = pending.peek(token, asker);
  return typeof waiting === 'object'
    ? { ...MAX_THROTTLE, as: MAX_COMMAND, countedAt: waiting.value.countedAt }
    : undefined;
}

/** The waiting report of a control; answers the member when there is none. */
async function claimed(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
): Promise<PendingShot | undefined> {
  const taken = pending.take(token, interaction);
  if (taken === 'not-yours') throw new UserError(NOT_YOURS);
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
 * Runs what follows `deferUpdate`: when it fails, the used-up controls are taken from the
 * message (best effort) before the error goes on; a refusal said already stays.
 */
async function afterDeferral(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof UserError && err.said) throw err;
    await interaction
      .editReply({ content: 'Nothing was reported.', components: [] })
      .catch(() => undefined);
    throw err;
  }
}

/** The Power Spot chosen in `/max screenshot:`'s menu (`max:<token>:spot`), kept in the record. */
export async function chooseMaxShotSpot(
  interaction: StringSelectMenuInteraction,
  token: string,
  ctx: AppContext,
): Promise<void> {
  const shot = await claimed(interaction, token);
  if (!shot) return;
  const spot = shot.spots.find((one) => one.id === interaction.values[0]);
  if (!spot) throw new UserError(SPOT_GONE);
  acknowledging(token);
  await interaction.deferUpdate();
  if (shot.screenshotId !== undefined) await ctx.screenshots.pickedSpot(shot.screenshotId, spot.id);
  const decision = decideMax(withSpot(shot.report, spot), {
    now: shot.uploadedAt,
    uploadedAt: shot.uploadedAt,
  });
  await afterDeferral(interaction, async () => {
    if (decision.kind === 'report') {
      await goOn(interaction, ctx, shot, decision.battle);
      return;
    }
    // Chosen, the spot leaves only what the screenshot could not tell (the tier) to refuse.
    const words =
      decision.kind === 'ask' && decision.about === 'spot'
        ? SPOT_GONE
        : refusal(interaction, ctx, decision, shot.report);
    await interaction.editReply({ content: words, components: [] });
  });
}

/** "Report it there" or "Cancel" of a waiting report (`max:<token>:yes` / `:no`). */
export async function confirmMaxShot(
  interaction: ButtonInteraction,
  token: string,
  action: string,
  ctx: AppContext,
): Promise<void> {
  const shot = await claimed(interaction, token);
  if (!shot) return;
  acknowledging(token);
  if (action !== 'yes' || !shot.request) {
    await interaction.update({ content: 'Nothing was reported.', components: [] });
    return;
  }
  const { request } = shot;
  await interaction.deferUpdate();
  await afterDeferral(interaction, () => finish(interaction, ctx, shot, request));
}
