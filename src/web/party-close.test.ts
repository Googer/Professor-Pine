import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  partyWebWith,
  postWebWith,
  TEST_OWNER_ID,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { CLOSE_KIND, CLOSE_THROTTLE } from '../commands/parties/delete.js';
import { controlThrottleKey } from '../discord/router.js';
import { Throttles } from '../discord/throttle.js';
import type { PartiesView, PressAnswer } from '../domain/web/party-data.js';
import { DELETE_NEEDS_MANAGE_MESSAGES } from './acting.js';

/**
 * A hatched raid on the map, with staff's Delete…: the bot's owner and Bob, a moderator by role,
 * are staff; Alice a member who is not.
 */
async function closing(throttles = new Throttles()) {
  const made = await reportedRaid({ boss: { key: 'yveltal' } });
  // The forum's name as the bot sees the channel.
  made.gateway.channelNames.set(WEST_FORUM, 'west-raids');
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const moderator = {
    roleNames: ['Moderator'],
    roleIds: [],
    administrator: false,
    manageMessages: true,
  };
  const noManaging = { roleNames: ['Moderator'], roleIds: [], administrator: false };
  const members = new FakeMemberDirectory()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(CAROL, 'Carol')
    .add(TEST_OWNER_ID, 'Owner')
    .standing(BOB, moderator)
    .standing(CAROL, noManaging);
  const acting = new FakeActingMembers()
    .add(ALICE, 'Alice')
    .add(BOB, 'Bob')
    .add(CAROL, 'Carol')
    .add(TEST_OWNER_ID, 'Owner')
    .standing(BOB, moderator)
    .standing(CAROL, noManaging);
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    posts: postWebWith(ctx),
  });
  web.clock.now = PARTY_NOW;
  const id = made.party.id;
  const close = async (body: unknown, userId = BOB, name = 'Bob') => {
    const answer = await web.app.inject({
      method: 'POST',
      url: `/s/${FAKE_GUILD_ID}/api/parties/${id}/close`,
      headers: { ...(await web.posting(userId, name)), 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
  };
  const listed = async (userId: string, name: string) => {
    const answer = await web.app.inject({
      url: `/s/${FAKE_GUILD_ID}/api/parties`,
      headers: { cookie: await web.loggedIn(userId, name) },
    });
    return answer.json<PartiesView>();
  };
  return { made, id, web, close, listed, throttles, acting };
}

describe("staff's Delete… on the map (plan 8M-8B)", () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  describe('Manage Messages as well as a staff role (plan 8Z)', () => {
    it('neither offers Delete… to a moderator without it, nor takes their Delete…', async () => {
      const map = await closing();
      web = map.web;
      expect((await map.listed(CAROL, 'Carol')).raids[0]).not.toHaveProperty('close');
      expect(await map.close({ removal: 'archive' }, CAROL, 'Carol')).toEqual({
        status: 403,
        json: { error: DELETE_NEEDS_MANAGE_MESSAGES },
      });
      expect(map.made.store.get(map.id)).toBeDefined();
      // Uncounted, as any Delete… a member may not press.
      for (let use = 0; use < CLOSE_THROTTLE.uses; use += 1) {
        expect(
          map.throttles.use(controlThrottleKey(CLOSE_KIND), CAROL, CLOSE_THROTTLE, PARTY_NOW),
        ).toBeUndefined();
      }
    });

    it('holds the bot owner to nothing, as the guards do', async () => {
      const map = await closing();
      web = map.web;
      expect((await map.listed(TEST_OWNER_ID, 'Owner')).raids[0]?.close).toBeDefined();
      const done = await map.close({ removal: 'archive' }, TEST_OWNER_ID, 'Owner');
      expect(done.status).toBe(200);
    });

    it('decides by the member as they are now, not by the kept view', async () => {
      const map = await closing();
      web = map.web;
      // A moderator by role in the list a minute ago, without the permission since.
      map.acting.standing(BOB, { roleNames: ['Moderator'], roleIds: [], administrator: false });
      const refused = await map.close({ removal: 'archive' });
      expect(refused.status).toBe(403);
      expect(map.made.store.get(map.id)).toBeDefined();
    });
  });

  it('offers Delete… to staff alone, saying whether the bot may delete the post, its forum named', async () => {
    const map = await closing();
    web = map.web;
    const staff = await map.listed(BOB, 'Bob');
    // The party in the dialog's words as the domain names it (review W-4).
    expect(staff.raids[0]?.close).toEqual({ mayDelete: true, forum: '#west-raids', word: 'raid' });
    map.made.gateway.noManaging.add(WEST_FORUM);
    expect((await map.listed(TEST_OWNER_ID, 'Owner')).raids[0]?.close).toEqual({
      mayDelete: false,
      forum: '#west-raids',
      word: 'raid',
    });
    const member = await map.listed(ALICE, 'Alice');
    expect(member.raids[0]).not.toHaveProperty('close');
  });

  it("closes the raid as /delete's dialog does: the post's last words name the moderator, the answer /delete's", async () => {
    const map = await closing();
    web = map.web;
    const answer = await map.close({ removal: 'archive' });
    expect(answer).toEqual({
      status: 200,
      json: {
        ok: true,
        text: 'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
      },
    });
    expect(map.made.store.get(map.id)).toBeUndefined();
    expect(map.made.said().join('\n')).toContain(`This raid was closed by **Bob** (<@${BOB}>).`);
    expect(map.web.entries).toContainEqual(
      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'close' }),
    );
  });

  it("deletes the post where chosen, and refuses Delete where the bot may not delete there, in /delete's words", async () => {
    const map = await closing();
    web = map.web;
    map.made.gateway.noManaging.add(WEST_FORUM);
    const refused = await map.close({ removal: 'delete' });
    expect(refused).toEqual({
      status: 422,
      json: {
        ok: false,
        text: "I can't delete posts in #west-raids (Manage Threads is missing there). Archive it, or delete it yourself.",
      },
    });
    expect(map.made.store.get(map.id)).toBeDefined();
    map.made.gateway.noManaging.delete(WEST_FORUM);
    const deleted = await map.close({ removal: 'delete' });
    expect(deleted.json).toEqual({
      ok: true,
      text: 'This raid is closed: its gym is free for a new report, and I am deleting its post.',
    });
  });

  it('refuses a member who is not staff, before anything is counted', async () => {
    const map = await closing();
    web = map.web;
    const refused = await map.close({ removal: 'archive' }, ALICE, 'Alice');
    expect(refused).toEqual({
      status: 403,
      json: {
        error: 'Only admins and moderators with the Manage Messages permission can do that.',
      },
    });
    expect(map.throttles.size).toBe(0);
    expect(map.made.store.get(map.id)).toBeDefined();
    expect((await map.close({ removal: 'everything' })).status).toBe(400);
  });

  it("counts in the window of /delete's dialog", async () => {
    const throttles = new Throttles();
    for (let n = 0; n < CLOSE_THROTTLE.uses; n++) {
      throttles.use(controlThrottleKey(CLOSE_KIND), BOB, CLOSE_THROTTLE, PARTY_NOW);
    }
    const map = await closing(throttles);
    web = map.web;
    expect((await map.close({ removal: 'archive' })).status).toBe(429);
    expect(map.made.store.get(map.id)).toBeDefined();
  });

  it('answers a party that has ended: "This has ended."', async () => {
    const map = await closing();
    web = map.web;
    await map.made.service.end(map.id);
    expect(await map.close({ removal: 'archive' })).toEqual({
      status: 409,
      json: { ok: false, text: 'This has ended.' },
    });
  });
});
