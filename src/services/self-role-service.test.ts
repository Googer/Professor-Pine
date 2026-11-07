import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { ROLE, selfRolesWith } from '../../test/support/roles.js';

const HOME = FAKE_GUILD_ID;
const ELSEWHERE = '499999999999999999';

/** Alice as an interaction of hers shows her at this moment. */
function alice(made: ReturnType<typeof selfRolesWith>) {
  return made.server.seen(ALICE);
}

describe('SelfRoleService.roster', () => {
  it('is undefined for a server whose roles the bot does not know', async () => {
    const made = selfRolesWith();
    expect(await made.selfRoles.roster(ELSEWHERE)).toBeUndefined();
    expect(
      await made.selfRoles.change(
        ELSEWHERE,
        { id: ALICE, held: [], seenAt: made.clock.now },
        { give: [], take: [] },
      ),
    ).toEqual({
      kind: 'unavailable',
    });
  });

  it('resolves the rows against the roles the server has now', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.edit(ROLE.north, { name: 'Northside' }).delete(ROLE.east);
    made.server.edit(ROLE.trader, { moderation: ['Manage Messages'] });
    const roster = await made.selfRoles.roster(HOME);
    expect(roster?.groups.map((group) => group.name)).toEqual(['Regions', 'Teams']);
    expect(roster?.entries.map((entry) => [entry.name, entry.group?.name, entry.problem])).toEqual([
      ['East', 'Regions', 'gone'],
      ['Instinct', 'Teams', undefined],
      ['Mystic', 'Teams', undefined],
      ['Northside', 'Regions', undefined],
      ['South', 'Regions', undefined],
      ['Trader', undefined, 'moderation'],
      ['Valor', 'Teams', undefined],
    ]);
    // The row follows its role's new name, for the legacy bot.
    expect(made.storage.rows.find((row) => row.roleId === ROLE.north)?.name).toBe('Northside');
  });

  it('gives a legacy row the id of its role the first time it is resolved, and then goes by it', async () => {
    const made = selfRolesWith();
    const id = made.storage.legacyRow('north', { description: 'from before' });
    expect((await made.selfRoles.roster(HOME))?.entries[0]).toMatchObject({
      name: 'North',
      role: { id: ROLE.north },
      problem: undefined,
    });
    expect(made.storage.rows.find((row) => row.id === id)).toMatchObject({
      roleId: ROLE.north,
      name: 'North',
    });
    made.server.edit(ROLE.north, { name: 'Up North' }).role('540000000000000001', 'North');
    expect((await made.selfRoles.roster(HOME))?.entries[0]).toMatchObject({
      name: 'Up North',
      role: { id: ROLE.north },
    });
  });

  it('still answers when what it found cannot be written', async () => {
    const made = selfRolesWith();
    made.storage.legacyRow('North');
    made.storage.remember = () => Promise.reject(new Error('database away'));
    expect((await made.selfRoles.roster(HOME))?.entries[0]).toMatchObject({
      role: { id: ROLE.north },
    });
    expect(made.entries.some((entry) => entry.msg === 'could not remember resolved roles')).toBe(
      true,
    );
  });

  it('reads the roles of the server after the rows: what changed while the database answered counts', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    const list = made.storage.list.bind(made.storage);
    made.storage.list = async (guildId) => {
      const rows = await list(guildId);
      made.server.edit(ROLE.north, { moderation: ['Kick Members'] }).delete(ROLE.south);
      return rows;
    };
    const roster = await made.selfRoles.roster(HOME);
    const problems = new Map(roster?.entries.map((entry) => [entry.name, entry.problem]));
    expect(problems.get('North')).toBe('moderation');
    expect(problems.get('South')).toBe('gone');
    // A server the bot lost meanwhile has no roster.
    made.storage.list = async (guildId) => {
      const rows = await list(guildId);
      made.gateway.servers.delete(HOME);
      return rows;
    };
    expect(await made.selfRoles.roster(HOME)).toBeUndefined();
  });

  it('does not wait for the write when it is asked not to, and still writes', async () => {
    const made = selfRolesWith();
    const id = made.storage.legacyRow('north');
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const remember = made.storage.remember.bind(made.storage);
    made.storage.remember = async (guildId, writes) => {
      await held;
      return remember(guildId, writes);
    };
    const roster = await made.selfRoles.roster(HOME, 'aside');
    expect(roster?.entries[0]).toMatchObject({ name: 'North', role: { id: ROLE.north } });
    expect(made.storage.rows.find((row) => row.id === id)?.roleId).toBeNull();
    // A second look while the first one's write is on its way starts no second write.
    const writes = vi.spyOn(made.storage, 'remember');
    await made.selfRoles.roster(HOME, 'aside');
    expect(writes).not.toHaveBeenCalled();
    release();
    await made.selfRoles.idle();
    expect(made.storage.rows.find((row) => row.id === id)?.roleId).toBe(ROLE.north);
  });

  it('does not try a write the database refuses again for a while', async () => {
    const made = selfRolesWith();
    made.storage.legacyRow('North');
    const remember = made.storage.remember.bind(made.storage);
    const writes = vi.fn(() => Promise.reject(new Error('database away')));
    made.storage.remember = writes;
    for (const mode of ['wait', 'aside', 'wait'] as const) {
      expect((await made.selfRoles.roster(HOME, mode))?.entries).toHaveLength(1);
      await made.selfRoles.idle();
    }
    expect(writes).toHaveBeenCalledTimes(1);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not remember resolved roles'),
    ).toHaveLength(1);
    // Another server is not held up by it.
    made.gateway.add(ELSEWHERE).role('540000000000000001', 'Raider');
    made.storage.legacyRow('Raider', { guildId: ELSEWHERE });
    await made.selfRoles.roster(ELSEWHERE);
    expect(writes).toHaveBeenCalledTimes(2);
    // After a minute it is tried again.
    made.storage.remember = remember;
    made.clock.now += 59_000;
    await made.selfRoles.roster(HOME);
    expect(made.storage.rows[0]?.roleId).toBeNull();
    made.clock.now += 1_000;
    await made.selfRoles.roster(HOME);
    expect(made.storage.rows[0]?.roleId).toBe(ROLE.north);
  });

  it('says that the rows were brought up to date only when something was written', async () => {
    const made = selfRolesWith();
    made.storage.legacyRow('North');
    const told = () =>
      made.entries.filter(
        (entry) => entry.msg === 'self-assigned roles brought up to date with the server',
      ).length;
    await made.selfRoles.roster(HOME);
    expect(told()).toBe(1);
    await made.selfRoles.roster(HOME);
    expect(told()).toBe(1);
    // A new name the database will not take is found again with every look and never written.
    made.server.edit(ROLE.north, { name: 'Northside' });
    made.storage.remember = () => Promise.resolve(0);
    await made.selfRoles.roster(HOME);
    await made.selfRoles.roster(HOME);
    expect(told()).toBe(1);
  });
});

