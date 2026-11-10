import { describe, expect, it } from 'vitest';
import { backAtWords } from './back-at.js';

describe('the words of the day’s research waiting under an event’s window (plan 8M-9B, B5)', () => {
  it('says when it comes back, and after which event where one is named', () => {
    expect(backAtWords('2:00 PM')).toBe('Back at 2:00 PM');
    expect(backAtWords('<t:1:t>', 'Pawniard Community Day')).toBe(
      'Back at <t:1:t>, after Pawniard Community Day',
    );
  });
});
