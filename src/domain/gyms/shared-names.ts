import { foldText } from '../search/text.js';

/**
 * Gyms of one region that are shown by the same name (several Starbucks): a screenshot names a
 * gym by what the game shows, and a menu of gyms can tell such gyms apart only by a nickname.
 * Names are compared by their letters and digits alone (Matt, 2026-10-14): case, accents, spaces
 * and punctuation do not count, so "P.N.C. Park" and "PNC Park" are one name. The gym search
 * itself reads them otherwise.
 */

/** What is needed of a gym. */
export interface NamedGym {
  id: number;
  name: string;
  nickname: string | null;
}

/** The name a gym is shown by: its nickname where it has one, otherwise its name. */
export function shownName(gym: NamedGym): string {
  return gym.nickname?.trim() || gym.name;
}

/** The shown name by its letters and digits: `St. Mary's Café` and `stmaryscafe` are one. */
export function nameKey(text: string): string {
  return foldText(text).replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The other gyms of `gyms` that are shown by the same name as `gym`. */
export function namesakes<G extends NamedGym>(gym: NamedGym, gyms: readonly G[]): G[] {
  const key = nameKey(shownName(gym));
  if (key === '') return [];
  return gyms.filter((other) => other.id !== gym.id && nameKey(shownName(other)) === key);
}

/**
 * The groups of gyms shown by the same name, each sorted by number, the groups by name. A gym
 * with a nickname of its own is not in a group with the gyms of its name: the nickname tells it
 * apart.
 */
export function sharedNames<G extends NamedGym>(gyms: readonly G[]): G[][] {
  const groups = new Map<string, G[]>();
  for (const gym of gyms) {
    const key = nameKey(shownName(gym));
    if (key === '') continue;
    groups.set(key, [...(groups.get(key) ?? []), gym]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => [...group].sort((a, b) => a.id - b.id));
}
