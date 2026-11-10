import { maxTierLabel, type MaxTier } from './max-tier.js';
import { raidTier, raidTierLabel, type RaidLevel, type RaidTier } from './raid-tier.js';

const LEVEL_WORDS: Readonly<Record<string, RaidLevel>> = {
  '1': 'T1',
  t1: 'T1',
  '3': 'T3',
  t3: 'T3',
  '5': 'T5',
  t5: 'T5',
  legendary: 'T5',
  mega: 'Mega',
  megalegendary: 'MegaLegendary',
  supermega: 'SuperMega',
  elite: 'Elite',
};

/**
 * The level a word names; none for any other word, also one every object has (`constructor`,
 * `__proto__`: read with a plain index they were levels, the audit of 2026-11-10, L-I5).
 */
function levelNamed(word: string): RaidLevel | undefined {
  return Object.hasOwn(LEVEL_WORDS, word) ? LEVEL_WORDS[word] : undefined;
}

/**
 * A text folded to lower case with a numbered tier spelled as the lists label it: `tier 5`,
 * `tier5`, `level 5`, `5 star` and `5-star` are `t5`. How `leadingTier` reads a tier, and how the
 * boss list of `/raid` narrows to what was typed (staging of 2026-11-07: `tier 1` found nothing).
 */
export function spellTiers(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(?:tier|level)\s*(\d)\b/g, 't$1')
    .replace(/\b(\d)[\s-]*stars?\b/g, 't$1');
}

/**
 * A tier typed as words at the start of a text (`shadow t5`, `tier 3`, `mega`), and the rest: how
 * a raid report and a train's boss read an egg. A nickname may not begin with one
 * (`nickname-rules.ts`).
 */
export function leadingTier(text: string): { tier: RaidTier; rest: string } | undefined {
  const words = spellTiers(text).split(/\s+/).filter(Boolean);
  let shadow = false;
  if (words[0] === 'shadow') {
    shadow = true;
    words.shift();
  }
  if (words[0] === 'tier' || words[0] === 'level') words.shift();
  // "mega legendary" and "super mega" are two words.
  const two = levelNamed(`${words[0] ?? ''}${words[1] ?? ''}`);
  const level = two ?? levelNamed(words[0] ?? '');
  if (!level) return undefined;
  const tier = raidTier(level, shadow);
  if (!tier) return undefined;
  const rest = words.slice(two ? 2 : 1).filter((word) => word !== 'egg' && word !== 'raid');
  return { tier, rest: rest.join(' ') };
}

/** `T5`, `Shadow T5`, `Dynamax 2★`, `Gigantamax`: a tier of either boss list in words. */
export function bossTierLabel(tier: RaidTier | MaxTier): string {
  return typeof tier === 'string' ? maxTierLabel(tier) : raidTierLabel(tier);
}

/**
 * The value of a tier among the choices of `/admin boss`'s `tier` option: `T5`, `T5:shadow`,
 * `D2`, `G` (also what a moderators' note suggests, plan 8X-J).
 */
export function bossTierValue(tier: RaidTier | MaxTier): string {
  if (typeof tier === 'string') return tier;
  return tier.shadow ? `${tier.level}:shadow` : tier.level;
}
