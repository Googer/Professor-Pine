import { describe, expect, it, onTestFinished } from 'vitest';
import {
  buttonsOf,
  customIdsOf,
  dmBrief,
  dmReasons,
  dmSentence,
  linksOf,
  thumbnailOf,
  v2,
} from '../../test/support/messages.js';
import { FakeDmGateway } from '../../test/support/dms.js';
import { Tally } from '../../test/support/tally.js';
import { watchImmediates } from '../../test/support/timers.js';
import { FAKE_GUILD_ID, fakeButton, type FakeRow } from '../../test/support/fake-interactions.js';
import { gymsFixture } from '../../test/support/providers.js';
import { createTestContext } from '../../test/support/test-context.js';
import { components } from '../components/index.js';
import { InteractionRouter } from '../discord/router.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { postLink } from '../render/notify-dm.js';
import { DM_PRIORITY } from './dm-sender.js';
import { withFeatures } from '../../test/support/server-values.js';

const DORA = '200000000000000005';
const EVE = '200000000000000006';
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const YVELTAL = pokemonTarget(717);
const GIRATINA = pokemonTarget(487);
const HATCH = at('2026-10-13T14:30');

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** A member who acts, with their name. */
const member = (id: string, name: string) => ({ id, name });
/** The news of each message for a member. */
const told = (made: Made, userId: string): string[] =>
  made.dms.to(userId).map((message) => dmSentence(message));
/** The reasons of each message for a member, joined by ` · `. */
const why = (made: Made, userId: string): string[] =>
  made.dms.to(userId).map((message) => dmReasons(message).join(' · '));

/**
 * A raid that is reported after `before` has filled the wants and targets: the first event
 * the notifier sees is the report itself.
 */
async function reported(
  before: (made: Awaited<ReturnType<typeof partyServiceWith>>) => Promise<void>,
  report: Parameters<typeof reportedRaid>[0] = {},
  overrides: Parameters<typeof reportedRaid>[1] = {},
): Promise<Made> {
  const kept = await partyServiceWith([], overrides);
  await before(kept);
  const made = await reportedRaid(report, overrides, {
    storage: kept.storage,
    gateway: kept.gateway,
    regions: kept.regions,
    clock: kept.clock,
    tags: kept.tags,
    wants: kept.wants,
    gymTargets: kept.gymTargets,
    userSettings: kept.userSettings,
  });
  await made.notify.flush();
  return made;
}

