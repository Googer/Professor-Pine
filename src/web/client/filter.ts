import { foldText } from '../../domain/search/text.js';

/** Lower case, no accents, no apostrophes: how both the filter and the names are read. */
function plain(text: string): string {
  return foldText(text).replace(/['’]/g, '');
}

/**
 * Which gyms the filter box lets through (spec 3.1): every word typed must be found in the
 * gym's name or nickname, without case, accents or apostrophes; an empty box lets every gym
 * through.
 */
export function gymFilter(
  text: string,
): (gym: { name: string; nickname: string | null }) => boolean {
  const words = plain(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
  if (words.length === 0) return () => true;
  return (gym) => {
    const names = plain(`${gym.name} ${gym.nickname ?? ''}`);
    return words.every((word) => names.includes(word));
  };
}
