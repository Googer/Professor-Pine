import type { StandingSpawn } from '../db/repositories/spawn-report-repository.js';
import type { Place } from '../domain/geo/place.js';
import { searchTokens } from '../domain/search/text.js';
import { allowedPicture } from '../domain/web/picture.js';
import type { MapSpawn, SpawnsView } from '../domain/web/spawn-data.js';
import { PLACE_KIND_WORDS } from '../render/place.js';
import { IV_WORDS } from '../render/spawn.js';

/** What the view of the spawns needs beyond the reports that stand. */
export interface SpawnViewInput {
  /** The reports of the server that stand now (`SpawnService.standing`), due first at the head. */
  spawns: readonly StandingSpawn[];
  /** Whether the member may see a report: its region does not keep them out. */
  shown(spawn: StandingSpawn): boolean;
  /** A region's channel as answers name it (`#west`, `Region 5`). */
  region(channelId: string): string;
  /** The server's snowflake, for the reports' links. */
  guild: string;
  /** The origins the page may load pictures from (`pictureOrigins`). */
  pictureOrigins: readonly string[];
}

/**
 * The place a report was made near, in words as its region message names it, without markdown:
 * `Near The Stacks (gym)`, a pin by the place it is near, by the name its maps link gave, or
 * `Dropped pin`.
 */
function nearWords(place: Place): string {
  if (place.kind !== 'pin') return `Near ${place.title} (${PLACE_KIND_WORDS[place.kind]})`;
  if (place.near) return `Near ${place.near.title} (${PLACE_KIND_WORDS[place.near.kind]})`;
  return place.linkName ?? 'Dropped pin';
}

/**
 * What Find finds a spawn by: the Pokémon's name and its catalogue key (its form: `rattata_alola`),
 * and `costumed`/`costume` where an event lists it costumed, folded, each once.
 */
function spawnWords(spawn: StandingSpawn): string[] {
  const texts = [
    spawn.pokemon.name,
    spawn.pokemon.key,
    ...(spawn.costumed ? ['costumed', 'costume'] : []),
  ];
  return [...new Set(texts.flatMap(searchTokens))];
}

/** A report as the map shows it: what its region message says, its point, its link. */
function mapSpawn(spawn: StandingSpawn, input: SpawnViewInput): MapSpawn {
  const picture = allowedPicture(spawn.image ?? undefined, input.pictureOrigins);
  const reporter = spawn.reporterName ?? '';
  return {
    id: spawn.messageId,
    pokemon: spawn.pokemon.name,
    costumed: spawn.costumed,
    ...(spawn.iv === null ? {} : { ivs: IV_WORDS[spawn.iv] }),
    ...(picture === undefined ? {} : { picture }),
    details: spawn.details,
    ...(spawn.near === null ? {} : { near: nearWords(spawn.near) }),
    point: spawn.near === null ? null : { lat: spawn.near.lat, lon: spawn.near.lon },
    reporter: reporter.trim() === '' ? 'a member' : reporter,
    region: input.region(spawn.channelId),
    madeAt: spawn.madeAt,
    goneAt: spawn.deleteAt,
    link: `https://discord.com/channels/${input.guild}/${spawn.channelId}/${spawn.messageId}`,
    words: spawnWords(spawn),
  };
}

/**
 * `GET /s/<guild>/api/spawns` (Matt, 2026-11-07: wild spawns on the map): the reports that stand
 * and the member may see, in their order (due first), each as its region message says it: the
 * Pokémon (costumed where an event lists it so), the IVs in the message's words, its picture only
 * where the page may load it, the details as typed, the place it is near, its point (the pin or
 * the place; none without one), the reporter by the name kept (never an id), the region's
 * channel, when it was made and goes away, its message's link and its search words. Pure.
 */
export function spawnsView(input: SpawnViewInput): SpawnsView {
  return {
    spawns: input.spawns.filter((spawn) => input.shown(spawn)).map((one) => mapSpawn(one, input)),
  };
}