describe('NotifyService: a raid is reported', () => {
  it('tells who wants the boss, its tier or the gym, once, with the post as it is', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'both');
        await wants.set(BOB, gateway.guildId, T5, 'raid');
        await gymTargets.add(CAROL, gateway.guildId, 1);
        await wants.set(DORA, gateway.guildId, GIRATINA, 'raid');
      },
      { boss: { key: 'yveltal' }, reporter: { name: 'Rhea' } },
    );
    const link = postLink(made.gateway.guildId, made.postId);
    const sentence = `A raid for **Yveltal** has been reported at **The Stacks** (<#${WEST_CHANNEL}>) by **Rhea**.`;
    expect(made.dms.recipients).toEqual([ALICE, BOB, CAROL]);
    expect(told(made, ALICE)).toEqual([sentence]);
    expect(why(made, ALICE)).toEqual(['Yveltal · Raids']);
    expect(why(made, BOB)).toEqual(['T5 · Raids']);
    expect(why(made, CAROL)).toEqual(['raids at The Stacks']);
    // Under the news the post in brief, the buttons to the post and the gym; none of the post's
    // controls, and it pings nobody.
    const message = v2(made.dms.to(ALICE)[0]);
    expect(dmBrief(message)).toEqual([
      '**Level 5 raid against Yveltal** ✨',
      'No time has been set yet.',
      '1 trainer',
    ]);
    expect(thumbnailOf(message)).toMatch(/pm717/);
    expect(linksOf(message)).toEqual([
      `Go to post ${link}`,
      'Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
    ]);
    expect(customIdsOf(message)).toEqual([`dm:${made.gateway.guildId}:change:sp:717`]);
    expect(message.mention).toBeUndefined();
    const [job] = made.dms.jobs;
    expect(job).toMatchObject({ priority: DM_PRIORITY.normal, eventAt: made.clock.now });
    // Without times a message is worth an hour.
    expect(job?.expiresAt).toBe(made.party.lastPossibleTime ?? made.clock.now + 60 * MINUTE);
  });

  it('asks the database for a server this process has not seen the row of, and tells its members (review F4)', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'both');
      },
      { boss: { key: 'yveltal' } },
      { notifying: { serverOfRow: () => undefined } },
    );
    expect(made.dms.recipients).toEqual([ALICE]);
  });

  it('tells nobody of a raid whose server is not known, and says so in the log (review F4)', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'both');
      },
      { boss: { key: 'yveltal' } },
      {
        notifying: {
          serverOfRow: () => undefined,
          guilds: {
            snowflakeOf: () => Promise.resolve(undefined),
            idFor: () => Promise.resolve(undefined),
          },
        },
      },
    );
    expect(made.dms.recipients).toEqual([]);
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        event: 'a reported raid',
        msg: 'nobody was told of an event: its server is not known',
      }),
    );
  });

  it('tells a costumed want only of a boss the list has costumed in the raid’s tier (plan 8R-4)', async () => {
    const PIKACHU = pokemonTarget(25);
    const wanting = async ({ wants, gateway }: Awaited<ReturnType<typeof partyServiceWith>>) => {
      await wants.set(ALICE, gateway.guildId, PIKACHU, 'raid', true);
      await wants.set(BOB, gateway.guildId, PIKACHU, 'raid');
    };
    // The feed of the fixture lists Astronaut Pikachu (a new costume) under 1-Star Raids.
    const costumed = await reported(wanting, {
      boss: { key: 'pikachu' },
      tier: { level: 'T1', shadow: false },
    });
    expect(costumed.dms.recipients).toEqual([ALICE, BOB]);
    expect(why(costumed, ALICE)).toEqual(['Costumed Pikachu · Raids']);
    expect(why(costumed, BOB)).toEqual(['Pikachu · Raids']);
    // A Pikachu of a tier the list does not have it costumed in is plain.
    const plainRaid = await reported(wanting, {
      boss: { key: 'pikachu' },
      tier: { level: 'T3', shadow: false },
    });
    expect(plainRaid.dms.recipients).toEqual([BOB]);
  });

  it('sends one message to a member for whom several reasons fire, and names them all', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, pokemonTarget(487, 'giratina_origin'), 'raid');
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(ALICE, gateway.guildId, GIRATINA, 'raid');
        await gymTargets.add(ALICE, gateway.guildId, 1);
      },
      { boss: { key: 'giratina_origin' } },
    );
    expect(made.dms.jobs).toHaveLength(1);
    // Giratina's two wants (a form and the species) are one section with one Manage….
    expect(why(made, ALICE)).toEqual(['Giratina · Raids · T5 · Raids · raids at The Stacks']);
  });

  it('tells only the tier and the gym for an egg, and expires with the raid', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'both');
        await wants.set(BOB, gateway.guildId, T5, 'raid');
        await wants.set(
          BOB,
          gateway.guildId,
          { kind: 'tier', tier: { level: 'T5', shadow: true } },
          'raid',
        );
        await gymTargets.add(CAROL, gateway.guildId, 1);
        await gymTargets.add(DORA, gateway.guildId, 2);
      },
      { time: { hatch: HATCH } },
    );
    expect(made.dms.recipients).toEqual([BOB, CAROL]);
    expect(told(made, BOB)[0]).toMatch(/^A T5 egg has been reported at \*\*The Stacks\*\*/);
    expect(why(made, BOB)).toEqual(['T5 · Raids']);
    expect(made.dms.jobs[0]?.expiresAt).toBe(made.party.endTime);
  });

  it('does not tell the reporter, and does not name one who reports anonymously', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(REPORTER, gateway.guildId, T5, 'raid');
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
      },
      { anonymous: true, reporter: { name: 'Rhea' } },
    );
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(told(made, ALICE)[0]).toBe(
      `A T5 egg has been reported at **The Stacks** (<#${WEST_CHANNEL}>).`,
    );
  });

  it('tells only members of the server who can see the forum of the raid', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      for (const id of [ALICE, BOB, CAROL]) await wants.set(id, gateway.guildId, T5, 'raid');
      gateway.shutOut(WEST_FORUM, BOB);
      gateway.leftServer.add(CAROL);
    });
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(made.members.batches[0]).toMatchObject({
      guildId: made.gateway.guildId,
      channelId: WEST_FORUM,
    });
  });

  it('tells nobody about wants of another server', async () => {
    const made = await reported(async ({ wants }) => {
      await wants.set(ALICE, '499999999999999999', T5, 'raid');
    });
    expect(made.dms.jobs).toEqual([]);
  });

  it('tells nobody where notifications are off', async () => {
    const off = withFeatures({ notifications: false });
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
      },
      {},
      { servers: off },
    );
    expect(made.dms.jobs).toEqual([]);
    expect(made.members.batches).toEqual([]);
  });

  it('still tells who targets the gym when the wants cannot be read', async () => {
    const made = await reported(async ({ wants, gymTargets, gateway }) => {
      await gymTargets.add(CAROL, gateway.guildId, 1);
      wants.failing = new Error('the database is away');
    });
    expect(made.dms.recipients).toEqual([CAROL]);
    expect(made.entries.some((entry) => entry.msg === 'could not read who wants a raid')).toBe(
      true,
    );
  });

  it('tells nobody it could not ask about, and remembers nothing of it', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      await wants.set(ALICE, gateway.guildId, T5, 'raid');
    });
    expect(made.dms.recipients).toEqual([ALICE]);
    await made.wants.set(BOB, made.gateway.guildId, YVELTAL, 'raid');
    made.members.failing = new Error('Discord is away');
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(
      made.entries.some(
        (entry) => entry.msg === 'could not find out who can see an event; they are not told',
      ),
    ).toBe(true);
    // The next event that fires the reason tells them: nothing was remembered.
    made.members.failing = undefined;
    for (const [key, label] of [
      ['giratina_origin', 'Giratina (Origin Forme) (T5)'],
      ['yveltal', 'Yveltal (T5)'],
    ] as const) {
      await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
        tier: { level: 'T5', shadow: false },
        boss: { key },
        label,
      });
    }
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([ALICE, BOB]);
  });
});

