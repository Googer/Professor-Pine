import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, CAROL, PARTY_NOW, TEST_SPOT } from '../../test/support/parties.js';
import { reportedMax, reportedRaid } from '../../test/support/party-service.js';
import { partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import type { PartiesView } from '../domain/web/party-data.js';
import { PartyStatus } from '../domain/party/status.js';
import { PARTIES_PER_MINUTE } from './party-routes.js';

const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;

/** A raid at the Library in West's forum, a web server over it, Alice a member of the server. */
async function raidOnTheMap() {
  const made = await reportedRaid();
  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
  const web = webServerWith({ members, parties: partyWebWith(made) });
  // The web server's clock is the parties' (the raid is reported at `PARTY_NOW`).
  web.clock.now = PARTY_NOW;
  return { ...made, members, web };
}

describe('the parties of a server on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('are for members who are logged in: 401 without a session, 403 for anybody else', async () => {
    const made = await raidOnTheMap();
    web = made.web;
    const anonymous = await web.app.inject({ url: PARTIES });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: 'Log in first.' });
    const cookie = await web.loggedIn(BOB, 'Bob');
    const stranger = await web.app.inject({ url: PARTIES, headers: { cookie } });
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toEqual({ error: 'Not allowed.' });
  });

  it("are the member's view, private, with an ETag per view and 304 when unchanged", async () => {
    const made = await raidOnTheMap();
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await web.app.inject({ url: PARTIES, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^application\/json/);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<PartiesView>();
    expect(view.readOnly).toBe(false);
    expect(view.raids.map((raid) => [raid.id, raid.gymId, raid.tier])).toEqual([
      [made.party.id, 1, 'Level 5 raid'],
    ]);
    expect(view.raids[0]?.link).toBe(
      `https://discord.com/channels/${FAKE_GUILD_ID}/${made.postId}`,
    );
    expect(view.raids[0]?.attendance.mine).toBeNull();

    const etag = String(answer.headers.etag);
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{20,}"$/);
    const again = await web.app.inject({
      url: PARTIES,
      headers: { cookie, 'if-none-match': `W/${etag}` },
    });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');

    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
    const changed = await web.app.inject({
      url: PARTIES,
      headers: { cookie, 'if-none-match': etag },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<PartiesView>().raids[0]?.attendance.mine).toEqual({
      status: 'coming',
      group: 'A',
    });
    expect(changed.headers.etag).not.toBe(etag);
  });

  it("are for members with the map's member role or administrators, when the settings name one", async () => {
    const made = await reportedRaid();
    const members = new FakeMemberDirectory()
      .add(ALICE, 'Alice')
      .standing(ALICE, { roleNames: ['Trainer'], administrator: false })
      .add(BOB, 'Bob')
      .standing(BOB, { roleNames: ['verified'], administrator: false })
      .add(CAROL, 'Carol')
      .standing(CAROL, { roleNames: [], administrator: true });
    const map = webServerWith({
      members,
      parties: partyWebWith(made),
      web: { memberRole: 'Verified' },
    });
    web = map;
    map.clock.now = PARTY_NOW;
    const ask = async (userId: string, name: string) =>
      map.app.inject({ url: PARTIES, headers: { cookie: await map.loggedIn(userId, name) } });
    const unverified = await ask(ALICE, 'Alice');
    expect(unverified.statusCode).toBe(403);
    expect(unverified.json()).toEqual({ error: 'Not allowed.' });
    for (const [id, name] of [
      [BOB, 'Bob'],
      [CAROL, 'Carol'],
    ] as const) {
      const answer = await ask(id, name);
      expect(answer.statusCode, name).toBe(200);
      expect(answer.json<PartiesView>().raids.map((raid) => raid.id)).toEqual([made.party.id]);
    }
  });

  it('leave out the parties of a forum the member is kept out of', async () => {
    const made = await raidOnTheMap();
    web = made.web;
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const answer = await web.app.inject({ url: PARTIES, headers: { cookie } });
    expect(answer.json<PartiesView>().raids).toEqual([]);
  });

  it('are read-only while Discord cannot be reached, for a member it confirmed lately', async () => {
    const made = await raidOnTheMap();
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    await web.app.inject({ url: PARTIES, headers: { cookie } });
    made.members.failing = new Error('Discord is away');
    const answer = await web.app.inject({ url: PARTIES, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    const view = answer.json<PartiesView>();
    expect(view.readOnly).toBe(true);
    expect(view.raids[0]?.attendance.actions).toEqual([]);
    const other = await web.loggedIn(BOB, 'Bob');
    const unknown = await web.app.inject({ url: PARTIES, headers: { cookie: other } });
    expect(unknown.statusCode).toBe(503);
    expect(unknown.json()).toEqual({
      error: 'Discord cannot be reached just now, so I cannot tell whether you are a member.',
    });
  });

  // Plan 8X-5: max battles in a list of their own, which a page made before them never reads.
  it('show a max battle at its spot in a list of its own, beside the raids the page reads', async () => {
    const made = await reportedMax();
    const members = new FakeMemberDirectory().add(ALICE, 'Alice');
    web = webServerWith({ members, parties: partyWebWith(made) });
    web.clock.now = PARTY_NOW;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    const view = (await web.app.inject({ url: PARTIES, headers: { cookie } })).json<PartiesView>();
    expect([...view.raids, ...view.trains, ...view.meetups]).toEqual([]);
    expect(view.maxes).toMatchObject([
      {
        kind: 'max',
        id: made.party.id,
        spotId: TEST_SPOT.id,
        title: 'Dynamax Machamp (2★)',
        place: { name: 'Gazebo of the Park', address: '1 Park Lane' },
        link: `https://discord.com/channels/${FAKE_GUILD_ID}/${made.postId}`,
        attendance: { mine: null, remote: { offered: true, on: false } },
      },
    ]);
  });

  it('may be asked PARTIES_PER_MINUTE times a minute from one address', async () => {
    const made = await raidOnTheMap();
    web = made.web;
    const cookie = await web.loggedIn(ALICE, 'Alice');
    for (let n = 0; n < PARTIES_PER_MINUTE; n++) {
      expect((await web.app.inject({ url: PARTIES, headers: { cookie } })).statusCode).toBe(200);
    }
    const refused = await web.app.inject({ url: PARTIES, headers: { cookie } });
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBe('60');
  });
});
