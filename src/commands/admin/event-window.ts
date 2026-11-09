import { SlashCommandSubcommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { DATE_EXAMPLE } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { v2Answer } from '../../discord/late-reply.js';
import {
  EVENT_WINDOW_MAX_DAYS,
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

/** The subcommand group of `/admin` the event window lives under. */
export const EVENT_WINDOW_GROUP = 'event-window';
export const EVENT_WINDOW_DESCRIPTION = 'All-day Raid Hour raids and Max Battle Day rotations';

const DAY_MS = 24 * 60 * 60_000;
/** What the window is called in every answer. */
const WHAT = 'the event window';
const END_BEFORE_START = 'The event window must end after it starts.';

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
        .setDescription('When it ends: a time, or a date and a time (month-day 8pm)')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName('from')
        .setDescription('When it starts, if not now: a time, or a date and a time')
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
        'Times are typed as for `/meetup`: a time, or a date (month-day) and a time. It starts ' +
        `now unless \`from:\` says otherwise, and lasts at most ${String(EVENT_WINDOW_MAX_DAYS)} ` +
        'days. Setting it again replaces it.\n\n' +
        'End it with `/admin event-window end` once raids and battles are back to normal. ' +
        'There is one window for all servers: anyone who may use `/admin` on any of them can ' +
        'set or end it.'
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
    const from = interaction.options.getString('from');
    const start = from === null ? now : typedTime(ctx, 'meet', from, null, now);
    const end = typedTime(ctx, 'end', interaction.options.getString('until', true), start, now);
    const problem = eventWindowProblem(start, end, now);
    if (problem === 'end-not-after-start') {
      throw new UserError(END_BEFORE_START);
    }
    if (problem === 'end-past') throw new UserError('The event window must end in the future.');
    if (problem === 'too-long') {
      const latest = start + EVENT_WINDOW_MAX_DAYS * DAY_MS;
      throw new UserError(
        `An event window lasts at most ${String(EVENT_WINDOW_MAX_DAYS)} days: end it by ` +
          `${momentWords(ctx, latest)}.`,
      );
    }
    const before = ctx.eventWindows.ongoing(now);
    const window: EventWindow = { start, end, setBy: interaction.user.id, setAt: now };
    await ctx.eventWindows.set(window);
    ctx.log.info({ ...usedBy(interaction), start, end }, 'an event window was set');
    const replaced =
      before === undefined
        ? undefined
        : `This replaces the window that was to last until ${momentWords(ctx, before.end)}.`;
    await interaction.editReply(
      v2Answer(textMessage(LIST_COLOUR, [windowWords(ctx, window, now), replaced])),
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
    const ended = await ctx.eventWindows.end(now);
    if (!ended) throw new UserError('No event window is set.');
    ctx.log.info(
      { ...usedBy(interaction), start: ended.start, end: ended.end },
      'an event window was ended',
    );
    const text =
      ended.end <= ended.start
        ? `The event window that was to begin ${momentWords(ctx, ended.start)} is called off.`
        : 'The event window is over: raids and battles reported from now on last as usual. ' +
          'Those already reported keep their times.';
    await interaction.editReply(v2Answer(textMessage(LIST_COLOUR, [text])));
  },
};

export const eventWindowParts: readonly SubcommandPart[] = [setEventWindow, endEventWindow];