describe('NotifyService: what it says of an event in the log', () => {
  const said = (made: Made, msg: string) => made.entries.filter((entry) => entry.msg === msg);

  it('says at info that an event had candidates and told nobody, with how many', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      for (const id of [ALICE, BOB]) await wants.set(id, gateway.guildId, T5, 'raid');
      gateway.shutOut(WEST_FORUM, ALICE, BOB);
    });
    expect(made.dms.jobs).toEqual([]);
    expect(said(made, 'an event had candidates and nobody was told')).toEqual([
      expect.objectContaining({ level: 30, party: made.party.id, candidates: 2, told: 0 }),
    ]);
    expect(said(made, 'members were told')).toEqual([]);
  });

  it('says at debug how many were told, and that there was nobody to tell', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      for (const id of [ALICE, BOB]) await wants.set(id, gateway.guildId, T5, 'raid');
      gateway.shutOut(WEST_FORUM, BOB);
    });
    expect(said(made, 'members were told')).toEqual([
      expect.objectContaining({ level: 20, candidates: 2, told: 1 }),
    ]);
    const nobody = await reported(() => Promise.resolve());
    expect(said(nobody, 'members were told')).toEqual([
      expect.objectContaining({ level: 20, candidates: 0, told: 0 }),
    ]);
    expect(said(nobody, 'an event had candidates and nobody was told')).toEqual([]);
  });
});

describe('NotifyService: a raid on its way to another region', () => {
  it('remembers nothing under the id of a party that is no longer there', async () => {
    const made = await reported(async ({ wants, gateway }) => {
      await wants.set(ALICE, gateway.guildId, T5, 'raid');
    });
    expect(made.notify.remembered).toBe(1);
    // The old party ended before the move got this far: its id would never be forgotten.
    made.notify.raidMoving('a party that has ended', made.party.id);
    expect(made.notify.remembered).toBe(1);
    // The party that is there shares what was told about it with the one it becomes.
    made.notify.raidMoving(made.party.id, 'the party it becomes');
    expect(made.notify.remembered).toBe(2);
  });

  it('remembers nothing where notifications are off', async () => {
    const off = withFeatures({ notifications: false });
    const made = await reported(() => Promise.resolve(), {}, { servers: off });
    made.notify.raidMoving(made.party.id, 'the party it becomes');
    expect(made.notify.remembered).toBe(0);
  });
});