describe('SelfRoleService.change', () => {
  it('gives and takes one role at a time, what is given first, and says what the member holds then', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.south, ROLE.valor);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.mystic],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['North', 'Mystic']);
    expect(outcome.taken.map((entry) => entry.name)).toEqual(['Valor', 'South']);
    expect(outcome.held.sort()).toEqual([ROLE.north, ROLE.mystic]);
    expect(made.gateway.said()).toEqual(['give North', 'give Mystic', 'take Valor', 'take South']);
    expect(made.gateway.calls.every((call) => call.memberId === ALICE)).toBe(true);
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'North']);
  });

  it('asks nothing of Discord when nothing changes', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.north);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [ROLE.south],
    });
    expect(outcome).toMatchObject({ kind: 'done', held: [ROLE.north], given: [], taken: [] });
    expect(made.gateway.calls).toEqual([]);
  });

  it('names only self-assigned roles to Discord, whatever is asked for', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.moderator, ROLE.admin, ROLE.booster, ROLE.valor);
    const everything = Object.values(ROLE);
    const offered: string[] = [
      ROLE.north,
      ROLE.south,
      ROLE.east,
      ROLE.instinct,
      ROLE.mystic,
      ROLE.valor,
      ROLE.trader,
    ];
    // Everything the server has is asked for, then everything is asked to be taken away.
    await made.selfRoles.change(HOME, alice(made), { give: everything, take: [] });
    expect(made.server.heldNames(ALICE)).toEqual(
      ['Admin', 'East', 'Moderator', 'North', 'Server Booster', 'South', 'Trader', 'Valor'].sort(),
    );
    await made.selfRoles.change(HOME, alice(made), { give: [], take: everything });
    expect(made.server.heldNames(ALICE)).toEqual(['Admin', 'Moderator', 'Server Booster']);
    expect(made.gateway.calls.length).toBeGreaterThan(0);
    for (const call of made.gateway.calls) expect(offered).toContain(call.roleId);
  });

  it('gives no role that became dangerous after it was added, and none of a row that is gone', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    made.server.edit(ROLE.north, { moderation: ['Ban Members'] });
    made.server.edit(ROLE.south, { position: 50 });
    made.server.delete(ROLE.east);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south, ROLE.east, ROLE.trader],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['North', 'moderation'],
      ['South', 'above-bot'],
      [undefined, 'not-offered'],
    ]);
    expect(made.server.heldNames(ALICE)).toEqual(['Trader']);
  });

  it('does not give back a role an admin took away between the interaction and the request', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.moderator);
    const seen = alice(made);
    // The admin demotes Alice before the bot's request arrives.
    made.server.member(ALICE);
    const outcome = await made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    expect(outcome.kind).toBe('done');
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    expect(made.gateway.said()).toEqual(['give North']);
  });

  it('does not strip a role that was given between the interaction and the request', async () => {
    const made = selfRolesWith();
    const MUTED = '580000000000000001';
    made.server.role(MUTED, 'Muted', { position: 45 });
    await made.offerSample();
    made.server.member(ALICE);
    const seen = alice(made);
    made.server.member(ALICE, MUTED);
    await made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    expect(made.server.heldNames(ALICE)).toEqual(['Muted', 'North']);
  });

  it('does not give back a role of its own recent change that staff took away since', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.trader], take: [] });
    // Staff: Trader gets Kick Members, the row is removed, Alice loses the role by hand.
    made.server.edit(ROLE.trader, { moderation: ['Kick Members'] });
    const { rows } = await made.selfRoles.stored(HOME);
    await made.selfRoles.removeRole(HOME, rows.find((row) => row.name === 'Trader')?.id ?? 0);
    made.server.member(ALICE);
    made.clock.now += 5_000;
    // A fresh interaction, which shows Alice truthfully without Trader.
    const fresh = alice(made);
    expect(made.selfRoles.heldNow(HOME, fresh)).toEqual([]);
    const outcome = await made.selfRoles.change(HOME, fresh, { give: [ROLE.north], take: [] });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.held).toEqual([ROLE.north]);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
  });

  it('lays over an interaction only the changes that finished after it was made', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const before = alice(made);
    made.clock.now += 1_000;
    await made.selfRoles.change(HOME, before, { give: [ROLE.north], take: [] });
    // An interaction from before the change does not show it; the service knows better.
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([ROLE.north]);
    // One made within the margin for the clocks is still laid over,
    made.clock.now += 1_500;
    expect(made.selfRoles.heldNow(HOME, { ...before, seenAt: made.clock.now })).toEqual([
      ROLE.north,
    ]);
    // and a later one is believed as it is: staff took the role away by hand meanwhile.
    made.server.member(ALICE);
    made.clock.now += 1_000;
    expect(made.selfRoles.heldNow(HOME, alice(made))).toEqual([]);
    // The old interaction is laid over for as long as it can be answered: fifteen minutes.
    made.clock.now += 10_000;
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([ROLE.north]);
    made.clock.now += 15 * 60_000;
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([]);
  });

  it('believes an interaction whose picture differs from the server, at the cost of a wrong "already" or a request too many', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.south);
    // The picture has North, which Alice lacks, and lacks South, which she has.
    const picture = { id: ALICE, held: [ROLE.north], seenAt: made.clock.now };
    const outcome = await made.selfRoles.change(HOME, picture, {
      give: [ROLE.north, ROLE.south],
      take: [ROLE.east],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.already.map((entry) => entry.name)).toEqual(['North']);
    expect(outcome.plan.lacking.map((entry) => entry.name)).toEqual(['East']);
    // Giving what she has changes nothing, and nothing else of hers is touched.
    expect(made.gateway.said()).toEqual(['give South']);
    expect(made.server.heldNames(ALICE)).toEqual(['South']);
  });

  it('runs a queued request with its old picture without undoing what happened meanwhile', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.moderator);
    // All three interactions were made while Alice held Valor and Moderator.
    const seen = alice(made);
    let release: () => void = () => undefined;
    made.gateway.holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = made.selfRoles.change(HOME, seen, { give: [ROLE.mystic], take: [] });
    const second = made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    const third = made.selfRoles.change(HOME, seen, { give: [], take: [ROLE.north] });
    // The first request is on its way and the others wait for it; an admin takes Moderator away.
    await made.gateway.requests.reached(1);
    expect(made.gateway.calls).toHaveLength(1);
    made.server.members.get(ALICE)?.delete(ROLE.moderator);
    made.gateway.holding = undefined;
    release();
    const outcomes = await Promise.all([first, second, third]);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['done', 'done', 'done']);
    // The third knows of the second's change although its interaction does not show it.
    expect(made.gateway.said()).toEqual(['give Mystic', 'take Valor', 'give North', 'take North']);
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic']);
  });

  it('reports a give that worked and a take that failed as exactly that', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.south);
    // Between the look at the roles and the second request Valor is moved above the bot.
    made.gateway.meanwhile = (call) => {
      if (call.action === 'take') made.server.edit(ROLE.valor, { position: 55 });
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.mystic],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['Mystic']);
    expect(outcome.taken).toEqual([]);
    expect(outcome.failed).toMatchObject({
      action: 'take',
      entry: { name: 'Valor' },
      reason: 'no-permission',
    });
    expect(outcome.untried.map((step) => [step.action, step.entry.name])).toEqual([
      ['take', 'South'],
    ]);
    expect(outcome.held.sort()).toEqual([ROLE.south, ROLE.valor, ROLE.mystic].sort());
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'South', 'Valor']);
    // What was done is remembered; what was not is not.
    expect(made.selfRoles.heldNow(HOME, { id: ALICE, held: [], seenAt: 0 })).toEqual([ROLE.mystic]);
    expect(
      made.entries.some((entry) => entry.msg === 'Discord refused a change of self-assigned roles'),
    ).toBe(true);
  });

  it('tells its listeners of every change that took a role away, done or partial (plan 8M-20, W2)', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    const told: string[] = [];
    made.selfRoles.onRolesTaken((guild, member) => told.push(`${guild} ${member}`));
    made.selfRoles.onRolesTaken(() => {
      throw new Error('a listener that fails');
    });
    made.server.member(ALICE, ROLE.north, ROLE.south);
    // Only given: nobody is told.
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.mystic], take: [] });
    expect(told).toEqual([]);
    // Done, with something taken.
    await made.selfRoles.change(HOME, alice(made), { give: [], take: [ROLE.mystic] });
    expect(told).toEqual([`${HOME} ${ALICE}`]);
    // Partial: North taken, South moved above the bot meanwhile.
    made.gateway.meanwhile = () => made.server.edit(ROLE.south, { position: 55 });
    const partial = await made.selfRoles.change(HOME, alice(made), {
      give: [],
      take: [ROLE.north, ROLE.south],
    });
    expect(partial).toMatchObject({ kind: 'partial', taken: [{ name: 'North' }] });
    expect(told).toEqual([`${HOME} ${ALICE}`, `${HOME} ${ALICE}`]);
    // A listener that fails is logged and keeps nothing from the others.
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'could not pass on that a self-assigned role was taken away',
      ),
    ).toHaveLength(2);
  });

  it('takes nothing away when the role that was to replace it could not be given', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor);
    const before = alice(made);
    made.gateway.meanwhile = () => made.server.edit(ROLE.mystic, { position: 55 });
    const outcome = await made.selfRoles.change(HOME, before, { give: [ROLE.mystic], take: [] });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome).toMatchObject({
      given: [],
      taken: [],
      failed: { action: 'give', entry: { name: 'Mystic' }, reason: 'no-permission' },
      held: [ROLE.valor],
    });
    expect(outcome.untried.map((step) => [step.action, step.entry.name])).toEqual([
      ['take', 'Valor'],
    ]);
    expect(made.gateway.said()).toEqual(['give Mystic']);
    expect(made.server.heldNames(ALICE)).toEqual(['Valor']);
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([ROLE.valor]);
  });

  it.each(['no-role', 'no-member', 'two-factor'] as const)(
    'hands on the refusal %s of Discord',
    async (reason) => {
      const made = selfRolesWith();
      await made.offerSample();
      made.server.member(ALICE);
      made.gateway.refusing = reason;
      const outcome = await made.selfRoles.change(HOME, alice(made), {
        give: [ROLE.north],
        take: [],
      });
      expect(outcome).toMatchObject({ kind: 'partial', failed: { reason }, given: [] });
    },
  );

  it('rejects when Discord fails otherwise before anything was done, and runs the next request all the same', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    made.gateway.failing = new Error('Discord is away');
    await expect(
      made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] }),
    ).rejects.toThrow('Discord is away');
    made.gateway.failing = undefined;
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.south], take: [] });
    expect(made.server.heldNames(ALICE)).toEqual(['South']);
  });

  it('reports a failure of another kind after something was done, instead of hiding what was done', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 1) made.gateway.failing = new Error('away');
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south, ROLE.east],
      take: [],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['North']);
    expect(outcome.failed).toMatchObject({
      action: 'give',
      entry: { name: 'South' },
      reason: 'error',
    });
    expect(outcome.untried.map((step) => step.entry.name)).toEqual(['East']);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    expect(
      made.entries.some((entry) => entry.msg === 'a change of self-assigned roles failed half-way'),
    ).toBe(true);
  });

  it('checks every step after the first when it is sent: a role that gained a permission meanwhile is not given', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    // While the first request is on its way, staff give South a permission of moderation.
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 0) {
        made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      }
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south, ROLE.east],
      take: [],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['North']);
    expect(outcome.failed).toMatchObject({
      action: 'give',
      entry: { name: 'South', problem: 'moderation' },
      reason: 'withdrawn',
      why: 'moderation',
    });
    expect(outcome.untried.map((step) => [step.action, step.entry.name])).toEqual([
      ['give', 'East'],
    ]);
    // Discord was never asked for South.
    expect(made.gateway.said()).toEqual(['give North']);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    expect(outcome.held).toEqual([ROLE.north]);
    expect(
      made.entries.some((entry) => entry.msg === 'a change of self-assigned roles was stopped'),
    ).toBe(true);
  });

  it('gives no role that was renamed to a name of staff since it was added, and still takes it back', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.south);
    made.server.edit(ROLE.north, { name: 'Bot Developer' }).edit(ROLE.south, { name: 'ADMIN' });
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['Bot Developer', 'moderation'],
    ]);
    expect(made.gateway.said()).toEqual(['take ADMIN']);
    expect(made.server.held(ALICE)).toEqual([]);
  });

  it('gives no role that a channel came to allow a permission of moderation after it was added', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.south);
    made.server.channelAllows(ROLE.north, ['Manage Threads']);
    made.server.channelAllows(ROLE.south, ['Manage Webhooks']);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['North', 'moderation'],
    ]);
    expect(made.gateway.said()).toEqual(['take South']);
    // The overwrite goes with the channel, and the role is harmless again.
    made.server.channelAllows(ROLE.north, []);
    expect(
      await made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] }),
    ).toMatchObject({ kind: 'done', given: [{ name: 'North' }] });
  });

  it('does not take away unasked a role of a pick-one group that became a role of moderation', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor);
    made.server.edit(ROLE.valor, { name: 'Moderator' });
    const swap = await made.selfRoles.change(HOME, alice(made), { give: [ROLE.mystic], take: [] });
    if (swap.kind !== 'done') throw new Error(swap.kind);
    expect(swap.plan.skipped).toMatchObject([
      { reason: 'stuck', entry: { name: 'Mystic' }, blocker: { name: 'Moderator' } },
    ]);
    expect(made.gateway.calls).toEqual([]);
    // Given back outright, it goes.
    await made.selfRoles.change(HOME, alice(made), { give: [], take: [ROLE.valor] });
    expect(made.gateway.said()).toEqual(['take Moderator']);
    expect(made.server.held(ALICE)).toEqual([]);
  });

  it('withdraws the take of a displaced role that became a role of moderation while the new one was given', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.south);
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 0) {
        made.server.channelAllows(ROLE.valor, ['Manage Messages']);
        made.server.channelAllows(ROLE.south, ['Manage Messages']);
      }
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.mystic],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.failed).toMatchObject({
      action: 'take',
      entry: { name: 'Valor' },
      reason: 'withdrawn',
      why: 'moderation',
    });
    expect(made.gateway.said()).toEqual(['give Mystic']);
    // What the member asked to lose would still have gone.
    made.gateway.meanwhile = undefined;
    await made.selfRoles.change(HOME, alice(made), { give: [], take: [ROLE.south] });
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'Valor']);
  });

  it('does not give a role that gained a permission while the rows were being read', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const list = made.storage.list.bind(made.storage);
    made.storage.list = async (guildId) => {
      const rows = await list(guildId);
      made.server.edit(ROLE.north, { moderation: ['Kick Members'] });
      return rows;
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => skip.reason)).toEqual(['moderation']);
    expect(made.gateway.calls).toEqual([]);
  });

  it('asks the rule again right before every give: a role that gained a permission after the roster was made is not given', async () => {
    const made = selfRolesWith();
    made.server.member(ALICE);
    // What resolving a legacy row found is written before the first step: time in which the
    // server changes.
    const legacy = ['north', 'south', 'east', 'trader'];
    const remember = made.storage.remember.bind(made.storage);
    const changes = [
      () => made.server.edit(ROLE.north, { moderation: ['Kick Members'] }),
      () => made.server.edit(ROLE.south, { name: 'Admin' }),
      () => made.server.delete(ROLE.east),
      () => made.gateway.servers.delete(HOME),
    ];
    const tried: unknown[] = [];
    for (const [index, roleId] of [ROLE.north, ROLE.south, ROLE.east, ROLE.trader].entries()) {
      made.storage.legacyRow(legacy[index] ?? '');
      made.storage.remember = async (guildId, writes) => {
        const written = await remember(guildId, writes);
        changes[index]?.();
        return written;
      };
      const outcome = await made.selfRoles.change(HOME, alice(made), { give: [roleId], take: [] });
      if (outcome.kind !== 'partial') throw new Error(outcome.kind);
      expect(outcome).toMatchObject({ given: [], taken: [], untried: [] });
      tried.push([outcome.failed.reason, 'why' in outcome.failed && outcome.failed.why]);
    }
    expect(tried).toEqual([
      ['withdrawn', 'moderation'],
      ['withdrawn', 'moderation'],
      ['withdrawn', 'gone'],
      ['withdrawn', 'unavailable'],
    ]);
    // Discord was asked for none of them.
    expect(made.gateway.calls).toEqual([]);
  });

  it('shows the server as it is after a give that was withdrawn at the last moment', async () => {
    const made = selfRolesWith();
    made.server.member(ALICE);
    made.storage.legacyRow('north');
    const remember = made.storage.remember.bind(made.storage);
    made.storage.remember = async (guildId, writes) => {
      const written = await remember(guildId, writes);
      made.server.edit(ROLE.north, { moderation: ['Kick Members'] });
      return written;
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.failed.entry).toMatchObject({ name: 'North', problem: 'moderation' });
    expect(outcome.roster.entries).toMatchObject([{ name: 'North', problem: 'moderation' }]);
  });

  it('refuses a member a fourth change while three of theirs are running or waiting', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE).member(BOB);
    let release = (): void => undefined;
    made.gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const seen = alice(made);
    const three = [ROLE.north, ROLE.south, ROLE.east].map((roleId) =>
      made.selfRoles.change(HOME, seen, { give: [roleId], take: [] }),
    );
    expect(await made.selfRoles.change(HOME, seen, { give: [ROLE.trader], take: [] })).toEqual({
      kind: 'refused',
      reason: 'busy',
    });
    // Another member, and the same member in another server, are not held up by it.
    const bob = made.selfRoles.change(HOME, made.server.seen(BOB), {
      give: [ROLE.north],
      take: [],
    });
    expect(await made.selfRoles.change(ELSEWHERE, seen, { give: [ROLE.trader], take: [] })).toEqual(
      { kind: 'unavailable' },
    );
    release();
    expect((await Promise.all([...three, bob])).map((outcome) => outcome.kind)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(made.server.heldNames(ALICE)).toEqual(['East', 'North', 'South']);
    // Once they are through, the next one is taken again, also after one that failed.
    made.gateway.holding = undefined;
    made.gateway.failing = new Error('Discord is away');
    const failing = [ROLE.trader, ROLE.trader, ROLE.trader].map((roleId) =>
      made.selfRoles.change(HOME, alice(made), { give: [roleId], take: [] }),
    );
    expect((await Promise.allSettled(failing)).map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    made.gateway.failing = undefined;
    expect(
      await made.selfRoles.change(HOME, alice(made), { give: [ROLE.trader], take: [] }),
    ).toMatchObject({ kind: 'done', given: [{ name: 'Trader' }] });
  });

  it('does not carry out a change whose interaction can no longer be answered when its turn comes', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    let release = (): void => undefined;
    made.gateway.holding = new Promise<void>((resolve) => (release = resolve));
    const seen = alice(made);
    const first = made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    const second = made.selfRoles.change(HOME, seen, { give: [ROLE.south], take: [] });
    // One that is a second short of its end when its turn comes is still carried out.
    const late = { ...seen, seenAt: seen.seenAt + 1_000 };
    const third = made.selfRoles.change(HOME, late, { give: [ROLE.east], take: [] });
    await made.gateway.requests.reached(1);
    expect(made.gateway.said()).toEqual(['give North']);
    made.clock.now += 15 * 60_000;
    release();
    expect(await first).toMatchObject({ kind: 'done' });
    expect(await second).toEqual({ kind: 'refused', reason: 'expired' });
    expect(await third).toMatchObject({ kind: 'done' });
    expect(made.gateway.said()).toEqual(['give North', 'give East']);
    expect(made.server.heldNames(ALICE)).toEqual(['East', 'North']);
    expect(
      made.entries.some((entry) => entry.msg === 'a change of self-assigned roles came too late'),
    ).toBe(true);
  });

  it('does not give a role whose row staff removed while the first request was on its way', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const { rows } = await made.selfRoles.stored(HOME);
    const south = rows.find((row) => row.name === 'South')?.id ?? 0;
    let removing: Promise<unknown> | undefined;
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 0) removing = made.selfRoles.removeRole(HOME, south);
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south],
      take: [],
    });
    await removing;
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.failed).toMatchObject({
      action: 'give',
      entry: { name: 'South' },
      reason: 'withdrawn',
      why: 'not-offered',
    });
    expect(outcome.untried).toEqual([]);
    expect(made.gateway.said()).toEqual(['give North']);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
  });

  it('does not take a role the bot can no longer change, and still takes one that only gained a permission', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.south, ROLE.east);
    made.gateway.meanwhile = (call) => {
      // While Mystic is given, South gains a permission (it may still be given back),
      if (made.gateway.calls.indexOf(call) === 0) {
        made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      }
      // and while South is taken, East is moved above the bot.
      if (made.gateway.calls.indexOf(call) === 2) made.server.edit(ROLE.east, { position: 55 });
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.mystic],
      take: [ROLE.south, ROLE.east],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.taken.map((entry) => entry.name)).toEqual(['Valor', 'South']);
    expect(outcome.failed).toMatchObject({
      action: 'take',
      entry: { name: 'East' },
      reason: 'withdrawn',
      why: 'above-bot',
    });
    expect(made.gateway.said()).toEqual(['give Mystic', 'take Valor', 'take South']);
    expect(made.server.heldNames(ALICE)).toEqual(['East', 'Mystic']);
  });

  it('stops when it cannot see the roles of the server any more', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const known = made.gateway.server.bind(made.gateway);
    made.gateway.meanwhile = () => {
      made.gateway.server = () => undefined;
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south],
      take: [],
    });
    made.gateway.server = known;
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.failed).toMatchObject({
      entry: { name: 'South' },
      reason: 'withdrawn',
      why: 'unavailable',
    });
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    // What it shows is the last it saw.
    expect(outcome.roster.entries.length).toBeGreaterThan(0);
  });

  it('answers with the roster as it is after the change', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    // While the one request is on its way, South gains a permission and East is renamed.
    made.gateway.meanwhile = () => {
      made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      made.server.edit(ROLE.east, { name: 'Eastside' });
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    const shown = outcome.roster.entries.map((entry) => [entry.name, entry.problem]);
    expect(shown).toContainEqual(['South', 'moderation']);
    expect(shown).toContainEqual(['Eastside', undefined]);
    // A change that asked nothing of Discord shows the roster it was planned with.
    made.gateway.meanwhile = undefined;
    const lists = vi.spyOn(made.storage, 'list');
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] });
    expect(lists).toHaveBeenCalledTimes(1);
  });

  it('remembers its changes for as long as an interaction can be answered: a slow request does not lose them', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    // Three interactions made at the same moment, while Alice held nothing.
    const seen = alice(made);
    await made.selfRoles.change(HOME, seen, { give: [ROLE.valor], take: [] });
    let release: () => void = () => undefined;
    made.gateway.holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const second = made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    const third = made.selfRoles.change(HOME, seen, { give: [ROLE.mystic], take: [] });
    await made.gateway.requests.reached(2);
    expect(made.gateway.calls).toHaveLength(2);
    // Discord makes the bot wait (a rate limit): eleven seconds pass.
    made.clock.now += 11_000;
    made.gateway.holding = undefined;
    release();
    await Promise.all([second, third]);
    // The third still knows of Valor, which its interaction does not show, and takes it away.
    expect(made.gateway.said()).toEqual(['give Valor', 'give North', 'give Mystic', 'take Valor']);
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'North']);
  });

  it('keeps the members and the servers apart', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE).member(BOB);
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] });
    expect(made.selfRoles.heldNow(HOME, { id: BOB, held: [], seenAt: 0 })).toEqual([]);
    expect(made.selfRoles.heldNow(ELSEWHERE, { id: ALICE, held: [], seenAt: 0 })).toEqual([]);
    expect(made.server.held(BOB)).toEqual([]);
  });
});

