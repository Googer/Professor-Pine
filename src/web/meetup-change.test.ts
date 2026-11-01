import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_SHOWN_MS } from './post-drawn.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, at, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { createdMeetup } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  meetupWebWith,
  partyWebWith,
  TEST_OWNER_ID,
  webServerWith,
  type TestWeb,
  RecordingDraws,
} from '../../test/support/web.js';
import { START_THROTTLE } from '../commands/parties/timed.js';
import { CHANGE_THROTTLE } from '../commands/raids/change.js';
import { variedThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import { PartyStatus } from '../domain/party/status.js';
import type { MeetupAnswer } from '../domain/web/meetup-data.js';
import { NOT_YOURS } from './meetup-routes.js';

const START = at('2026-10-13T18:00');
const END = at('2026-10-13T20:00');

/**
 * A meetup made by Alice (signed up, as its maker is), starting at six, with information, on the
 * map: Alice, Bob (not signed up), Carol (signed up) and the bot's owner (staff) members of the
 * server, fetched fresh. The web server's clock is the parties' own.
 */
async function changing(options: { throttles?: Throttles } = {}) {
  const made = await createdMeetup({
    name: 'Picnic',
    creatorId: ALICE,
    creator: { name: 'Alice' },
    startTime: START,
    description: 'Bring snacks.',
  });
  await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
  await made.attendance.flush();
  const throttles = options.throttles ?? new Throttles();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
  });
  const members = new FakeMemberDirectory()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(CAROL, 'Carol')
    .add(TEST_OWNER_ID, 'Owner');
  const acting = new FakeActingMembers()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(CAROL, 'Carol')
    .add(TEST_OWNER_ID, 'Owner');
  const drawn = new RecordingDraws(made.store);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles, drawn }),
    meetups: meetupWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const headers = await web.posting(ALICE, 'Alice');
  const change = async (what: string, body: unknown, sent = headers, partyId = made.party.id) => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `/s/${FAKE_GUILD_ID}/api/meetups/${partyId}/${what}`,
      headers: { ...sent, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return {
      status: answer.statusCode,
      json: answer.json<MeetupAnswer & { error?: string }>(),
      headers: answer.headers,
    };
  };
  return { made, web, members, acting, headers, change, throttles, drawn };
}

