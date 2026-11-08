import type { StandingSpawn } from '../db/repositories/spawn-report-repository.js';
import { spawnGates, spawnKeptOut } from '../domain/regions/spawn-access.js';
import { nearPicture } from '../render/spawn.js';
import type { PartyViewer, PartyViewers } from './party-viewers.js';
import type { WebDeps } from './server.js';
import type { SpawnWebContext } from './spawn-routes.js';

/** The gates of a spawn's region (`spawnGates`), its channel alone where the region is gone. */
export function gatesOf(ctx: Pick<SpawnWebContext, 'regions'>, spawn: StandingSpawn): string[] {
  return spawnGates({
    forumChannelId: ctx.regions.byChannel(spawn.channelId)?.forumChannelId ?? null,
    channelId: spawn.channelId,
  });
}

/**
 * Whether a member who stands so sees a spawn on the map: unless its region's gates keep them out
 * (review S2, `spawnKeptOut`, the rule of a report on the map too).
 */
export function seenBy(
  ctx: Pick<SpawnWebContext, 'regions'>,
  viewer: Extract<PartyViewer, { kind: 'member' }>,
): (spawn: StandingSpawn) => boolean {
  return (spawn) =>
    !spawnKeptOut(
      gatesOf(ctx, spawn).map((gate) =>
        viewer.barred.has(gate) ? 'barred' : viewer.hidden.has(gate) ? 'hidden' : 'visible',
      ),
      viewer.standing?.administrator ?? false,
    );
}

/**
 * Whether a spawn that stands in this server and that the member sees on the map shows this
 * picture of a place beside its Where (`nearPicture`): the places' pictures' route serves it then,
 * as for a post that shows it (staging of 2026-11-07). The spawns that show it first, then how the
 * member stands to their regions alone.
 */
export async function spawnShowsPlacePicture(
  deps: Pick<WebDeps, 'spawns'>,
  viewers: PartyViewers,
  guild: string,
  userId: string,
  url: string,
): Promise<boolean> {
  const { ctx } = deps.spawns;
  const showing = (await ctx.spawns.standing(guild)).filter(
    (spawn) => spawn.near !== null && nearPicture(spawn.near) === url,
  );
  if (showing.length === 0) return false;
  const viewer = await viewers.viewer(
    guild,
    userId,
    showing.flatMap((spawn) => gatesOf(ctx, spawn)),
  );
  return viewer.kind === 'member' && showing.some(seenBy(ctx, viewer));
}
