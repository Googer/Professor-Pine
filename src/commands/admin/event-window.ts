import { SlashCommandSubcommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { DATE_EXAMPLE } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { v2Answer } from '../../discord/late-reply.js';
import {
  EVENT_WINDOW_MAX_DAYS,
  eventWindowLatestEnd,
  eventWindowProblem,
  type EventWindow,
} from '../../domain/time/event-window.js';
import {
  resolvePartyTime,
  type PartyTimeResult,
  type TimeParameter,
} from '../../domain/time/party-time.js';
import { clockWords, dayWords, zoned } from '../../domain/time/zoned.js';
import { plain, truncate } from '../../render/text.js';
import { LIST_COLOUR, textMessage } from '../../render/v2.js';
import { timedTimeHint } from '../parties/timed.js';
import { between } from '../raids/raid-input.js';
import { tellOwnerOfSharedChange } from './shared-change.js';

/** The subcommand group of `/admin` the event window lives under. */
export const EVENT_WINDOW_GROUP = 'event-window';
export const EVENT_WINDOW_DESCRIPTION = 'All-day Raid Hour raids and Max Battle Day rotations';

const MINUTE_MS = 60_000;
/**
 * How long after its end a window still lends its start to a `set` without `from:` (review
 * LW-1): staff who let it run out and set it again soon after mean the same window.
 */
const KEEP_START_AFTER_END_MS = 2 * 60 * MINUTE_MS;
/** How far back an end is read again to tell one in the past (`typedTime`). */
const LOOK_BACK_MS = 30 * 24 * 60 * MINUTE_MS;
/** What the window is called in every answer. */
const WHAT = 'the event window';
const END_BEFORE_START = 'The event window must end after it starts.';
const END_PAST = 'The event window must end in the future.';

/**
 * The start a `set` without `from:` keeps (review LW-1): that of the window kept when it has
 * begun and is on, or ended less than `KEEP_START_AFTER_END_MS` ago, so that the part that ran
 * stays counted; undefined (it starts now) otherwise.
 */
function keptStart(kept: EventWindow | undefined, now: number): number | undefined {
  if (kept === undefined || kept.start > now) return undefined;
  return now - kept.end < KEEP_START_AFTER_END_MS ? kept.start : undefined;
}

/** A moment as the answers say it, in the settings' zone: "Friday, November 13 at 8:00 PM". */
function momentWords(ctx: Pick<AppContext, 'config'>, time: number): string {
  const local = zoned(time, ctx.config.settings.timezone);
  return `${dayWords(local)} at ${clockWords(local)}`;
}

/** A time typed for the window, read as a meetup's start (`meet`) or its end (`end`) is read. */
function readTime(
  ctx: Pick<AppContext, 'config'>,
  parameter: Extract<TimeParameter, 'meet' | 'end'>,
  text: string,
  start: number | null,
  now: number,
): PartyTimeResult {
  const { settings } = ctx.config;
  return resolvePartyTime({
    text,
    now,
    zone: settings.timezone,
    parameter,
    partyType: 'meetup',
    raidKind: 'standard',
    party: { creationTime: now, startTime: start },
    settings,
  });
}

/**
 * A time typed for the window, read as a meetup's start (`from`, `meet`: from now on) or its end
 * (`until`, `end`: from the start on, a time without a date on the start's day) is read
 * (`resolvePartyTime`: dates month-day, `tomorrow`, `in 30`); a `UserError` in the words of the
 * window for a text that is no time or lies outside, and for an end that is a time before the
 * start (read again from now, so that the refusal says what is wrong).
 */
function typedTime(
  ctx: Pick<AppContext, 'config'>,
  parameter: Extract<TimeParameter, 'meet' | 'end'>,
  text: string,
  start: number | null,
  now: number,
): number {
  const result = readTime(ctx, parameter, text, start, now);
  if (result.kind === 'time') return result.at;
  const what = parameter === 'meet' ? `the start of ${WHAT}` : `the end of ${WHAT}`;
  const typed = plain(truncate(text, 80));
  if (result.kind === 'out-of-range') {
    const fromNow = start === null ? undefined : readTime(ctx, parameter, text, null, now);
    if (start !== null && fromNow?.kind === 'time' && fromNow.at <= start) {
      throw new UserError(END_BEFORE_START);
    }
    // An end already gone (review LW-5): a time without a date read on a day it has passed
    // (`read`), or one with a date that the same reader takes as of a month ago.
    const earlier = readTime(ctx, parameter, text, null, now - LOOK_BACK_MS);
    const gone =
      (result.read !== undefined && result.read <= now) ||
      (earlier.kind === 'time' && earlier.at <= now);
    if (parameter === 'end' && gone) throw new UserError(END_PAST);
    throw new UserError(
      `"${typed}" cannot be ${what}: it must be ${between(result.first, result.last, now)}.`,
    );
  }
  throw new UserError(
    `I could not read "${typed}" as ${what}. ${timedTimeHint(now, ctx.config.settings.timezone)}`,
  );
}

/** What a window changes, as `set` says it (`from` named when it is still to come). */
function windowWords(ctx: Pick<AppContext, 'config'>, window: EventWindow, now: number): string {
  const minutes = ctx.config.settings.raidEvents.hatchedDuration['raid-hour'];
  const until = momentWords(ctx, window.end);
  const when =
    window.start > now ? `From ${momentWords(ctx, window.start)} until ${until}` : `Until ${until}`;
  return (
    `${when}, raids last ${String(minutes)} minutes as in a Raid Hour, and Dynamax and ` +
    'Gigantamax battles change every 30 minutes, as on a Max Battle Day. ' +
    'Raids and battles already reported keep their times.'
  );
}

/** Who used it and where, for the log. */
function usedBy(interaction: ChatInputCommandInteraction): { by: string; guild: string | null } {
  return { by: interaction.user.id, guild: interaction.guildId };
}

/** `/admin event-window set`. */
export const setEventWindow: SubcommandPart = {
  group: EVENT_WINDOW_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('set')
    .setDescription('Have raids last as in a Raid Hour and max battles rotate every 30 minutes')
    .addStringOption((option) =>
      option
        .setName('until')
        .setDescription('When it ends: a time with am or pm, or a date and one (month-day 8pm)')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName('from')
        .setDescription(
          'When it starts, if not now: a time with am or pm, or a date and one (month-day 10am)',
        )
        .setMaxLength(100),
    ),
  help: {
    details: (settings) => {
      const minutes = String(settings.raidEvents.hatchedDuration['raid-hour']);
      return (
        'For the days around a big event, its lead-up and the event itself, when the game ' +
        `runs all-day Raid Hour raids (no eggs, every raid ${minutes} minutes) and Max Battle ` +
        'Day rotations, though the events feed does not say so.\n\n' +
        `While it is on, a raid that hatches lasts ${minutes} minutes, and a Dynamax or ` +
        'Gigantamax battle ends at the next half hour. Raids and battles reported before keep ' +
        'their times.\n\n' +
        'Times are typed as for `/meetup`: a time with am or pm (1 to 6 alone is the ' +
        'afternoon), or a date (month-day) and a time. It starts now unless `from:` says ' +
        `otherwise, and lasts at most ${String(EVENT_WINDOW_MAX_DAYS)} days.\n\n` +
        'Setting it again replaces it. Without `from:` it keeps the start of a window that is ' +
        'on or ended less than 2 hours ago.\n\n' +
        'End it with `/admin event-window end` once raids and battles are back to normal. ' +
        'There is one window for all servers: anyone who may use `/admin` on any of them can ' +
        'set or end it. My owner is told who did, and in which server.'
      );
    },
    examples: [
      `/admin event-window set until:${DATE_EXAMPLE} 8pm`,
      `/admin event-window set from:${DATE_EXAMPLE} 10am until:${DATE_EXAMPLE} 8pm`,
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const now = Date.now();
    const zone = ctx.config.settings.timezone;
    const from = interaction.options.getString('from');
    const until = interaction.options.getString('until', true);
    const typedStart = from === null ? undefined : typedTime(ctx, 'meet', from, null, now);
    // Decided after any set or end asked before (review LW-2), from the window they left.
    const { window, before } = await ctx.eventWindows.set((kept) => {
      const start = typedStart ?? keptStart(kept, now) ?? now;
      const end = typedTime(ctx, 'end', until, start, now);
      const problem = eventWindowProblem(start, end, now, zone);
      if (problem === 'end-not-after-start') throw new UserError(END_BEFORE_START);
      if (problem === 'end-past') throw new UserError(END_PAST);
      if (problem === 'too-long') {
        throw new UserError(
          `An event window lasts at most ${String(EVENT_WINDOW_MAX_DAYS)} days: end it by ` +
            `${momentWords(ctx, eventWindowLatestEnd(start, now, zone))}.`,
        );
      }
      return { start, end, setBy: interaction.user.id, setAt: now };
    });
    ctx.log.info(
      { ...usedBy(interaction), start: window.start, end: window.end },
      'an event window was set',
    );
    // One window for every server, set on the word of one server's staff: the owner is told
    // (Matt's ruling 5 of 2026-11-10; the audit's L-D1).
    tellOwnerOfSharedChange(
      interaction,
      ctx,
      `Set the event window, for every server: from ${momentWords(ctx, window.start)} until ` +
        `${momentWords(ctx, window.end)}.`,
      now,
    );
    const stillFrom =
      window.start < now ? `Still counted from ${momentWords(ctx, window.start)}.` : undefined;
    const replaced =
      before === undefined || before.end <= now
        ? undefined
        : `This replaces the window that was to last until ${momentWords(ctx, before.end)}.`;
    await interaction.editReply(
      v2Answer(textMessage(LIST_COLOUR, [windowWords(ctx, window, now), stillFrom, replaced])),
    );
  },
};

/** `/admin event-window end`. */
export const endEventWindow: SubcommandPart = {
  group: EVENT_WINDOW_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('end')
    .setDescription('End the event window now: raids and max battles as usual again'),
  help: {
    details:
      'Ends the event window now, or calls it off if it has not begun. Raids and battles ' +
      'reported from then on last as usual; those reported before keep their times.',
    examples: ['/admin event-window end'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const now = Date.now();
    // Until when it was to last, for the owner's DM: the window as it stood before the end.
    const planned = ctx.eventWindows.ongoing(now);
    const ended = await ctx.eventWindows.end(now);
    if (!ended) throw new UserError('No event window is set.');
    ctx.log.info(
      { ...usedBy(interaction), start: ended.start, end: ended.end },
      'an event window was ended',
    );
    const calledOff = ended.end <= ended.start;
    const wasToLast =
      planned !== undefined && planned.start === ended.start && planned.end > now
        ? ` and was to last until ${momentWords(ctx, planned.end)}`
        : '';
    tellOwnerOfSharedChange(
      interaction,
      ctx,
      calledOff
        ? `Called off the event window that was to begin ${momentWords(ctx, ended.start)}, ` +
            'for every server.'
        : 'Ended the event window, for every server: it had run since ' +
            `${momentWords(ctx, ended.start)}${wasToLast}.`,
      now,
    );
    const text = calledOff
      ? `The event window that was to begin ${momentWords(ctx, ended.start)} is called off.`
      : 'The event window is over: raids and battles reported from now on last as usual. ' +
        'Those already reported keep their times.';
    await interaction.editReply(v2Answer(textMessage(LIST_COLOUR, [text])));
  },
};

export const eventWindowParts: readonly SubcommandPart[] = [setEventWindow, endEventWindow];
