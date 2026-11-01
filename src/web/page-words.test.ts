import { describe, expect, it } from 'vitest';
import { pageWords } from './page-words.js';

const ZONE = 'America/New_York';
/** 2026-10-13 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;
const stamp = (time: number, style: string) => `<t:${time / 1000}:${style}>`;

describe('the words of a command as the map shows them (pageWords)', () => {
  it("writes Discord's timestamps as clock times in the posts' zone, with the day when it is not today", () => {
    expect(
      pageWords(
        `"5pm" cannot be the time the egg hatches: it must be between ${stamp(NOW, 't')} and ${stamp(NOW + 60 * MINUTE, 't')}.`,
        ZONE,
        NOW,
      ),
    ).toBe('"5pm" cannot be the time the egg hatches: it must be between 2:00 PM and 3:00 PM.');
    expect(pageWords(`Ends at ${stamp(NOW + 24 * 60 * MINUTE, 'f')}.`, ZONE, NOW)).toBe(
      'Ends at Wed, Oct 14, 2:00 PM.',
    );
  });

  it("writes Discord's relative timestamps as how long until then, or since", () => {
    const at = NOW + 4 * 60 * MINUTE + 30 * MINUTE;
    expect(
      pageWords(`This meetup starts at ${stamp(at, 't')} (${stamp(at, 'R')}).`, ZONE, NOW),
    ).toBe('This meetup starts at 6:30 PM (in 5 hours).');
    expect(pageWords(stamp(NOW + 5 * MINUTE, 'R'), ZONE, NOW)).toBe('in 5 minutes');
    expect(pageWords(stamp(NOW + 2 * 60 * MINUTE, 'R'), ZONE, NOW)).toBe('in 2 hours');
    expect(pageWords(stamp(NOW - 90 * MINUTE, 'R'), ZONE, NOW)).toBe('2 hours ago');
    expect(pageWords(stamp(NOW, 'R'), ZONE, NOW)).toBe('a few seconds ago');
  });

  it("takes out the bot's own markdown and undoes the escapes of what members and feeds wrote", () => {
    expect(pageWords('Try `20` (minutes from now) or `6:15pm`.', ZONE, NOW)).toBe(
      'Try 20 (minutes from now) or 6:15pm.',
    );
    expect(pageWords('The boss was set: **Yveltal (T5)**.', ZONE, NOW)).toBe(
      'The boss was set: Yveltal (T5).',
    );
    expect(pageWords('Reported: T5 egg at north\\_hills \\`x\\`.', ZONE, NOW)).toBe(
      'Reported: T5 egg at north_hills `x`.',
    );
  });

  it('takes out the code span and bold around text that ends in a backslash a member typed', () => {
    // `plain` writes a typed backslash as `\\`: the backtick or asterisks after it are the bot's.
    expect(pageWords('Your group is `north\\\\`; its gym is **a\\\\**.', ZONE, NOW)).toBe(
      'Your group is north\\; its gym is a\\.',
    );
  });

  it("writes the bot's masked links as their text, with or without the angle brackets, brackets in a name kept", () => {
    const maps = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
    expect(
      pageWords(
        `The train is at stop 2 of 3: [The Stacks](<${maps}>). Next is [B](${maps}).`,
        ZONE,
        NOW,
      ),
    ).toBe('The train is at stop 2 of 3: The Stacks. Next is B.');
    // `linkText` escapes the brackets of a name; a bracket a member typed outside a link stays.
    expect(pageWords(`At [Gym \\[old\\] north\\_hills](<${maps}>) [sic]`, ZONE, NOW)).toBe(
      'At Gym [old] north_hills [sic]',
    );
  });

  // Plan 8M-13 (A1): a research report of several stops lists them as Discord's list.
  // Fix round 1 (R1-2): a bullet in the mark's place, so that the items still read as a list.
  it("writes the bot's list marks at the starts of lines as bullets, each item on its own line", () => {
    expect(
      pageWords(
        '**Catch 5 Pokémon** · Pikachu\n- Yellow Mural\n- Blue Door\n* Red Bench',
        ZONE,
        NOW,
      ),
    ).toBe('Catch 5 Pokémon · Pikachu\n• Yellow Mural\n• Blue Door\n• Red Bench');
    // A mark inside a line is a member's or no mark at all.
    expect(pageWords('Left - right * up', ZONE, NOW)).toBe('Left - right * up');
  });

  it("keeps a member's own escaped list mark as they wrote it", () => {
    // `plain()` escapes a member's line-start mark (`bulletedList`).
    expect(pageWords('\\- my notes\n- Yellow Mural', ZONE, NOW)).toBe('- my notes\n• Yellow Mural');
    expect(pageWords('\\* starred', ZONE, NOW)).toBe('* starred');
  });
});
