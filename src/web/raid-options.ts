import { allTiers, bossChoiceValue, eggChoiceValue } from '../commands/raids/raid-input.js';
import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
import { raidWords } from '../domain/pogo/raid-tier.js';
import type { RaidOptionsView } from '../domain/web/raid-options-data.js';

/** The longest value a pick of `/raid`'s list may have (Discord's limit, kept for the map too). */
const MAX_VALUE = 100;

/**
 * The pick lists of a report on the map (spec 3.6), as `/raid` offers them: the current bosses in
 * the boss list's order, each with the value its choice has (`reportedBoss` reads it back), then
 * an egg of every tier; tiers in the posts' words (`raidWords`), and nothing of gyms (the elite
 * raid gym mark is not shown to members). Pure.
 */
export function raidOptions(bosses: readonly RaidBoss[], zone: string): RaidOptionsView {
  return {
    zone,
    bosses: bosses
      .map((boss) => ({
        value: bossChoiceValue(boss),
        name: boss.name,
        tier: raidWords(boss.tier),
      }))
      .filter((option) => option.value.length <= MAX_VALUE),
    eggs: allTiers().map((tier) => ({ value: eggChoiceValue(tier), tier: raidWords(tier) })),
  };
}
