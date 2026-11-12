import { describe, expect, it } from 'vitest';
import { NO_MODERATORS_CHANNEL, reportRefusal } from './reports.js';

describe('where a report goes (plan 19A-1)', () => {
  it("goes to the server's moderators' channel, and is refused without one: never in the open", () => {
    expect(reportRefusal({ channels: { moderation: '300000000000000099' } })).toBeUndefined();
    expect(reportRefusal({ channels: {} })).toBe(NO_MODERATORS_CHANNEL);
    expect(NO_MODERATORS_CHANNEL).toBe(
      "This server's staff have not set a moderators' channel, so reports cannot be sent here.",
    );
  });

  it('is taken, to find the moderators unreachable, where the file named a channel the server lacks (review F2)', () => {
    expect(reportRefusal({ channels: {}, unmatched: ['channels.moderation'] })).toBeUndefined();
  });
});
