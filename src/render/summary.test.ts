import { describe, expect, it } from 'vitest';
import { accentOf, componentCount, textDisplays } from '../../test/support/messages.js';
import {
  ALICE,
  at,
  MINUTE,
  PARTY_NOW,
  PARTY_ZONE,
  testMax,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
  stops,
} from '../../test/support/parties.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { MeetupParty, RaidParty, TrainParty } from '../domain/party/party.js';
import { setEndTime, setHatchTime } from '../domain/party/raid.js';
import { endParty } from '../domain/party/party.js';
import { TEXT_BUDGET } from './party-post.js';
import { meetupTitle } from './meetup-post.js';
import { trainTitle } from './train-post.js';
import { LIST_COLOUR } from './v2.js';
import { RAID_LEVELS, SHADOW_RAID_LEVELS } from '../domain/pogo/raid-tier.js';
import type { MaxTier } from '../domain/pogo/max-tier.js';
import {
  LEGACY_SUMMARY_TITLES,
  NOTHING_GOING,
  renderRegionLink,
  renderSummary,
  SUMMARY_TIERS,
  SUMMARY_TITLE,
  tierHeading,
  type ListedMax,
  type ListedMeetup,
  type ListedRaid,
  type ListedTrain,
} from './summary.js';

const rules = testRaidRules();
const ID = (n: number): string => `00000000-0000-4000-8000-0000${String(n).padStart(8, '0')}`;

function listed(party: RaidParty, title: string, post: string | null): ListedRaid {
  return { party: { ...party, forumPostId: post }, title };
}

/** The whole text of a summary, as Discord counts it against the text a message may have. */
const textLength = (message: V2Message): number =>
  textDisplays(message).reduce((sum, text) => sum + text.length, 0);

/** The lines of the text display that begins with `heading`, without the heading. */
function linesUnder(message: V2Message, heading: string): string[] {
  const block = textDisplays(message).find((text) => text.startsWith(`${heading}\n`));
  if (block === undefined) throw new Error(`no block ${heading}`);
  return block.split('\n').slice(1);
}

const NOTHING = `### Today and coming up\n${NOTHING_GOING}`;