describe('NotifyService: the buttons that stop a message', () => {
  it('gives a Pokémon’s and a tier’s reason Manage…, a gym’s Stop, for the server of the raid', async () => {
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(ALICE, gateway.guildId, YVELTAL, 'raid');
        await wants.set(ALICE, gateway.guildId, pokemonTarget(717, undefined, true), 'raid');
        await gymTargets.add(ALICE, gateway.guildId, 1);
      },
      { boss: { key: 'yveltal' }, tier: { level: 'T5', shadow: true } },
    );
    const guild = made.gateway.guildId;
    const message = made.dms.to(ALICE)[0];
    // Yveltal's two reasons are one section with one Manage… (plan 8R-4, F5).
    expect(dmReasons(message)).toEqual(['Yveltal · Raids, Shadow', 'raids at The Stacks']);
    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toEqual([
      {
        label: 'Manage…',
        emoji: undefined,
        style: 2,
        customId: `dm:${guild}:change:sp:717`,
        url: undefined,
      },
      {
        label: 'Stop',
        emoji: undefined,
        style: 2,
        customId: `dm:${guild}:stop:g:1`,
        url: undefined,
      },
    ]);
    const egg = await reported(async ({ wants, gateway }) => {
      await wants.set(ALICE, gateway.guildId, T5, 'raid');
    });
    expect(dmReasons(egg.dms.to(ALICE)[0])).toEqual(['T5 · Raids']);
    expect(customIdsOf(egg.dms.to(ALICE)[0])).toEqual([`dm:${egg.gateway.guildId}:change:st:T5`]);
  });

  it('is a message Discord takes, and a pressed Stop ends the messages for that reason', async () => {
    const made = await reported(async ({ gymTargets, gateway }) => {
      await gymTargets.add(ALICE, gateway.guildId, 2);
    });
    expect(made.dms.to(ALICE)).toHaveLength(0);
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym 2');
    const report = () =>
      made.service.reportRaid({
        gym,
        guildRow: TEST_GUILD_ROW,
        reporterId: BOB,
        anonymous: false,
        autoStatus: PartyStatus.Interested,
        tier: { level: 'T5', shadow: false },
        boss: null,
      });
    await report();
    await made.notify.flush();
    const message = v2(made.dms.to(ALICE)[0]);
    const dmGateway = new FakeDmGateway();
    expect(await dmGateway.send(ALICE, message)).toBe('sent');
    // The press, as the router handles it in a DM.
    const { ctx } = createTestContext({ wants: made.wants, gymTargets: made.gymTargets });
    const [customId = ''] = customIdsOf(message);
    expect(customId).toBe(`dm:${made.gateway.guildId}:stop:g:2`);
    const pressed = fakeButton({
      customId,
      isDm: true,
      userId: ALICE,
      messageRows: message.components as unknown as FakeRow[],
    });
    await new InteractionRouter(ctx, [], components).handle(pressed as never);
    expect(await made.gymTargets.count(ALICE, made.gateway.guildId)).toBe(0);
  });
});

