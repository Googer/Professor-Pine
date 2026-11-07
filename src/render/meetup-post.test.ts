import { describe, expect, it } from 'vitest';
import { expectSendable } from '../../test/support/post-limits.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  accentOf,
  buttonsOf,
  componentCount,
  partTexts,
  textDisplays,
  textOf,
  thumbnailBeside,
  thumbnailOf,
  thumbnailsOf,
} from '../../test/support/messages.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  PARTY_ZONE,
  REPORTER,
  testMeetup,
  testRaid,
  withAttendees,
} from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import type { DroppedPin, KnownPlace } from '../domain/geo/place.js';
import { setDescription } from '../domain/party/meetup.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import {
  endParty,
  type Attendee,
  type MeetupParty,
  type MeetupPlace,
} from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { meetupTags, meetupTitle, renderMeetupPost, type MeetupPostView } from './meetup-post.js';
import {
  KEPT_OPEN,
  layoutTextLength,
  LEAD_ROOM,
  MAX_COMPONENTS,
  postMessage,
  TEXT_BUDGET,
  type RenderedPost,
} from './party-post.js';
import { renderRaidPost, type PostGym } from './raid-post.js';
import { LIMITS } from './text.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const DAY = 24 * 60 * MINUTE;

/** The grace after a party's last moment and the warning time of a timed party, as configured. */
const ARCHIVING = { graceMinutes: 5, warningMinutes: 60 };
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');

function view(party: MeetupParty, extra: Partial<MeetupPostView> = {}): MeetupPostView {
  return { party, now: PARTY_NOW, zone: PARTY_ZONE, archiving: ARCHIVING, emoji, ...extra };
}

/** The test meetup with these times, as they are stored. */
function timed(start: number | null, end: number | null, base = testMeetup()): MeetupParty {
  return { ...base, endTime: end, timed: { ...base.timed, startTime: start } };
}

/** The lines of the first block of a post: its name, its times. */
function header(post: RenderedPost): string[] {
  return textDisplays(post.message)[0]?.split('\n') ?? [];
}

/** The line of the post that says the times: the second. */
function timesLine(party: MeetupParty, now = PARTY_NOW): string | undefined {
  return header(renderMeetupPost(view(party, { now })))[1];
}

/** The part of a post that starts so (a heading; `partTexts`), or undefined. */
function block(post: RenderedPost, start: string): string | undefined {
  return partTexts(post.message).find((text) => text.startsWith(start));
}

function described(text: string, base = testMeetup()): MeetupParty {
  const set = setDescription(base, text);
  if (!set.ok) throw new Error(set.reason);
  return set.party;
}

const NO_TIME =
  'No time has been set yet: `/meet` sets the start. ' +
  `Without one this post is archived ${stamp(PARTY_NOW + DAY + 65 * MINUTE, 'R')}.`;

describe('meetupTitle and meetupTags', () => {
  it('titles the post with what it is and its name', () => {
    expect(meetupTitle(testMeetup())).toBe('Meetup · Community Day picnic');
    const long = meetupTitle(testMeetup({ name: 'x'.repeat(80) }));
    expect(long).toBe(`Meetup · ${'x'.repeat(80)}`);
    expect(long.length).toBeLessThanOrEqual(LIMITS.title);
  });

  it('tags it as a meetup, and as ended once its end time has passed', () => {
    expect(meetupTags(timed(START, END), PARTY_NOW)).toEqual(['Meetup']);
    expect(meetupTags(timed(START, END), END - 1)).toEqual(['Meetup']);
    expect(meetupTags(timed(START, END), END)).toEqual(['Meetup', 'Ended']);
    // Not by the day a meetup without an end is given, while it is still active.
    expect(meetupTags(timed(START, null), START + 30 * DAY)).toEqual(['Meetup']);
  });

  it('tags a meetup that has ended as ended, whatever its times', () => {
    expect(meetupTags(endParty(testMeetup()), PARTY_NOW)).toEqual(['Meetup', 'Ended']);
    expect(meetupTags(endParty(timed(START, null)), START + MINUTE)).toEqual(['Meetup', 'Ended']);
  });
});