describe('changing a meetup on the map', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it('renames it as /name does, in its words, the line in the post naming who did, the meetup as it is now', async () => {
    const map = await changing();
    web = map.web;
    const answer = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
    expect(answer.status).toBe(200);
    expect(answer.json).toMatchObject({
      ok: true,
      text: 'This meetup is now called Park picnic.',
      meetup: { kind: 'meetup', name: 'Park picnic' },
    });
    expect(map.made.current().timed.name).toBe('Park picnic');
    await map.made.attendance.flush();
    expect(map.made.said().join('\n')).toContain('renamed this meetup: **Park picnic**.');
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a meetup was changed on the map',
        user: ALICE,
        guild: FAKE_GUILD_ID,
        party: map.made.party.id,
        change: 'name',
        outcome: 'ok',
      }),
    );
  });

  it('sets and removes the information as /info does', async () => {
    const map = await changing();
    web = map.web;
    const set = await map.change('info', { drawn: 'Bring snacks.', info: 'Bring tea.\nAnd cups.' });
    expect(set.json).toMatchObject({
      ok: true,
      text: 'The post of this meetup shows what you wrote, under "Meeting Information".',
    });
    expect(map.made.current().meetup.description).toBe('Bring tea.\nAnd cups.');
    const cleared = await map.change('info', { drawn: 'Bring tea.\nAnd cups.', info: '  ' });
    expect(cleared.json.text).toBe('The post of this meetup has no information any more.');
    expect(map.made.current().meetup.description).toBeNull();
  });

  it('sets the start as /meet reads and sets it, and the others are told', async () => {
    const map = await changing();
    web = map.web;
    const answer = await map.change('start', { drawn: START, time: '7pm' });
    expect(answer.status).toBe(200);
    expect(answer.json.text).toBe(
      'This meetup starts at 7:00 PM (in 5 hours). I am telling the others.',
    );
    expect(map.made.current().timed.startTime).toBe(at('2026-10-13T19:00'));
    await map.made.timed.flush();
    expect(map.made.said().at(-1)).toContain(`<@${CAROL}>`);
  });

  it('sets and removes the end as /end does, and refuses a time it cannot read in its words', async () => {
    const map = await changing();
    web = map.web;
    const set = await map.change('end', { drawn: null, time: '8pm' });
    expect(set.status).toBe(200);
    expect(map.made.current().endTime).toBe(END);
    const unread = await map.change('end', { drawn: END, time: 'later' });
    expect(unread.status).toBe(422);
    expect(unread.json).toMatchObject({ ok: false, meetup: { endTime: END } });
    expect(unread.json.text).toContain('I could not read "later" as the time the meetup ends.');
    const removed = await map.change('end', { drawn: END, time: 'none' });
    expect(removed.json.text).toBe('This meetup has no end time any more.');
  });

  it('refuses a change drawn from what the meetup no longer is, with the meetup as it is now, uncounted', async () => {
    const throttles = new Throttles();
    const map = await changing({ throttles });
    web = map.web;
    await map.made.timed.setName(map.made.party.id, { id: CAROL }, 'Lake picnic');
    const stale = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
    expect(stale.status).toBe(409);
    expect(stale.json).toEqual({
      ok: false,
      text: 'This meetup changed meanwhile: here it is as it is now.',
      meetup: expect.objectContaining({ name: 'Lake picnic' }) as unknown,
    });
    expect((await map.change('start', { drawn: null, time: '7pm' })).status).toBe(409);
    expect((await map.change('info', { drawn: null, info: 'x' })).status).toBe(409);
    expect((await map.change('end', { drawn: END, time: '9pm' })).status).toBe(409);
    expect(map.made.current().timed.name).toBe('Lake picnic');
    for (let use = 0; use < CHANGE_THROTTLE.uses; use += 1) {
      expect(throttles.use('name', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
    }
  });

  it('refuses inside the store a change that another one overtook after the checks, with the meetup as it is now', async () => {
    const map = await changing();
    web = map.web;
    // The forum is asked about before the change is checked and made: Carol's rename is on its
    // way into the store meanwhile, ahead of Alice's.
    const { gateway, timed } = map.made;
    const access = gateway.memberAccess.bind(gateway);
    let overtaken: Promise<unknown> | undefined;
    gateway.memberAccess = (forumId, memberId) => {
      overtaken ??= timed.setName(map.made.party.id, { id: CAROL }, 'Lake picnic');
      return access(forumId, memberId);
    };
    const stale = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
    await overtaken;
    expect(stale.status).toBe(409);
    expect(stale.json).toEqual({
      ok: false,
      text: 'This meetup changed meanwhile: here it is as it is now.',
      meetup: expect.objectContaining({ name: 'Lake picnic' }) as unknown,
    });
    expect(map.made.current().timed.name).toBe('Lake picnic');
  });

  it('lets its maker and staff change it here, nobody else; a start only as /meet allows it, signed up', async () => {
    const map = await changing();
    web = map.web;
    const bob = await map.change(
      'name',
      { drawn: 'Picnic', name: 'Mine' },
      await map.web.posting(BOB, 'Bob'),
    );
    expect(bob).toMatchObject({ status: 403, json: { ok: false, text: NOT_YOURS } });
    // Carol is signed up, but did not make it.
    const carol = await map.web.posting(CAROL, 'Carol');
    expect((await map.change('info', { drawn: 'Bring snacks.', info: 'x' }, carol)).status).toBe(
      403,
    );
    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
    expect(
      (await map.change('name', { drawn: 'Picnic', name: 'Staff picnic' }, owner)).status,
    ).toBe(200);
    const start = await map.change('start', { drawn: START, time: '7pm' }, owner);
    expect(start).toMatchObject({
      status: 403,
      json: { ok: false, text: 'You are not signed up for this meetup.' },
    });
    expect(map.made.current().timed).toMatchObject({ name: 'Staff picnic', startTime: START });
  });

  it("counts each change in its command's own window, a start in that of /meet in a meetup", async () => {
    const throttles = new Throttles();
    for (let use = 0; use < START_THROTTLE.uses; use += 1) {
      throttles.use(variedThrottleKey('meet', START_THROTTLE), ALICE, START_THROTTLE, PARTY_NOW);
    }
    for (let use = 0; use < CHANGE_THROTTLE.uses; use += 1) {
      throttles.use('name', ALICE, CHANGE_THROTTLE, PARTY_NOW);
    }
    const map = await changing({ throttles });
    web = map.web;
    const start = await map.change('start', { drawn: START, time: '7pm' });
    expect(start.status).toBe(429);
    expect(start.json.error).toMatch(/^You can do that again in /u);
    const name = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
    expect(name.status).toBe(429);
    expect(name.json.error).toMatch(/^You can do that again in /u);
    // Another window.
    expect((await map.change('end', { drawn: null, time: '8pm' })).status).toBe(200);
  });

  describe('both times in one request (POST …/times)', () => {
    const SEVEN = at('2026-10-13T19:00');
    /** A meetup from six to seven; `times` asks for both, drawn from what it has now. */
    const sixToSeven = async (throttles = new Throttles()) => {
      const map = await changing({ throttles });
      web = map.web;
      await map.change('end', { drawn: null, time: '7pm' });
      expect(map.made.current().endTime).toBe(SEVEN);
      const times = (start: string, end: string, sent = map.headers) => {
        const now = map.made.current();
        return map.change(
          'times',
          {
            start: { drawn: now.timed.startTime, time: start },
            end: { drawn: now.endTime, time: end },
          },
          sent,
        );
      };
      return { ...map, times };
    };
    const meetWindow = variedThrottleKey('meet', START_THROTTLE);

    it('moves both later: the end first, as the start would be refused against it', async () => {
      const map = await sixToSeven();
      const answer = await map.times('8pm', '9pm');
      expect(answer.status).toBe(200);
      expect(answer.json.ok).toBe(true);
      // Said start first all the same (staging of 2026-10-30).
      expect(answer.json.text).toMatch(/^This meetup starts at .* This meetup ends at /u);
      expect(map.made.current().timed.startTime).toBe(at('2026-10-13T20:00'));
      expect(map.made.current().endTime).toBe(at('2026-10-13T21:00'));
      expect(answer.json.meetup?.startTime).toBe(at('2026-10-13T20:00'));
    });

    it('moves both earlier: the start first', async () => {
      const map = await sixToSeven();
      const answer = await map.times('4pm', '5pm');
      expect(answer.status).toBe(200);
      expect(answer.json.text).toMatch(/^This meetup starts at .* This meetup ends at /u);
      expect(map.made.current().timed.startTime).toBe(at('2026-10-13T16:00'));
      expect(map.made.current().endTime).toBe(at('2026-10-13T17:00'));
    });

    it('reads the end from the start asked, across days', async () => {
      const map = await sixToSeven();
      const answer = await map.times('10-31 8pm', '9pm');
      expect(answer.status).toBe(200);
      expect(map.made.current().timed.startTime).toBe(at('2026-10-31T20:00'));
      expect(map.made.current().endTime).toBe(at('2026-10-31T21:00'));
    });

    it('refuses an unreadable start with a good end: nothing changed, nothing counted', async () => {
      const throttles = new Throttles();
      const map = await sixToSeven(throttles);
      const answer = await map.times('whenever', '9pm');
      expect(answer.status).toBe(422);
      expect(answer.json.text).toContain('I could not read "whenever"');
      expect(map.made.current().endTime).toBe(SEVEN);
      expect(map.made.current().timed.startTime).toBe(START);
      for (let use = 0; use < START_THROTTLE.uses; use += 1) {
        expect(throttles.use(meetWindow, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
    });

    it('refuses an impossible pair: nothing changed, nothing counted', async () => {
      const throttles = new Throttles();
      const map = await sixToSeven(throttles);
      for (const [start, end] of [
        ['8pm', '7:30pm'],
        ['8pm', '8pm'],
      ] as const) {
        const answer = await map.times(start, end);
        expect(answer.status).toBe(422);
        expect(map.made.current().endTime).toBe(SEVEN);
        expect(map.made.current().timed.startTime).toBe(START);
      }
      for (let use = 0; use < START_THROTTLE.uses; use += 1) {
        expect(throttles.use(meetWindow, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
      // One /end before them: the rest of its window is left.
      for (let use = 0; use < CHANGE_THROTTLE.uses - 1; use += 1) {
        expect(throttles.use('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
    });

    it('costs one use of /meet per move, and refuses a fourth with nothing changed', async () => {
      const throttles = new Throttles();
      const map = await sixToSeven(throttles);
      expect((await map.times('8pm', '9pm')).status).toBe(200);
      expect((await map.times('10pm', '11pm')).status).toBe(200);
      // Two moves within three minutes: one of the three left.
      expect(throttles.use(meetWindow, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
      expect(throttles.wait(meetWindow, ALICE, START_THROTTLE, PARTY_NOW)).toBeDefined();
      const over = await map.times('9pm', '10pm');
      expect(over.status).toBe(429);
      expect(map.made.current().timed.startTime).toBe(at('2026-10-13T22:00'));
      // Its end's use was not spent: three before it (the first end, two moves).
      for (let use = 0; use < CHANGE_THROTTLE.uses - 3; use += 1) {
        expect(throttles.use('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
      expect(throttles.wait('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeDefined();
    });

    it('gives back the start when the /end window is full, and spends nothing', async () => {
      const throttles = new Throttles();
      const map = await sixToSeven(throttles);
      for (let use = 0; use < CHANGE_THROTTLE.uses - 1; use += 1) {
        throttles.use('end', ALICE, CHANGE_THROTTLE, PARTY_NOW);
      }
      expect((await map.times('8pm', '9pm')).status).toBe(429);
      for (let use = 0; use < START_THROTTLE.uses; use += 1) {
        expect(throttles.use(meetWindow, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
    });

    it('says which went, and gives back only the use of the time refused', async () => {
      const throttles = new Throttles();
      const map = await sixToSeven(throttles);
      vi.spyOn(map.made.timed, 'setStartTime').mockResolvedValueOnce({
        kind: 'refused',
        reason: 'start-after-end',
      });
      const answer = await map.times('8pm', '9pm');
      expect(answer.status).toBe(422);
      expect(answer.json.went).toEqual(['end']);
      expect(answer.json.text).toMatch(/^This meetup ends at /u);
      expect(map.made.current().endTime).toBe(at('2026-10-13T21:00'));
      for (let use = 0; use < START_THROTTLE.uses; use += 1) {
        expect(throttles.use(meetWindow, ALICE, START_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
      for (let use = 0; use < CHANGE_THROTTLE.uses - 2; use += 1) {
        expect(throttles.use('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
      }
      expect(throttles.wait('end', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeDefined();
    });

    it('guards as the other changes: stale, not signed up, a stranger, malformed, over', async () => {
      const map = await sixToSeven();
      const stale = await map.change('times', {
        start: { drawn: START + 60_000, time: '8pm' },
        end: { drawn: SEVEN, time: '9pm' },
      });
      expect(stale.status).toBe(409);
      expect(stale.json.meetup?.startTime).toBe(START);
      const staff = await map.web.posting(TEST_OWNER_ID, 'Owner');
      expect((await map.times('8pm', '9pm', staff)).status).toBe(403);
      const bob = await map.web.posting(BOB, 'Bob');
      expect((await map.times('8pm', '9pm', bob)).json.text).toBe(NOT_YOURS);
      expect(map.made.current().endTime).toBe(SEVEN);
      const extra = {
        start: { drawn: START, time: '8pm' },
        end: { drawn: SEVEN, time: '9pm' },
        x: 1,
      };
      expect((await map.change('times', extra)).status).toBe(400);
      expect((await map.change('times', { start: { drawn: START, time: '8pm' } })).status).toBe(
        400,
      );
      expect(
        (
          await map.change(
            'times',
            { start: { drawn: START, time: '8pm' }, end: { drawn: SEVEN, time: '9pm' } },
            map.headers,
            'no-such-meetup',
          )
        ).status,
      ).toBe(409);
    });
  });

  it('gives the use back when a change fails for no fault of the member, as /name does', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < CHANGE_THROTTLE.uses - 1; n++) {
      throttles.use('name', ALICE, CHANGE_THROTTLE, PARTY_NOW);
    }
    const map = await changing({ throttles });
    web = map.web;
    const update = vi
      .spyOn(map.made.store, 'update')
      .mockRejectedValue(new Error('the database is away'));
    expect((await map.change('name', { drawn: 'Picnic', name: 'Park picnic' })).status).toBe(500);
    update.mockRestore();
    expect((await map.change('name', { drawn: 'Picnic', name: 'Park picnic' })).status).toBe(200);
  });

  it('answers a meetup that is over or no meetup of this server as over, an unknown change 404, a malformed body 400, a barred member 403', async () => {
    const map = await changing();
    web = map.web;
    expect((await map.change('place', { drawn: null })).status).toBe(404);
    expect((await map.change('name', { name: 'x' })).status).toBe(400);
    // A raid of the same store and server: no meetup.
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('the invented gyms have no gym 1');
    const raid = await map.made.service.reportRaid({
      gym,
      reporterId: CAROL,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error(`the raid was not created: ${raid.kind}`);
    expect(map.made.store.get(raid.party.id)?.status).toBe('active');
    const notMeetup = await map.change(
      'name',
      { drawn: 'x', name: 'y' },
      map.headers,
      raid.party.id,
    );
    expect(notMeetup).toMatchObject({
      status: 409,
      json: { ok: false, text: 'This meetup is over.' },
    });
    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    expect((await map.change('name', { drawn: 'Picnic', name: 'x' })).status).toBe(403);
    map.made.gateway.barred.clear();
    await map.made.service.end(map.made.party.id);
    const over = await map.change('name', { drawn: 'Picnic', name: 'x' });
    expect(over).toEqual({
      status: 409,
      json: { ok: false, text: 'This meetup is over.' },
      headers: expect.anything() as unknown,
    });
  });
  it("answers a meetup's change once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
    const map = await changing();
    web = map.web;
    const id = map.made.party.id;
    const before = map.made.store.get(id);
    const answer = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
    expect(answer.status).toBe(200);
    // Review fix R1: the ticket taken once the change returned, the party with it.
    expect(map.drawn.waits).toEqual([
      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
    ]);
    expect(map.made.store.get(id)).not.toBe(before);
  });
});
