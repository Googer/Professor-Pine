import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { textDisplays, textOf } from '../../test/support/messages.js';
import {
  ALICE,
  asMax,
  at,
  REPORTER,
  TEST_PIN,
  TEST_SPOT,
  testMax,
} from '../../test/support/parties.js';
import { partyServiceWith, reportedMax } from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';
import type { MaxReport } from './party-service.js';

const END = at('2026-10-13T21:00');
const SNEASEL = { key: 'sneasel' };

function report(extra: Partial<MaxReport> = {}): MaxReport {
  return {
    spot: TEST_SPOT,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: 'D2',
    boss: { key: 'machamp' },
    endTime: END,
    regionChannelId: WEST_CHANNEL,
    ...extra,
  };
}

describe('PartyService.reportMax (plan 8X-3)', () => {
  it('makes a max battle with its post in the forum of the spot, tagged, with a link line', async () => {
    const made = await reportedMax();
    const post = made.gateway.posts.get(made.postId);
    expect(post?.forumId).toBe(WEST_FORUM);
    expect(post?.title).toBe('Dynamax Machamp (2★) · Gazebo of the Park');
    expect(post?.tagIds).toEqual([made.tags[WEST_FORUM]['Max battle']]);
    expect(textDisplays(post?.message)[0]).toMatch(/^### Dynamax Machamp \(2★\)/);
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((m) => m.message.content)).toEqual([
      `New max battle: <#${made.postId}>`,
    ]);
    expect(made.current()).toMatchObject({ endTime: END, regionId: 1 });
  });

  it('keeps the screenshot a battle was reported from, and since when it has its boss', async () => {
    const made = await partyServiceWith();
    const since = at('2026-10-13T13:58');
    const outcome = await made.service.reportMax(
      report({ screenshot: { id: 'abcdefghijkl', timeUncertain: true }, bossSince: since }),
    );
    expect(outcome).toMatchObject({ kind: 'created' });
    expect(asMax(made.store.active()[0]).max).toMatchObject({
      bossSince: since,
      screenshot: { id: 'abcdefghijkl', timeUncertain: true },
    });
    // Without them: since it was made, and no screenshot.
    const plain = await reportedMax();
    expect(plain.current().max).toMatchObject({
      bossSince: plain.current().createdAt,
      screenshot: null,
    });
  });

  it('signs a second reporter of the same boss up for the battle there', async () => {
    const made = await reportedMax();
    const again = await made.service.reportMax(
      report({ reporterId: ALICE, autoStatus: PartyStatus.Coming }),
    );
    expect(again).toMatchObject({ kind: 'exists', joined: true, party: { id: made.party.id } });
    expect(made.current().attendees[ALICE]?.status).toBe(PartyStatus.Coming);
  });

  it('refuses a report of another boss at the spot, naming the battle there', async () => {
    const made = await reportedMax();
    const other = await made.service.reportMax(report({ boss: { key: 'sneasel' }, tier: 'D1' }));
    expect(other).toMatchObject({ kind: 'taken', party: { id: made.party.id } });
    expect(made.store.active()).toHaveLength(1);
  });

  // Review B, B2: the boss there is decided inside the store, as the battle is when it is joined.
  it('refuses to join a battle whose boss changed while the report waited', async () => {
    const made = await reportedMax();
    // The battle stands in another forum, so the report asks whether Alice may be put there.
    await made.store.update(made.party.id, (party) => ({
      party: { ...party, forumChannelId: EAST_FORUM },
    }));
    const outcome = await made.service.reportMax(
      report({
        reporterId: ALICE,
        // Meanwhile a member changes the boss of the rotation (`/boss`).
        mayJoin: async () => {
          await made.store.update(made.party.id, (party) => {
            const battle = asMax(party);
            return { party: { ...battle, max: { ...battle.max, boss: SNEASEL, tier: 'D1' } } };
          });
          return true;
        },
      }),
    );
    expect(outcome).toMatchObject({
      kind: 'taken',
      party: { id: made.party.id, max: { boss: SNEASEL } },
    });
    expect(made.current().attendees[ALICE]).toBeUndefined();
  });

  // Fix review F2: the battle there ended while the report waited.
  it('makes a new battle when the one it would join ended meanwhile, once', async () => {
    const made = await reportedMax();
    const moved = (id: string, extra: object) =>
      made.store.update(id, (party) => ({ party: { ...party, ...extra } }));
    await moved(made.party.id, { forumChannelId: EAST_FORUM });
    const past = made.clock.now - 60_000;
    const again = await made.service.reportMax(
      report({
        reporterId: ALICE,
        mayJoin: async () => {
          await moved(made.party.id, { endTime: past });
          return true;
        },
      }),
    );
    expect(again).toMatchObject({ kind: 'created' });
    const fresh = again.kind === 'created' ? again.party : undefined;
    expect(fresh?.id).not.toBe(made.party.id);
    expect(fresh?.attendees[ALICE]).toBeDefined();
    expect(asMax(made.store.get(made.party.id)).attendees[ALICE]).toBeUndefined();
  });

  it('says the battle there has just ended when the one after it ends too', async () => {
    const made = await reportedMax();
    const moved = (id: string, extra: object) =>
      made.store.update(id, (party) => ({ party: { ...party, ...extra } }));
    await moved(made.party.id, { forumChannelId: EAST_FORUM });
    const past = made.clock.now - 60_000;
    const second = testMax({ id: '00000000-0000-4000-8000-0000000003a2', now: made.clock.now });
    let asked = 0;
    const outcome = await made.service.reportMax(
      report({
        reporterId: ALICE,
        mayJoin: async () => {
          asked += 1;
          if (asked === 1) {
            // The battle there ends, and another is reported at the spot at once.
            await moved(made.party.id, { endTime: past });
            await made.store.addMaxUnlessTaken(second, made.clock.now);
            await moved(second.id, { forumChannelId: EAST_FORUM });
          } else {
            await moved(second.id, { endTime: past });
          }
          return true;
        },
      }),
    );
    expect(outcome).toEqual({ kind: 'ended' });
    expect(asked).toBe(2);
    expect(asMax(made.store.get(second.id)).attendees[ALICE]).toBeUndefined();
  });

  it('makes one at a pin, an unlisted power spot', async () => {
    const made = await partyServiceWith();
    const pinned = await made.service.reportMax(report({ spot: TEST_PIN }));
    expect(pinned.kind).toBe('created');
    await made.service.flush();
    const id = pinned.kind === 'created' ? pinned.party.forumPostId : null;
    expect(textOf(made.gateway.posts.get(id ?? '')?.message)).toContain(
      '📍 **Unlisted power spot**',
    );
  });

  // Final review F4: a member blocked from meetups makes no battle at a pin (`mayCreateAtPin`).
  it('makes no battle at a pin the reporter may not make one at, and asks only at a pin', async () => {
    const made = await partyServiceWith();
    let asked = 0;
    const mayCreateAtPin = () => {
      asked += 1;
      return Promise.resolve(false);
    };
    const refused = await made.service.reportMax(report({ spot: TEST_PIN, mayCreateAtPin }));
    expect(refused).toEqual({ kind: 'pin-blocked' });
    expect(made.store.active()).toEqual([]);
    expect((await made.service.reportMax(report({ mayCreateAtPin }))).kind).toBe('created');
    expect(asked).toBe(1);
    // Joining the battle at a pin is allowed all the same.
    await made.service.reportMax(report({ spot: TEST_PIN }));
    const joined = await made.service.reportMax(
      report({ spot: TEST_PIN, reporterId: ALICE, mayCreateAtPin }),
    );
    expect(joined).toMatchObject({ kind: 'exists', joined: true });
  });

  it('makes no battle at a pin it may not when the one it would join ended meanwhile', async () => {
    const made = await partyServiceWith();
    const first = await made.service.reportMax(report({ spot: TEST_PIN }));
    const id = first.kind === 'created' ? first.party.id : '';
    const moved = (extra: object) =>
      made.store.update(id, (party) => ({ party: { ...party, ...extra } }));
    // In another forum, so that the report asks whether Alice may be put there.
    await moved({ forumChannelId: EAST_FORUM });
    const outcome = await made.service.reportMax(
      report({
        spot: TEST_PIN,
        reporterId: ALICE,
        mayCreateAtPin: () => Promise.resolve(false),
        mayJoin: async () => {
          await moved({ endTime: made.clock.now - 60_000 });
          return true;
        },
      }),
    );
    expect(outcome).toEqual({ kind: 'pin-blocked' });
    expect(made.store.active().filter((party) => party.createdById === ALICE)).toEqual([]);
  });

  it('refuses a spot outside the regions of the server, and a region without a forum', async () => {
    const made = await partyServiceWith();
    const far = await made.service.reportMax(report({ spot: { ...TEST_PIN, lat: 10, lon: 10 } }));
    expect(far).toEqual({ kind: 'no-region' });
    made.regions.rows = made.regions.rows.map((region) => ({ ...region, forumChannelId: null }));
    expect((await made.service.reportMax(report())).kind).toBe('no-forum');
  });

  it('lists it in the summary of its region, after the raids', async () => {
    const made = await reportedMax();
    const texts = textDisplays(made.service.summaryMessage(1));
    expect(texts[0]).toBe('### Today and coming up\n1 max battle');
    expect(texts).toContainEqual(
      `**Max battles**\n<#${made.postId}> · Dynamax 2★ · ends <t:${END / 1000}:R> · 1 trainer`,
    );
  });

  it('puts a battle in the forum of the region the report was made in, of those the spot is in', async () => {
    const made = await partyServiceWith();
    // The spot lies in West only: a report from East's channel still goes to West's forum.
    const fromEast = await made.service.reportMax(report({ regionChannelId: EAST_CHANNEL }));
    expect(fromEast).toMatchObject({ kind: 'created', party: { regionId: 1 } });
  });
});
