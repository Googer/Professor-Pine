import type { APISelectMenuOption } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { ScreenshotReport } from '../../domain/ocr/screenshot-report.js';
import type { GymNamer } from '../../render/screenshot-reading.js';
import { truncate } from '../../render/text.js';
import { gymInGuild } from '../../services/region-directory.js';
import type { GymView } from '../../services/gym-directory.js';

/** A select menu holds this many options. */
const MENU_SIZE = 25;

/**
 * The gyms a screenshot's gym may be, for the member to choose from: a fresh search of the text
 * whose search decided (or the whole text read), by names only, this server's gyms only, as
 * many as a menu holds, so that every gym of that name is offered (several Starbucks of one
 * region), and the gym the report took among them.
 */
export function gymCandidates(
  ctx: Pick<AppContext, 'gyms' | 'regions'>,
  regionChannelId: string | undefined,
  guildRow: number,
  gym: ScreenshotReport['gym'],
): Gym[] {
  const text = gym.searched ?? gym.read ?? '';
  // The server's gyms in its regions (plan 19B-2): another server's is never a candidate.
  const gyms = ctx.gyms.of(guildRow);
  const found =
    text.trim() === ''
      ? []
      : gyms
          .search(regionChannelId ?? null, text, { nameOnly: true })
          .filter((hit) => gymInGuild(ctx.gyms, ctx.regions, hit.gym.id, guildRow))
          .map((hit) => hit.gym);
  const taken = gym.gymId === null ? undefined : gyms.get(gym.gymId);
  const all = taken && !found.some((g) => g.id === taken.id) ? [taken, ...found] : found;
  return all.slice(0, MENU_SIZE);
}

/**
 * What a gym menu says under a gym, so that gyms of one name are told apart: its nickname, the
 * region it lies in when that is not the region the command was used in (`regionName` names a
 * region channel), and its own description.
 */
export function menuDescription(
  servers: Pick<GymView, 'regionsOf'>,
  regionChannelId: string | undefined,
  gym: Gym,
  regionName: (channelId: string) => string | undefined,
): string | undefined {
  const regions = servers.regionsOf(gym.id);
  const [elsewhere] = regions;
  const region =
    regionChannelId !== undefined && elsewhere !== undefined && !regions.includes(regionChannelId)
      ? regionName(elsewhere)
      : undefined;
  const parts = [gym.nickname, region, gym.description].filter(
    (part): part is string => part !== null && part !== undefined && part.trim() !== '',
  );
  return parts.length === 0 ? undefined : truncate(parts.join(' · '), 100);
}

/** The options of a gym menu: each gym by its name, told apart by `menuDescription`. */
export function gymMenuOptions(
  servers: Pick<GymView, 'regionsOf'>,
  regionChannelId: string | undefined,
  gyms: readonly Gym[],
  regionName: (channelId: string) => string | undefined,
): APISelectMenuOption[] {
  return gyms.map((gym) => {
    const description = menuDescription(servers, regionChannelId, gym, regionName);
    return {
      label: truncate(gym.name, 100),
      value: String(gym.id),
      ...(description === undefined ? {} : { description }),
    };
  });
}

/**
 * The gym's name as members know it (its nickname first), by id: the gym a reading of the
 * server's took (a stored reference, plan 19B-2).
 */
export function gymNamerOf(ctx: Pick<AppContext, 'gyms'>): GymNamer {
  return (id) => {
    const gym = ctx.gyms.stored(id);
    return gym ? gym.nickname || gym.name : undefined;
  };
}