describe('renderMeetupPost', () => {
  it('shows the name, what it is, that it has no time yet, who comes and who made it', () => {
    const rendered = renderMeetupPost(view(testMeetup()));
    expect(rendered.title).toBe('Meetup · Community Day picnic');
    expect(rendered.tags).toEqual(['Meetup']);
    expect(textDisplays(rendered.message)).toEqual([
      `### Meetup: Community Day picnic\n${NO_TIME}`,
      `1 trainer\n🤔 Interested (1): <@${REPORTER}>`,
      `-# Created by <@${REPORTER}>`,
    ]);
    expect(accentOf(rendered.message)).toBe(0x3498db);
    expect(rendered.message).toEqual(postMessage(rendered.layout));
    // The brief of a direct message.
    expect(rendered.brief).toEqual({
      accent: 0x3498db,
      lines: ['**Meetup: Community Day picnic**', NO_TIME, '1 trainer'],
    });
  });

  it('is nothing like a raid: no gym link, no picture, another colour', () => {
    const { message, brief } = renderMeetupPost(view(testMeetup()));
    expect(textOf(message)).not.toContain('google.com/maps');
    expect(thumbnailOf(message)).toBeUndefined();
    expect(brief).not.toHaveProperty('map');
    expect(brief).not.toHaveProperty('picture');
    const raid = renderRaidPost({
      party: testRaid(),
      now: PARTY_NOW,
      gym: testGyms()[0],
      boss: undefined,
      catalogue: catalogueFixture(),
      showUnknownMoves: true,
      emoji,
      zone: PARTY_ZONE,
    });
    expect(accentOf(message)).not.toBe(accentOf(raid.message));
  });

  it('makes a name plain in the post and leaves it raw in the title of the post', () => {
    const rendered = renderMeetupPost(view(testMeetup({ name: '**Bold** @everyone <@1>' })));
    expect(rendered.title).toBe('Meetup · **Bold** @everyone <@1>');
    expect(header(rendered)[0]).toBe('### Meetup: \\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
    expect(rendered.brief.lines[0]).toBe('**Meetup: \\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>**');
  });

  it('always names who made it, as the first trainer in its list does anyway', () => {
    // Not a state `createMeetup` makes: the post does not go by the flag of a raid report.
    const flagged = { ...testMeetup(), anonymous: true };
    expect(block(renderMeetupPost(view(flagged)), '-# Created by')).toBe(
      `-# Created by <@${REPORTER}>`,
    );
  });

  it('says that a moderator keeps it, but not in the last showing of a closed one', () => {
    const saved = { ...testMeetup(), saved: true };
    expect(header(renderMeetupPost(view(saved))).at(-1)).toBe(KEPT_OPEN);
    const closed = renderMeetupPost(view(saved, { closed: 'This meetup was closed by <@9>.' }));
    expect(textOf(closed.message)).not.toContain(KEPT_OPEN);
  });
});

describe('the times of a meetup post', () => {
  it('tells a meetup without a time how to set one, and when the post goes without', () => {
    expect(timesLine(testMeetup())).toBe(NO_TIME);
    // Once the archiving is scheduled, that is the moment.
    const due = PARTY_NOW + DAY + 66 * MINUTE;
    expect(timesLine({ ...testMeetup(), deletionTime: due }, PARTY_NOW + DAY + 6 * MINUTE)).toBe(
      'No time has been set yet: `/meet` sets the start. ' +
        `Without one this post is archived ${stamp(due, 'R')}.`,
    );
    // The day it is given, the grace and the warning time: with other settings, another moment.
    const quick = view(testMeetup(), { archiving: { graceMinutes: 1, warningMinutes: 10 } });
    expect(header(renderMeetupPost(quick))[1]).toBe(
      'No time has been set yet: `/meet` sets the start. ' +
        `Without one this post is archived ${stamp(PARTY_NOW + DAY + 11 * MINUTE, 'R')}.`,
    );
    // A post a moderator keeps is not archived by itself.
    expect(timesLine({ ...testMeetup(), saved: true })).toBe(
      'No time has been set yet: `/meet` sets the start.',
    );
  });

  it('never names a moment that has passed for the archiving: it says "soon" then', () => {
    const soon =
      'No time has been set yet: `/meet` sets the start. Without one this post is archived soon.';
    // The day ran out an hour ago and the warning is not out yet: the old line said "an hour ago".
    expect(timesLine(testMeetup(), PARTY_NOW + DAY + 64 * MINUTE)).toBe(NO_TIME);
    expect(timesLine(testMeetup(), PARTY_NOW + DAY + 65 * MINUTE)).toBe(soon);
    expect(timesLine(testMeetup(), PARTY_NOW + DAY + 3 * 60 * MINUTE)).toBe(soon);
    // Scheduled, and the moment is here: the clean-up is about to run.
    const due = PARTY_NOW + DAY + 66 * MINUTE;
    expect(timesLine({ ...testMeetup(), deletionTime: due }, due)).toBe(soon);
    expect(timesLine({ ...testMeetup(), deletionTime: due }, due - 1000)).toBe(
      'No time has been set yet: `/meet` sets the start. ' +
        `Without one this post is archived ${stamp(due, 'R')}.`,
    );
  });

  it('counts down to the start, and names the end after it', () => {
    expect(timesLine(timed(START, END))).toBe(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}. Ends at ${stamp(END)}.`,
    );
    expect(timesLine(timed(START, null))).toBe(`Starts ${stamp(START, 'R')}, at ${stamp(START)}.`);
  });

  it('counts down to the end once it has started', () => {
    expect(timesLine(timed(START, END), START)).toBe(
      `Started at ${stamp(START)}. Ends ${stamp(END, 'R')}, at ${stamp(END)}.`,
    );
    expect(timesLine(timed(START, END), START - 1)).toMatch(/^Starts /);
  });

  it('says how long ago a meetup without an end started', () => {
    expect(timesLine(timed(START, null), START + 30 * MINUTE)).toBe(
      `Started ${stamp(START, 'R')}, at ${stamp(START)}.`,
    );
  });

  it('counts down to the end of a meetup without a start', () => {
    expect(timesLine(timed(null, END))).toBe(`Ends ${stamp(END, 'R')}, at ${stamp(END)}.`);
  });

  it('shows the weekday and date of a time that is not today, and only of that one', () => {
    const tomorrow = at('2026-10-14T10:00');
    const dayAfter = at('2026-10-15T12:00');
    expect(timesLine(timed(tomorrow, dayAfter))).toBe(
      `Starts ${stamp(tomorrow, 'R')}, at ${stamp(tomorrow, 'F')}. Ends at ${stamp(dayAfter, 'F')}.`,
    );
    // On the day itself the clock time is enough for the start; the end is still another day.
    expect(timesLine(timed(tomorrow, dayAfter), at('2026-10-14T00:00'))).toBe(
      `Starts ${stamp(tomorrow, 'R')}, at ${stamp(tomorrow)}. Ends at ${stamp(dayAfter, 'F')}.`,
    );
    // A meetup that began yesterday says so with the date.
    expect(timesLine(timed(START, dayAfter), at('2026-10-14T09:00'))).toBe(
      `Started at ${stamp(START, 'F')}. Ends ${stamp(dayAfter, 'R')}, at ${stamp(dayAfter, 'F')}.`,
    );
  });

  it('is over once the end time has passed: red, tagged, and the end with its day', () => {
    const rendered = renderMeetupPost(view(timed(START, END), { now: END }));
    expect(header(rendered)[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
    expect(accentOf(rendered.message)).toBe(0xe74c3c);
    expect(rendered.tags).toEqual(['Meetup', 'Ended']);
    const before = renderMeetupPost(view(timed(START, END), { now: END - 1 }));
    expect(accentOf(before.message)).toBe(0x3498db);
  });

  it('is not over by the day a meetup without an end is given: it only started long ago', () => {
    const late = START + 3 * DAY;
    const rendered = renderMeetupPost(view(timed(START, null), { now: late }));
    expect(accentOf(rendered.message)).toBe(0x3498db);
    expect(rendered.tags).toEqual(['Meetup']);
    expect(header(rendered)[1]).toBe(`Started ${stamp(START, 'R')}, at ${stamp(START, 'F')}.`);
  });

  it('shows a meetup that has ended as over, also one that never had an end time', () => {
    // The last showing before the post is archived: it must not look as if it went on.
    for (const party of [testMeetup(), timed(START, null)]) {
      const rendered = renderMeetupPost(view(endParty(party), { now: START + 2 * DAY }));
      expect(header(rendered)).toEqual([
        '### Meetup: Community Day picnic',
        'This meetup is over.',
      ]);
      expect(block(rendered, '-# Created by')).toBe(`-# Created by <@${REPORTER}>`);
      expect(accentOf(rendered.message)).toBe(0xe74c3c);
      expect(rendered.tags).toEqual(['Meetup', 'Ended']);
    }
    // With an end time it says when, also when that end still lay ahead (it was closed early).
    const early = renderMeetupPost(view(endParty(timed(START, END)), { now: START }));
    expect(header(early)[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
    expect(accentOf(early.message)).toBe(0xe74c3c);
  });

  it('says in the place of the times that it was closed, as ended whatever the clock says', () => {
    const closed = 'This meetup was closed by <@200000000000000009>.';
    const rendered = renderMeetupPost(view(timed(START, END), { closed }));
    expect(header(rendered)).toEqual(['### Meetup: Community Day picnic', closed]);
    expect(accentOf(rendered.message)).toBe(0xe74c3c);
    expect(rendered.tags).toEqual(['Meetup', 'Ended']);
    // One that had ended by the clock already is tagged once.
    expect(renderMeetupPost(view(timed(START, END), { closed, now: END })).tags).toEqual([
      'Meetup',
      'Ended',
    ]);
  });
});

describe('the information of a meetup post', () => {
  const information = (party: MeetupParty): string | undefined =>
    block(renderMeetupPost(view(party)), '**Meeting Information**\n')?.slice(
      '**Meeting Information**\n'.length,
    );

  it('has no such heading while nobody wrote anything', () => {
    const rendered = renderMeetupPost(view(testMeetup()));
    expect(textOf(rendered.message)).not.toContain('Information');
    expect(rendered.brief.lines.join('\n')).not.toContain('Information');
  });

  it('shows what the members wrote under the head lines, line by line', () => {
    const rendered = renderMeetupPost(view(described('Bring snacks.\n\nWe meet at the fountain.')));
    expect(textDisplays(rendered.message).slice(0, 2)).toEqual([
      `### Meetup: Community Day picnic\n${NO_TIME}`,
      '**Meeting Information**\nBring snacks.\n\nWe meet at the fountain.',
    ]);
    // Not in the brief of a direct message: the post has it.
    expect(rendered.brief.lines.join('\n')).not.toContain('snacks');
  });

  it('puts it under the line that the post is kept', () => {
    const rendered = renderMeetupPost(view({ ...described('Bring snacks.'), saved: true }));
    expect(header(rendered).at(-1)).toBe(KEPT_OPEN);
    expect(textDisplays(rendered.message)[1]).toBe('**Meeting Information**\nBring snacks.');
  });

  it('makes every line of it plain: no Markdown, no mention, no link to a channel', () => {
    expect(
      information(described('# Big\n> quoted **bold**\n@everyone <@123> <#456>\n- item')),
    ).toBe(
      '\\# Big\n\\> quoted \\*\\*bold\\*\\*\n@\u200beveryone <\u200b@123> <\u200b#456>\n\\- item',
    );
  });

  it('shows no masked link: a text that names one address cannot lead to another', () => {
    const shown = information(
      described(
        '[ [Official rules](https://evil.example)\n' +
          'see [a](https://a.example) and [b](https://b.example)',
      ),
    );
    expect(shown).toBe(
      '\\[ [Official rules]\\(https://evil.example)\n' +
        'see \\[a]\\(https://a.example) and [b]\\(https://b.example)',
    );
    expect(shown).not.toMatch(/(?<!\\)\]\(/);
  });

  it('never cuts what a form accepts: a thousand characters that all need escaping', () => {
    // Every `<` that something follows gets a character after it: the text is twice as long.
    expect(information(described('<'.repeat(1000)))).toBe(`${'<\u200b'.repeat(999)}<`);
    // The same for what is escaped with a backslash, a line each.
    expect(information(described('_\n'.repeat(500)))).toBe('\\_\n'.repeat(500).trimEnd());
  });

  it('stays a message Discord takes with the longest text, the longest name and a crowd', () => {
    const base = described('<'.repeat(1000), testMeetup({ name: '<'.repeat(80) }));
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`300000000000${String(n).padStart(6, '0')}`] = {
        number: 5,
        remote: true,
        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
      };
    }
    const rendered = renderMeetupPost(view(withAttendees({ ...base, saved: true }, crowd)));
    expect(layoutTextLength(rendered.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
    expect(componentCount(rendered.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
    // Its third row of Manage… alone (plan 8M-21) is two of them: well within Discord's 40.
    expect(componentCount(rendered.message)).toBeLessThanOrEqual(30);
    expectSendable(rendered);
    // The text is whole; it is the lists of trainers that give way.
    expect(information(withAttendees({ ...base, saved: true }, crowd))).toBe(
      `${'<\u200b'.repeat(999)}<`,
    );
    expect(
      textOf(rendered.message)
        .split('\n')
        .find((line) => line.startsWith('🏃 Coming (')),
    ).toMatch(/…and \d+ more$/);
  });
});

describe('the Where of a meetup post', () => {
  const MAPS = (lat: number, lon: number) =>
    `[Map](<https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}>)`;
  const STOP: KnownPlace = {
    kind: 'stop',
    id: '0123456789abcdef0123456789abcdef.16',
    title: 'Fountain Square',
    lat: 40.0601,
    lon: -80.0601,
    address: '20 Market Street, Pinewood',
    image: 'https://lh3.googleusercontent.com/square',
  };
  const [, fountain] = testGyms();
  const GYM: KnownPlace = {
    kind: 'gym',
    id: '2',
    title: 'Old Stone Fountain',
    lat: 40.06,
    lon: -80.06,
    address: '12 Market Street, Pinewood, Pennsylvania 15999',
    image: null,
  };
  const pin = (near: DroppedPin['near'], linkName: string | null): DroppedPin => ({
    kind: 'pin',
    lat: 40.02,
    lon: -80.02,
    near,
    linkName,
  });

  /** The test meetup made at this place. */
  function placed(place: MeetupPlace | null): MeetupParty {
    return testMeetup({ place });
  }
  const whereOf = (party: MeetupParty, extra: Partial<MeetupPostView> = {}) =>
    block(renderMeetupPost(view(party, extra)), '**Where**');

  it('marks its heading, Where, trainers and small print by role (plan 8M-8A)', () => {
    const party = withAttendees(described('Bring trade lists.', placed(pin(null, null))), {
      [ALICE]: { name: 'Alice' },
    });
    const post = renderMeetupPost(view(party));
    // What the meetup is for has no role: the map's card leaves it to the whole post.
    expect(roleLines(post.layout)).toEqual([
      ['head', expect.stringMatching(/^### Meetup: /u)],
      ['where', '**Where**'],
      ['trainers', '2 trainers'],
      ['note', expect.stringMatching(/^-# Created by /u)],
    ]);
    expect(postMessage(post.layout)).toEqual(postMessage(withoutRoles(post.layout)));
  });

  it('says where a meetup near a PokéStop is, with its picture beside', () => {
    const post = renderMeetupPost(view(described('Bring trade lists.', placed(STOP))));
    // After the heading block, before what the meetup is for.
    expect(textDisplays(post.message).slice(1, 3)).toEqual([
      `**Where**\nNear **Fountain Square** (PokéStop) · 20 Market Street, Pinewood · ${MAPS(40.0601, -80.0601)}`,
      '**Meeting Information**\nBring trade lists.',
    ]);
    expect(thumbnailBeside(post.message, '**Where**')).toBe(
      'https://lh3.googleusercontent.com/square=s400',
    );
    expectSendable(post);
  });

  it('shows a gym or Wayspot as it is now while it is the same place, as it was named otherwise', () => {
    const now: PostGym = {
      ...fountain!,
      name: 'Old Stone *Fountain* Plaza',
      notice: 'Closed on Mondays',
      imageUrl: 'https://lh3.googleusercontent.com/plaza',
    };
    const atGym = placed(GYM);
    expect(whereOf(atGym, { gym: (id) => (id === 2 ? now : undefined) })).toBe(
      `**Where**\nNear **Old Stone \\*Fountain\\* Plaza** (gym) · 12 Market Street, Pinewood, Pennsylvania 15999 · ${MAPS(40.06, -80.06)}\nClosed on Mondays`,
    );
    // Gone, or moved more than 25 metres: the place where the members agreed to meet.
    const snapshot = `**Where**\nNear **Old Stone Fountain** (gym) · 12 Market Street, Pinewood, Pennsylvania 15999 · ${MAPS(40.06, -80.06)}`;
    expect(whereOf(atGym, { gym: () => undefined })).toBe(snapshot);
    expect(whereOf(atGym, { gym: () => ({ ...now, lat: 40.061 }) })).toBe(snapshot);
    expect(whereOf(atGym)).toBe(snapshot);
    // A kept Wayspot likewise.
    const renamed: Wayspot = {
      ...keptRow(16, { title: 'Fountain Square Park', lat: STOP.lat, lon: STOP.lon }),
      id: STOP.id,
      firstSeen: 0,
      lastSeen: 0,
    };
    expect(
      whereOf(placed(STOP), { wayspot: (id) => (id === STOP.id ? renamed : undefined) }),
    ).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square Park\*\* \(PokéStop\) · 16 Main St/);
    // A Wayspot whose title went blank keeps the name it was named by, the rest as it is now.
    const blank: Wayspot = { ...renamed, title: ' ' };
    expect(
      whereOf(placed(STOP), { wayspot: (id) => (id === STOP.id ? blank : undefined) }),
    ).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square\*\* \(PokéStop\) · 16 Main St/);
  });

  it('says a pin by the place it is near, else its link’s name, else as dropped', () => {
    expect(whereOf(placed(pin({ kind: 'stop', title: 'Fountain Square' }, 'Blue Tent')))).toBe(
      `**Where**\n📍 Near **Fountain Square** (PokéStop) · ${MAPS(40.02, -80.02)}`,
    );
    expect(whereOf(placed(pin(null, 'Blue Tent')))).toBe(
      `**Where**\n📍 **Blue Tent** · ${MAPS(40.02, -80.02)}`,
    );
    expect(whereOf(placed(pin(null, null)))).toBe(
      `**Where**\n📍 Dropped pin · ${MAPS(40.02, -80.02)}`,
    );
    expect(thumbnailsOf(renderMeetupPost(view(placed(pin(null, null)))).message)).toEqual([]);
  });

  it('says nothing without a place: the information says where', () => {
    expect(whereOf(described('Picnic shelter 3 in Frick Park'))).toBeUndefined();
  });

  it('says that a place beside its picture has no address, and only there', () => {
    const post = renderMeetupPost(view(placed({ ...STOP, address: null })));
    expect(block(post, '**Where**')).toBe(
      `**Where**\nNear **Fountain Square** (PokéStop) · (no address available) · ${MAPS(40.0601, -80.0601)}`,
    );
    expect(textDisplays(postMessage(post.layout, { picture: false }))).toContain(
      `**Where**\nNear **Fountain Square** (PokéStop) · ${MAPS(40.0601, -80.0601)}`,
    );
  });

  it('gives a direct message the place in one line, without links, and its map', () => {
    const brief = (party: MeetupParty) => renderMeetupPost(view(party)).brief;
    expect(brief(placed(STOP))).toEqual({
      accent: 0x3498db,
      lines: [
        '**Meetup: Community Day picnic**',
        NO_TIME,
        'Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood',
        '1 trainer',
      ],
      // The line of where, which a report to the moderators leaves out (plan 8S-2).
      whereLine: 'Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood',
      map: 'https://www.google.com/maps/search/?api=1&query=40.0601%2C-80.0601',
    });
    expect(brief(placed(pin(null, 'see https://evil.example')))).toMatchObject({
      lines: [expect.any(String), NO_TIME, '📍 **see https:\u200b//evil.example**', '1 trainer'],
      map: 'https://www.google.com/maps/search/?api=1&query=40.02%2C-80.02',
    });
    expect(brief(testMeetup())).not.toHaveProperty('map');
    expect(brief(testMeetup()).lines).toHaveLength(3);
  });

  it('stays a message Discord takes with the longest place and information', () => {
    const longest: KnownPlace = {
      ...STOP,
      title: '*'.repeat(255),
      address: '<'.repeat(255),
      image: `https://lh3.googleusercontent.com/${'p'.repeat(200)}`,
    };
    const base = described('<'.repeat(1000), placed(longest));
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`300000000000${String(n).padStart(6, '0')}`] = {
        number: 5,
        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
      };
    }
    const rendered = renderMeetupPost(view(withAttendees({ ...base, saved: true }, crowd)));
    expectSendable(rendered);
    for (const place of [pin({ kind: 'gym', title: '*'.repeat(255) }, null), null]) {
      const other = { ...base, meetup: { ...base.meetup, place } };
      expectSendable(renderMeetupPost(view(withAttendees(other, crowd))));
    }
  });
});

describe('the trainers of a meetup post', () => {
  it('lists them by status as a raid does, with head counts, remote and teams', () => {
    const meetup = withAttendees(testMeetup(), {
      [ALICE]: { status: PartyStatus.Present, number: 3, team: 'mystic', name: 'Alice' },
      [BOB]: { status: PartyStatus.Coming, remote: true },
      [CAROL]: { status: PartyStatus.Coming, team: 'valor', name: 'Carol' },
    });
    expect(textDisplays(renderMeetupPost(view(meetup)).message)[1]?.split('\n')).toEqual([
      '6 trainers',
      `🤔 Interested (1): <@${REPORTER}>`,
      `🏃 Coming (2): <@${BOB}> 🛰️, 🔥 Carol`,
      '✅ Here (3): ❄️ Alice +2',
    ]);
  });

  it('has no Done list and tells nobody to split up: there is no lobby', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 30; n++) crowd[`300000000000${String(n).padStart(6, '0')}`] = {};
    const text = textOf(renderMeetupPost(view(withAttendees(testMeetup(), crowd))).message);
    expect(text).toContain('\n🏃 Coming (30): ');
    expect(text).not.toContain('Done');
    expect(text).not.toContain('lobby');
  });

  it('says so when nobody is signed up', () => {
    const empty = { ...testMeetup(), attendees: {} };
    expect(textDisplays(renderMeetupPost(view(empty)).message)[1]).toBe('Nobody yet');
  });
});

describe('the controls of a meetup post', () => {
  /** What each button shows: its label, or a status's icon. */
  const labels = (party: MeetupParty) =>
    buttonsOf(renderMeetupPost(view(party)).message).map((button) => button.label ?? button.emoji);

  it('has no Done, Meet…, "Set time", Group… or map: the statuses and Leave, the head count, then Manage…', () => {
    // A meetup has its one group for good: the rows of a raid, and in the third Manage… alone
    // (plan 8M-21: the map's editor as a dialog).
    expect(labels(testMeetup())).toEqual(['🤔', '🏃', '✅', '👋', '⬇️', '⬆️', '📡', 'Manage…']);
    const { message } = renderMeetupPost(view(testMeetup()));
    expect(buttonsOf(message).at(-1)?.customId).toBe(`party:${testMeetup().id}:manage`);
  });

  it('names the meetup in every custom id, like the controls of a raid', () => {
    const meetup = testMeetup();
    for (const button of buttonsOf(renderMeetupPost(view(meetup)).message)) {
      expect(decodeCustomId(button.customId ?? '')).toMatchObject({ kind: 'party', id: meetup.id });
    }
  });

  it('is the same whatever its times', () => {
    const controls = (party: MeetupParty) => buttonsOf(renderMeetupPost(view(party)).message);
    expect(controls(timed(START, END))).toEqual(controls(testMeetup()));
  });
});
