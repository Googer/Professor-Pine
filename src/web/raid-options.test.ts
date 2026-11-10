import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { createTestContext } from '../../test/support/test-context.js';
import { raidWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
import type { RaidOptionsView } from '../domain/web/raid-options-data.js';
import { raidOptions } from '../commands/raids/raid-options.js';

const OPTIONS = `/s/${FAKE_GUILD_ID}/api/raid-options`;

describe('the pick lists of a raid report (raidOptions)', () => {
  it("lists the current bosses in the boss list's order, then an egg of every tier, as /raid offers them, the tiers in the posts' words", () => {
    const bosses = raidBossesFixture().bosses();
    const view = raidOptions(bosses, 'America/New_York');
    expect(view.zone).toBe('America/New_York');
    expect(view.bosses.map((boss) => boss.value)).toEqual(
      bosses.map((boss) => `b:${boss.key}:${boss.tier.level}:${boss.tier.shadow ? '1' : '0'}`),
    );
    expect(view.bosses).toContainEqual({
      value: 'b:yveltal:T5:0',
      name: 'Yveltal',
      tier: 'Level 5 raid',
    });
    expect(view.eggs[0]).toEqual({ value: 'e:T1:0', tier: 'Level 1 raid' });
    expect(view.eggs.map((egg) => egg.tier)).toContain('Shadow Level 5 raid');
    expect(view.eggs.map((egg) => egg.tier)).toContain('Elite raid');
    // Nothing of gyms: the elite raid gym mark is not shown to members.
    expect(JSON.stringify(view)).not.toMatch(/gym/i);
  });
});

describe('GET /s/<guild>/api/raid-options', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  function serve() {
    const { ctx } = createTestContext();
    web = webServerWith({
      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
      raids: raidWebWith(ctx),
    });
    return web;
  }

  it('answers a member with the pick lists, kept by an ETag', async () => {
    const served = serve();
    const cookie = await served.loggedIn(ALICE, 'Alice');
    const answer = await served.app.inject({ url: OPTIONS, headers: { cookie } });
    expect(answer.statusCode).toBe(200);
    expect(answer.headers['cache-control']).toBe('private, no-cache');
    const view = answer.json<RaidOptionsView>();
    expect(view.bosses.length).toBeGreaterThan(0);
    const etag = String(answer.headers.etag);
    const again = await served.app.inject({
      url: OPTIONS,
      headers: { cookie, 'if-none-match': etag },
    });
    expect(again.statusCode).toBe(304);
  });

  it('is for members only: 401 without a login, 403 for somebody who is not a member', async () => {
    const served = serve();
    expect((await served.app.inject({ url: OPTIONS })).statusCode).toBe(401);
    const cookie = await served.loggedIn(BOB, 'Bob');
    expect((await served.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(403);
  });
});
