import { describe, expect, it } from 'vitest';
import { parseServerValues, type ServerValues } from '../config/server-settings.js';
import { checkServerValues, ServerValuesError } from '../services/server-settings.js';
import { changesSaid, changeWords, refusalWords, settingsChangeLine } from './server-settings.js';

const LAB = '300000000000000001';
const MODS = '300000000000000009';
const ROLE = '300000000000000021';

describe("the words of a change of a server's settings", () => {
  it('names a channel, a category and a role by mention, and what it was', () => {
    expect(changeWords({ key: 'channels.moderation', before: LAB, after: MODS })).toBe(
      `set the moderators’ channel to <#${MODS}> (was <#${LAB}>)`,
    );
    expect(changeWords({ key: 'channels.events', before: null, after: MODS })).toBe(
      `set the events forum to <#${MODS}>`,
    );
    expect(changeWords({ key: 'categories.pvp', before: MODS, after: null })).toBe(
      `cleared the PvP category (was <#${MODS}>)`,
    );
    expect(changeWords({ key: 'roles.mapMember', before: null, after: ROLE })).toBe(
      `set the map’s member role to <@&${ROLE}>`,
    );
  });

  it('turns a feature on or off', () => {
    expect(changeWords({ key: 'features.notifications', before: true, after: false })).toBe(
      'turned off notifications (wants and DMs)',
    );
    expect(changeWords({ key: 'postNewGyms', before: false, after: true })).toBe(
      'turned on posting new gyms',
    );
  });

  it('says a number, a choice, a text and a link with what they were', () => {
    expect(changeWords({ key: 'eventsForum.horizonDays', before: 35, after: 20 })).toBe(
      'set the days the events forum lists to 20 (was 35)',
    );
    expect(changeWords({ key: 'distanceUnits', before: 'imperial', after: 'metric' })).toBe(
      'set the distance units to metric (was imperial)',
    );
    expect(changeWords({ key: 'regionForumSuffix', before: '-board', after: '-raids' })).toBe(
      'set the ending of region forums to `-raids` (was `-board`)',
    );
    expect(changeWords({ key: 'invite', before: null, after: 'https://discord.gg/pine' })).toBe(
      'set the invite to `https://discord.gg/pine`',
    );
    expect(
      changeWords({ key: 'regionMapLink', before: 'https://maps.example.test/a', after: null }),
    ).toBe('cleared the region map link (was `https://maps.example.test/a`)');
  });

  it('says which flagged words were added and removed, as plain text', () => {
    expect(
      changeWords({
        key: 'flaggedWords',
        before: ['garden', 'condo'],
        after: ['garden', '**bold**', 'apartments'],
      }),
    ).toBe('changed the flagged words: added “\\*\\*bold\\*\\*”, “apartments”; removed “condo”');
  });

  it('names a setting it does not know by its key, without its values', () => {
    expect(changeWords({ key: 'something.else', before: 1, after: 2 })).toBe(
      'changed something.else',
    );
  });
});

describe('a line of Recent changes', () => {
  it('says when, who by name and what, and pings nobody', () => {
    const line = settingsChangeLine(
      {
        id: '1',
        serverId: '412345678901234567',
        at: 1_000_000,
        actor: { id: '200000000000000011', name: 'Ash' },
        key: 'channels.moderation',
        before: LAB,
        after: MODS,
      },
      1_000_000,
    );
    expect(line).toBe(
      `<t:1000:t> **Ash** set the moderators’ channel to <#${MODS}> (was <#${LAB}>).`,
    );
  });
});

describe('the line of what a press changed (fix round 3, H11)', () => {
  const code = (n: number) => `https://maps.example.test/${String(n)}/${'a'.repeat(200)}`;

  it('says every change where all fit', () => {
    expect(
      changesSaid(
        [
          { key: 'postNewGyms', before: false, after: true },
          { key: 'channels.events', before: null, after: MODS },
        ],
        500,
      ),
    ).toBe(`Turned on posting new gyms. Set the events forum to <#${MODS}>.`);
  });

  it('drops the sentences that do not fit whole, and says how many', () => {
    const changes = [
      { key: 'postNewGyms', before: false, after: true },
      { key: 'invite', before: null, after: 'https://discord.gg/pine' },
      { key: 'regionForumSuffix', before: '-board', after: '-raids' },
    ];
    expect(changesSaid(changes, 90)).toBe(
      'Turned on posting new gyms. And 2 more changes: see Recent changes.',
    );
  });

  it('says a sentence too long without the value before, else without its values', () => {
    const set = { key: 'regionMapLink', before: code(1), after: code(2) };
    expect(changesSaid([set], 300)).toBe(`Set the region map link to \`${code(2)}\`.`);
    expect(changesSaid([set], 100)).toBe('Changed the region map link.');
  });

  it('gives a list of words a smaller room, cut between words', () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${String(i)}`);
    const said = changesSaid([{ key: 'flaggedWords', before: [], after: words }], 500);
    expect(said.length).toBeLessThan(200);
    expect(said).toMatch(/^Changed the flagged words: added “word0”, .*”, …and \d+ more\.$/u);
  });
});

describe('the words of a refused change', () => {
  it('name each refused setting by its label, and the setting it would be the same as (fix round 3, H2)', () => {
    expect(
      refusalWords([
        {
          key: 'channels.moderation',
          message: 'must be a channel of its own, not the bot-lab channel',
          same: 'channels.bot-lab',
        },
      ]),
    ).toBe(
      'Not changed: the moderators’ channel must be a channel of its own, not the same as the bot lab.',
    );
  });

  it("says in the panel's own words what is wrong, never the checker's or a key (review G4)", () => {
    const refused = (change: (values: ServerValues) => ServerValues): string => {
      try {
        checkServerValues(change(parseServerValues({})));
      } catch (err) {
        if (err instanceof ServerValuesError) return refusalWords(err.problems);
        throw err;
      }
      throw new Error('not refused');
    };
    const forum =
      (eventsForum: Partial<ServerValues['eventsForum']>) => (values: ServerValues) => ({
        ...values,
        eventsForum: { ...values.eventsForum, ...eventsForum },
      });
    expect(refused(forum({ horizonDays: 400 }))).toBe(
      'Not changed: the days the events forum lists must be 1 to 365.',
    );
    expect(refused(forum({ horizonDays: 0, postDaysAhead: 0 }))).toBe(
      'Not changed: the days the events forum lists must be 1 to 365.',
    );
    expect(refused(forum({ horizonDays: 10, postDaysAhead: 14 }))).toBe(
      'Not changed: the days before an event that its post opens must be at most the days listed.',
    );
    expect(refused(forum({ postDaysAhead: -1 }))).toBe(
      'Not changed: the days before an event that its post opens must be 0 to 365.',
    );
    expect(refused(forum({ onThisDay: 11 }))).toBe(
      'Not changed: the big days “On this day” recalls must be 0 to 10.',
    );
    expect(refused((values) => ({ ...values, regionMapLink: 'ftp://maps.example.test' }))).toBe(
      'Not changed: the region map link must be an https:// address.',
    );
    expect(refused((values) => ({ ...values, flaggedWords: ['condo', 'x'.repeat(101)] }))).toBe(
      'Not changed: a flagged word is longer than 100 characters.',
    );
    const lab = '500000000000000001';
    expect(refused((values) => ({ ...values, channels: { unown: lab, moderation: lab } }))).toBe(
      'Not changed: the moderators’ channel must be a channel of its own, not the same as the Unown channel.',
    );
  });
});
