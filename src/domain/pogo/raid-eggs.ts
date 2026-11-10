import type { PokemonClass } from './game-master.js';
import type { RaidLevel, RaidTier } from './raid-tier.js';

/**
 * Where the game's raid egg pictures come from (PokeMiners' `pogo_assets`, `Images/Raids`), at
 * the commit the tier head of the screenshot reader is pinned to. They are 112 by 128, which a
 * phone crops to a square: `scripts/eggs/make-eggs.ts` makes square ones of them once, which the
 * bot carries (plan 8D-F); nothing is downloaded at run time.
 */
export const RAID_EGG_PICTURES_URL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/';

/**
 * The egg of each tier, by file name without `.png`. A super mega raid has none: pogo_assets has
 * no egg for it (its `raid_egg_5_icon` is not known to be one). Shadow raids have no egg of their
 * own there either (the folder at that commit, looked at on 2026-10-14, has none): a shadow egg
 * shows the plain egg of its tier.
 */
const EGG_FILES: Readonly<Record<RaidLevel, string | undefined>> = {
  T1: 'raid_egg_0_icon',
  T3: 'raid_egg_1_icon',
  T5: 'raid_egg_2_icon',
  Mega: 'raid_egg_3_icon',
  MegaLegendary: 'raid_egg_4_icon',
  SuperMega: undefined,
  Elite: 'raid_egg_extended_icon',
};
/** A mega legendary egg whose bosses are all primal shows the primal egg. */
const PRIMAL_EGG = 'raid_egg_primal_icon';
/** A T5 "egg" whose bosses are all ultra beasts is a wormhole. */
const ULTRA_WORMHOLE = 'raid_ultra_icon';

/** What the picture needs of the current bosses of the egg's tier. */
export interface EggBoss {
  key: string;
  entry?: { key: string; class: PokemonClass | null };
}

/** Every egg picture `raidEggName` can name, without `.png`. */
export const EGG_PICTURE_NAMES: readonly string[] = [
  ...Object.values(EGG_FILES).filter((name) => name !== undefined),
  PRIMAL_EGG,
  ULTRA_WORMHOLE,
];

/**
 * The picture of an egg of this tier by its name, without `.png`, or undefined when the game has
 * none. A T5 egg whose current bosses are all ultra beasts shows the wormhole; a mega legendary
 * egg whose bosses are all primal shows the primal egg.
 */
export function raidEggName(tier: RaidTier, bossesOfTier: readonly EggBoss[]): string | undefined {
  const all = (fits: (boss: EggBoss) => boolean) =>
    bossesOfTier.length > 0 && bossesOfTier.every(fits);
  let file = EGG_FILES[tier.level];
  if (tier.level === 'T5' && all((boss) => boss.entry?.class === 'ultra-beast')) {
    file = ULTRA_WORMHOLE;
  }
  if (
    tier.level === 'MegaLegendary' &&
    all((boss) => (boss.entry?.key ?? boss.key).endsWith('_primal'))
  ) {
    file = PRIMAL_EGG;
  }
  return file;
}
