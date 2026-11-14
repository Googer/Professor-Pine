import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import {
  estimateLine,
  GOOGLE_ZONE,
  googleMonth,
  type EstimatedDay,
} from '../../domain/geo/google-line.js';
import { zoned } from '../../domain/time/zoned.js';
import { timestamp } from '../../render/text.js';
import { gymLineOrder, type WaitingGym } from '../../services/gym-lookups.js';
import type { GoogleLineSnapshot } from '../../services/gym-upkeep.js';
import { wayspotLineOrder, type WaitingWayspot } from '../../services/wayspot-lookups.js';
import { answerGym, gymQuestion, staffPlace } from './shared.js';

/** A number as a sentence writes it: `4,500`. */
function amount(n: number): string {
  return n.toLocaleString('en-US');
}

/** `1 gym`, `2,600 gyms`. */
function counted(n: number, singular: string, plural = `${singular}s`): string {
  return `${amount(n)} ${n === 1 ? singular : plural}`;
}

/** This server's part of the line: how many wait, and how far into the line its last ones are. */
export interface ServerShare {
  gyms: number;
  wayspots: number;
  /** The gyms of the line up to and with this server's last (0: none of it waits). */
  gymsTo: number;
  /** The PokéStops and Power Spots up to and with this server's last (0: none). */
  wayspotsTo: number;
  /**
   * As `gymsTo` and `wayspotsTo`, with this server's rows at the ranks its regions give them
   * (fix round 4, R6): where they stand on the 1st, held at the end of the line no more; only
   * where the snapshot has them (`server.ownRanks`).
   */
  nextMonth?: { gymsTo: number; wayspotsTo: number };
}

/**
 * This server's part of the instance's line (`/gym google`): its own rows (plan 19B-3: a gym or
 * Wayspot waits once per server that has it, by its `Guild` row; a server without a row has
 * none). How far into the line its last ones are counts every server's rows before them; with its
 * own ranks (`server.ownRanks`), also where they stand on the 1st.
 */
export function serverShare(
  line: Pick<GoogleLineSnapshot, 'gyms' | 'wayspots' | 'server'>,
  guildId: number | undefined,
): ServerShare {
  if (guildId === undefined) return { gyms: 0, wayspots: 0, gymsTo: 0, wayspotsTo: 0 };
  const share: ServerShare = positions(line.gyms, line.wayspots, guildId);
  const own = line.server?.ownRanks;
  if (own === undefined) return share;
  // The line on the 1st: this server's rows by their own ranks, in the line's order.
  const gyms = line.gyms
    .map((row) =>
      row.guildId === guildId ? { ...row, rank: own.gyms.get(row.gymId) ?? row.rank } : row,
    )
    .sort(gymLineOrder);
  const wayspots = line.wayspots
    .map((row) =>
      row.guildId === guildId ? { ...row, rank: own.wayspots.get(row.wayspotId) ?? row.rank } : row,
    )
    .sort(wayspotLineOrder);
  const next = positions(gyms, wayspots, guildId);
  return { ...share, nextMonth: { gymsTo: next.gymsTo, wayspotsTo: next.wayspotsTo } };
}

/** A server's rows of the line as it is ordered, and how far into it its last ones are. */
function positions(
  gyms: readonly WaitingGym[],
  wayspots: readonly WaitingWayspot[],
  guildId: number,
): ServerShare {
  const share: ServerShare = { gyms: 0, wayspots: 0, gymsTo: 0, wayspotsTo: 0 };
  // How far in counts the questions before: a gym or Wayfarer id of two servers is asked once.
  const gymsSeen = new Set<number>();
  for (const gym of gyms) {
    gymsSeen.add(gym.gymId);
    if (gym.guildId !== guildId) continue;
    share.gyms++;
    share.gymsTo = gymsSeen.size;
  }
  const spotsSeen = new Set<string>();
  for (const wayspot of wayspots) {
    spotsSeen.add(wayspot.wayspotId);
    if (wayspot.guildId !== guildId) continue;
    share.wayspots++;
    share.wayspotsTo = spotsSeen.size;
  }
  return share;
}

/**
 * When something will be done, as a sentence ends: today, on a day, or not soon. The day is shown
 * at noon in California, so that a reader west of it (Hawaii) sees the same date, not the day
 * before.
 */
