import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { classic, customIdsOf, dmBrief, dmSummary, linksOf } from '../../test/support/messages.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { MemoryNewTrains } from '../../test/support/new-trains.js';
import { ALICE, at, BOB, CAROL, MINUTE, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import {
  createdMeetup,
  createdTrain,
  partyServiceWith,
  reportedRaid,
} from '../../test/support/party-service.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from '../config/settings.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { PartyStatus } from '../domain/party/status.js';
import { postLink } from '../render/notify-dm.js';
import { DM_PRIORITY } from './dm-sender.js';

const DORA = '200000000000000005';
/** How the meeting-time DMs name the party: the raid by its gym's shown name, a train by its own. */
const GYM = 'The Stacks';
const TRAIN = 'Saturday legendaries';
const HATCH = at('2026-10-13T14:30');
const YVELTAL = pokemonTarget(717);
const member = (id: string, name: string) => ({ id, name });

type Made = Awaited<ReturnType<typeof partyServiceWith>>;
/** Each message for a member: its news and its reasons (`dmSummary`), or a meeting time's lines. */
const told = (made: Made, userId: string): string[][] =>
  made.dms.to(userId).map((message) => dmSummary(message));
const stamp = (time: number, style = 't') => `<t:${String(time / 1000)}:${style}>`;

function off() {
  const settings = loadSettings(TEST_SETTINGS_PATH);
  return { ...settings, features: { ...settings.features, notifications: false } };
}
const background = watchEachTest();

describe('NotifyService: a train is made', () => {
  it('tells who asked to hear of new trains and can see it, but for its maker', async () => {
    const kept = await partyServiceWith();
    const guild = kept.gateway.guildId;
    for (const id of [ALICE, BOB, CAROL, REPORTER]) await kept.newTrains.set(id, guild, true, 1);
    // Dora asked in another server, which is not asking here.
    await kept.newTrains.set(DORA, '499999999999999999', true, 1);
    kept.gateway.shutOut(WEST_FORUM, BOB);
    const made = await createdTrain(
      { creator: { name: 'Rhea' } },
      {},
      {
        storage: kept.storage,
        gateway: kept.gateway,
        regions: kept.regions,
        clock: kept.clock,
        tags: kept.tags,
        newTrains: kept.newTrains,
      },
    );
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE, CAROL]);
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, ALICE)).toEqual([
      [`A new train has been announced in <#${WEST_CHANNEL}> by **Rhea**.`, 'new trains'],
    ]);
    const [message] = made.dms.to(ALICE);
    // The brief names the train, which the sentence does not.
    expect(dmBrief(message)[0]).toBe('**Raid Train: Saturday legendaries**');
    expect(linksOf(message)).toEqual([`Go to post ${link}`]);
    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:stop:train`]);
    expect(made.dms.jobs[0]).toMatchObject({
      priority: DM_PRIORITY.normal,
      expiresAt: made.clock.now + 60 * MINUTE,
    });
  });

  // Plan 8M-11A (Matt's answers): the application's train emoji before the train's name, once it
  // has it; the brief reads as before without (the test above).
  it("puts the application's train emoji before the train's name in the brief, and nowhere else", async () => {
    const newTrains = new MemoryNewTrains();
    await newTrains.set(ALICE, '412345678901234567', true, 1);
    const mark = '<:pinetrain:1400823744760905730>';
    const made = await createdTrain(
      { creator: { name: 'Rhea' } },
      { appEmoji: { get: (name) => (name === 'pinetrain' ? mark : undefined) } },
      { newTrains },
    );
    await made.notify.flush();
    const [message] = made.dms.to(ALICE);
    expect(dmBrief(message)[0]).toBe(`${mark} **Raid Train: Saturday legendaries**`);
    expect(told(made, ALICE)[0]?.[0]).toBe(
      `A new train has been announced in <#${WEST_CHANNEL}> by **Rhea**.`,
    );
    // Not on the post, nor its buttons: the train's own post is as before.
    expect(JSON.stringify(made.gateway.posts.get(made.postId)?.message)).not.toContain('pinetrain');
  });

  it('does not name a maker who chose not to be named, and does not tell them either', async () => {
    const newTrains = new MemoryNewTrains();
    for (const id of [ALICE, REPORTER]) await newTrains.set(id, '412345678901234567', true, 1);
    const made = await createdTrain(
      { creator: { name: 'Rhea' }, anonymous: true, autoStatus: PartyStatus.NotInterested },
      {},
      { newTrains },
    );
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE]);
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, ALICE)[0]?.[0]).toBe(`A new train has been announced in <#${WEST_CHANNEL}>.`);
    expect(linksOf(made.dms.to(ALICE)[0])).toEqual([`Go to post ${link}`]);
    const [message] = made.dms.to(ALICE);
    expect(JSON.stringify(message)).not.toContain('Rhea');
    expect(JSON.stringify(message)).not.toContain(REPORTER);
  });

  it('tells nobody of a meetup, and nobody of a train where notifications are off', async () => {
    const newTrains = new MemoryNewTrains();
    await newTrains.set(ALICE, '412345678901234567', true, 1);
    const meetup = await createdMeetup({}, {}, { newTrains });
    expect(meetup.gateway.guildId).toBe('412345678901234567');
    await meetup.notify.flush();
    expect(meetup.dms.jobs).toEqual([]);
    const train = await createdTrain({}, { settings: off() }, { newTrains });
    await train.notify.flush();
    expect(train.dms.jobs).toEqual([]);
  });
});

