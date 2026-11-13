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
import { timedIn, wallClockAt } from '../../domain/time/feed-times.js';
import { clockWords, dayWords, momentIn, zoned } from '../../domain/time/zoned.js';
import { zoneOf } from '../../discord/server-values.js';
import { plain, truncate } from '../../render/text.js';
import { LIST_COLOUR, textMessage } from '../../render/v2.js';
import { timedTimeHint } from '../parties/timed.js';
import { between } from '../raids/raid-input.js';
import { tellOwnerOfSharedChange } from './shared-change.js';

/** The subcommand group of `/operator` the event window lives under. */
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

/** A window's start as kept: its moment, and its wall-clock time where it was typed. */
type WindowStart = Pick<EventWindow, 'start' | 'startLocal'>;

/**
 * The start a `set` without `from:` keeps (review LW-1), as kept (plan 19A-2: local time stays
 * local): that of the window kept, as kept (fix round 1, M3), when it has begun and is on in one
 * of `zones` (the zones in use, the issuing server's among them), or ended there less than
 * `KEEP_START_AFTER_END_MS` ago, so that the part that ran anywhere stays counted; undefined (it
 * starts now) otherwise.
 */
function keptStart(
  kept: EventWindow | undefined,
  now: number,
  zones: readonly string[],
): WindowStart | undefined {
  if (kept === undefined) return undefined;
  const ran = zones.some((zone) => {
    const timed = timedIn(kept, zone);
    return (
      timed.end > timed.start && timed.start <= now && now - timed.end < KEEP_START_AFTER_END_MS
    );
  });
  if (!ran) return undefined;
  return {
    start: kept.start,
    ...(kept.startLocal === undefined ? {} : { startLocal: kept.startLocal }),
  };
}

/** A time typed for the window: its moment in the typing server's zone, and whether it is a span from now. */
interface TypedTime {
  at: number;
  relative?: true;
}

/**
 * A time typed in `zone` as the window keeps it (plan 19A-2): wall-clock time, local in every
 * server's zone, and its moment in the instance's default zone (what 2.0 reads). A span from now
 * (`in 30`) is a moment, the same everywhere, without a local time (fix round 1, M2).
 */
function typedLocal(
  typed: TypedTime,
  zone: string,
  defaultZone: string,
): { at: number; local?: string } {
  if (typed.relative === true) return { at: typed.at };
  const local = wallClockAt(typed.at, zone);
  return { at: momentIn({ local }, defaultZone).epochMilliseconds, local };
}

/** A moment as the answers say it, in `zone`: "Friday, November 13 at 8:00 PM". */
function momentWords(zone: string, time: number): string {
  const local = zoned(time, zone);
  return `${dayWords(local)} at ${clockWords(local)}`;
}

/** What the owner is told the window's times are: local time in every server's zone. */
const EVERY_ZONE = 'local time in every server’s zone';

/**
 * The window's times for the owner's DM (plan 19A-2), as `zone`'s clock says them: a time typed
 * (local in every server's zone) as it was typed, a moment with the zone it is said in when the
 * window has a local time beside it; `local` whether any is local time.
 */
function ownerTimes(
  window: EventWindow,
  zone: string,
): { start: string; end: string; local: boolean } {
  const timed = timedIn(window, zone);
  const local = window.startLocal !== undefined || window.endLocal !== undefined;
  const said = (time: number, typed: string | undefined): string =>
    typed !== undefined || !local
      ? momentWords(zone, time)
      : `${momentWords(zone, time)} (${zone})`;
  return {
    start: said(timed.start, window.startLocal),
    end: said(timed.end, window.endLocal),
    local,
  };
}