describe('renderSummary', () => {
  it('says so when there is nothing, in one container', () => {
    const message = renderSummary([], PARTY_NOW);
    expect(textDisplays(message)).toEqual([NOTHING]);
    expect(NOTHING_GOING).toBe(
      'Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    );
    expect(accentOf(message)).toBe(LIST_COLOUR);
    expect(message.components).toHaveLength(1);
  });

  it('lists the raids by when they end, with a link, the time that matters and the head count', () => {
    const egg = setHatchTime(testRaid({ id: ID(1) }), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const hatched = withAttendees(
      setEndTime(testRaid({ id: ID(2) }), at('2026-10-13T14:20'), rules, PARTY_NOW),
      { [ALICE]: { number: 3 } },
    );
    const timeless = testRaid({ id: ID(3) });
    const message = renderSummary(
      [
        listed(egg, 'T5 egg · The Stacks', '300000000000000001'),
        listed(timeless, 'T5 egg · Old Stone Fountain', '300000000000000003'),
        listed(hatched, 'Yveltal · Starbucks', '300000000000000002'),
      ],
      PARTY_NOW,
    );
    expect(textDisplays(message)).toEqual([
      '### Today and coming up\n3 raids',
      [
        '**Level 5**',
        `<#300000000000000002> · ends <t:${at('2026-10-13T14:20') / 1000}:R> · 4 trainers`,
        `<#300000000000000001> · hatches <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
        '<#300000000000000003> · no time set · 1 trainer',
      ].join('\n'),
    ]);
  });

  it('groups the raids by tier, the rarest first and each shadow tier after its plain one', () => {
    const raids = [...SUMMARY_TIERS]
      .reverse()
      .map((tier, n) =>
        listed(
          testRaid({ id: ID(n), tier }),
          'raid',
          `30000000000000${String(n).padStart(4, '0')}`,
        ),
      );
    const message = renderSummary(raids, PARTY_NOW);
    expect(textDisplays(message).map((text) => text.split('\n')[0])).toEqual([
      '### Today and coming up',
      '**Elite**',
      '**Level 5**',
      '**Shadow Level 5**',
      '**Mega Legendary**',
      '**Super Mega**',
      '**Mega**',
      '**Level 3**',
      '**Shadow Level 3**',
      '**Level 1**',
      '**Shadow Level 1**',
    ]);
    expect(tierHeading({ level: 'T3', shadow: true })).toBe('**Shadow Level 3**');
    // Every tier there is, once.
    expect(SUMMARY_TIERS).toHaveLength(RAID_LEVELS.length + SHADOW_RAID_LEVELS.length);
    expect(new Set(SUMMARY_TIERS.map((tier) => `${tier.level}:${String(tier.shadow)}`)).size).toBe(
      SUMMARY_TIERS.length,
    );
  });

  it('leaves out raids that have ended, by the clock or for good', () => {
    const over = setEndTime(testRaid({ id: ID(1) }), PARTY_NOW - MINUTE, rules, PARTY_NOW);
    const archived = endParty(testRaid({ id: ID(2) }));
    const message = renderSummary(
      [listed(over, 'a', '300000000000000001'), listed(archived, 'b', '300000000000000002')],
      PARTY_NOW,
    );
    expect(textDisplays(message)).toEqual([NOTHING]);
  });

  it('names a raid whose post does not exist yet by its title, made plain', () => {
    expect(
      linesUnder(
        renderSummary([listed(testRaid(), 'T5 egg · The Stacks', null)], PARTY_NOW),
        '**Level 5**',
      ),
    ).toEqual(['**T5 egg · The Stacks** · no time set · 1 trainer']);
    expect(
      linesUnder(
        renderSummary([listed(testRaid(), 'M*A*S*H Memorial', null)], PARTY_NOW),
        '**Level 5**',
      ),
    ).toEqual(['**M\\*A\\*S\\*H Memorial** · no time set · 1 trainer']);
  });

  it('keeps the last raid when its line fits, and says "and 1 more" only when it does not', () => {
    const one = (title: string, n: number) => listed(testRaid({ id: ID(n) }), title, null);
    const filler = Array.from({ length: 24 }, (_, n) => one('x'.repeat(130), n));
    const base = textLength(renderSummary([...filler, one('', 30)], PARTY_NOW));
    const lastTitle = 'y'.repeat(TEXT_BUDGET - base);
    const fits = renderSummary([...filler, one(lastTitle, 30)], PARTY_NOW);
    expect(textLength(fits)).toBe(TEXT_BUDGET);
    expect(linesUnder(fits, '**Level 5**')).toHaveLength(25);
    expect(textDisplays(fits).join('\n')).not.toContain('more');
    const tooLong = renderSummary([...filler, one(`${lastTitle}y`, 30)], PARTY_NOW);
    expect(linesUnder(tooLong, '**Level 5**').at(-1)).toBe('…and 1 more');
    expect(textLength(tooLong)).toBeLessThanOrEqual(TEXT_BUDGET);
  });

  it('fits into one message however many raids there are, and counts the rest', () => {
    const many = Array.from({ length: 200 }, (_, n) =>
      listed(testRaid({ id: ID(n) }), `raid ${n}`, `3000000000000${String(n).padStart(5, '0')}`),
    );
    const message = renderSummary(many, PARTY_NOW);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 100);
    expect(textDisplays(message)[0]).toBe('### Today and coming up\n200 raids');
    const lines = linesUnder(message, '**Level 5**');
    const last = lines.at(-1);
    expect(last).toMatch(/^…and \d+ more$/);
    expect(lines.length - 1 + Number(/\d+/.exec(last ?? '')?.[0])).toBe(200);
    expectV2Sendable(message);
  });

  it('keeps every tier and kind at once, with texts that need escapes, within what Discord takes', () => {
    const escapes = '*_~`|>[]<@1>'.repeat(20);
    const raids = SUMMARY_TIERS.flatMap((tier, t) =>
      Array.from({ length: 30 }, (_, n) =>
        listed(testRaid({ id: ID(t * 100 + n), tier }), escapes, null),
      ),
    );
    const trains = Array.from({ length: 30 }, (_, n) => ({
      party: testTrain({ id: ID(5000 + n) }),
      title: escapes,
      at: escapes,
    }));
    const meetups = Array.from({ length: 30 }, (_, n) => ({
      party: testMeetup({ id: ID(6000 + n) }),
      title: escapes,
    }));
    const message = renderSummary(raids, PARTY_NOW, meetups, trains);
    expect(componentCount(message)).toBeLessThanOrEqual(40);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    expectV2Sendable(message);
    // Every tier is there, if only to say how many it has, and so are the trains and meetups.
    const headings = textDisplays(message).map((text) => text.split('\n')[0]);
    expect(headings).toEqual([
      '### Today and coming up',
      ...SUMMARY_TIERS.map(tierHeading),
      '**Trains**',
      '**Meetups**',
    ]);
    expect(textDisplays(message)[0]).toBe(
      `### Today and coming up\n${String(raids.length)} raids · 30 trains · 30 meetups`,
    );
    for (const heading of ['**Trains**', '**Meetups**']) {
      expect(linesUnder(message, heading).length).toBeGreaterThan(1);
    }
  });
});

describe('renderRegionLink', () => {
  it('links the post, which Discord shows under its title', () => {
    expect(renderRegionLink('300000000000000001')).toBe('New raid: <#300000000000000001>');
  });
});

describe('renderSummary with meetups', () => {
  const HOUR = 60 * MINUTE;
  const stamp = (time: number) => `<t:${time / 1000}:R>`;
  let posts = 0;

  /** A meetup for the list, with a post, made `order` minutes after `PARTY_NOW`. */
  function meetup(
    order: number,
    times: { start?: number; end?: number } = {},
    change: (party: MeetupParty) => MeetupParty = (party) => party,
  ): ListedMeetup {
    const made = testMeetup({ id: ID(500 + order), now: PARTY_NOW + order * MINUTE });
    const party: MeetupParty = change({
      ...made,
      forumPostId: `3000000000000001${String(posts++).padStart(2, '0')}`,
      endTime: times.end ?? null,
      timed: { ...made.timed, startTime: times.start ?? null },
    });
    return { party, title: `Meetup · ${party.timed.name}` };
  }
  const link = (listed: ListedMeetup) => `<#${listed.party.forumPostId ?? ''}>`;

  it('lists them under the raids, under a heading of their own, after a line', () => {
    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
    const picnic = meetup(1, { start: PARTY_NOW + 2 * HOUR });
    const message = renderSummary([raid], PARTY_NOW, [picnic]);
    expect(textDisplays(message)).toEqual([
      '### Today and coming up\n1 raid · 1 meetup',
      '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
      `**Meetups**\n${link(picnic)} · starts ${stamp(PARTY_NOW + 2 * HOUR)} · 1 trainer`,
    ]);
    // A line under the count, and one between the raids and the meetups.
    const kinds = (message.components[0] as { components: { type: number }[] }).components.map(
      (component) => component.type,
    );
    expect(kinds).toEqual([10, 14, 10, 14, 10]);
  });

  it('counts only the meetups when there are only meetups', () => {
    const picnic = meetup(1);
    expect(textDisplays(renderSummary([], PARTY_NOW, [picnic]))).toEqual([
      '### Today and coming up\n1 meetup',
      `**Meetups**\n${link(picnic)} · no time set · 1 trainer`,
    ]);
  });

  it('is the list it always was for a region without meetups', () => {
    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
    expect(renderSummary([raid], PARTY_NOW, [])).toEqual(renderSummary([raid], PARTY_NOW));
    expect(textDisplays(renderSummary([], PARTY_NOW, []))).toEqual([NOTHING]);
  });

  it('says the time that matters: the start, then the end, or since when it goes on', () => {
    const ahead = meetup(1, { start: PARTY_NOW + HOUR, end: PARTY_NOW + 3 * HOUR });
    const going = meetup(2, { start: PARTY_NOW - HOUR, end: PARTY_NOW + HOUR });
    const open = meetup(3, { start: PARTY_NOW - 2 * HOUR });
    const endOnly = meetup(4, { end: PARTY_NOW + 5 * HOUR });
    const crowd = meetup(5, {}, (party) => withAttendees(party, { [ALICE]: { number: 4 } }));
    const message = renderSummary([], PARTY_NOW, [ahead, going, open, endOnly, crowd]);
    expect(linesUnder(message, '**Meetups**')).toEqual([
      `${link(open)} · started ${stamp(PARTY_NOW - 2 * HOUR)} · 1 trainer`,
      `${link(going)} · ends ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
      `${link(ahead)} · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
      `${link(endOnly)} · ends ${stamp(PARTY_NOW + 5 * HOUR)} · 1 trainer`,
      `${link(crowd)} · no time set · 5 trainers`,
    ]);
  });

  it('says a start or end more than a day ahead as a date and time, which each reader’s Discord shows in their own zone (plan 8X-H, G4)', () => {
    // Discord rounds a relative stamp ("in 4 days" for 3 days and 15 hours); its date-and-time
    // stamp is drawn from the epoch in each viewer's time zone, daylight saving included.
    const dated = (time: number) => `<t:${time / 1000}:f>`;
    const later = meetup(1, { start: PARTY_NOW + 87 * HOUR });
    const ending = meetup(2, { start: PARTY_NOW - HOUR, end: PARTY_NOW + 30 * HOUR });
    const day = meetup(3, { start: PARTY_NOW + 24 * HOUR });
    const lines = linesUnder(renderSummary([], PARTY_NOW, [later, ending, day]), '**Meetups**');
    expect(lines).toEqual([
      `${link(ending)} · ends ${dated(PARTY_NOW + 30 * HOUR)} · 1 trainer`,
      // Within a day, the relative stamp as before.
      `${link(day)} · starts ${stamp(PARTY_NOW + 24 * HOUR)} · 1 trainer`,
      `${link(later)} · starts ${dated(PARTY_NOW + 87 * HOUR)} · 1 trainer`,
    ]);
  });

  it('orders them by their start, then those without one as they were made', () => {
    const late = meetup(1, { start: PARTY_NOW + 5 * HOUR });
    const second = meetup(3);
    const first = meetup(2);
    const soon = meetup(4, { start: PARTY_NOW + HOUR });
    const lines = linesUnder(
      renderSummary([], PARTY_NOW, [late, second, first, soon]),
      '**Meetups**',
    );
    expect(lines.map((text) => text.split(' ')[0])).toEqual([soon, late, first, second].map(link));
  });

  it('leaves out meetups that are over, by the clock or for good', () => {
    const over = meetup(1, { start: PARTY_NOW - 2 * HOUR, end: PARTY_NOW });
    const ended = meetup(2, {}, (party) => endParty(party));
    const going = meetup(3);
    expect(linesUnder(renderSummary([], PARTY_NOW, [over, ended, going]), '**Meetups**')).toEqual([
      `${link(going)} · no time set · 1 trainer`,
    ]);
    // With none left there is no heading either.
    expect(textDisplays(renderSummary([], PARTY_NOW, [over, ended]))).toEqual([NOTHING]);
  });

  it('names a meetup without a post by its title, made plain', () => {
    const made = testMeetup({ name: '**Picnic**' });
    const message = renderSummary([], PARTY_NOW, [{ party: made, title: 'Meetup · **Picnic**' }]);
    expect(linesUnder(message, '**Meetups**')).toEqual([
      '**Meetup · \\*\\*Picnic\\*\\*** · no time set · 1 trainer',
    ]);
  });

  it('gives the meetups the room that few raids leave', () => {
    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg', '300000000000000001');
    const meetups = Array.from({ length: 50 }, (_unused, n) => meetup(n));
    const message = renderSummary([raid], PARTY_NOW, meetups);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    // Every one of the fifty is listed: far more than their 600 characters alone would hold.
    const lines = linesUnder(message, '**Meetups**');
    expect(lines).toHaveLength(50);
    expect(lines.at(-1)).not.toMatch(/more$/);
  });

  it('fills the message when there are more meetups than fit, and counts the rest', () => {
    const meetups = Array.from({ length: 120 }, (_unused, n) => meetup(n));
    const message = renderSummary([], PARTY_NOW, meetups);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 100);
    expect(linesUnder(message, '**Meetups**').at(-1)).toMatch(/^…and \d+ more$/);
  });

  it('stays one message with many of both, and counts what it left out of each', () => {
    const raids = Array.from({ length: 120 }, (_unused, n) =>
      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
    );
    const meetups = Array.from({ length: 60 }, (_unused, n) => meetup(n));
    const message = renderSummary(raids, PARTY_NOW, meetups);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    // The raids give way to the meetups, which have their own room, and both say what is missing.
    const raidLines = linesUnder(message, '**Level 5**');
    const meetupLines = linesUnder(message, '**Meetups**');
    expect(raidLines.at(-1)).toMatch(/^…and \d+ more$/);
    expect(meetupLines.at(-1)).toMatch(/^…and \d+ more$/);
    expect(meetupLines.length).toBeGreaterThan(5);
    expect(raidLines.length).toBeGreaterThan(30);
  });
});

describe('renderRegionLink for a meetup', () => {
  it('says what kind of party is new', () => {
    expect(renderRegionLink('300000000000000001', 'meetup')).toBe(
      'New meetup: <#300000000000000001>',
    );
    expect(renderRegionLink('300000000000000001', 'raid')).toBe(
      renderRegionLink('300000000000000001'),
    );
  });
});

describe('renderSummary with trains', () => {
  const HOUR = 60 * MINUTE;
  const stamp = (time: number) => `<t:${time / 1000}:R>`;
  let posts = 0;

  /** A train for the list, with a post, made `order` minutes after `PARTY_NOW`. */
  function train(
    order: number,
    details: Partial<TrainParty['train']> = {},
    times: { start?: number; end?: number } = {},
    at?: string,
  ): ListedTrain {
    const made = testTrain({ id: ID(700 + order), now: PARTY_NOW + order * MINUTE });
    const party: TrainParty = {
      ...made,
      forumPostId: `3000000000000003${String(posts++).padStart(2, '0')}`,
      endTime: times.end ?? null,
      timed: { ...made.timed, startTime: times.start ?? null },
      train: { ...made.train, ...details },
    };
    return { party, title: `Train · ${party.timed.name}`, at };
  }
  const link = (listed: ListedTrain) => `<#${listed.party.forumPostId ?? ''}>`;

  it('lists them under the raids and above the meetups, each under its heading', () => {
    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
    const rolling = train(
      1,
      { route: stops(4, 1), stop: 1 },
      { start: PARTY_NOW + HOUR },
      'The Stacks',
    );
    const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
    expect(textDisplays(renderSummary([raid], PARTY_NOW, [picnic], [rolling]))).toEqual([
      '### Today and coming up\n1 raid · 1 train · 1 meetup',
      '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
      `**Trains**\n${link(rolling)} · at The Stacks · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
      '**Meetups**\n**Meetup · Community Day picnic** · no time set · 1 trainer',
    ]);
    expect(textDisplays(renderSummary([], PARTY_NOW, [], [rolling]))[0]).toBe(
      '### Today and coming up\n1 train',
    );
  });

  it('says where each train is: at a gym, without a route yet, or through with it', () => {
    const none = train(1);
    const going = train(
      2,
      { route: stops(4, 1), stop: 0 },
      { end: PARTY_NOW + HOUR },
      '**Bridge**',
    );
    const finished = train(3, { route: stops(4, 1), stop: 2 }, { start: PARTY_NOW - HOUR });
    const gone = train(4, { route: stops(999), stop: 0 });
    const message = renderSummary([], PARTY_NOW, [], [none, going, finished, gone]);
    expect(linesUnder(message, '**Trains**')).toEqual([
      // By their start, then those without one as they were made.
      `${link(finished)} · route finished · started ${stamp(PARTY_NOW - HOUR)} · 1 trainer`,
      `${link(none)} · no route yet · no time set · 1 trainer`,
      // The name of a gym is made plain.
      `${link(going)} · at \\*\\*Bridge\\*\\* · ends ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
      `${link(gone)} · at Unknown gym · no time set · 1 trainer`,
    ]);
  });

  it('names the kind of a train of max battles after its post (plan 8X-4)', () => {
    const dynamax = train(1, { kind: 'dynamax' });
    const giga = train(2, { kind: 'gigantamax' });
    expect(linesUnder(renderSummary([], PARTY_NOW, [], [dynamax, giga]), '**Trains**')).toEqual([
      `${link(dynamax)} · Max Battle Train · no route yet · no time set · 1 trainer`,
      `${link(giga)} · Gigantamax Train · no route yet · no time set · 1 trainer`,
    ]);
  });

  // Plan 8M-11A (Matt's answers): the train emoji before a train's name, once the application has
  // it; without it the lines read as before.
  it("puts the application's train emoji before each train, and nothing while it has none", () => {
    const today = train(1);
    const later = train(2, {}, { start: PARTY_NOW + 3 * 24 * HOUR });
    const mark = '<:pinetrain:1400823744760905730>';
    const marked = renderSummary([], PARTY_NOW, [], [today, later], [], {
      zone: 'America/New_York',
      trainMark: mark,
    });
    expect(linesUnder(marked, '**Trains**')).toEqual([
      `${mark} ${link(today)} · no route yet · no time set · 1 trainer`,
    ]);
    expect(textDisplays(marked).join(' ')).toContain(`${mark} ${link(later)}`);
    const plainLines = renderSummary([], PARTY_NOW, [], [today], [], { zone: 'America/New_York' });
    expect(linesUnder(plainLines, '**Trains**')).toEqual([
      `${link(today)} · no route yet · no time set · 1 trainer`,
    ]);
  });

  it('leaves out a train whose end has passed or that has ended, and names one without a post', () => {
    const over = train(1, {}, { end: PARTY_NOW - MINUTE });
    const ended = { ...train(2), party: endParty(train(2).party) };
    expect(textDisplays(renderSummary([], PARTY_NOW, [], [over, ended]))).toEqual([NOTHING]);
    const fresh = { party: testTrain({ name: '_Night_ train' }), title: 'Train · _Night_ train' };
    expect(linesUnder(renderSummary([], PARTY_NOW, [], [fresh]), '**Trains**')).toEqual([
      '**Train · \\_Night\\_ train** · no route yet · no time set · 1 trainer',
    ]);
  });

  it('stays one message with many raids, trains and meetups, and counts what it left out of each', () => {
    const raids = Array.from({ length: 120 }, (_unused, n) =>
      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
    );
    const trains = Array.from({ length: 60 }, (_unused, n) =>
      train(n, { route: stops(4) }, {}, 'Gym'),
    );
    const meetups = Array.from({ length: 60 }, (_unused, n) => ({
      party: {
        ...testMeetup({ id: ID(900 + n), now: PARTY_NOW + n }),
        forumPostId: `3000000000000${String(400 + n).padStart(5, '0')}`,
      },
      title: 'Meetup',
    }));
    const message = renderSummary(raids, PARTY_NOW, meetups, trains);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 150);
    const [raidLines, trainLines, meetupLines] = ['**Level 5**', '**Trains**', '**Meetups**'].map(
      (heading) => linesUnder(message, heading),
    );
    for (const lines of [raidLines, trainLines, meetupLines]) {
      expect(lines?.at(-1)).toMatch(/^…and \d+ more$/);
      // Each of the three has a fair part of the message.
      expect(lines?.length).toBeGreaterThan(5);
    }
    expect(raidLines?.length).toBeGreaterThan(20);
  });

  // Plan 8X-G (Matt, 2026-10-22): trains of other regions with a stop in this one.
  it('lists the trains passing through after its own, each linked to its copy here or its post', () => {
    const own = train(1, { route: stops(4, 1) }, {}, 'The Stacks');
    const visiting = train(2, { route: stops(7, 1), stop: 0 }, {}, 'Harbor Lighthouse Mural');
    const copy = 'https://discord.com/channels/1/2/3';
    const elsewhere = train(3, { route: stops(8, 2), kind: 'dynamax' }, {}, 'Café Élan Fresco');
    const message = renderSummary([], PARTY_NOW, [], [own], [], {
      passing: [{ ...visiting, copyUrl: copy }, elsewhere],
    });
    expect(textDisplays(message)).toEqual([
      '### Today and coming up\n1 train · 2 trains passing through',
      `**Trains**\n${link(own)} · at The Stacks · no time set · 1 trainer`,
      '**Passing through**\n' +
        `[Train · ${visiting.party.timed.name}](<${copy}>) · at Harbor Lighthouse Mural · no time set · 1 trainer\n` +
        `${link(elsewhere)} · Max Battle Train · at Café Élan Fresco · no time set · 1 trainer`,
    ]);
    // Passing through alone is something going on.
    expect(
      textDisplays(renderSummary([], PARTY_NOW, [], [], [], { passing: [elsewhere] }))[0],
    ).toBe('### Today and coming up\n1 train passing through');
  });

  it('keeps brackets in the name of a train linked to its copy from breaking the link (final review F3)', () => {
    const visiting = train(2, { route: stops(7, 1), stop: 0 }, {}, 'Harbor Lighthouse Mural');
    const copy = 'https://discord.com/channels/1/2/3';
    const message = renderSummary([], PARTY_NOW, [], [], [], {
      passing: [{ ...visiting, title: 'Train · [Fri] legendaries', copyUrl: copy }],
    });
    expect(linesUnder(message, '**Passing through**')[0]).toBe(
      `[Train · \\[Fri\\] legendaries](<${copy}>) · at Harbor Lighthouse Mural · no time set · 1 trainer`,
    );
  });

  it('keeps the trains passing through within the message with everything else, counting the rest', () => {
    const raids = Array.from({ length: 120 }, (_unused, n) =>
      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
    );
    const passing = Array.from({ length: 60 }, (_unused, n) =>
      train(n, { route: stops(4) }, {}, 'Gym'),
    );
    const message = renderSummary(raids, PARTY_NOW, [], [], [], { passing });
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    const lines = linesUnder(message, '**Passing through**');
    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
    expect(lines.length).toBeGreaterThan(5);
  });
});

describe('renderSummary: "Today’s Stops" (plan 8X-G)', () => {
  const POST = 'https://discord.com/channels/1/2/3';

  it('links the pinned post of the stops, with its counts, last', () => {
    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
    const texts = textDisplays(
      renderSummary([raid], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 6, hideouts: 2 } }),
    );
    expect(texts.at(-1)).toBe(`[Today’s Stops](<${POST}>): 6 tasks · 2 hideouts`);
    expect(
      textDisplays(
        renderSummary([], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 1, hideouts: 0 } }),
      ),
    ).toEqual(['### Today and coming up\n1 task', `[Today’s Stops](<${POST}>): 1 task`]);
  });

  it('counts the day’s research waiting under an event’s window apart, with when it comes back (plan 8R-6)', () => {
    const at = Date.UTC(2026, 10, 21, 22);
    const back = `13 tasks back at <t:${String(at / 1_000)}:t>`;
    expect(
      textDisplays(
        renderSummary([], PARTY_NOW, [], [], [], {
          stops: { url: POST, tasks: 2, hideouts: 1, waiting: { tasks: 13, at } },
        }),
      ),
    ).toEqual([
      `### Today and coming up\n2 tasks · 1 hideout · ${back}`,
      `[Today’s Stops](<${POST}>): 2 tasks · 1 hideout · ${back}`,
    ]);
    // Only the day's research, waiting: the post is linked all the same.
    expect(
      textDisplays(
        renderSummary([], PARTY_NOW, [], [], [], {
          stops: { url: POST, tasks: 0, hideouts: 0, waiting: { tasks: 13, at } },
        }),
      ),
    ).toEqual([`### Today and coming up\n${back}`, `[Today’s Stops](<${POST}>): ${back}`]);
  });

  it('says nothing of the stops where nothing is reported', () => {
    expect(
      textDisplays(
        renderSummary([], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 0, hideouts: 0 } }),
      ),
    ).toEqual([NOTHING]);
  });
});