describe('NotifyService: an egg gets its boss', () => {
  /** An egg that Alice and Bob are coming to and Carol is done with; Alice and Carol asked. */
  async function egg(more: Record<string, object> = {}) {
    const userSettings = new Map<string, object>([
      [ALICE, { bossSetNotification: true }],
      [CAROL, { bossSetNotification: true }],
      [DORA, { bossSetNotification: true }],
      ...Object.entries(more),
    ]);
    const made = await reportedRaid({ time: { hatch: HATCH } }, {}, { userSettings });
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ] as const) {
      await made.attendance.signUp(made.party.id, member(id, name), PartyStatus.Coming);
    }
    await made.notify.flush();
    return made;
  }
  const BOSSES = {
    yveltal: 'Yveltal (T5)',
    giratina_origin: 'Giratina (Origin Forme) (T5)',
  } as const;
  const setBoss = async (
    made: Awaited<ReturnType<typeof egg>>,
    by: string,
    key: keyof typeof BOSSES | null = 'yveltal',
  ) => {
    await made.raids.setBoss(made.party.id, member(by, 'Somebody'), {
      tier: { level: 'T5', shadow: false },
      boss: key === null ? null : { key },
      label: key === null ? 'T5 egg' : BOSSES[key],
    });
    await made.notify.flush();
  };
  /** The news of every message for a member. */
  const heard = (made: Awaited<ReturnType<typeof egg>>, userId: string): string[] =>
    told(made, userId).map((lines) => lines[0] ?? '');
  const STACKS = `**The Stacks** (<#${WEST_CHANNEL}>)`;

  it('tells who is signed up and asked to hear it, whether or not they want the boss', async () => {
    const made = await egg();
    await setBoss(made, BOB);
    // Bob set it, and did not ask; Dora asked and is not signed up.
    expect(made.dms.recipients).toEqual([ALICE]);
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, ALICE)).toEqual([
      [
        `The boss of the egg at **The Stacks** (<#${WEST_CHANNEL}>) is **Yveltal**.`,
        'the boss of your eggs',
      ],
    ]);
    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.urgent);
    expect(customIdsOf(made.dms.to(ALICE)[0])).toEqual([`dm:${made.gateway.guildId}:stop:boss`]);
    expect(linksOf(made.dms.to(ALICE)[0])[0]).toBe(`Go to post ${link}`);
  });

  it('says what it hatched into when the clock sets the only possible boss', async () => {
    const made = await egg({ [REPORTER]: { bossSetNotification: true } });
    made.clock.now = HATCH + MINUTE;
    await made.scheduler.tick();
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
    expect(told(made, ALICE)[0]?.[0]).toBe(
      `The egg at **The Stacks** (<#${WEST_CHANNEL}>) hatched into **Yveltal**.`,
    );
  });

  it('sends one message to an attendee who also wants the boss, with both reasons', async () => {
    const made = await egg();
    await made.wants.set(ALICE, made.gateway.guildId, YVELTAL, 'raid');
    await made.wants.set(DORA, made.gateway.guildId, YVELTAL, 'raid');
    await setBoss(made, BOB);
    expect(made.dms.to(ALICE)).toHaveLength(1);
    expect(told(made, ALICE)[0]).toEqual([
      expect.stringMatching(/^The boss of the egg at/),
      'the boss of your eggs · Yveltal · Raids',
    ]);
    // Dora is not signed up: for her it is news of a raid she wants.
    expect(told(made, DORA)[0]?.[0]).toMatch(/^The raid at \*\*The Stacks\*\* .* now has its boss/);
    expect(made.dms.jobs.find((job) => job.userId === DORA)?.priority).toBe(DM_PRIORITY.normal);
    // Who is in the raid is put in line first.
    expect(made.dms.recipients).toEqual([ALICE, DORA]);
  });

  it('does not tell who set it', async () => {
    const made = await egg();
    await setBoss(made, ALICE);
    expect(made.dms.jobs).toEqual([]);
  });

  it('tells of a boss that is corrected straight away, in a sentence that says so', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, 'giratina_origin');
    expect(heard(made, ALICE)).toEqual([
      `The boss of the egg at ${STACKS} is **Yveltal**.`,
      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**.`,
    ]);
    expect(told(made, ALICE)[1]?.[1]).toBe('the boss of your eggs');
    expect(made.dms.jobs.map((job) => job.priority)).toEqual([
      DM_PRIORITY.urgent,
      DM_PRIORITY.urgent,
    ]);
  });

  it('tells of the next boss when the raid was an egg again between, and nothing for the egg', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, null);
    expect(made.dms.to(ALICE)).toHaveLength(1);
    await setBoss(made, BOB, 'giratina_origin');
    expect(heard(made, ALICE)).toEqual([
      `The boss of the egg at ${STACKS} is **Yveltal**.`,
      `The boss of the egg at ${STACKS} is **Giratina (Origin Forme)**.`,
    ]);
  });

  it('tells of a boss the raid comes back to, so that the last message is never wrong', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, 'giratina_origin');
    await setBoss(made, BOB, 'yveltal');
    expect(heard(made, ALICE)).toEqual([
      `The boss of the egg at ${STACKS} is **Yveltal**.`,
      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**.`,
      `The boss of the raid at ${STACKS} is now **Yveltal**.`,
    ]);
    // A boss a member set themself is the last one they know of.
    const other = await egg();
    await setBoss(other, ALICE, 'yveltal');
    await setBoss(other, BOB, 'giratina_origin');
    await setBoss(other, BOB, 'yveltal');
    expect(heard(other, ALICE)).toEqual([
      `The boss of the raid at ${STACKS} is now **Giratina (Origin Forme)**.`,
      `The boss of the raid at ${STACKS} is now **Yveltal**.`,
    ]);
  });

  it('tells of one boss once when it is set again with no other between', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal');
    await setBoss(made, BOB, null);
    await setBoss(made, BOB, 'yveltal');
    expect(heard(made, ALICE)).toEqual([`The boss of the egg at ${STACKS} is **Yveltal**.`]);
    // Set by themself, taken back, set by another: they know it.
    const other = await egg();
    await setBoss(other, ALICE, 'yveltal');
    await setBoss(other, BOB, null);
    await setBoss(other, BOB, 'yveltal');
    expect(other.dms.to(ALICE)).toEqual([]);
  });

  it('tells nobody where notifications are off', async () => {
    const userSettings = new Map([[ALICE, { bossSetNotification: true }]]);
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      { settings: off() },
      { userSettings },
    );
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.raids.setBoss(made.party.id, member(BOB, 'Bob'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.notify.flush();
    expect(made.dms.jobs).toEqual([]);
  });
});

