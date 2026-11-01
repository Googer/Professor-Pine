import { foldText } from '../search/text.js';

/**
 * Brands whose shops were sponsored gyms in Pokémon GO. Sponsored locations are not in
 * Wayfarer, so a gym the import never found whose name holds one is most likely such a gym
 * (`/gym review` says so; nothing is decided by it). Each brand as its folded words.
 */
export const SPONSOR_BRANDS: readonly string[] = [
  'starbucks',
  'sprint',
  't mobile',
  'at t',
  'verizon',
  'boost mobile',
  'cricket wireless',
  'mcdonald s',
  '7 eleven',
];

const words = (text: string): string[] =>
  foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');

const BRANDS = SPONSOR_BRANDS.map((brand) => brand.split(' '));

/**
 * Whether a gym's name holds a sponsor's brand as whole words, compared folded ("STARBUCKS
 * #1234", "Starbucks Coffee" and "AT&T Store" all do).
 */
export function looksSponsored(name: string): boolean {
  const found = words(name);
  return BRANDS.some((brand) =>
    found.some((_, start) => brand.every((word, i) => found[start + i] === word)),
  );
}