/** A time typed for the window, read as a meetup's start (`meet`) or its end (`end`) is read. */
function readTime(
  ctx: Pick<AppContext, 'config'>,
  zone: string,
  parameter: Extract<TimeParameter, 'meet' | 'end'>,
  text: string,
  start: number | null,
  now: number,
): PartyTimeResult {
  const { settings } = ctx.config;
  return resolvePartyTime({
    text,
    now,
    zone,
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
  zone: string,
  parameter: Extract<TimeParameter, 'meet' | 'end'>,
  text: string,
  start: number | null,
  now: number,
): TypedTime {
  const result = readTime(ctx, zone, parameter, text, start, now);
  if (result.kind === 'time')
    return result.relative === true ? { at: result.at, relative: true } : { at: result.at };
  const what = parameter === 'meet' ? `the start of ${WHAT}` : `the end of ${WHAT}`;
  const typed = plain(truncate(text, 80));
  if (result.kind === 'out-of-range') {
    const fromNow = start === null ? undefined : readTime(ctx, zone, parameter, text, null, now);
    if (start !== null && fromNow?.kind === 'time' && fromNow.at <= start) {
      throw new UserError(END_BEFORE_START);
    }
    // An end already gone (review LW-5): a time without a date read on a day it has passed
    // (`read`), or one with a date that the same reader takes as of a month ago.
    const earlier = readTime(ctx, zone, parameter, text, null, now - LOOK_BACK_MS);
    const gone =
      (result.read !== undefined && result.read <= now) ||
      (earlier.kind === 'time' && earlier.at <= now);
    if (parameter === 'end' && gone) throw new UserError(END_PAST);
    throw new UserError(
      `"${typed}" cannot be ${what}: it must be ${between(result.first, result.last, now)}.`,
    );
  }
  throw new UserError(`I could not read "${typed}" as ${what}. ${timedTimeHint(now, zone)}`);
}

/**
 * What a window changes, as `set` says it (`from` named when it is still to come), on `zone`'s
 * clock (`window` in it).
 */
function windowWords(
  ctx: Pick<AppContext, 'config'>,
  zone: string,
  window: EventWindow,
  now: number,
): string {
  const minutes = ctx.config.settings.raidEvents.hatchedDuration['raid-hour'];
  const until = momentWords(zone, window.end);
  const when =
    window.start > now
      ? `From ${momentWords(zone, window.start)} until ${until}`
      : `Until ${until}`;
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

/** `/operator event-window set`. */
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
        `otherwise, and lasts at most ${String(EVENT_WINDOW_MAX_DAYS)} days. The times you ` +
        'type are local time: the window is on at those hours on each server’s own clock.\n\n' +
        'Setting it again replaces it. Without `from:` it keeps the start of a window that is ' +
        'on or ended less than 2 hours ago.\n\n' +
        'End it with `/operator event-window end` once raids and battles are back to normal.\n\n' +
        'There is one window for all servers: the operators of this Pine set and end it, from ' +
        'any server or a direct message with me. Unless this Pine is open to every server, the ' +
        'admins, moderators and bot developers of its servers may too, from their server (where ' +
        'it lists its servers, those of the listed ones only).\n\nMy owner is told who did, ' +
        'and from where.'
      );
    },
    examples: [
      `/operator event-window set until:${DATE_EXAMPLE} 8pm`,
      `/operator event-window set from:${DATE_EXAMPLE} 10am until:${DATE_EXAMPLE} 8pm`,
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const now = Date.now();
    // Plan 19A-2: typed and said on the clock of the server it is set in, kept as local time,
    // which is on at those hours in every server's zone; a start of now is a moment.
    const zone = zoneOf(interaction, ctx);
    const defaultZone = ctx.servers.defaultZone();
    const from = interaction.options.getString('from');
    const until = interaction.options.getString('until', true);
    const typedStart = from === null ? undefined : typedTime(ctx, zone, 'meet', from, null, now);
    // Decided after any set or end asked before (review LW-2), from the window they left.
    const { window, before } = await ctx.eventWindows.set((kept) => {
      const typed =
        typedStart === undefined ? undefined : typedLocal(typedStart, zone, defaultZone);
      const startKept: WindowStart = typed
        ? { start: typed.at, ...(typed.local === undefined ? {} : { startLocal: typed.local }) }
        : (keptStart(kept, now, [zone, ...ctx.servers.zonesInUse()]) ?? { start: now });
      // The start on this server's clock, from which the end's day and the checks are counted.
      const start = timedIn({ ...startKept, end: startKept.start }, zone).start;
      const typedEnd = typedTime(ctx, zone, 'end', until, start, now);
      const end = typedEnd.at;
      const problem = eventWindowProblem(start, end, now, zone);
      if (problem === 'end-not-after-start') throw new UserError(END_BEFORE_START);
      if (problem === 'end-past') throw new UserError(END_PAST);
      if (problem === 'too-long') {
        throw new UserError(
          `An event window lasts at most ${String(EVENT_WINDOW_MAX_DAYS)} days: end it by ` +
            `${momentWords(zone, eventWindowLatestEnd(start, now, zone))}.`,
        );
      }
      const endKept = typedLocal(typedEnd, zone, defaultZone);
      return {
        ...startKept,
        end: endKept.at,
        ...(endKept.local === undefined ? {} : { endLocal: endKept.local }),
        setBy: interaction.user.id,
        setAt: now,
      };
    });
    ctx.log.info(
      { ...usedBy(interaction), start: window.start, end: window.end },
      'an event window was set',
    );
    // One window for every server, set on the word of one server's staff: the owner is told
    // (Matt's ruling 5 of 2026-11-10; the audit's L-D1), and that it is local time everywhere.
    const told = ownerTimes(window, zone);
    tellOwnerOfSharedChange(
      interaction,
      ctx,
      `Set the event window, for every server: from ${told.start} until ${told.end}` +
        `${told.local ? `, ${EVERY_ZONE}` : ''}.`,
      now,
    );
    const shown = timedIn(window, zone);
    const stillFrom =
      shown.start < now ? `Still counted from ${momentWords(zone, shown.start)}.` : undefined;
    const was = before === undefined ? undefined : timedIn(before, zone);
    const replaced =
      was === undefined || was.end <= now
        ? undefined
        : `This replaces the window that was to last until ${momentWords(zone, was.end)}.`;
    await interaction.editReply(
      v2Answer(textMessage(LIST_COLOUR, [windowWords(ctx, zone, shown, now), stillFrom, replaced])),
    );
  },
};

