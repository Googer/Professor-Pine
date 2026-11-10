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
import type { GoogleLineSnapshot } from '../../services/gym-upkeep.js';
import { gymRegionsInGuild } from '../../services/region-directory.js';
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
}

/**
 * This server's part of the instance's line (`/gym google`): its gyms are those in a region of
 * the server; its PokéStops and Power Spots those in its regions.
 */
export function serverShare(
  line: Pick<GoogleLineSnapshot, 'gyms' | 'wayspots'>,
  isOwnGym: (gymId: number) => boolean,
  isOwnWayspot: (wayspotId: string) => boolean,
): ServerShare {
  const share: ServerShare = { gyms: 0, wayspots: 0, gymsTo: 0, wayspotsTo: 0 };
  line.gyms.forEach((gym, index) => {
    if (!isOwnGym(gym.gymId)) return;
    share.gyms++;
    share.gymsTo = index + 1;
  });
  line.wayspots.forEach((wayspot, index) => {
    if (!isOwnWayspot(wayspot.wayspotId)) return;
    share.wayspots++;
    share.wayspotsTo = index + 1;
  });
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

/** The month's maps of places (`MapBudget`): how many are used, of how many. */
export interface MapsUsed {
  used: number;
  perMonth: number;
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
    `${used.monthByHand === 1 ? 'is' : 'are'} used this month.`;
  const estimate = estimateLine({
    now,
    used,
    budget,
    everyMs: line.everyMs,
    gyms: share.gymsTo,
    allGyms: line.gyms.length,
    wayspots: share.wayspotsTo,
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
    byHand,
    ...(maps === undefined
      ? []
      : [
          `${amount(maps.used)} of ${amount(maps.perMonth)} maps of \`/find-region\` ` +
            `${maps.used === 1 ? 'is' : 'are'} used this month.`,
        ]),
    ...(pace === undefined ? [] : [pace]),
    '-# The line and the budget are this instance’s, for its one Google key; the counts are ' +
      'this server’s part of it.',
  ];
}

/** `/gym google` for the staff member's server. */
async function googleLineMessage(ctx: AppContext, guildId: number | undefined) {
  const line = await ctx.gymAdmin.googleLine();
  const own = new Set(
    ctx.regions
      .all()
      .filter((region) => guildId !== undefined && region.guildId === guildId)
      .map((region) => region.channelId),
  );
  const share = serverShare(
    line,
    (gymId) =>
      guildId !== undefined && gymRegionsInGuild(ctx.gyms, ctx.regions, gymId, guildId).length > 0,
    (wayspotId) => ctx.wayspots.regionsOf(wayspotId).some((channelId) => own.has(channelId)),
  );
  // The maps of `/find-region`, where it is offered and Google is asked at all.
  const used =
    line.fetches && ctx.config.settings.findRegion !== undefined
      ? await ctx.mapBudget.used()
      : undefined;
  const maps = used === undefined ? undefined : { used, perMonth: ctx.mapBudget.perMonth };
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
