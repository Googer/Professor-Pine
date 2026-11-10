const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/**
 * A count as Pine writes it in a sentence: in words from zero to ten, in digits from 11 on (and
 * for what is no whole number from 0). One helper for every sentence that says a small count
 * (plan 8H-8, G13).
 */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
