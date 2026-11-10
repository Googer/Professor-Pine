import type { MapSpawn } from '../../domain/web/spawn-data.js';

/*
 * How the map names a wild spawn (review S7): a leaf module, which the list of what is on
 * (`what-is-on.ts`) and the spawns' own (`spawns.ts`) import without an import cycle between them.
 */

/** A spawn's popup key on the map (`spawn:<id>`), as a stop's is `stop:<key>`. */
export const spawnPopupKey = (id: string): string => `spawn:${id}`;

/** A spawn's name in the list and the things at one place: `Dratini`, `Costumed Pikachu`. */
export function spawnName(spawn: Pick<MapSpawn, 'pokemon' | 'costumed'>): string {
  return spawn.costumed ? `Costumed ${spawn.pokemon}` : spawn.pokemon;
}
