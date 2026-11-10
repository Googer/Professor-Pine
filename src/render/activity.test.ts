import { describe, expect, it } from 'vitest';
import { ALICE, testRaid, withAttendees } from '../../test/support/parties.js';
import type { Attendee, PartyProblem, RaidParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  archiveWarning,
  NO_POST_MADE,
  noPostWords,
  problemText,
  standing,
  standingLine,
  standingReply,
} from './activity.js';

const base: Attendee = { number: 1, status: PartyStatus.Coming, group: 'A', remote: false };
const one = testRaid();
const two: RaidParty = { ...one, groups: [{ id: 'A' }, { id: 'B', label: 'park side' }] };

describe('standing', () => {
  it('says the status in a word', () => {
    const word = (status: Attendee['status']) => standing(one, { ...base, status });
    expect(word(PartyStatus.Interested)).toBe('interested');
    expect(word(PartyStatus.Coming)).toBe('coming');
    expect(word(PartyStatus.Present)).toBe('here');
    expect(word(PartyStatus.CompletePending)).toBe('here');
    expect(word(PartyStatus.Complete)).toBe('done');
  });

  it('adds whom the member brings, the group when there are several, and remote', () => {
    expect(standing(one, { ...base, number: 3 })).toBe('coming with 2 more');
    expect(standing(one, { ...base, remote: true })).toBe('coming, remotely');
    expect(standing(two, { ...base, number: 2, group: 'B', remote: true })).toBe(
      'coming with 1 more, in group B (park side), remotely',
    );
    expect(standing(two, base)).toBe('coming, in group A');
  });

  it('says no more than "done" of somebody who is done', () => {
    const done = {
      ...base,
      status: PartyStatus.Complete,
      number: 3,
      group: 'B' as const,
      remote: true,
    };
    expect(standing(two, done)).toBe('done');
    expect(standing(two, done, { sayInPerson: true })).toBe('done');
  });

  it('says "in person" only when asked to, and never of a remote member', () => {
    expect(standing(one, base, { sayInPerson: true })).toBe('coming, in person');
    expect(standing(one, { ...base, remote: true }, { sayInPerson: true })).toBe(
      'coming, remotely',
    );
    expect(standingReply(one, base, { sayInPerson: true })).toBe('You are coming, in person.');
    expect(standingLine(one, ALICE, base, { sayInPerson: true })).toBe(
      `<@${ALICE}> is coming, in person.`,
    );
  });

  it('makes the private answer and the public line of it', () => {
    const party = withAttendees(one, { [ALICE]: { number: 2 } });
    const alice = party.attendees[ALICE];
    if (!alice) throw new Error('no Alice');
    expect(standingReply(party, alice)).toBe('You are coming with 1 more.');
    expect(standingLine(party, ALICE, alice)).toBe(`<@${ALICE}> is coming with 1 more.`);
  });
});