describe('SelfRoleService.addRole', () => {
  it('adds a role of the server and changes it when it is added again', async () => {
    const made = selfRolesWith();
    expect(
      await made.selfRoles.addRole(
        HOME,
        { roleId: ROLE.north, description: 'Up', aliases: ['n'] },
        made.owner(),
      ),
    ).toMatchObject({
      kind: 'added',
      row: { name: 'North', roleId: ROLE.north, description: 'Up', aliases: ['n'] },
      botLacksManageRoles: false,
    });
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.north, aliases: [] }, made.owner()),
    ).toMatchObject({
      kind: 'changed',
      row: { description: 'Up', aliases: [] },
    });
    expect((await made.selfRoles.stored(HOME)).rows).toHaveLength(1);
  });

  it.each([
    [FAKE_GUILD_ID, 'everyone'],
    [ROLE.booster, 'managed'],
    [ROLE.bot, 'managed'],
    [ROLE.moderator, 'moderation'],
    [ROLE.admin, 'moderation'],
  ] as const)('refuses the role %s as %s', async (roleId, problem) => {
    const made = selfRolesWith();
    expect(await made.selfRoles.addRole(HOME, { roleId }, made.owner())).toMatchObject({
      kind: 'unfit',
      problem,
    });
    expect((await made.selfRoles.stored(HOME)).rows).toEqual([]);
  });

  it('never offers a role whose name makes its holder staff of this bot, whatever it grants', async () => {
    const made = selfRolesWith();
    for (const [index, name] of ['admin', 'Moderator', 'Bot Developer'].entries()) {
      const id = `54000000000000000${String(index)}`;
      made.server.role(id, name);
      expect(await made.selfRoles.addRole(HOME, { roleId: id }, made.owner())).toMatchObject({
        kind: 'unfit',
        problem: 'moderation',
        role: { moderation: [], channelModeration: [], staffName: true },
      });
    }
    expect((await made.selfRoles.stored(HOME)).rows).toEqual([]);
  });

  it('never offers a role that a channel allows a permission of moderation', async () => {
    const made = selfRolesWith();
    made.server.channelAllows(ROLE.north, ['Manage Messages', 'Manage Roles']);
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.owner())).toMatchObject({
      kind: 'unfit',
      problem: 'moderation',
      role: { moderation: [], channelModeration: ['Manage Permissions', 'Manage Messages'] },
    });
    // What a channel allows every member, or what is no moderation, makes no role dangerous.
    made.server.everyone(PermissionFlagsBits.MentionEveryone);
    made.server.channelAllows(ROLE.south, ['Mention @everyone, @here and All Roles']);
    made.server.channelAllows(ROLE.east, PermissionFlagsBits.SendMessages);
    for (const roleId of [ROLE.south, ROLE.east]) {
      expect(await made.selfRoles.addRole(HOME, { roleId }, made.owner())).toMatchObject({
        kind: 'added',
      });
    }
  });

  it('takes over the row of a role that was deleted when a role of its name is added', async () => {
    const made = selfRolesWith();
    const { regions } = await made.offerSample();
    const before = (await made.selfRoles.stored(HOME)).rows.find((row) => row.name === 'North');
    made.server.delete(ROLE.north).role('540000000000000001', 'North');
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000001' }, made.owner()),
    ).toMatchObject({
      kind: 'changed',
      row: {
        id: before?.id,
        roleId: '540000000000000001',
        description: 'North of the river',
        aliases: ['n'],
        groupId: regions,
      },
    });
    expect((await made.selfRoles.stored(HOME)).rows).toHaveLength(7);
    // A row whose role is still there is in the way as before.
    made.server.role('540000000000000002', 'South');
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000002' }, made.owner()),
    ).toMatchObject({ kind: 'refused', reason: 'name-taken' });
  });

  it('compares a new role with the names the listed roles have now', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    // North was renamed on Discord and nobody has looked since; another role is called North now.
    made.server.edit(ROLE.north, { name: 'Up North' }).role('540000000000000001', 'North');
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000001' }, made.owner()),
    ).toMatchObject({ kind: 'added', row: { name: 'North' } });
    expect(
      (await made.selfRoles.stored(HOME)).rows
        .filter((row) => /north/i.test(row.name))
        .map((row) => [row.name, row.roleId]),
    ).toEqual([
      ['Up North', ROLE.north],
      ['North', '540000000000000001'],
    ]);
  });

  it('refuses a role at or above the highest role of the bot', async () => {
    const made = selfRolesWith();
    made.server.role('540000000000000001', 'Level', { position: 50 });
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000001' }, made.owner()),
    ).toMatchObject({
      kind: 'unfit',
      problem: 'above-bot',
    });
  });

  it('judges a role by what it adds to what every member has anyway', async () => {
    const made = selfRolesWith();
    const { MentionEveryone, KickMembers, SendMessages } = PermissionFlagsBits;
    // Discord makes a role with the permissions of @everyone, which include Mention Everyone.
    made.server.everyone(SendMessages | MentionEveryone);
    made.server.edit(ROLE.north, { permissions: SendMessages | MentionEveryone });
    made.server.edit(ROLE.south, { permissions: SendMessages | MentionEveryone | KickMembers });
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.owner())).toMatchObject({
      kind: 'added',
    });
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.south }, made.owner())).toMatchObject({
      kind: 'unfit',
      problem: 'moderation',
      role: { moderation: ['Kick Members'] },
    });
    // The same is asked every time a role is given: once @everyone loses the permission, the
    // role that still has it grants something.
    made.server.everyone(SendMessages);
    made.server.member(ALICE);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => skip.reason)).toEqual(['moderation']);
    expect(made.server.held(ALICE)).toEqual([]);
  });

  it('lets staff offer only a role they could give by hand: Manage Roles, and the role below their own', async () => {
    const made = selfRolesWith();
    made.server.ownerId = BOB;
    made.server.member(ALICE, ROLE.moderator);
    const add = (roleId: string, mayManageRoles: boolean) =>
      made.selfRoles.addRole(HOME, { roleId }, made.server.staff(ALICE, mayManageRoles));
    // Moderator stands at 40: North (5) is below it, a role at 40 or above is not.
    expect(await add(ROLE.north, false)).toMatchObject({
      kind: 'not-yours',
      problem: 'no-manage-roles',
    });
    made.server.role('540000000000000001', 'Level', { position: 40 });
    made.server.role('540000000000000002', 'Higher', { position: 45 });
    expect(await add('540000000000000001', true)).toMatchObject({
      kind: 'not-yours',
      problem: 'not-below',
      role: { name: 'Level' },
    });
    expect(await add('540000000000000002', true)).toMatchObject({ kind: 'not-yours' });
    expect((await made.selfRoles.stored(HOME)).rows).toEqual([]);
    expect(await add(ROLE.north, true)).toMatchObject({ kind: 'added' });
    // Changing what is said about a role is offering it too.
    expect(
      await made.selfRoles.addRole(
        HOME,
        { roleId: ROLE.north, description: 'mine now' },
        made.server.staff(ALICE, false),
      ),
    ).toMatchObject({ kind: 'not-yours' });
    // The owner is bound by nothing but what the bot can give.
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000002' }, made.server.staff(BOB)),
    ).toMatchObject({ kind: 'added' });
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.admin }, made.server.staff(BOB, true)),
    ).toMatchObject({ kind: 'unfit' });
  });

  it('counts staff without any role as below every role', async () => {
    const made = selfRolesWith();
    made.server.ownerId = BOB;
    made.server.member(ALICE);
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.server.staff(ALICE, true)),
    ).toMatchObject({ kind: 'not-yours', problem: 'not-below' });
  });

  it('saves a role while the bot lacks Manage Roles, and says so', async () => {
    const made = selfRolesWith();
    made.server.bot.mayManageRoles = false;
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.owner())).toMatchObject({
      kind: 'added',
      botLacksManageRoles: true,
    });
    // What lies in the role is still refused.
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.admin }, made.owner())).toMatchObject({
      kind: 'unfit',
    });
  });

  it('says when the server has no such role, or is not known', async () => {
    const made = selfRolesWith();
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000009' }, made.owner()),
    ).toEqual({
      kind: 'no-role',
    });
    expect(await made.selfRoles.addRole(ELSEWHERE, { roleId: ROLE.north }, made.owner())).toEqual({
      kind: 'unavailable',
    });
  });

  it('hands on what the rows refuse', async () => {
    const made = selfRolesWith();
    await made.selfRoles.addRole(HOME, { roleId: ROLE.north, aliases: ['n'] }, made.owner());
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.south, aliases: ['n'] }, made.owner()),
    ).toMatchObject({
      kind: 'refused',
      reason: 'alias-taken',
      alias: 'n',
      other: 'North',
    });
  });
});