/** `/operator event-window end`. */
export const endEventWindow: SubcommandPart = {
  group: EVENT_WINDOW_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('end')
    .setDescription('End the event window now: raids and max battles as usual again'),
  help: {
    details:
      'Ends the event window now in every server: where it has not begun yet, it is called ' +
      'off; where it has, what ran stays. Raids and battles ' +
      'reported from then on last as usual; those reported before keep their times.',
    examples: ['/operator event-window end'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const now = Date.now();
    // Plan 19A-2: it ends now, one moment for every server (fix round 1, M1): what ran anywhere
    // stays; the answer says how it stood on the clock of the server it is ended in.
    const zone = zoneOf(interaction, ctx);
    const result = await ctx.eventWindows.end(now, zone);
    if (!result) throw new UserError('No event window is set.');
    const { before, window: ended, here, ran } = result;
    ctx.log.info(
      { ...usedBy(interaction), start: ended.start, end: ended.end },
      'an event window was ended',
    );
    // Until when it was to last, for the owner's DM: the window as it stood before the end.
    const told = ownerTimes(before, zone);
    const everyZone = told.local ? `, ${EVERY_ZONE}` : '';
    const wasToLast = timedIn(before, zone).end > now ? ` and was to last until ${told.end}` : '';
    // Called off for every server only where it had begun nowhere.
    tellOwnerOfSharedChange(
      interaction,
      ctx,
      ran
        ? `Ended the event window, for every server: it had run since ${told.start}` +
            `${wasToLast}${everyZone}.`
        : `Called off the event window that was to begin ${told.start}${everyZone}, ` +
            'for every server.',
      now,
    );
    const text =
      here === 'to-come'
        ? `The event window that was to begin ${momentWords(zone, timedIn(before, zone).start)} ` +
          'is called off.'
        : here === 'over'
          ? // Over on this clock, on elsewhere (fix round 1, M4).
            'Ended the event window in the servers where it was still on.'
          : 'The event window is over: raids and battles reported from now on last as usual. ' +
            'Those already reported keep their times.';
    await interaction.editReply(v2Answer(textMessage(LIST_COLOUR, [text])));
  },
};

export const eventWindowParts: readonly SubcommandPart[] = [setEventWindow, endEventWindow];