describe('renderSummary: max battles (plan 8X-3)', () => {
  const max = (n: number, tier: MaxTier, end: string, post = true): ListedMax => ({
    party: {
      ...testMax({ id: ID(700 + n), tier, endTime: at(end), now: PARTY_NOW + n }),
      forumPostId: post ? `30000000000000070${String(n)}` : null,
    },
    title: `Battle ${String(n)}`,
  });

  it('lists them after the raids under a heading of their own, by tier, the soonest end first', () => {
    const raid = listed(testRaid(), 'T5 egg', '300000000000000001');
    const message = renderSummary(
      [raid],
      PARTY_NOW,
      [],
      [],
      [
        max(1, 'D2', '2026-10-13T21:00'),
        max(2, 'G', '2026-10-13T15:00'),
        max(3, 'D5', '2026-10-13T14:30'),
        max(4, 'D2', '2026-10-13T16:00', false),
      ],
    );
    const texts = textDisplays(message);
    expect(texts[0]).toBe('### Today and coming up\n1 raid · 4 max battles');
    expect(linesUnder(message, '**Max battles**')).toEqual([
      `<#300000000000000703> · Dynamax 5★ · ends <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
      `**Battle 4** · Dynamax 2★ · ends <t:${at('2026-10-13T16:00') / 1000}:R> · 1 trainer`,
      `<#300000000000000701> · Dynamax 2★ · ends <t:${at('2026-10-13T21:00') / 1000}:R> · 1 trainer`,
      `<#300000000000000702> · Gigantamax · ends <t:${at('2026-10-13T15:00') / 1000}:R> · 1 trainer`,
    ]);
    const order = texts.map((text) => text.split('\n')[0]);
    expect(order.indexOf('**Level 5**')).toBeLessThan(order.indexOf('**Max battles**'));
  });

  it('says Eternamax for the tier of Eternatus’s battle', () => {
    const eternatus: ListedMax = {
      party: {
        ...testMax({ id: ID(709), tier: 'G', boss: { key: 'eternatus_eternamax' } }),
        forumPostId: '300000000000000709',
      },
      title: 'Eternamax Eternatus',
    };
    const message = renderSummary([], PARTY_NOW, [], [], [eternatus]);
    expect(linesUnder(message, '**Max battles**')[0]).toMatch(
      /^<#300000000000000709> · Eternamax · ends /,
    );
  });

  it('leaves out one whose end has passed, and counts what does not fit', () => {
    const over = renderSummary(
      [],
      at('2026-10-13T21:00'),
      [],
      [],
      [max(1, 'D2', '2026-10-13T21:00')],
    );
    expect(textDisplays(over)[0]).toBe(`### Today and coming up\n${NOTHING_GOING}`);
    const many = Array.from({ length: 150 }, (_unused, n) => max(n, 'D1', '2026-10-13T20:00'));
    const message = renderSummary([], PARTY_NOW, [], [], many);
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    expect(linesUnder(message, '**Max battles**')?.at(-1)).toMatch(/^…and \d+ more$/);
    expectV2Sendable(message);
  });
});

