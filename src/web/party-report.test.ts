import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { reportedMeetup } from '../../test/support/reports-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import {
  FakeActingMembers,
  partyWebWith,
  postWebWith,
  webServerWith,
  type TestWeb,
} from '../../test/support/web.js';
import { REPORT_COMMAND, REPORT_THROTTLE } from '../commands/parties/report.js';
import { Throttles } from '../discord/throttle.js';
import type { MapReport, PartiesView, PressAnswer } from '../domain/web/party-data.js';
import { BARRED_FRESH_MS } from './party-viewers.js';
import type { PostWebContext } from './post-control-routes.js';

const STAFF_ROLE = '300000000000000009';

/**
 * A party on the map that members report to the moderators: Alice's meetup at the Little Free
 * Library, with the moderators' channel (`reportedMeetup`), or `made` with its own context; Alice
 * and Bob members of the server, the web server's clock the parties' own.
 */
function reporting(
  made: Awaited<ReturnType<typeof reportedMeetup>> | Awaited<ReturnType<typeof reportedRaid>>,
  ctx: PostWebContext,
  throttles = new Throttles(),
) {
  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
  const web = webServerWith({
    members,
    parties: partyWebWith(made, { acting, throttles }),
    posts: postWebWith(ctx, { staffRoles: () => [STAFF_ROLE] }),
    // The server's moderators' channel (plan 19A-1), as the services of `made` have it.
    serverSettings: made.servers,
  });
  web.clock.now = PARTY_NOW;
  const url = `/s/${FAKE_GUILD_ID}/api/parties/${made.party.id}/report`;
  const open = async (userId = BOB, name = 'Bob') => {
    const answer = await web.app.inject({
      url,
      headers: { cookie: await web.loggedIn(userId, name) },
    });
    return { status: answer.statusCode, json: answer.json<MapReport & { error?: string }>() };
  };
  const send = async (body: unknown, userId = BOB, name = 'Bob') => {
    const answer = await web.app.inject({
      method: 'POST',
      url,
      headers: { ...(await web.posting(userId, name)), 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
  };
  return { web, open, send, throttles };
}

/** A meetup reported to the moderators' channel. */
async function meetup(throttles?: Throttles) {
  const made = await reportedMeetup();
  const ctx = { partyService: made.service, reports: made.reports };
  return { made, ...reporting(made, ctx, throttles) };
}

describe('reporting a party to the moderators on the map (plan 8M-8B)', () => {
  let web: TestWeb | undefined;
  afterEach(async () => {
    await web?.app.close();
    web = undefined;
  });

  it("opens the report's form with /report's words", async () => {
    const map = await meetup();
    web = map.web;
    expect(await map.open()).toEqual({
      status: 200,
      json: {
        title: 'Report this meetup to the moderators',
        label: 'What is wrong?',
        placeholder: 'Only the moderators read this.',
        maxLength: 1000,
      },
    });
  });

  it("sends the reason to the moderators' channel as /report does, and refuses a second one", async () => {
    const map = await meetup();
    web = map.web;
    const sent = await map.send({ reason: 'It is somebody’s front yard.' });
    expect(sent).toEqual({ status: 200, json: { ok: true, text: 'Sent to the moderators.' } });
    await map.made.reports.flush();
    const post = map.made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message;
    expect(JSON.stringify(post)).toContain('somebody’s front yard');
    expect(JSON.stringify(post)).toContain('Bob');
    // Asked before the form opens, as /report asks it (`refuseReportedBefore`).
    expect(await map.open()).toEqual({
      status: 422,
      json: { error: 'You already reported this.' },
    });
    // An answer, as the form's Submit says it (not a refusal).
    expect((await map.send({ reason: 'Again.' })).json).toEqual({
      ok: true,
      text: 'You already reported this.',
    });
  });

  // Plan 19A-1: never in the open, on the map as on Discord.
  it("refuses a report where there is no moderators' channel, and puts nothing into the post", async () => {
    const made = await reportedRaid();
    const { ctx } = createTestContext({
      partyService: made.service,
      attendance: made.attendance,
      parties: made.store,
      regions: made.regions,
    });
    const map = reporting(made, ctx);
    web = map.web;
    const before = made.said().length;
    const opened = await map.open();
    expect(opened.status).toBe(422);
    expect(opened.json).toEqual({
      error:
        "This server's staff have not set a moderators' channel, so reports cannot be sent here.",
    });
    const sent = await map.send({ reason: 'A duplicate of the other raid here.' });
    expect(sent.json).toEqual({
      ok: false,
      text: "This server's staff have not set a moderators' channel, so reports cannot be sent here.",
    });
    await made.service.flush();
    expect(made.said()).toHaveLength(before);
  });

  it("refuses a reason of white space alone in /report's words, counting nothing", async () => {
    const map = await meetup();
    web = map.web;
    expect(await map.send({ reason: '   ' })).toEqual({
      status: 422,
      json: { ok: false, text: 'Say what is wrong, so that the moderators know what to look at.' },
    });
    expect(map.throttles.size).toBe(0);
    expect((await map.send({ reason: 'x'.repeat(1001) })).status).toBe(400);
  });

  it("counts in /report's window, and refuses to open the form while it is full", async () => {
    const throttles = new Throttles();
    for (let n = 0; n < REPORT_THROTTLE.uses; n++) {
      throttles.use(REPORT_COMMAND, BOB, REPORT_THROTTLE, PARTY_NOW);
    }
    const map = await meetup(throttles);
    web = map.web;
    const full = { error: 'You can do that again in 60 minutes.' };
    expect(await map.open()).toEqual({ status: 429, json: full });
    expect(await map.send({ reason: 'Somebody’s yard.' })).toEqual({ status: 429, json: full });
  });

  // Review W-7 (Matt to confirm with C1): a report writes into the post where there is no
  // moderators' channel, so only a member who sees the forum on Discord may report from the map.
  it("offers Report… only to a member who sees the party's forum on Discord, and refuses anybody else", async () => {
    const map = await meetup();
    web = map.web;
    const listed = async (userId: string, name: string) => {
      const answer = await map.web.app.inject({
        url: `/s/${FAKE_GUILD_ID}/api/parties`,
        headers: { cookie: await map.web.loggedIn(userId, name) },
      });
      return answer.json<PartiesView>().meetups[0];
    };
    expect((await listed(BOB, 'Bob'))?.mayReport).toBe(true);
    map.made.gateway.shutOut(WEST_FORUM, BOB);
    // What Discord said of the forum is used for a minute.
    map.web.clock.now += BARRED_FRESH_MS;
    // Shown (the map crosses region roles), but not his to report.
    const hidden = await listed(BOB, 'Bob');
    expect(hidden?.id).toBe(map.made.party.id);
    expect(hidden).not.toHaveProperty('mayReport');
    expect((await map.open()).status).toBe(403);
    expect((await map.send({ reason: 'Somebody’s yard.' })).status).toBe(403);
    expect(map.throttles.size).toBe(0);
  });

  it('gives the use back when the moderators could not be told, as the router does', async () => {
    const throttles = new Throttles();
    for (let n = 0; n < REPORT_THROTTLE.uses - 1; n++) {
      throttles.use(REPORT_COMMAND, BOB, REPORT_THROTTLE, PARTY_NOW);
    }
    const map = await meetup(throttles);
    web = map.web;
    map.made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    expect(await map.send({ reason: 'Somebody’s yard.' })).toEqual({
      status: 422,
      json: { ok: false, text: 'I could not send your report to the moderators. Try again later.' },
    });
    map.made.gateway.failing.delete('sendMessage');
    expect((await map.send({ reason: 'Somebody’s yard.' })).json).toEqual({
      ok: true,
      text: 'Sent to the moderators.',
    });
  });

  it('refuses a member kept out of the forum, before anything is read or counted', async () => {
    const map = await meetup();
    web = map.web;
    map.made.gateway.barred.set(WEST_FORUM, new Set([BOB]));
    expect((await map.open()).status).toBe(403);
    expect((await map.send({ reason: 'Somebody’s yard.' })).status).toBe(403);
    expect(map.throttles.size).toBe(0);
  });
});