describe('problemText', () => {
  it('has a sentence for every reason', () => {
    const reasons: PartyProblem[] = [
      'not-attending',
      'no-such-group',
      'bad-count',
      'in-person-only',
      'too-many-groups',
      'not-pending',
      'label-too-long',
      'not-hatched',
      'no-boss',
      'bad-duration',
      'already-done',
      'gym-taken',
      'other-region',
      'not-a-move',
      'no-groups',
      'party-wide-start',
      'bad-name',
      'description-too-long',
      'end-before-start',
      'start-after-end',
    ];
    const texts = reasons.map((reason) => problemText(reason, { maxNumber: 21 }, 'raid'));
    for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(problemText('bad-count', { maxNumber: 21 }, 'raid')).toContain('from 1 to 21');
  });

  it('names the kind of party where any kind can give the reason', () => {
    const said = (reason: PartyProblem) => problemText(reason, { maxNumber: 21 }, 'meetup');
    expect(said('not-attending')).toBe('You are not signed up for this meetup.');
    expect(said('no-such-group')).toBe('This meetup has no such group.');
    expect(said('no-groups')).toBe('A meetup has no groups.');
    expect(said('party-wide-start')).toBe(
      'A meetup starts for everybody at once: its groups have no meeting times.',
    );
    expect(said('too-many-groups')).toBe('A meetup cannot have more than five groups.');
    expect(said('end-before-start')).toBe(
      'A meetup cannot end before it starts. Give a later end, or change the start first with `/meet`.',
    );
    expect(said('start-after-end')).toBe(
      'A meetup cannot start after it ends. Give an earlier start, or change the end first with `/end`.',
    );
    expect(said('bad-name')).toBe('Give a name of 1 to 80 characters.');
    expect(said('description-too-long')).toBe('That is too long: keep it to 1000 characters.');
    // For a raid it is the sentence it always was.
    expect(problemText('not-attending', { maxNumber: 21 }, 'raid')).toBe(
      'You are not signed up for this raid.',
    );
  });

  it('says that a raid stays where it was when its post in the other region could not be made', () => {
    expect(problemText('post-not-made', { maxNumber: 21 }, 'raid')).toBe(
      'I could not make the post in the other region: it was deleted while I was making it. ' +
        'The raid stays here; try again.',
    );
    expect(problemText('posts-refused', { maxNumber: 21 }, 'raid')).toBe(
      "I am not allowed to make posts in the other region's forum: the server's staff must " +
        'give me Manage Posts there (and View Channel, Create Posts and Send Messages in Posts). ' +
        'The raid stays here.',
    );
  });

  it('says how an Elite egg without its hatch time is reported (8E-1)', () => {
    expect(problemText('elite-egg-time', { maxNumber: 21 }, 'raid')).toBe(
      'An Elite egg needs its hatch time: once staff delete this egg, report it again with `/raid` and its hatch time.',
    );
  });

  it('says what a train refuses: its route, its moves, its conductor', () => {
    const said = (reason: PartyProblem) => problemText(reason, { maxNumber: 21 }, 'train');
    expect(said('not-attending')).toBe('You are not signed up for this train.');
    expect(said('party-wide-start')).toBe(
      'A train starts for everybody at once: its groups have no meeting times.',
    );
    expect(said('too-many-groups')).toBe('A train cannot have more than five groups.');
    expect(said('no-route')).toBe('This train has no route yet. Add its stops with `/route add`.');
    expect(said('route-finished')).toBe('This train has finished its route.');
    expect(said('at-first-stop')).toBe('This train is at its first stop.');
    expect(said('no-stop-to-skip')).toBe('There is no stop after the next one to skip to.');
    expect(said('already-on-route')).toBe('That stop is on the route already.');
    expect(said('route-full')).toBe('A route has at most 50 stops.');
    expect(said('no-such-stop')).toBe('The route has no stop with that number.');
    expect(said('empty-route')).toBe('That route has no stops.');
    expect(said('not-conductor')).toBe(
      'This train has a conductor: only they and the moderators can move it.',
    );
    expect(said('conductor-or-staff')).toBe(
      'Only the conductor of this train and the moderators can do that.',
    );
    expect(said('train-moved-on')).toBe('The train has moved on meanwhile.');
    expect(said('route-changed')).toBe(
      'The route changed meanwhile, so that button is out of date.',
    );
  });
});

describe('noPostWords', () => {
  const channel = (id: string) => `<#${id}>`;

  it('says the post went while it was being made, or what the bot lacks in the forum', () => {
    expect(noPostWords(undefined, channel)).toBe(NO_POST_MADE);
    expect(noPostWords({ forumId: '5', missing: ['Manage Posts'] }, channel)).toBe(
      'I am not allowed to make posts in <#5>: I lack the permission Manage Posts there. ' +
        "Nothing was made. The server's staff must give it to me.",
    );
    expect(
      noPostWords(
        { forumId: '5', missing: ['View Channel', 'Create Posts', 'Manage Posts'] },
        (id) => (id === '5' ? '#west-raids' : '?'),
      ),
    ).toBe(
      'I am not allowed to make posts in #west-raids: I lack the permissions View Channel, ' +
        "Create Posts and Manage Posts there. Nothing was made. The server's staff must give " +
        'them to me.',
    );
  });

  it('names every permission a post needs where Discord refused without the bot seeing why', () => {
    expect(noPostWords({ forumId: '5', missing: [] }, channel)).toBe(
      "Discord does not let me make posts in <#5>. Nothing was made. The server's staff must " +
        'check that I have View Channel, Create Posts, Send Messages in Posts and Manage Posts there.',
    );
  });
});

describe('archiveWarning', () => {
  const WHEN = 1_791_900_000_000;
  const archive = `I will archive this post <t:${WHEN / 1000}:R>; it stays readable afterwards.`;

  it('says that a raid is over, with or without an end time', () => {
    expect(archiveWarning({ type: 'raid', endTime: WHEN - 600_000 }, WHEN)).toBe(
      `This raid is over. ${archive}`,
    );
    expect(archiveWarning({ type: 'raid', endTime: null }, WHEN)).toBe(
      `This raid is over. ${archive}`,
    );
  });

  it('says that a meetup whose end time has passed is over', () => {
    expect(archiveWarning({ type: 'meetup', endTime: WHEN - 3_900_000 }, WHEN)).toBe(
      `This meetup is over. ${archive}`,
    );
  });

  it('tells a meetup without an end time how to stay open', () => {
    expect(archiveWarning({ type: 'meetup', endTime: null }, WHEN)).toBe(
      `This meetup has no end time, so I take it to be over. ${archive} ` +
        'A time set with `/meet` or `/end` keeps it open.',
    );
  });

  it('says the same of a train, in its own word', () => {
    expect(archiveWarning({ type: 'train', endTime: WHEN - 3_900_000 }, WHEN)).toBe(
      `This train is over. ${archive}`,
    );
    expect(archiveWarning({ type: 'train', endTime: null }, WHEN)).toBe(
      `This train has no end time, so I take it to be over. ${archive} ` +
        'A time set with `/meet` or `/end` keeps it open.',
    );
  });
});