describe('NotifyService: a raid moves to another gym', () => {
  /** A raid at The Stacks with Alice coming, Bob interested, Carol here and Dora done. */
  async function raid(overrides: Parameters<typeof reportedRaid>[1] = {}) {
    const made = await reportedRaid({ boss: { key: 'yveltal' } }, overrides);
    const id = made.party.id;
    await made.attendance.signUp(id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.attendance.signUp(id, member(BOB, 'Bob'), PartyStatus.Interested);
    await made.attendance.signUp(id, member(CAROL, 'Carol'), PartyStatus.Present);
    await made.attendance.signUp(id, member(DORA, 'Dora'), PartyStatus.Present);
    await made.attendance.done(id, member(DORA, 'Dora'));
    await made.notify.flush();
    // What the report told is not what these tests look at.
    made.dms.jobs.length = 0;
    return made;
  }
  const map = (lat: number, lon: number) =>
    `[Map](<https://www.google.com/maps/search/?api=1&query=${String(lat)}%2C${String(lon)}>)`;
  const STACKS = `**${GYM}** (${map(40.05, -80.05)})`;

  it('tells who is signed up, not who moved it or is done, naming both gyms, with the post', async () => {
    const made = await raid({ settings: off() });
    await made.raids.setGym(made.party.id, member(ALICE, 'Alice'), 2);
    await made.notify.flush();
    // Whatever the server's notifications: it is part of the raid they are in.
    expect(made.dms.recipients.sort()).toEqual([BOB, CAROL, REPORTER].sort());
    expect(told(made, BOB)).toEqual([
      [
        `The raid you signed up for has moved to another gym: from ${STACKS} to ` +
          `**Old Stone Fountain** (${map(40.06, -80.06)}).`,
      ],
    ]);
    expect(linksOf(made.dms.to(BOB)[0])).toEqual([
      `Go to post ${postLink(made.gateway.guildId, made.postId)}`,
    ]);
    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.urgent);
  });

  it('names the region it moved to, and links its new post', async () => {
    const made = await raid();
    const outcome = await made.raids.setGym(made.party.id, member(ALICE, 'Alice'), 8);
    if (outcome.kind !== 'ok') throw new Error(outcome.kind);
    await made.notify.flush();
    const moved = made.dms.jobs.filter((job) => dmSummary(job.message)[0]?.includes('moved'));
    expect(moved.map((job) => job.userId).sort()).toEqual([BOB, CAROL, REPORTER].sort());
    expect(told(made, CAROL).at(-1)).toEqual([
      `The raid you signed up for has moved to another gym: from ${STACKS} to ` +
        `**Café Élan Fresco** (${map(40.05, -79.92)}) in <#${EAST_CHANNEL}>.`,
    ]);
    expect(linksOf(made.dms.to(CAROL).at(-1))).toEqual([
      `Go to post ${postLink(made.gateway.guildId, outcome.party.forumPostId ?? '')}`,
    ]);
  });

  it('tells nobody of a change that keeps the gym', async () => {
    const made = await raid();
    await made.raids.setGym(made.party.id, member(ALICE, 'Alice'), 1);
    await made.raids.setBoss(made.party.id, member(ALICE, 'Alice'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'xerneas' },
      label: 'Xerneas (T5)',
    });
    await made.notify.flush();
    expect(made.dms.jobs.filter((job) => dmSummary(job.message)[0]?.includes('moved'))).toEqual([]);
  });
});

