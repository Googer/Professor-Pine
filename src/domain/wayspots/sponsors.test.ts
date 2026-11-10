import { describe, expect, it } from 'vitest';
import { looksSponsored } from './sponsors.js';

describe('looksSponsored', () => {
  it('finds a brand among the words of a name, whatever the case, accents and punctuation', () => {
    expect(looksSponsored('Starbucks')).toBe(true);
    expect(looksSponsored('STARBUCKS #1234')).toBe(true);
    expect(looksSponsored('Starbucks Coffee')).toBe(true);
    expect(looksSponsored('T-Mobile Store')).toBe(true);
    expect(looksSponsored('AT&T Wireless')).toBe(true);
    expect(looksSponsored('Verizon Authorized Retailer')).toBe(true);
    expect(looksSponsored('Sprint')).toBe(true);
    expect(looksSponsored("McDonald's")).toBe(true);
  });

  it('finds a brand only as whole words', () => {
    expect(looksSponsored('Old Stone Fountain')).toBe(false);
    expect(looksSponsored('Starbuckstown Mural')).toBe(false);
    expect(looksSponsored('Batty Mobile Art')).toBe(false);
    expect(looksSponsored('At the Park')).toBe(false);
    expect(looksSponsored('')).toBe(false);
  });
});