describe('NotifyService: a raid changes', () => {
  /** An egg at the Library that Alice (T5) and Carol (the gym) were told about. */
  const egg = () =>
    reported(
      async ({ wants, gymTargets, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
        await wants.set(DORA, gateway.guildId, YVELTAL, 'raid');
        await wants.set(DORA, gateway.guildId, T5, 'raid');
        await gymTargets.add(CAROL, gateway.guildId, 1);
        await gymTargets.add(EVE, gateway.guildId, 2);
      },
      { time: { hatch: HATCH } },
    );
  const setBoss = async (made: Made, by: string, key: string, label: string) => {
    const outcome = await made.raids.setBoss(made.party.id, member(by, 'Somebody'), {
      tier: { level: 'T5', shadow: false },
      boss: { key },
      label,
    });
    await made.notify.flush();
    return outcome;
  };

  it('tells the events of a row whose server it asks the database for in their order (fix round 3, H6)', async () => {
    // Each ask of the database waits for the test, which lets the later answer first; once let
    // go, the database answers at once.
    const asked: Array<{ answer: () => void; answered: Promise<unknown> }> = [];
    let holding = true;
    const notifying = {
      serverOfRow: () => undefined,
      guilds: {
        snowflakeOf: (row: number) => {
          if (!holding) return Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined);
          let answer!: () => void;
          const answered = new Promise<string | undefined>((resolve) => {
            answer = () => {
              resolve(row === 1 ? FAKE_GUILD_ID : undefined);
            };
          });
          asked.push({ answer, answered });
          return answered;
        },
        idFor: (snowflake: string) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined),
      },
    };
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
      { notifying },
    );
    await made.raids.setBoss(made.party.id, member(CAROL, 'Somebody'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    holding = false;
    for (const ask of [...asked].reverse()) ask.answer();
    await Promise.all(asked.map((ask) => ask.answered));
    await made.notify.flush();
    // The egg's news first, then its boss's: Alice hears of the egg, not of a raid with a boss.
    expect(made.dms.recipients).toEqual([ALICE, BOB]);
    expect(told(made, ALICE)).toEqual([
      expect.stringMatching(/^A T5 egg has been reported at \*\*The Stacks\*\*/u),
    ]);
    expect(told(made, BOB)).toEqual([
      `The raid at **The Stacks** (<#${WEST_CHANNEL}>) now has its boss, **Yveltal**.`,
    ]);
  });

  it('tells who wants the boss when a member sets it, and nobody a second time', async () => {
    const made = await egg();
    expect(made.dms.recipients).toEqual([ALICE, DORA, CAROL]);
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    // Alice and Carol were told for their only reason; Dora's tier was told, her Yveltal not.
    expect(made.dms.recipients).toEqual([ALICE, DORA, CAROL, BOB]);
    expect(told(made, BOB)).toEqual([
      `The raid at **The Stacks** (<#${WEST_CHANNEL}>) now has its boss, **Yveltal**.`,
    ]);
    expect(why(made, DORA)).toEqual(['T5 · Raids', 'Yveltal · Raids']);
    expect(dmBrief(made.dms.to(BOB)[0]).slice(0, 2)).toEqual([
      '**Level 5 raid** (egg)',
      '**Hatches as Yveltal** ✨',
    ]);
    // The same boss again changes nothing; nobody is told again.
    await setBoss(made, ALICE, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.jobs).toHaveLength(5);
  });

  it('does not tell whoever set the boss, and counts it as told to them', async () => {
    const made = await egg();
    await setBoss(made, BOB, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.to(BOB)).toEqual([]);
    expect(made.dms.to(DORA)).toHaveLength(2);
    // Another boss and back again: Bob knows about Yveltal, Dora was told.
    await setBoss(made, CAROL, 'giratina_origin', 'Giratina (Origin Forme) (T5)');
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.to(BOB)).toEqual([]);
    expect(made.dms.to(DORA)).toHaveLength(2);
  });

  it('tells who wants another boss when the boss is corrected', async () => {
    const made = await egg();
    await made.wants.set(EVE, made.gateway.guildId, GIRATINA, 'raid');
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    expect(made.dms.to(EVE)).toEqual([]);
    await setBoss(made, CAROL, 'giratina_origin', 'Giratina (Origin Forme) (T5)');
    expect(why(made, EVE)).toEqual(['Giratina · Raids']);
    expect(told(made, EVE)).toEqual([
      `The boss of the raid at **The Stacks** (<#${WEST_CHANNEL}>) is now **Giratina (Origin Forme)**.`,
    ]);
  });

  it('tells nobody when the boss is taken back and the raid is an egg again', async () => {
    const made = await egg();
    await setBoss(made, CAROL, 'yveltal', 'Yveltal (T5)');
    const before = made.dms.jobs.length;
    // Somebody who wants the tier and was not told yet: an egg again is still no news.
    await made.wants.set(EVE, made.gateway.guildId, T5, 'raid');
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: null,
      label: 'T5 egg',
    });
    await made.notify.flush();
    expect(made.current().raid.boss).toBeNull();
    expect(made.dms.jobs).toHaveLength(before);
    expect(made.members.batches.every((batch) => !batch.userIds.includes(EVE))).toBe(true);
  });

  it('tells who wants the boss when the egg hatches as the only possible one, with nobody left out', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(REPORTER, gateway.guildId, YVELTAL, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
    );
    expect(made.dms.jobs).toEqual([]);
    made.clock.now = HATCH + MINUTE;
    await made.scheduler.tick();
    await made.notify.flush();
    expect(made.current().raid.boss).toEqual({ key: 'yveltal' });
    // The clock has no actor: the reporter wants Yveltal and is told like anybody.
    expect(made.dms.recipients).toEqual([REPORTER, BOB]);
    expect(told(made, BOB)[0]).toMatch(/^The raid at \*\*The Stacks\*\* .* now has its boss/);
    // Later ticks change nothing about the boss and tell nobody.
    made.clock.now += MINUTE;
    await made.scheduler.tick();
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(2);
  });

  it('tells who targets the new gym when the raid moves within its region, not the mover', async () => {
    const made = await egg();
    await made.gymTargets.add(BOB, made.gateway.guildId, 2);
    const before = made.dms.jobs.length;
    await made.raids.setGym(made.party.id, member(BOB, 'Bob'), 2);
    await made.notify.flush();
    expect(made.current().gymId).toBe(2);
    // The reporter is signed up: they hear that it moved (`notify-service.parties.test.ts`).
    expect(
      made.dms.jobs
        .slice(before)
        .map((job) => job.userId)
        .sort(),
    ).toEqual([EVE, REPORTER].sort());
    expect(told(made, REPORTER).at(-1)).toMatch(/^The raid you signed up for has moved/);
    expect(told(made, EVE)).toEqual([
      `The T5 egg is at **Old Stone Fountain** (<#${WEST_CHANNEL}>), not where it was first reported.`,
    ]);
    expect(why(made, EVE)).toEqual(['raids at Old Stone Fountain']);
    // Back to the first gym: Carol was told about that one; the reporter hears of the move.
    await made.raids.setGym(made.party.id, member(BOB, 'Bob'), 1);
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before + 3);
    expect(made.dms.jobs.at(-1)?.userId).toBe(REPORTER);
  });

  it('tells about the raid in its new region: the new gym, and the wants of who sees it only now', async () => {
    const FRED = '200000000000000007';
    const made = await reported(
      async ({ wants, gymTargets, gateway }) => {
        for (const id of [ALICE, BOB, CAROL]) await wants.set(id, gateway.guildId, T5, 'raid');
        await gymTargets.add(DORA, gateway.guildId, 8);
        await gymTargets.add(CAROL, gateway.guildId, 8);
        await gymTargets.add(FRED, gateway.guildId, 8);
        // Bob sees only East, Fred only West.
        gateway.shutOut(WEST_FORUM, BOB);
        gateway.shutOut(EAST_FORUM, FRED);
      },
      { time: { hatch: HATCH } },
    );
    expect(made.dms.recipients).toEqual([ALICE, CAROL]);
    const before = made.dms.jobs.length;
    const outcome = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 8);
    await made.notify.flush();
    if (outcome.kind !== 'ok') throw new Error(`the raid did not move: ${outcome.kind}`);
    const moved = outcome.party;
    expect(moved.id).not.toBe(made.party.id);
    const after = made.dms.jobs.slice(before);
    // Alice was told about the T5 egg and is not told again; Bob sees it only now; Dora targets
    // the new gym; Carol moved it; Fred cannot see East; the reporter, signed up, hears it moved.
    expect(after.map((job) => job.userId).sort()).toEqual([BOB, DORA, REPORTER].sort());
    const link = postLink(made.gateway.guildId, moved.forumPostId ?? '');
    // The post in the new region, as the button leads there.
    expect(linksOf(made.dms.to(BOB).at(-1))[0]).toBe(`Go to post ${link}`);
    expect(told(made, BOB)).toEqual([
      `The T5 egg is at **Café Élan Fresco** (<#${EAST_CHANNEL}>), not where it was first reported.`,
    ]);
    expect(why(made, BOB)).toEqual(['T5 · Raids']);
    expect(why(made, DORA)).toEqual(['raids at Café Élan Fresco']);
    expect(made.members.batches.at(-1)?.channelId).toBe(EAST_FORUM);
    // The old party has ended: what is remembered is about the new one alone.
    expect(made.notify.remembered).toBe(1);
    // In the new region the memory goes on: a boss tells nobody about the tier again.
    await made.raids.setBoss(moved.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before + 3);
  });

  it('forgets what it told when the party ends', async () => {
    const made = await egg();
    expect(made.notify.remembered).toBe(1);
    await made.service.end(made.party.id);
    expect(made.notify.remembered).toBe(0);
  });

  it('does not announce a raid that ended meanwhile, and remembers nothing of it', async () => {
    const made = await egg();
    const before = made.dms.jobs.length;
    let release: () => void = () => undefined;
    made.members.holding = new Promise((resolve) => {
      release = resolve;
    });
    const asked = made.members.batches.length;
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), {
      tier: { level: 'T5', shadow: false },
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    await made.members.asks.reached(asked + 1);
    await made.service.end(made.party.id);
    release();
    await made.notify.flush();
    expect(made.dms.jobs).toHaveLength(before);
    expect(made.notify.remembered).toBe(0);
  });
});

