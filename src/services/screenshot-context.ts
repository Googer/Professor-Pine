import type { AppContext } from '../app-context.js';
import type { MaxReportContext } from '../domain/ocr/max-report.js';
import type { SpotTitle } from '../domain/ocr/power-spot-match.js';
import type { ReportContext } from '../domain/ocr/screenshot-report.js';
import { takenAtFromFileName } from '../domain/ocr/file-time.js';
import { gymInGuild } from './region-directory.js';

/** How many hits of each search the report looks at: enough to see that one is not alone. */
const GYM_HITS = 3;

/**
 * What `screenshotReport` needs, from the bot: the bosses in effect, every Pokémon of the game
 * data (a boss the list does not have yet, by its CP), the gym search where the
 * screenshot was posted (names only: what a raid screen shows; this server's gyms only, also
 * outside a region channel), the settings' time zone and durations. `channelId` is the region
 * channel (or null outside one), `guildRow` the server's row (`ctx.guilds.idFor`), `uploadedAt`
 * the time of the message or interaction that brought the screenshot, `fileName` the name of
 * the screenshot's file (an Android phone names it by the moment it was taken).
 */
export function reportContext(
  ctx: Pick<AppContext, 'raidBosses' | 'gameData' | 'gyms' | 'regions' | 'config'>,
  where: { channelId: string | null; guildRow: number },
  uploadedAt: number,
  fileName?: string,
): ReportContext {
  const { settings } = ctx.config;
  const fileTakenAt =
    fileName === undefined ? undefined : takenAtFromFileName(fileName, settings.timezone);
  return {
    bosses: ctx.raidBosses.bosses(),
    pokemon: ctx.gameData.catalogue.all,
    searchGym: (text) =>
      ctx.gyms
        .search(where.channelId, text, { nameOnly: true })
        .filter((hit) => gymInGuild(ctx.gyms, ctx.regions, hit.gym.id, where.guildRow))
        .slice(0, GYM_HITS),
    uploadedAt,
    zone: settings.timezone,
    standardIncubate: settings.standardRaidIncubateDuration,
    standardHatched: settings.standardRaidHatchedDuration,
    maxHatched: settings.maxRaidHatchedDuration,
    guessOffsetSeconds: settings.screenshotMessageOffsetTime,
    ...(fileTakenAt === undefined ? {} : { fileTakenAt }),
  };
}

/**
 * What `maxScreenshotReport` needs, from the bot (plan 8X-S): the max bosses in effect, the
 * Pokémon search (the report narrows it to the max bosses `/max` takes, `typedMaxBoss`), the
 * catalogue, the server's Power Spots (`ctx.wayspots` of each of its
 * regions, those of the channel's region marked `local` and first; review R15), the max and big
 * events and the battle hours, and the moment as `reportContext` has it.
 */
export function maxReportContext(
  ctx: Pick<
    AppContext,
    'maxBosses' | 'raidEvents' | 'wayspots' | 'regions' | 'pokemon' | 'gameData' | 'config'
  >,
  where: { channelId: string | null; guildRow: number },
  uploadedAt: number,
  fileName?: string,
): MaxReportContext {
  const { settings } = ctx.config;
  const { catalogue } = ctx.gameData;
  const fileTakenAt =
    fileName === undefined ? undefined : takenAtFromFileName(fileName, settings.timezone);
  const channels = [
    ...(where.channelId === null ? [] : [where.channelId]),
    ...ctx.regions
      .all()
      .filter((region) => region.guildId === where.guildRow)
      .map((region) => region.channelId),
  ];
  const spots = new Map<string, SpotTitle>();
  for (const channelId of new Set(channels)) {
    for (const spot of ctx.wayspots.inRegion(channelId)) {
      if (spot.kind !== 'powerspot' || spot.title.trim() === '' || spots.has(spot.id)) continue;
      spots.set(spot.id, { id: spot.id, title: spot.title, local: channelId === where.channelId });
    }
  }
  return {
    bosses: ctx.maxBosses.bosses(),
    pokemon: (read, among) =>
      ctx.pokemon.find(read, { limit: 1, ...(among ? { filter: among } : {}) })[0]?.entry,
    catalogue,
    spots: [...spots.values()],
    hours: settings.maxBattles,
    events: ctx.raidEvents.maxEvents(),
    big: ctx.raidEvents.bigEvents(),
    uploadedAt,
    zone: settings.timezone,
    guessOffsetSeconds: settings.screenshotMessageOffsetTime,
    ...(fileTakenAt === undefined ? {} : { fileTakenAt }),
  };
}