describe('renderSummary: today and coming up (plan 8R-9)', () => {
  const dated = (time: number) => `<t:${time / 1000}:f>`;
  const POST = 'https://discord.com/channels/1/2/3';
  let posts = 0;
  const post = (): string => `3000000000000009${String(posts++).padStart(2, '0')}`;
  const meetupAt = (order: number, start: number | null): ListedMeetup => {
    const made = testMeetup({ id: ID(800 + order), now: PARTY_NOW + order * MINUTE });
    const party: MeetupParty = {
      ...made,
      forumPostId: post(),
      timed: { ...made.timed, startTime: start },
    };
    return { party, title: meetupTitle(party) };
  };
  const trainAt = (
    order: number,
    start: number | null,
    kind: TrainParty['train']['kind'] = 'raid',
  ): ListedTrain => {
    const made = testTrain({ id: ID(900 + order), now: PARTY_NOW + order * MINUTE });
    const party: TrainParty = {
      ...made,
      forumPostId: post(),
      timed: { ...made.timed, startTime: start },
      train: { ...made.train, route: stops(4), kind },
    };
    return { party, title: trainTitle(party), at: 'The Stacks' };
  };
  const link = (listed: { party: { forumPostId: string | null } }) =>
    `<#${listed.party.forumPostId ?? ''}>`;

  it('is titled "Today and coming up", the titles of before kept for taking a post over', () => {
    expect(SUMMARY_TITLE).toBe('Today and coming up');
    expect(LEGACY_SUMMARY_TITLES).toEqual(['Active raids', 'Going on now']);
  });

  it('lists what starts after midnight under Coming up, one list by start, its kind once (B8; plan 8R-9F, M1)', () => {
    const today = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
    const tonight = meetupAt(1, at('2026-10-13T22:00'));
    const saturday = meetupAt(2, at('2026-10-17T13:00'));
    const tomorrow = trainAt(3, at('2026-10-14T10:00'));
    // A max battle train's title says "Train" only: its kind is named before it, "Train" once
    // (review F9: `Max Battle <#post>` reads "Max Battle Train · …").
    const maxTrain = trainAt(5, at('2026-10-16T09:00'), 'dynamax');
    const giant = { ...trainAt(6, at('2026-10-16T12:00'), 'gigantamax'), copyUrl: POST };
    const elite = listed(
      setHatchTime(
        testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } }),
        at('2026-10-15T11:00'),
        rules,
        PARTY_NOW,
      ),
      'Elite egg · Lost',
      '300000000000000002',
    );
    const passing = { ...trainAt(4, at('2026-10-14T18:00')), copyUrl: POST };
    const message = renderSummary(
      [today, elite],
      PARTY_NOW,
      [tonight, saturday],
      [tomorrow, maxTrain],
      [],
      { passing: [passing, giant], zone: PARTY_ZONE },
    );
    expect(textDisplays(message)).toEqual([
      '### Today and coming up\n1 raid · 1 meetup today · 6 coming up',
      '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
      `**Meetups**\n${link(tonight)} · starts <t:${at('2026-10-13T22:00') / 1000}:R> · 1 trainer`,
      '**Coming up**\n' +
        [
          // The posts' titles say "Train · …" and "Meetup · …": the kind is not said again.
          `${link(tomorrow)} · ${dated(at('2026-10-14T10:00'))} · 1 trainer`,
          `Passing through · [Train · ${passing.party.timed.name}](<${POST}>) · ${dated(at('2026-10-14T18:00'))} · 1 trainer`,
          `Elite raid · <#300000000000000002> · ${dated(at('2026-10-15T11:00'))} · 1 trainer`,
          `Max Battle ${link(maxTrain)} · ${dated(at('2026-10-16T09:00'))} · 1 trainer`,
          `Passing through · Gigantamax [Train · ${giant.party.timed.name}](<${POST}>) · ${dated(at('2026-10-16T12:00'))} · 1 trainer`,
          `${link(saturday)} · ${dated(at('2026-10-17T13:00'))} · 1 trainer`,
        ].join('\n'),
    ]);
  });

  it('counts the stops in the head and links them below, last (plan 8R-9)', () => {
    const today = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
    const texts = textDisplays(
      renderSummary([today], PARTY_NOW, [meetupAt(1, at('2026-10-14T10:00'))], [], [], {
        stops: { url: POST, tasks: 4, hideouts: 2 },
        stopsBelow: true,
        zone: PARTY_ZONE,
      }),
    );
    expect(texts[0]).toBe(
      '### Today and coming up\n1 raid today · 1 coming up · 4 tasks · 2 hideouts',
    );
    expect(texts.at(-1)).toBe(`[Today’s Stops](<${POST}>) (below): 4 tasks · 2 hideouts`);
    // Elsewhere (`/status` in the region's channel) the stops are not below.
    expect(
      textDisplays(
        renderSummary([today], PARTY_NOW, [], [], [], {
          stops: { url: POST, tasks: 4, hideouts: 2 },
        }),
      ).at(-1),
    ).toBe(`[Today’s Stops](<${POST}>): 4 tasks · 2 hideouts`);
  });

  it('keeps Coming up within the message beside many raids, counting what does not fit', () => {
    const raids = Array.from({ length: 120 }, (_unused, n) =>
      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
    );
    const later = Array.from({ length: 60 }, (_unused, n) =>
      meetupAt(n, at('2026-10-15T10:00') + n * MINUTE),
    );
    const message = renderSummary(raids, PARTY_NOW, later, [], [], { zone: PARTY_ZONE });
    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
    const lines = linesUnder(message, '**Coming up**');
    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
    expect(lines.length).toBeGreaterThan(5);
    expectV2Sendable(message);
  });
});