describe('NotifyService: what must not go wrong', () => {
  const yveltal = {
    tier: { level: 'T5', shadow: false },
    boss: { key: 'yveltal' },
    label: 'Yveltal (T5)',
  } as const;
  /** Holds the answers about who can see something until `release` is called. */
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
  /** Waits until the notifier has asked who can see something once more than `asked` times. */
  function untilAsked(made: Pick<Made, 'members'>, asked: number): Promise<void> {
    return made.members.asks.reached(asked + 1);
  }

  it('never breaks the report or the change it follows when it cannot even begin', async () => {
    const broken = {
      bosses: (): never => {
        throw new Error('the boss list is broken');
      },
    };
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      { notifying: { raidBosses: broken } },
    );
    // The raid was reported and has its post although the notifier threw.
    expect(made.gateway.posts.has(made.postId)).toBe(true);
    const failed = () =>
      made.entries.filter((entry) => entry.msg === 'could not tell members of an event');
    expect(failed()).toHaveLength(1);
    expect(failed()[0]).toMatchObject({ level: 50, event: 'a reported raid' });
    // A member's change is stored, shown and said in the post.
    const outcome = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    expect(outcome.kind).toBe('ok');
    expect(made.current().gymId).toBe(2);
    await made.attendance.flush();
    expect(made.said().some((line) => line.includes('Old Stone Fountain'))).toBe(true);
    expect(failed()).toHaveLength(2);
    // A move to another region still closes the old post and opens the new one.
    const moved = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 8);
    if (moved.kind !== 'ok') throw new Error(`the raid did not move: ${moved.kind}`);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.store.get(moved.party.id)).toBeDefined();
    await made.notify.flush();
    // Only what needs no boss: the reporter, signed up, hears of both moves.
    expect(made.dms.jobs.map((job) => job.userId)).toEqual([REPORTER, REPORTER]);
    expect(told(made, REPORTER)).toEqual([
      expect.stringMatching(/^The raid you signed up for has moved/),
      expect.stringMatching(/^The raid you signed up for has moved/),
    ]);
  });

  it('lets the clock do everything it does at hatch when the notifier throws', async () => {
    const broken = {
      bosses: (): never => {
        throw new Error('the boss list is broken');
      },
    };
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      { notifying: { raidBosses: broken } },
    );
    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Present);
    made.clock.now = HATCH + MINUTE;
    await made.scheduler.tick();
    await made.attendance.flush();
    await made.service.flush();
    expect(made.current().raid.boss).toEqual({ key: 'yveltal' });
    expect(made.said().some((line) => /hatched/i.test(line))).toBe(true);
    expect(
      made.entries.filter(
        (entry) =>
          entry.msg === 'could not tell members of an event' && entry['event'] === 'a changed raid',
      ),
    ).toHaveLength(1);
    expect(made.entries.some((entry) => entry.msg === 'could not run the clock for a party')).toBe(
      false,
    );
  });

  it('asks nobody about an event whose time has passed', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
    );
    const release = hold(made);
    const asked = made.members.batches.length;
    // An event for the gym is in flight; the boss waits behind it until the raid is over.
    await made.gymTargets.add(DORA, made.gateway.guildId, 2);
    await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    await untilAsked(made, asked);
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), yveltal);
    made.clock.now = (made.current().endTime ?? 0) + 1;
    release();
    await made.notify.flush();
    expect(made.members.batches).toHaveLength(asked + 1);
    expect(made.dms.to(BOB)).toEqual([]);
  });

  it('tells a member once when a raid moves to another region while they are being asked about', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
    );
    const release = hold(made);
    const asked = made.members.batches.length;
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), yveltal);
    await untilAsked(made, asked);
    // The answer for the old party comes while the raid is on its way to the other region.
    const moving = made.notify.raidMoving.bind(made.notify);
    made.notify.raidMoving = (fromId, toId) => {
      moving(fromId, toId);
      release();
    };
    const outcome = await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 8);
    expect(outcome.kind).toBe('ok');
    await made.notify.flush();
    expect(made.dms.to(BOB)).toHaveLength(1);
    expect(made.notify.remembered).toBe(1);
  });

  it('does not count a member as told whose message could not be made', async () => {
    const made = await reported(
      async ({ wants, gateway }) => {
        await wants.set(ALICE, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, T5, 'raid');
        await wants.set(BOB, gateway.guildId, YVELTAL, 'raid');
      },
      { time: { hatch: HATCH } },
      {
        notifying: {
          regions: {
            byId: (): never => {
              throw new Error('the regions are away');
            },
            all: () => [],
          },
        },
      },
    );
    expect(made.dms.jobs).toEqual([]);
    const failures = made.entries.filter(
      (entry) => entry.msg === 'could not make the direct message for an event',
    );
    // Once per set of reasons, not once per member.
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ level: 40 });
    expect(made.notify.remembered).toBe(0);
  });

  it('asks nobody at shutdown about an event that was still reading who it is for', async () => {
    let gate: Promise<void> = Promise.resolve();
    const reads = new Tally('the reads of who targets a gym');
    const made = await reportedRaid(
      { time: { hatch: HATCH } },
      {
        notifying: {
          gymTargets: {
            targeting: async () => {
              reads.add();
              await gate;
              return [DORA];
            },
          },
        },
      },
    );
    await made.notify.flush();
    expect(made.dms.to(DORA)).toHaveLength(1);
    const asked = made.members.batches.length;
    let release: () => void = () => undefined;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    await made.raids.setGym(made.party.id, member(CAROL, 'Carol'), 2);
    await reads.reached(2);
    // The close has done all it can while the read is held: it waits for that read.
    const immediates = watchImmediates();
    onTestFinished(() => {
      immediates.restore();
    });
    const closing = made.notify.close();
    await immediates.settle();
    release();
    await closing;
    expect(made.members.batches).toHaveLength(asked);
    expect(made.dms.to(DORA)).toHaveLength(1);
  });

  it('stops at shutdown: what is in flight puts its batch in line, nothing more begins', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.notify.flush();
    for (let n = 0; n < 250; n++) {
      made.wants.add(
        String(300_000_000_000_000_000n + BigInt(n)),
        made.gateway.guildId,
        -5,
        'raid',
      );
    }
    const release = hold(made);
    await made.raids.setBoss(made.party.id, member(DORA, 'Dora'), yveltal);
    await untilAsked(made, 0);
    const closing = made.notify.close();
    release();
    await closing;
    expect(made.dms.jobs).toHaveLength(99);
    expect(made.members.batches).toHaveLength(1);
    // Nothing is taken from then on.
    await made.raids.setBoss(made.party.id, member(CAROL, 'Carol'), yveltal);
    await made.notify.flush();
    expect(made.members.batches).toHaveLength(1);
  });
});

