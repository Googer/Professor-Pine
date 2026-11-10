import { describe, expect, it } from 'vitest';
import { ALICE, BOB, partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { MemoryUsers } from '../../test/support/users.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { isRaid, refused, setSaved, type Party } from '../domain/party/party.js';
import { anyParty, pingInMessages, settingsOf, storedChange } from './party-change.js';

describe('pingInMessages', () => {
  const POST = '900000000000000001';
  const crowd = Array.from({ length: 200 }, (_, n) => `7000000000000${String(10000 + n)}`);

  /** A store that holds the raid with its post until a test says otherwise, and the sends. */
  function stubs() {
    let party: Party | undefined = { ...testRaid(), forumPostId: POST };
    const sent: { channelId: string; users: string[] }[] = [];
    let afterSend: (count: number) => void = () => undefined;
    return {
      sent,
      set party(value: Party | undefined) {
        party = value;
      },
      get party() {
        return party;
      },
      afterSend(run: (count: number) => void) {
        afterSend = run;
      },
      deps: {
        store: { get: (id: string) => (party?.id === id ? party : undefined) },
        gateway: {
          sendMessage: (channelId: string, message: OutgoingMessage) => {
            sent.push({ channelId, users: message.mention?.users ?? [] });
            afterSend(sent.length);
            return Promise.resolve<string | undefined>(`8${String(sent.length).padStart(17, '0')}`);
          },
        },
      },
    };
  }

  it('pings everybody in as many messages as it takes, one after the other', async () => {
    const made = stubs();
    const id = testRaid().id;
    const outcome = await pingInMessages(made.deps, id, POST, 'Lobby up', crowd);
    expect(outcome).toEqual({ complete: true, pinged: 200, sent: made.sent.length });
    expect(made.sent.length).toBeGreaterThan(2);
    expect(made.sent.every((send) => send.channelId === POST)).toBe(true);
    expect(made.sent.flatMap((send) => send.users)).toEqual(crowd);
  });

  it('stops before a message once the party is gone, and says how many it pinged', async () => {
    const made = stubs();
    made.afterSend((count) => {
      if (count === 1) made.party = undefined;
    });
    const outcome = await pingInMessages(made.deps, testRaid().id, POST, 'Lobby up', crowd);
    expect(made.sent).toHaveLength(1);
    expect(outcome).toEqual({
      complete: false,
      stopped: 'gone',
      pinged: made.sent[0]?.users.length,
      sent: 1,
    });
  });

  it('stops once the party has another post (it moved): nothing goes into the old one', async () => {
    const made = stubs();
    made.afterSend(() => {
      if (made.party) made.party = { ...made.party, forumPostId: '900000000000000002' };
    });
    const outcome = await pingInMessages(made.deps, testRaid().id, POST, 'Lobby up', crowd);
    expect(made.sent).toHaveLength(1);
    expect(outcome).toEqual({
      complete: false,
      stopped: 'moved',
      pinged: made.sent[0]?.users.length,
      sent: 1,
    });
    const none = stubs();
    none.party = { ...testRaid(), forumPostId: '900000000000000002' };
    expect(await pingInMessages(none.deps, testRaid().id, POST, 'Hi', crowd)).toEqual({
      complete: false,
      stopped: 'moved',
      pinged: 0,
      sent: 0,
    });
    expect(none.sent).toEqual([]);
  });

  it('stops when the post is gone on Discord', async () => {
    const made = stubs();
    made.deps.gateway.sendMessage = () => Promise.resolve(undefined);
    expect(await pingInMessages(made.deps, testRaid().id, POST, 'Hi', crowd)).toEqual({
      complete: false,
      stopped: 'gone',
      pinged: 0,
      sent: 0,
    });
  });
});

describe('settingsOf', () => {
  it('reads the settings of all the members at once', async () => {
    const users = new MemoryUsers(new Map([[BOB, { mentions: false }]]));
    const { log, entries } = createTestLogger();
    const settings = await settingsOf(users, [ALICE, BOB], log);
    expect(settings.get(ALICE)?.mentions).toBe(true);
    expect(settings.get(BOB)?.mentions).toBe(false);
    expect(users.reads).toEqual({ get: 0, getMany: 1 });
    expect(users.asked).toEqual([[ALICE, BOB]]);
    expect(entries).toEqual([]);
  });

  it('asks nothing for nobody', async () => {
    const users = new MemoryUsers();
    const { log, entries } = createTestLogger();
    expect(await settingsOf(users, [], log)).toEqual(new Map());
    expect(users.reads).toEqual({ get: 0, getMany: 0 });
    expect(entries).toEqual([]);
  });

  it('answers with nobody and one warning when the settings cannot be read', async () => {
    const users = new MemoryUsers();
    users.getMany = () => Promise.reject(new Error('the database is away'));
    const { log, entries } = createTestLogger();
    expect(await settingsOf(users, [ALICE, BOB], log)).toEqual(new Map());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 40,
      msg: 'could not read the settings of members',
      members: 2,
      err: { message: 'the database is away' },
    });
  });
});

describe('storedChange', () => {
  it('stores what the change answers and hands on what else it said', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const stored = await storedChange(store, raid.id, isRaid, (party) => ({
      ok: true as const,
      party: setSaved(party, true),
      why: 'kept',
    }));
    expect(stored).toMatchObject({ kind: 'ok', written: true, extra: { why: 'kept' } });
    expect(stored.kind === 'ok' && stored.party).toBe(store.get(raid.id));
    expect(store.get(raid.id)?.saved).toBe(true);
    expect(storage.writes).toHaveLength(1);
  });

  it('says that nothing was written when the party comes back as it was', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const stored = await storedChange(store, raid.id, anyParty, (party) => ({
      ok: true as const,
      party,
    }));
    expect(stored).toEqual({ kind: 'ok', party: raid, written: false, extra: {} });
    expect(storage.writes).toEqual([]);
  });

  it('hands a refusal on whole, and writes nothing', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const stored = await storedChange(store, raid.id, isRaid, () => ({
      ...refused('gym-taken'),
      other: raid,
    }));
    expect(stored).toMatchObject({
      kind: 'refused',
      refusal: { reason: 'gym-taken', other: raid },
    });
    expect(storage.writes).toEqual([]);
  });

  it('finds no party where there is none, or one of another kind, without asking the change', async () => {
    const meetup = testMeetup();
    const { store } = await partyStoreWith([meetup]);
    const change = () => {
      throw new Error('not to be asked');
    };
    expect(await storedChange(store, meetup.id, isRaid, change)).toEqual({ kind: 'gone' });
    expect(await storedChange(store, 'no-such-party', anyParty, change)).toEqual({ kind: 'gone' });
    expect(store.get(meetup.id)).toBe(meetup);
  });
});
