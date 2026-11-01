import { maxChoiceValue, TIER_CHOICES } from '../commands/max/max-input.js';
import type { MaxBossChoice } from '../domain/pogo/max-boss-list.js';
import type { MaxBoss } from '../domain/pogo/max-bosses.js';
import { maxTierLabel } from '../domain/pogo/max-tier.js';
import type { MaxOptionsView } from '../domain/web/max-data.js';
import { allowedPicture } from '../domain/web/picture.js';

/** The longest value a pick of `/max`'s list may have (Discord's limit, kept for the map too). */
const MAX_VALUE = 100;

/**
 * The pick lists of a report of a max battle on the map (plan 8X-5), as `/max` offers them: the
 * current bosses in their order (`currentMaxBossChoices`: the featured ones first, the Gigantamax
 * ones first during a big event's hours), each with the value its choice has (`maxChoiceValue`,
 * which `readMaxBoss` reads back; one over 100 characters left out, as `/max`'s list leaves it),
 * its tier and the tier in the posts' words, and its picture (`picture`, the post's) only from
 * `origins`; then the tiers `/max`'s `tier:` offers for a boss on no list. Pure.
 */
export function maxOptions(
  choices: readonly MaxBossChoice[],
  zone: string,
  picture: (boss: MaxBoss) => string | undefined,
  origins: readonly string[],
): MaxOptionsView {
  return {
    zone,
    bosses: choices
      .map((choice) => {
        const image = allowedPicture(picture(choice.boss), origins);
        return {
          value: maxChoiceValue(choice.boss),
          name: choice.boss.name,
          level: choice.boss.tier,
          tier: maxTierLabel(choice.boss.tier),
          featured: choice.featured,
          ...(image === undefined ? {} : { image }),
        };
      })
      .filter((option) => option.value.length <= MAX_VALUE),
    tiers: TIER_CHOICES.map((choice) => ({ value: choice.value, tier: choice.name })),
  };
}