describe('FakeRoleGateway', () => {
  it('refuses what Discord refuses, one role at a time, and touches nothing else', async () => {
    const { gateway, server } = selfRolesWith();
    server.member(ALICE, ROLE.admin, ROLE.booster);
    const give = (roleId: string) => gateway.giveRole(HOME, ALICE, roleId, 'test');
    const take = (roleId: string) => gateway.takeRole(HOME, ALICE, roleId, 'test');
    expect(await give(ROLE.north)).toBe('ok');
    // Giving again and taking what is not held change nothing, as on Discord.
    expect(await give(ROLE.north)).toBe('ok');
    expect(await take(ROLE.south)).toBe('ok');
    // Above the bot, level with it, managed.
    expect(await take(ROLE.admin)).toBe('no-permission');
    expect(await give(ROLE.bot)).toBe('no-permission');
    expect(await take(ROLE.booster)).toBe('no-permission');
    expect(await give(ROLE.moderator)).toBe('ok');
    expect(await give('540000000000000009')).toBe('no-role');
    expect(await gateway.giveRole(HOME, 'nobody', ROLE.north, 'test')).toBe('no-member');
    server.bot.mayManageRoles = false;
    expect(await give(ROLE.south)).toBe('no-permission');
    expect(await take(ROLE.north)).toBe('no-permission');
    await expect(give(HOME)).rejects.toThrow('@everyone');
    await expect(gateway.giveRole(ELSEWHERE, ALICE, ROLE.north, 'test')).rejects.toThrow(
      'Unknown Guild',
    );
    expect(server.heldNames(ALICE)).toEqual(['Admin', 'Moderator', 'North', 'Server Booster']);
    expect(gateway.calls).toHaveLength(13);
    expect(gateway.said().slice(0, 3)).toEqual(['give North', 'give North', 'take South']);
  });

  it('shows a role with what it adds to @everyone, and the owner of the server', () => {
    const { gateway, server } = selfRolesWith();
    const { KickMembers, MentionEveryone } = PermissionFlagsBits;
    server
      .everyone(MentionEveryone)
      .edit(ROLE.north, { permissions: MentionEveryone | KickMembers });
    const shown = gateway.server(HOME);
    expect(shown?.roles.find((role) => role.id === ROLE.north)?.moderation).toEqual([
      'Kick Members',
    ]);
    expect(shown?.roles.find((role) => role.everyone)).toMatchObject({ id: HOME, moderation: [] });
    // What a channel allows a role is told apart from what the role grants, and so is its name.
    server.channelAllows(ROLE.north, ['Kick Members', 'Manage Channels']).delete(ROLE.south);
    expect(gateway.server(HOME)?.roles.find((role) => role.id === ROLE.north)).toMatchObject({
      moderation: ['Kick Members'],
      channelModeration: ['Manage Channels'],
      staffName: false,
    });
    expect(() => server.channelAllows(ROLE.south, [])).toThrow('no role');
    expect(
      gateway
        .server(HOME)
        ?.roles.filter((role) => role.staffName)
        .map((role) => role.name),
    ).toEqual(['Moderator', 'Admin']);
    expect(shown?.ownerId).toBe(server.ownerId);
    expect(() => server.edit(ROLE.north, { moderation: ['Fly'] })).toThrow('no permission');
  });
});