describe('NotifyService: many recipients', () => {
  /** A user id of 18 digits for a number. */
  const idOf = (n: number): string => String(300_000_000_000_000_000n + BigInt(n));

  it('judges, asks about and puts in line thousands in batches that give the event loop back', async () => {
    const kept = await partyServiceWith();
    for (let n = 0; n < 5_000; n++) kept.wants.add(idOf(n), kept.gateway.guildId, -5, 'raid');
    // Every tenth cannot see the forum.
    kept.gateway.shutOut(
      WEST_FORUM,
      ...Array.from({ length: 500 }, (_unused, index) => idOf(index * 10)),
    );
    let beats = 0;
    let beating = true;
    const beat = (): void => {
      beats += 1;
      if (beating) setImmediate(beat);
    };
    setImmediate(beat);
    const made = await reportedRaid(
      {},
      {},
      {
        storage: kept.storage,
        gateway: kept.gateway,
        regions: kept.regions,
        clock: kept.clock,
        tags: kept.tags,
        wants: kept.wants,
      },
    );
    await made.notify.flush();
    beating = false;
    expect(made.dms.jobs).toHaveLength(4_500);
    expect(new Set(made.dms.jobs.map((job) => job.userId)).size).toBe(4_500);
    // Ninety-nine at a time (the request for them names the bot too), each batch asked about
    // in one question.
    expect(made.members.batches).toHaveLength(51);
    expect(made.members.batches.map((batch) => batch.userIds.length)).toEqual([
      ...Array.from({ length: 50 }, () => 99),
      50,
    ]);
    // The event loop turned at least twice per batch: for the answer, and between the batches.
    expect(beats).toBeGreaterThanOrEqual(102);
    // One message was built for all of them.
    expect(new Set(made.dms.jobs.map((job) => job.message)).size).toBe(1);
  });
});