describe('NotifyService: a meeting time', () => {
  const MEET = at('2026-10-13T14:40');

  /** A raid with Alice and Bob coming beside the reporter, and Carol in a group of her own. */
  async function raid(overrides: Parameters<typeof reportedRaid>[1] = {}) {
    const made = await reportedRaid({ boss: { key: 'yveltal' } }, overrides);
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
      [CAROL, 'Carol'],
    ] as const) {
      await made.attendance.signUp(made.party.id, member(id, name), PartyStatus.Coming);
    }
    await made.attendance.newGroup(made.party.id, member(CAROL, 'Carol'));
    await made.notify.flush();
    return made;
  }

  it('tells the others of the group in the legacy words, not who set it, without a button', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    expect(made.dms.jobs).toEqual([]);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, BOB)).toEqual([
      [
        `Meet at ${stamp(MEET)} for the raid at ${GYM} (set by Alice). 3 trainers are attending: ${link}`,
      ],
    ]);
    // Plain text for a phone's notification: no components, no embed.
    const message = classic(made.dms.to(BOB)[0]);
    expect(message.components).toBeUndefined();
    expect(message.embeds).toBeUndefined();
    expect(made.dms.jobs[0]).toMatchObject({ priority: DM_PRIORITY.urgent, expiresAt: MEET });
  });

  it('counts the trainers as the post does, and says one in the singular', async () => {
    const made = await raid();
    await made.attendance.signUp(made.party.id, member(BOB, 'Bob'), PartyStatus.Coming, {
      number: 3,
    });
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flush();
    expect(told(made, BOB)[0]?.[0]).toContain('5 trainers are attending');
    // Carol is alone in her group: nobody else to tell.
    await made.attendance.setMeetingTime(made.party.id, member(CAROL, 'Carol'), MEET);
    await made.notify.flush();
    expect(made.dms.to(CAROL)).toEqual([]);
    expect(made.dms.jobs).toHaveLength(2);
  });

  it('makes one message of a time that is corrected at once, and none of one that is taken back', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.attendance.setMeetingTime(made.party.id, member(BOB, 'Bob'), MEET + 5 * MINUTE);
    await made.notify.flush();
    // The last one to change it is who set it, and is not told.
    expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
    expect(told(made, ALICE)).toEqual([
      [
        expect.stringContaining(
          `Meet at ${stamp(MEET + 5 * MINUTE)} for the raid at ${GYM} (set by Bob)`,
        ),
      ],
    ]);
    const before = made.dms.jobs.length;
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET + 5 * MINUTE);
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before);
  });

  it('tells of a cancelled time in a sentence of the same kind', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flush();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), null);
    await made.notify.flush();
    expect(told(made, BOB)[1]).toEqual([
      `No meeting time any more for the raid at ${GYM} (canceled by Alice): ${postLink(made.gateway.guildId, made.postId)}`,
    ]);
    expect(made.dms.jobs.at(-1)?.expiresAt).toBe(made.clock.now + 30 * MINUTE);
  });

  it('is sent where notifications are off, and not to who is done or cannot be reached', async () => {
    const made = await raid({ settings: off() });
    await made.attendance.signUp(made.party.id, member(BOB, 'Bob'), PartyStatus.Present);
    await made.attendance.done(made.party.id, member(BOB, 'Bob'));
    await made.attendance.setMeetingTime(made.party.id, member(CAROL, 'Carol'), MEET);
    await made.attendance.joinGroup(made.party.id, member(DORA, 'Dora'), 'A');
    await made.attendance.setMeetingTime(made.party.id, member(DORA, 'Dora'), MEET);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([ALICE, REPORTER].sort());
  });

  it('asks nobody who can see the post: whoever is signed up is told, and nothing is remembered', async () => {
    const made = await raid();
    const asked = made.members.batches.length;
    // Not even Discord being away, or a member who left, keeps the message out of the line:
    // the send itself finds out who cannot be written to.
    made.members.failing = new Error('Discord is away');
    made.gateway.leftServer.add(REPORTER);
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    expect(made.members.batches).toHaveLength(asked);
    expect(made.notify.remembered).toBe(0);
  });

  /** Holds the answers about who can see something until the returned function is called. */
  function hold(made: Pick<Made, 'members'>): () => void {
    let release: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      made.members.holding = undefined;
      release();
    };
  }
  /** A raid one of whose events is being worked off: who wants its new boss is asked about. */
  async function withEventInFlight() {
    const made = await raid();
    await made.wants.set(DORA, made.gateway.guildId, pokemonTarget(716), 'raid');
    const release = hold(made);
    const asked = made.members.batches.length;
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'xerneas' },
      label: 'Xerneas (T5)',
    });
    await made.members.asks.reached(asked + 1);
    return { made, release };
  }

  it('does not wait behind the look-ups of its own raid', async () => {
    const { made, release } = await withEventInFlight();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    await made.notify.flushMeetings();
    // The line has taken it; the answer about the gym is still held back.
    await background.settle();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    expect(made.dms.to(DORA)).toEqual([]);
    release();
    await made.notify.flush();
    expect(made.dms.to(DORA)).toHaveLength(1);
  });

  it('still goes out when it was waiting for its delay at shutdown, beside an event in flight', async () => {
    const { made, release } = await withEventInFlight();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    const closing = made.notify.close();
    // Shutdown has begun before the look-up answers.
    await background.settle();
    release();
    await closing;
    expect(told(made, BOB)).toEqual([
      [expect.stringContaining(`Meet at ${stamp(MEET)} for the raid at ${GYM} (set by Alice)`)],
    ]);
    expect(made.dms.to(REPORTER)).toHaveLength(1);
  });

  it('refuses a time that comes while it shuts down, and says so: nothing is gathered and lost', async () => {
    const made = await raid();
    await made.attendance.setMeetingTime(made.party.id, member(ALICE, 'Alice'), MEET);
    const group = made.current().attendees[ALICE]?.group;
    if (group === undefined) throw new Error('Alice is in no group');
    const closing = made.notify.close();
    // The times that waited are being told just now.
    made.notify.meetingTimeChanged(made.party.id, group, undefined, member(BOB, 'Bob'));
    await closing;
    // Alice's time went out as it was gathered; Bob's call was told to nobody.
    expect(told(made, BOB)).toEqual([
      [expect.stringContaining(`Meet at ${stamp(MEET)} for the raid at ${GYM} (set by Alice)`)],
    ]);
    expect(made.dms.to(ALICE)).toEqual([]);
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    expect(
      made.entries.filter((entry) => entry.msg === 'a time is not told: the bot is shutting down'),
    ).toEqual([expect.objectContaining({ level: 20, party: made.party.id, what: 'meeting' })]);

    // The start of a train or meetup that is announced then is refused alike.
    const train = await createdTrain();
    await train.attendance.signUp(train.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await train.notify.flush();
    const ending = train.notify.close();
    train.notify.startTimeChanged(train.current(), member(BOB, 'Bob'));
    await ending;
    expect(train.dms.jobs).toEqual([]);
    expect(
      train.entries.filter((entry) => entry.msg === 'a time is not told: the bot is shutting down'),
    ).toEqual([expect.objectContaining({ level: 20, party: train.party.id, what: 'start' })]);
  });

  it('sends nothing for a time the bot itself moved because the raid changed', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.attendance.setMeetingTime(
      made.party.id,
      member(REPORTER, 'Rhea'),
      HATCH + 10 * MINUTE,
    );
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
    // The hatch moves by half an hour: the meeting time moves with it, or is canceled.
    await made.raids.setHatchTime(made.party.id, member(REPORTER, 'Rhea'), HATCH + 30 * MINUTE);
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('tells everybody signed up for a train of its start, once it has stood for a moment', async () => {
    const made = await createdTrain();
    for (const [id, name] of [
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ] as const) {
      await made.attendance.signUp(made.party.id, member(id, name), PartyStatus.Coming);
    }
    const start = at('2026-10-13T16:00');
    await made.timed.setStartTime(made.party.id, member(ALICE, 'Alice'), start - 30 * MINUTE);
    await made.timed.setStartTime(made.party.id, member(ALICE, 'Alice'), start);
    await made.timed.flush();
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    const link = postLink(made.gateway.guildId, made.postId);
    expect(told(made, BOB)).toEqual([
      [
        `Start at ${stamp(start)} for the train ${TRAIN} (set by Alice). 3 trainers are attending: ${link}`,
      ],
    ]);
    expect(made.dms.jobs[0]).toMatchObject({ priority: DM_PRIORITY.urgent, expiresAt: start });
    await made.timed.setStartTime(made.party.id, member(BOB, 'Bob'), null);
    await made.timed.flush();
    await made.notify.flush();
    expect(told(made, ALICE)).toEqual([
      [`No start time any more for the train ${TRAIN} (removed by Bob): ${link}`],
    ]);
  });

  it('says the start in the post also when the notifier cannot even begin', async () => {
    const made = await createdTrain(
      {},
      {
        notifying: {
          now: () => {
            throw new Error('no clock');
          },
        },
      },
    );
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    const start = at('2026-10-13T16:00');
    await made.timed.setStartTime(made.party.id, member(ALICE, 'Alice'), start);
    await made.timed.flush();
    await made.notify.flush();
    expect(made.said().some((line) => line.includes('set the start of this train'))).toBe(true);
    expect(made.dms.jobs).toEqual([]);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not tell members of an event'),
    ).toHaveLength(2);
    // A meeting time in a raid is stored and said as well.
    const raid = await reportedRaid(
      { boss: { key: 'yveltal' } },
      {
        notifying: {
          now: () => {
            throw new Error('no clock');
          },
        },
      },
    );
    await raid.attendance.signUp(raid.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    const outcome = await raid.attendance.setMeetingTime(
      raid.party.id,
      member(ALICE, 'Alice'),
      at('2026-10-13T14:40'),
    );
    expect(outcome.kind).toBe('ok');
    await raid.notify.flush();
    expect(raid.dms.jobs).toEqual([]);
  });

  it('says where a meetup is last in the message about its start, as its post says it now', async () => {
    const { storage, wayspots } = await wayspotsWith([
      keptRow(1, { title: 'Fountain Square', lat: 40.0601, lon: -80.0601 }),
    ]);
    const made = await createdMeetup(
      {
        place: {
          kind: 'stop',
          id: wayspotId(1),
          title: 'Fountain Square',
          lat: 40.0601,
          lon: -80.0601,
          address: null,
          image: null,
        },
      },
      { wayspots },
    );
    // An import renames the stop after the meetup was made.
    await storage.saveFromImport(
      {
        upsert: [keptRow(1, { title: 'Fountain *Square* Park', lat: 40.0601, lon: -80.0601 })],
        remove: [],
      },
      PARTY_NOW,
    );
    await wayspots.load();
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    await made.timed.setStartTime(made.party.id, member(REPORTER, 'Rhea'), at('2026-10-13T16:00'));
    await made.timed.flush();
    await made.notify.flush();
    const [sentence, where] = told(made, ALICE)[0] ?? [];
    expect(sentence).toMatch(
      /^Start at .* for the meetup Community Day picnic \(set by Rhea\)\. .*: https:\/\/\S+$/,
    );
    expect(where).toBe('Where: Near Fountain \\*Square\\* Park (PokéStop)');
  });

  it('names another day with its date in the start of a meetup', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
    const start = at('2026-10-17T11:00');
    await made.timed.setStartTime(made.party.id, member(REPORTER, 'Rhea'), start);
    await made.timed.flush();
    await made.notify.flush();
    expect(told(made, ALICE)[0]?.[0]).toContain(
      `Start at ${stamp(start, 'f')} for the meetup Community Day picnic (set by Rhea)`,
    );
  });
});
