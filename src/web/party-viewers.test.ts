import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { MembersClosingError } from './paced-members.js';
import { BARRED_FRESH_MS, MEMBER_SEEN_MS, PartyViewers } from './party-viewers.js';

const FORUMS = [WEST_FORUM, EAST_FORUM];

function viewersWith() {
  const gateway = new FakePartyGateway();
  gateway.addForum(WEST_FORUM);
  gateway.addForum(EAST_FORUM);
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const asked: string[] = [];
  const clock = { now: 1_000_000 };
  const { log, entries } = createTestLogger();
  const viewers = new PartyViewers({
    members,
    forums: {
      memberAccess: (forumId, memberId) => {
        asked.push(`${forumId}:${memberId}`);
        return gateway.memberAccess(forumId, memberId);
      },
    },
    log,
    now: () => clock.now,
  });
  return { gateway, members, asked, clock, viewers, entries };
}

describe('PartyViewers.askedMembership while the web server closes', () => {
  const closing = () => {
    const { log, entries } = createTestLogger();
    const clock = { now: 1_000_000 };
    let refused = false;
    const viewers = new PartyViewers({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      asks: {
        find: (_guild, userId) => {
          if (refused) return Promise.reject(new MembersClosingError());
          return Promise.resolve({ id: userId, name: 'Alice' });
        },
      },
      forums: { memberAccess: () => Promise.resolve(undefined) },
      log,
      now: () => clock.now,
    });
    return {
      viewers,
      entries,
      refuse: (): void => {
        refused = true;
      },
    };
  };

  it('is unconfirmed, without a warning, for somebody never seen', async () => {
    const { viewers, entries, refuse } = closing();
    refuse();
    expect(await viewers.askedMembership('100000000000000001', ALICE)).toEqual({
      kind: 'unconfirmed',
    });
    expect(entries.filter((entry) => entry.level === 40)).toEqual([]);
  });

  it('is unconfirmed, without a warning, for a member seen lately too', async () => {
    const { viewers, entries, refuse } = closing();
    await viewers.askedMembership('100000000000000001', ALICE);
    refuse();
    expect(await viewers.askedMembership('100000000000000001', ALICE)).toEqual({
      kind: 'unconfirmed',
    });
    expect(entries.filter((entry) => entry.level === 40)).toEqual([]);
  });
});

describe('PartyViewers', () => {
  it('lets a member of the server see every forum but those somebody keeps them out of', async () => {
    const { gateway, viewers } = viewersWith();
    gateway.shutOut(EAST_FORUM, ALICE);
    gateway.barred.set(WEST_FORUM, new Set([BOB]));
    // A forum she cannot see by her roles is shown (the map crosses region roles), and said
    // `hidden` (review W-7: no report to the moderators from it).
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
      kind: 'member',
      readOnly: false,
      barred: new Set(),
      hidden: new Set([EAST_FORUM]),
    });
    expect(await viewers.viewer(FAKE_GUILD_ID, BOB, FORUMS)).toEqual({
      kind: 'member',
      readOnly: false,
      barred: new Set([WEST_FORUM]),
      hidden: new Set(),
    });
  });

  it('shows nothing to somebody who is not a member', async () => {
    const { viewers, asked } = viewersWith();
    expect(await viewers.viewer(FAKE_GUILD_ID, '200000000000000009', FORUMS)).toEqual({
      kind: 'not-member',
    });
    expect(asked).toEqual([]);
  });

  it('asks Discord about a member and a forum once a minute, not at every request', async () => {
    const { viewers, asked, clock, gateway } = viewersWith();
    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
    expect(asked).toEqual([`${WEST_FORUM}:${ALICE}`, `${EAST_FORUM}:${ALICE}`]);
    gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    clock.now += BARRED_FRESH_MS;
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toMatchObject({
      barred: new Set([EAST_FORUM]),
    });
    expect(asked).toHaveLength(4);
  });

  it('is read-only while Discord cannot be reached, for a member seen lately, by what Discord said last', async () => {
    const { viewers, members, gateway, clock, entries } = viewersWith();
    gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
    members.failing = new Error('Discord is away');
    gateway.failing.set('memberAccess', new Error('Discord is away'));
    clock.now += BARRED_FRESH_MS;
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
      kind: 'member',
      readOnly: true,
      barred: new Set([EAST_FORUM]),
      hidden: new Set(),
    });
    expect(entries.some((entry) => entry.msg?.toString().includes('member'))).toBe(true);
    // Nobody else learns anything; nor does she once it is long ago.
    expect(await viewers.viewer(FAKE_GUILD_ID, BOB, FORUMS)).toEqual({ kind: 'unconfirmed' });
    clock.now += MEMBER_SEEN_MS;
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({ kind: 'unconfirmed' });
  });

  it('hides a forum Discord could not be asked about and has said nothing of lately', async () => {
    const { viewers, gateway } = viewersWith();
    gateway.failing.set('memberAccess', new Error('Discord is away'));
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
      kind: 'member',
      readOnly: true,
      barred: new Set(FORUMS),
      hidden: new Set(),
    });
  });

  it('asks Discord nothing more in a request once it failed, and warns once', async () => {
    const { viewers, gateway, asked, entries, clock, members } = viewersWith();
    const THIRD_FORUM = '100000000000000013';
    gateway.addForum(THIRD_FORUM);
    const three = [...FORUMS, THIRD_FORUM];
    gateway.barred.set(EAST_FORUM, new Set([ALICE]));
    await viewers.viewer(FAKE_GUILD_ID, ALICE, [EAST_FORUM]);
    clock.now += BARRED_FRESH_MS;
    asked.length = 0;
    const warnings = () => entries.filter((entry) => entry.level === 40).length;
    // The first forum fails: the others are not asked; what Discord said lately is used, and a
    // forum it said nothing of counts as barred.
    gateway.failing.set('memberAccess', new Error('Discord is away'));
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, three)).toEqual({
      kind: 'member',
      readOnly: true,
      barred: new Set(three),
      hidden: new Set(),
    });
    expect(asked).toEqual([`${WEST_FORUM}:${ALICE}`]);
    expect(warnings()).toBe(1);
    // Whether she is a member cannot be asked: no forum is asked about either.
    members.failing = new Error('Discord is away');
    asked.length = 0;
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, three)).toMatchObject({
      kind: 'member',
      readOnly: true,
    });
    expect(asked).toEqual([]);
    expect(warnings()).toBe(2);
  });

  it('forgets a member who left the server', async () => {
    const { viewers, members, clock } = viewersWith();
    await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS);
    members.remove(ALICE);
    clock.now += 60_000;
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({ kind: 'not-member' });
    members.failing = new Error('Discord is away');
    expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({ kind: 'unconfirmed' });
  });
});