function when(day: EstimatedDay, now: number): string {
  if (day === 'beyond') return 'not within three years at this budget';
  if (googleMonth(day).today === googleMonth(now).today) return 'today';
  const noon = zoned(day, GOOGLE_ZONE).with({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  return `on ${timestamp(noon.epochMilliseconds, 'D')}`;
}

/**
 * The month's maps of places (`MapBudget`): how many are used, of how many; and of them this
 * server's members' (plan 19B-5), where its count could be read, and their floor of the month.
 */
export interface MapsUsed {
  used: number;
  perMonth: number;
  server?: { used: number; floor: number };
}

/**
 * This server's share of the month (plan 19B-5, `GoogleShares`) as a sentence; undefined where
 * the snapshot has none (no server asked about, no shares).
 */
function shareText(line: GoogleLineSnapshot): string | undefined {
  const server = line.server;
  if (server === undefined) return undefined;
  const { share } = server;
  if (share === undefined && server.used.places + server.used.geocodes > 0) {
    // Nothing of it waits now, but the line asked about its rows this month (fix round 4, R6).
    return (
      `This server used ${counted(server.used.places, 'places search', 'places searches')} ` +
      `and ${counted(server.used.geocodes, 'address', 'addresses')} of this month; nothing of ` +
      'it waits now, and it gets a share as soon as something does.'
    );
  }
  if (share === undefined) {
    return (
      'This server has no share of this month yet: nothing of it waited for Google when the ' +
      'shares were worked out. It gets one as soon as something of it waits.'
    );
  }
  const raised = share.raise > 0 ? `, ${amount(share.raise)} of each added by an operator` : '';
  return (
    `This server’s share of this month is ${amount(share.share.places)} places searches and ` +
    `${amount(share.share.geocodes)} addresses, by what each server has waiting${raised}; the ` +
    `line used ${amount(share.used.places)} and ${amount(share.used.geocodes)} of it.`
  );
}

/**
 * What `/gym google` says; `maps` where `/find-region` is offered and its count could be read
 * (plan 8Z-2).
 */
export function googleLineTexts(
  line: GoogleLineSnapshot,
  share: ServerShare,
  maps?: MapsUsed,
): string[] {
  const heading = '### The line for Google';
  if (!line.fetches) {
    return [heading, 'No Google API key is configured, so nothing is asked of Google.'];
  }
  const { used, budget, now } = line;
  const waiting =
    share.gyms + share.wayspots === 0
      ? 'Nothing of this server waits for Google.'
      : `${[
          share.gyms > 0 ? counted(share.gyms, 'gym') : undefined,
          share.wayspots > 0
            ? counted(share.wayspots, 'PokéStop or Power Spot', 'PokéStops or Power Spots')
            : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(
            ' and ',
          )} of this server ${share.gyms + share.wayspots === 1 ? 'waits' : 'wait'} for Google.`;
  const month =
    `This month ${amount(used.monthPlaces)} of ${amount(budget.places)} places searches ` +
    `${used.monthPlaces === 1 ? 'is' : 'are'} used; the line stops when ` +
    `${amount(budget.reserve)} ${budget.reserve === 1 ? 'is' : 'are'} left, for gyms added or ` +
    `moved by hand and \`/gym refresh\`. ${amount(used.monthGeocodes)} of ` +
    `${amount(budget.geocodes)} addresses ${used.monthGeocodes === 1 ? 'is' : 'are'} used; ` +
    `Power Spots’ addresses on the map stop when ${amount(budget.geocodesReserve)} ` +
    `${budget.geocodesReserve === 1 ? 'is' : 'are'} left, for gyms. The ` +
    `month starts again ${timestamp(googleMonth(now).nextReset, 'f')}, when Google’s free ` +
    'amounts reset.';
  const byHand =
    `${amount(used.monthByHand)} of ${amount(line.byHandPerMonth)} lookups by hand ` +
    `${used.monthByHand === 1 ? 'is' : 'are'} used this month` +
    (line.server === undefined
      ? '.'
      : `, ${amount(line.server.byHand)} of them by this server, which may always make ` +
        `${amount(line.server.byHandFloor)}.`);
  const shared = shareText(line);
  // Bounded by what is left of the server's share (fix round 3, T9).
  const monthShare = line.server?.share;
  const estimate = estimateLine({
    now,
    used,
    budget,
    everyMs: line.everyMs,
    gyms: share.gymsTo,
    allGyms: questionsOf(line).gyms,
    wayspots: share.wayspotsTo,
    ...(monthShare === undefined
      ? {}
      : {
          share: {
            left: monthShare.share.places - monthShare.used.places,
            gyms: share.gyms,
            all: share.gyms + share.wayspots,
            // Its rows on the 1st at their own ranks (fix round 4, R6).
            ...(share.nextMonth === undefined
              ? {}
              : {
                  nextMonth: {
                    gyms: share.nextMonth.gymsTo,
                    wayspots: share.nextMonth.wayspotsTo,
                  },
                }),
          },
        }),
  });
  const gymsWhen = estimate.gyms === undefined ? undefined : when(estimate.gyms, now);
  const allWhen = estimate.all === undefined ? undefined : when(estimate.all, now);
  const pace =
    allWhen === undefined
      ? undefined
      : gymsWhen === undefined
        ? `At this pace everything of this server is asked about ${allWhen}.`
        : gymsWhen === allWhen
          ? `At this pace everything of this server is asked about ${allWhen}, the gyms first.`
          : `At this pace the gyms of this server are all asked about ${gymsWhen}, and ` +
            `everything of this server ${allWhen}.`;
  return [
    heading,
    waiting,
    month,
    ...(shared === undefined ? [] : [shared]),
    byHand,
    ...(maps === undefined
      ? []
      : [
          `${amount(maps.used)} of ${amount(maps.perMonth)} maps of \`/find-region\` ` +
            `${maps.used === 1 ? 'is' : 'are'} used this month` +
            (maps.server === undefined
              ? '.'
              : `, ${amount(maps.server.used)} of them by this server’s members, who may ` +
                `always have ${amount(maps.server.floor)}.`),
        ]),
    ...(pace === undefined ? [] : [pace]),
    '-# The line and the budget are this instance’s, for its one Google key; the counts are ' +
      'this server’s part of it.',
  ];
}

/**
 * How many questions the line holds: its gyms and Wayspots by their ids, a gym or Wayfarer id
 * that waits for two servers asked once (plan 19B-3).
 */
export function questionsOf(line: Pick<GoogleLineSnapshot, 'gyms' | 'wayspots'>): {
  gyms: number;
  wayspots: number;
} {
  return {
    gyms: new Set(line.gyms.map((gym) => gym.gymId)).size,
    wayspots: new Set(line.wayspots.map((wayspot) => wayspot.wayspotId)).size,
  };
}

/** `/gym google` for the staff member's server. */
async function googleLineMessage(ctx: AppContext, guildId: number | undefined) {
  const line = await ctx.gymAdmin.googleLine(guildId);
  const share = serverShare(line, guildId);
  // The maps of `/find-region`, where it is offered and Google is asked at all; and this
  // server's members' of them (plan 19B-5).
  const offered = line.fetches && ctx.config.settings.findRegion !== undefined;
  const used = offered ? await ctx.mapBudget.used() : undefined;
  const ours = offered && guildId !== undefined ? await ctx.mapBudget.used(guildId) : undefined;
  const maps =
    used === undefined
      ? undefined
      : {
          used,
          perMonth: ctx.mapBudget.perMonth,
          ...(ours === undefined
            ? {}
            : { server: { used: ours, floor: ctx.mapBudget.floorOf(guildId) } }),
        };
  return gymQuestion(googleLineTexts(line, share, maps));
}

/**
 * `/gym google` (plan 8W-6): how far the line that waits for Google is, for staff: this
 * server's gyms, PokéStops and Power Spots that wait, this month's questions of the budget and
 * the reserve, when the month resets, and when at the current pace this server's gyms and all
 * of its part will be done. The line and the budget are the instance's (one Google key).
 */
export const googleLine: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('google')
    .setDescription('See how far the gyms and PokéStops waiting for Google have come'),
  help: {
    details:
      'Gyms are also found by the names of the places around them, and PokéStops and Power ' +
      'Spots too, which I ask Google for one at a time within a monthly budget that stays ' +
      'within its free amounts: gyms first, the busiest regions first, then PokéStops and Power ' +
      'Spots a little every day.\n\nThis says how many places of this server are still ' +
      'waiting, how much of the month’s budget is used, and when they will be done at this ' +
      'pace.',
    examples: ['/gym google'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const { guildId } = await staffPlace(interaction, ctx);
    await answerGym(interaction, await googleLineMessage(ctx, guildId));
  },
};
