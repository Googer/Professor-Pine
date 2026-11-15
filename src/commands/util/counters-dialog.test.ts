import { ComponentType, MessageFlags } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  checkModal,
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { OTHER_GUILD_ID, WEST_FORUM } from '../../../test/support/gyms.js';
import { NOT_YOURS } from '../../services/pending-requests.js';
import { buttonsOf, textDisplays } from '../../../test/support/messages.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import { reportedMax, reportedRaid } from '../../../test/support/party-service.js';
import { FakePokebattler } from '../../../test/support/pokebattler.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import { bossMovesets, counters, isKeptMax, KeptCounterOptions, keptCounters } from './counters.js';
import { countersControls, countersDialog, NOT_KEPT } from './counters-dialog.js';

/** The form as the fake recorded it. */
interface Form {
  custom_id: string;
  title: string;
  components: {
    label: string;
    component: {
      type: number;
      custom_id: string;
      max_values?: number;
      options: { label: string; value: string; default?: boolean }[];
    };
  }[];
}

async function setup(options: { inPost?: boolean; bossNamed?: string } = {}) {
  const pokebattler = new FakePokebattler();
  const users = new MemoryUsers();
  const raid = options.inPost
    ? await reportedRaid({
        boss: options.bossNamed === undefined ? { key: 'mewtwo' } : { name: options.bossNamed },
      })
    : undefined;
  const { ctx } = createTestContext({
    pokebattler,
    users,
    ...(raid ? { parties: raid.store, regions: raid.regions } : {}),
  });
  const router = new InteractionRouter(ctx, [counters], [countersControls], {
    now: () => 1_800_000_000_000,
  });
  const where: FakeOptions = raid
    ? { channelId: raid.postId, thread: { parentId: WEST_FORUM } }
    : {};
  /** Asks `/counters` as Alice, and gives the answer and the token of its options. */
  const ask = async (opts: Record<string, string | boolean> = {}) => {
    const used = fakeChatInput({
      commandName: 'counters',
      userId: ALICE,
      options: raid ? opts : { boss: 'mewtwo', tier: 'T5', ...opts },
      ...where,
    });
    await router.handle(used as never);
    const answer = asV2(sent(used.editReply));
    const optionsId = buttonsOf(answer).find((b) => b.label === 'Change options…')?.customId;
    const token = optionsId?.split(':')[1] ?? '';
    return { used, answer, token, optionsId };
  };
  const open = async (token: string, userId: string, extra: FakeOptions = {}) => {
    const press = fakeButton({ customId: `counters:${token}:options`, userId, ...where, ...extra });
    await router.handle(press as never);
    return press;
  };
  const submit = async (
    token: string,
    userId: string,
    values: { attackers?: string; weather?: string; friendship?: string; moveset?: string } = {},
    also: string[] = [],
    extra: FakeOptions = {},
  ) => {
    // The form the bot shows this member, so that the submit is checked against its real inputs
    // (none where the options are no longer kept: the submit then names its inputs itself).
    const shown = (await open(token, userId)).showModal.mock.calls[0]?.[0] as
      { custom_id: string } | undefined;
    const form = fakeModal({
      customId: shown?.custom_id ?? `counters:${token}:dialog:${userId}`,
      userId,
      askedBy: ALICE,
      ...(shown === undefined ? {} : { form: shown }),
      selected: {
        attackers: [values.attackers ?? '40'],
        weather: [values.weather ?? 'NO_WEATHER'],
        friendship: [values.friendship ?? '4'],
        moveset: [values.moveset ?? 'average'],
      },
      checked: { also },
      ...where,
      ...extra,
    });
    await router.handle(form as never);
    return form;
  };
  return { ctx, pokebattler, users, raid, router, ask, open, submit };
}

const formOf = (press: FakeInteraction): Form => {
  const form = press.showModal.mock.calls[0]?.[0] as Form | undefined;
  if (!form) throw new Error('no form was shown');
  return form;
};
const selectedIn = (form: Form, label: string): string[] =>
  form.components
    .find((component) => component.label === label)
    ?.component.options.filter((option) => option.default === true)
    .map((option) => option.value) ?? [];
const valuesIn = (form: Form, label: string): string[] =>
  form.components
    .find((component) => component.label === label)
    ?.component.options.map((option) => option.value) ?? [];
const settingsOf = (message: V2Message): string => textDisplays(message)[2] ?? '';

afterEach(() => {
  vi.useRealTimers();
});

/** The options kept under a token, asked from the test server, where the answers are given. */
const keptHere = (token: string) => keptCounters.of(token, { guildId: FAKE_GUILD_ID });

describe('/counters: Change options…', () => {
  it('takes a kept mega from the game data once the game data has it, with its moves', async () => {
    const made = await setup();
    const token = keptCounters.keep(
      { ...keptCountersValue(), bossKey: 'blastoise_mega', bossName: 'Mega Blastoise' },
      FAKE_GUILD_ID,
    );
    const form = formOf(await made.open(token, ALICE));
    expect(form.title).toBe('Counters for Mega Blastoise');
    expect(valuesIn(form, 'Boss moves').length).toBeGreaterThan(1);
  });

  it('opens and answers for a mega newer than the game data, with the average of its moves', async () => {
    const made = await setup({ inPost: true, bossNamed: 'Mega Chandelure' });
    const { token } = await made.ask();
    const form = formOf(await made.open(token, ALICE));
    expect(form.title).toBe('Counters for Mega Chandelure');
    expect(valuesIn(form, 'Boss moves')).toEqual(['average']);
    await made.submit(token, ALICE, { weather: 'RAINY' });
    expect(made.pokebattler.asked.at(-1)).toMatchObject({
      boss: 'CHANDELURE_MEGA',
      weather: 'RAINY',
    });
  });

  it('stands under every answer, with a token of its own', async () => {
    const made = await setup();
    const first = await made.ask();
    const second = await made.ask();
    expect(first.optionsId).toMatch(/^counters:[0-9a-f]{16}:options$/);
    expect(second.token).not.toBe(first.token);
    expect(keptHere(first.token)).toMatchObject({
      kind: 'raid',
      bossKey: 'mewtwo',
      tier: { level: 'T5', shadow: false },
      attackers: { kind: 'level', level: '40' },
      askerId: ALICE,
      partyId: null,
    });
  });

  it('opens a dialog with what the answer chose, the Pokébox only for who has one', async () => {
    const made = await setup();
    const { token } = await made.ask({
      level: '50',
      weather: 'WINDY',
      friendship: '2',
      moveset: 'CONFUSION_FAST/PSYSTRIKE',
      shadow: true,
    });
    const press = await made.open(token, BOB);
    expect(press.deferReply).not.toHaveBeenCalled();
    const form = formOf(press);
    // The answer's options, in a dialog that names the member who opened it (plan 19B-4).
    expect(form.custom_id).toBe(`counters:${token}:dialog:${BOB}`);
    expect(form.title).toBe('Counters for Mewtwo');
    expect(form.components.map((component) => component.label)).toEqual([
      'Attackers',
      'Weather',
      'Friendship',
      'Boss moves',
      'Also list',
    ]);
    expect(selectedIn(form, 'Attackers')).toEqual(['50']);
    expect(valuesIn(form, 'Attackers')).not.toContain('box');
    expect(selectedIn(form, 'Weather')).toEqual(['WINDY']);
    expect(selectedIn(form, 'Friendship')).toEqual(['2']);
    expect(selectedIn(form, 'Boss moves')).toEqual(['CONFUSION_FAST/PSYSTRIKE']);
    expect(valuesIn(form, 'Boss moves')[0]).toBe('average');
    expect(selectedIn(form, 'Also list')).toEqual(['shadow']);
    expect(form.components[4]?.component.type).toBe(ComponentType.CheckboxGroup);
    expect(form.components[4]?.component.max_values).toBe(3);
    await made.users.update(BOB, { pokebattlerId: 4242 });
    expect(valuesIn(formOf(await made.open(token, BOB)), 'Attackers')).toContain('box');
  });

  it('keeps every boss’s moves within a menu, with the current ones among them', async () => {
    const made = await setup();
    const entry = made.ctx.gameData.catalogue.byKey('mew');
    if (!entry) throw new Error('no mew');
    const kept = {
      kind: 'raid',
      bossKey: 'mew',
      bossName: 'Mew',
      tier: { level: 'T5', shadow: false },
      attackers: { kind: 'level', level: '40' },
      weather: 'NO_WEATHER',
      friendship: '4',
      moveset: null,
      shadow: false,
      mega: false,
      single: false,
      askerId: ALICE,
      partyId: null,
    } as const;
    const all = countersDialog(made.ctx, 'abc', kept, entry, true) as unknown as Form;
    checkModal(all);
    const moves = valuesIn(all, 'Boss moves');
    expect(moves.length).toBeLessThanOrEqual(25);
    // Mew knows far more than 24 movesets: the last one is shown when it is the current one.
    const movesets = bossMovesets(made.ctx.gameData.catalogue, entry);
    expect(movesets.length).toBeGreaterThan(24);
    const lastMoveset = movesets.at(-1);
    if (!lastMoveset) throw new Error('no moveset');
    const current = `${lastMoveset.fast.id}/${lastMoveset.charged.id}`;
    expect(moves).not.toContain(current);
    const last = countersDialog(
      made.ctx,
      'abc',
      { ...kept, moveset: { fast: lastMoveset.fast.id, charged: lastMoveset.charged.id } },
      entry,
      true,
    ) as unknown as Form;
    checkModal(last);
    expect(selectedIn(last, 'Boss moves')).toEqual([current]);
    expect(valuesIn(last, 'Boss moves')).toHaveLength(25);
  });

  it('changes the asker’s public answer in a post, with options of its own', async () => {
    const made = await setup({ inPost: true });
    const { token } = await made.ask();
    const form = await made.submit(
      token,
      ALICE,
      { attackers: '50', weather: 'WINDY', friendship: '2' },
      ['shadow', 'mega'],
    );
    expect(form.deferUpdate).toHaveBeenCalledOnce();
    expect(form.reply).not.toHaveBeenCalled();
    const changed = asV2(sent(form.editReply));
    expect(settingsOf(changed)).toBe(
      '-# Attackers at level 50 · windy weather · great friends · shadow Pokémon and megas ' +
        'listed · † a legacy move',
    );
    expect(made.pokebattler.asked.at(-1)).toMatchObject({
      boss: 'MEWTWO',
      raidLevel: 'RAID_LEVEL_5',
      attackers: { kind: 'level', level: '50' },
      weather: 'WINDY',
      friendship: '2',
      shadow: true,
      mega: true,
    });
    const newToken = buttonsOf(changed)
      .find((b) => b.label === 'Change options…')
      ?.customId?.split(':')[1];
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(token);
    expect(keptHere(newToken ?? '')).toMatchObject({
      askerId: ALICE,
      partyId: made.raid?.party.id,
      shadow: true,
      weather: 'WINDY',
    });
    // The old token stays good for its own message.
    expect(keptHere(token)).toMatchObject({ weather: 'NO_WEATHER' });
  });

  it('gives anybody else a private copy and leaves the public answer alone', async () => {
    const made = await setup({ inPost: true });
    const { token } = await made.ask();
    const form = await made.submit(token, BOB, { friendship: '0' });
    expect(form.deferUpdate).not.toHaveBeenCalled();
    expect(form.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
    const copy = asV2(sent(form.editReply));
    expect(settingsOf(copy)).toContain('not friends');
    const copyToken = buttonsOf(copy)
      .find((b) => b.label === 'Change options…')
      ?.customId?.split(':')[1];
    expect(keptHere(copyToken ?? '')).toMatchObject({ askerId: BOB, partyId: null });
  });

  it('shows a Pokébox privately only, also to the asker of a public answer', async () => {
    const made = await setup({ inPost: true });
    await made.users.update(ALICE, { pokebattlerId: 4242 });
    const { token } = await made.ask();
    const form = await made.submit(token, ALICE, { attackers: 'box' });
    expect(form.deferUpdate).not.toHaveBeenCalled();
    expect(form.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
    expect(made.pokebattler.asked.at(-1)?.attackers).toEqual({ kind: 'box', userId: 4242 });
    expect(settingsOf(asV2(sent(form.editReply)))).toMatch(/^-# Your Pokébox on Pokebattler/);
  });

  it('refuses a Pokébox to a member who has saved no Pokebattler id', async () => {
    const made = await setup();
    const { token } = await made.ask();
    const form = await made.submit(token, BOB, { attackers: 'box' });
    expect(sent(form.reply)).toEqual({
      content: 'You have no Pokebattler user id saved. Save it in `/settings`, or pick a level.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.pokebattler.asked).toHaveLength(1);
  });

  it('updates a private answer in its place', async () => {
    const made = await setup();
    const { token } = await made.ask();
    const form = await made.submit(token, ALICE, { weather: 'FOG' }, [], {
      askedBy: ALICE,
      ephemeralMessage: true,
    });
    expect(form.deferUpdate).toHaveBeenCalledOnce();
    expect(settingsOf(asV2(sent(form.editReply)))).toContain('fog weather');
  });

  it('says privately when Pokebattler failed, and leaves the answer as it was', async () => {
    const made = await setup({ inPost: true });
    const { token } = await made.ask();
    made.pokebattler.failing = { ok: false, reason: 'timeout' };
    const form = await made.submit(token, ALICE);
    expect(form.editReply).not.toHaveBeenCalled();
    expect(sent(form.followUp)).toEqual({
      content: 'Pokebattler is still working this out: try again in a minute.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('answers privately when the raid ended while Pokebattler was asked', async () => {
    const made = await setup({ inPost: true });
    const { token } = await made.ask();
    const raid = made.raid;
    if (!raid) throw new Error('no raid');
    const ask = made.pokebattler.counters.bind(made.pokebattler);
    made.pokebattler.counters = async (request) => {
      await raid.service.end(raid.party.id);
      return ask(request);
    };
    const form = await made.submit(token, ALICE);
    expect(form.deferUpdate).toHaveBeenCalledOnce();
    expect(form.editReply).not.toHaveBeenCalled();
    expect(sent(form.followUp).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    // Once the party has ended, the asker's next change is a private copy from the start.
    made.pokebattler.counters = ask;
    const later = await made.submit(token, ALICE);
    expect(later.deferUpdate).not.toHaveBeenCalled();
    expect(later.deferReply).toHaveBeenCalledOnce();
  });

  it('reads a submit without the checkbox group as nothing ticked', async () => {
    const made = await setup();
    const { token } = await made.ask();
    const form = fakeModal({
      customId: `counters:${token}:dialog:${BOB}`,
      userId: BOB,
      askedBy: ALICE,
      selected: {
        attackers: ['40'],
        weather: ['NO_WEATHER'],
        friendship: ['4'],
        moveset: ['average'],
      },
    });
    await made.router.handle(form as never);
    expect(made.pokebattler.asked).toHaveLength(2);
    expect(form.reply.mock.calls.length + form.editReply.mock.calls.length).toBeGreaterThan(0);
  });

  it('counts opening the dialog in a window of its own, apart from the command', () => {
    const throttle = countersControls.throttle;
    if (typeof throttle !== 'function') throw new Error('the throttle is a function');
    const pressed = fakeButton({ userId: BOB });
    const open = decodeCustomId('counters:abc:options');
    const dialog = decodeCustomId('counters:abc:dialog');
    if (!open || !dialog) throw new Error('ids');
    const { ctx } = createTestContext();
    expect(throttle(pressed as never, open, ctx)).toEqual(MEMBER_READ_THROTTLE);
    expect(throttle(pressed as never, dialog, ctx)).toMatchObject({ as: 'counters' });
  });

  it('counts submits against the three a minute, not the opening of the dialog', async () => {
    const made = await setup();
    const { token } = await made.ask();
    for (let n = 0; n < 5; n++) expect(formOf(await made.open(token, BOB)).title).toBeDefined();
    for (let n = 0; n < 3; n++) await made.submit(token, BOB);
    const over = await made.submit(token, BOB);
    expect(sent(over.reply).content).toBe('You can use /counters again in 1 minute.');
    expect(made.pokebattler.asked).toHaveLength(4);
  });

  it('counts submits in the same window as the command itself', async () => {
    const made = await setup();
    // Alice's use of the command is one of her three.
    const { token } = await made.ask();
    // Submits that work: the asker's change of the answer, a components-v2 message, in its place
    // (one that failed would be given back).
    const onAnswer = { v2Message: true };
    for (let n = 0; n < 2; n++) {
      const submitted = await made.submit(token, ALICE, {}, [], onAnswer);
      expect(submitted.followUp).not.toHaveBeenCalled();
    }
    expect(sent((await made.submit(token, ALICE, {}, [], onAnswer)).reply).content).toBe(
      'You can use /counters again in 1 minute.',
    );
    const again = fakeChatInput({
      commandName: 'counters',
      userId: ALICE,
      options: { boss: 'mewtwo', tier: 'T5' },
    });
    await made.router.handle(again as never);
    expect(sent(again.reply).content).toBe('You can use /counters again in 1 minute.');
    expect(made.pokebattler.asked).toHaveLength(3);
  });

  it('does not count a submit it refuses', async () => {
    const made = await setup();
    const { token } = await made.ask();
    for (let n = 0; n < 4; n++) {
      expect(sent((await made.submit(token, BOB, { attackers: 'box' })).reply).content).toMatch(
        /^You have no Pokebattler user id saved/,
      );
      expect(
        sent((await made.submit(token, BOB, { moveset: 'HYDRO_PUMP/SURF' })).reply).content,
      ).toBe('Pick the boss moves from their list.');
      expect(sent((await made.submit('0123456789abcdef', BOB)).reply).content).toBe(NOT_KEPT);
    }
    for (let n = 0; n < 3; n++)
      expect((await made.submit(token, BOB)).editReply).toHaveBeenCalled();
    expect(made.pokebattler.asked).toHaveLength(4);
  });

  it('selects the average for a kept moveset the boss no longer has', async () => {
    const made = await setup();
    const { token } = await made.ask();
    const kept = keptHere(token);
    const entry = made.ctx.gameData.catalogue.byKey('mewtwo');
    if (!kept || isKeptMax(kept) || !entry) throw new Error('nothing kept');
    const form = countersDialog(
      made.ctx,
      token,
      { ...kept, moveset: { fast: 'SPLASH_FAST', charged: 'STRUGGLE' } },
      entry,
      false,
    ) as unknown as Form;
    checkModal(form);
    expect(selectedIn(form, 'Boss moves')).toEqual(['average']);
  });

  // Plan 19B-4: the options of an answer are of the server it was given in; the dialog of
  // Change options… is of the member who opened it.
  it('takes no options of an answer of another server: they are no longer kept there', async () => {
    const made = await setup();
    const { token } = await made.ask();
    const abroad = await made.open(token, ALICE, { guildId: OTHER_GUILD_ID });
    expect(abroad.showModal).not.toHaveBeenCalled();
    expect(sent(abroad.reply).content).toBe(NOT_KEPT);
    const dialog = formOf(await made.open(token, ALICE));
    const submitted = fakeModal({
      customId: dialog.custom_id,
      userId: ALICE,
      askedBy: ALICE,
      form: dialog,
      selected: {
        attackers: ['40'],
        weather: ['NO_WEATHER'],
        friendship: ['4'],
        moveset: ['average'],
      },
      checked: { also: [] },
      guildId: OTHER_GUILD_ID,
    });
    await made.router.handle(submitted as never);
    expect(sent(submitted.reply).content).toBe(NOT_KEPT);
    expect(made.pokebattler.asked).toHaveLength(1);
  });

  it('keeps nothing for a press of Change options…, however often it is pressed', async () => {
    const made = await setup({ inPost: true });
    const { token } = await made.ask();
    const kept = keptCounters.size;
    for (const userId of [ALICE, BOB, ALICE, BOB, BOB]) await made.open(token, userId);
    expect(keptCounters.size).toBe(kept);
  });

  it('takes the Submit of a dialog only from the member who opened it', async () => {
    const made = await setup({ inPost: true });
    const { token } = await made.ask();
    // Bob may open the dialog of Alice's answer; what he opened is his.
    const dialog = formOf(await made.open(token, BOB));
    const submitted = (userId: string) =>
      fakeModal({
        customId: dialog.custom_id,
        userId,
        askedBy: ALICE,
        form: dialog,
        selected: {
          attackers: ['40'],
          weather: ['NO_WEATHER'],
          friendship: ['0'],
          moveset: ['average'],
        },
        checked: { also: [] },
        channelId: made.raid?.postId ?? '',
        thread: { parentId: WEST_FORUM },
      });
    const byAlice = submitted(ALICE);
    await made.router.handle(byAlice as never);
    expect(sent(byAlice.reply).content).toBe(NOT_YOURS);
    expect(made.pokebattler.asked).toHaveLength(1);
    const byBob = submitted(BOB);
    await made.router.handle(byBob as never);
    expect(settingsOf(asV2(sent(byBob.editReply)))).toContain('not friends');
  });

  it('says the options are no longer kept after a day, or after a restart', async () => {
    const made = await setup();
    const { token } = await made.ask();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
    expect(sent((await made.open(token, ALICE)).reply).content).toBe(NOT_KEPT);
    expect(sent((await made.submit(token, ALICE)).reply).content).toBe(NOT_KEPT);
    expect(sent((await made.open('0123456789abcdef', ALICE)).reply).content).toBe(NOT_KEPT);
  });
});

describe('KeptCounterOptions', () => {
  it('keeps at most so many, the oldest going first, each for its time', () => {
    let now = 0;
    const kept = new KeptCounterOptions({ max: 2, ttlMs: 1_000, now: () => now });
    const value = keptCountersValue();
    const a = kept.keep(value, FAKE_GUILD_ID);
    const b = kept.keep(value, FAKE_GUILD_ID);
    const c = kept.keep(value, FAKE_GUILD_ID);
    const here = (token: string) => kept.of(token, { guildId: FAKE_GUILD_ID });
    expect([here(a), here(b), here(c)].map(Boolean)).toEqual([false, true, true]);
    expect(kept.of(c, { guildId: OTHER_GUILD_ID })).toBeUndefined();
    now = 1_000;
    expect(here(c)).toBeUndefined();
  });
});

function keptCountersValue() {
  return {
    kind: 'raid',
    bossKey: 'mewtwo',
    bossName: 'Mewtwo',
    tier: { level: 'T5', shadow: false },
    attackers: { kind: 'box' },
    weather: 'NO_WEATHER',
    friendship: '4',
    moveset: null,
    shadow: true,
    mega: true,
    single: false,
    askerId: ALICE,
    partyId: null,
  } as const;
}

describe('/counters: Change options… under a max battle team', () => {
  async function maxSetup() {
    const pokebattler = new FakePokebattler();
    const max = await reportedMax();
    const { ctx } = createTestContext({ pokebattler, parties: max.store, regions: max.regions });
    const router = new InteractionRouter(ctx, [counters], [countersControls], {
      now: () => 1_800_000_000_000,
    });
    const where: FakeOptions = { channelId: max.postId, thread: { parentId: WEST_FORUM } };
    const used = fakeChatInput({ commandName: 'counters', userId: ALICE, options: {}, ...where });
    await router.handle(used as never);
    const answer = asV2(sent(used.editReply));
    const token =
      buttonsOf(answer)
        .find((b) => b.label === 'Change options…')
        ?.customId?.split(':')[1] ?? '';
    const open = async (userId: string) => {
      const press = fakeButton({ customId: `counters:${token}:options`, userId, ...where });
      await router.handle(press as never);
      return press;
    };
    return { pokebattler, max, router, where, token, open };
  }

  it('asks the role and the level, as the answer had them', async () => {
    const made = await maxSetup();
    const form = formOf(await made.open(BOB));
    checkModal(form);
    expect(form.title).toBe('Team against Dynamax Machamp (2★)');
    expect(form.components.map((component) => component.label)).toEqual([
      'Your role',
      'Level of your Pokémon',
      'Weather',
      'Friendship',
    ]);
    expect(selectedIn(form, 'Weather')).toEqual(['NO_WEATHER']);
    expect(selectedIn(form, 'Friendship')).toEqual(['4']);
    expect(valuesIn(form, 'Your role')).toEqual(['attacker', 'defensive', 'healer', 'shielder']);
    expect(selectedIn(form, 'Your role')).toEqual(['attacker']);
    // The levels of a team: no best buddy levels.
    expect(valuesIn(form, 'Level of your Pokémon')).toEqual([
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
      '50',
    ]);
    expect(selectedIn(form, 'Level of your Pokémon')).toEqual(['40']);
  });

  it('changes the asker’s public answer to the team of the role chosen', async () => {
    const made = await maxSetup();
    const shown = (await made.open(ALICE)).showModal.mock.calls[0]?.[0];
    const form = fakeModal({
      customId: `counters:${made.token}:dialog:${ALICE}`,
      userId: ALICE,
      askedBy: ALICE,
      form: shown,
      selected: { role: ['shielder'], level: ['30'], weather: ['FOG'], friendship: ['1'] },
      ...made.where,
    });
    await made.router.handle(form as never);
    expect(form.deferUpdate).toHaveBeenCalledOnce();
    expect(made.pokebattler.maxAsked.at(-1)).toEqual({
      boss: 'MACHAMP',
      maxLevel: 'RAID_LEVEL_2_MAX',
      role: 'shielder',
      level: '30',
      weather: 'FOG',
      friendship: '1',
    });
    const changed = asV2(sent(form.editReply));
    expect(textDisplays(changed)[0]).toContain('your role: Shielder (three shielders)');
    const newToken = buttonsOf(changed)
      .find((b) => b.label === 'Change options…')
      ?.customId?.split(':')[1];
    expect(keptHere(newToken ?? '')).toMatchObject({
      kind: 'max',
      role: 'shielder',
      level: '30',
      weather: 'FOG',
      friendship: '1',
      partyId: made.max.party.id,
    });
  });

  it('gives anybody else a private copy of the team of their role', async () => {
    const made = await maxSetup();
    const shown = (await made.open(BOB)).showModal.mock.calls[0]?.[0];
    const form = fakeModal({
      customId: `counters:${made.token}:dialog:${BOB}`,
      userId: BOB,
      askedBy: ALICE,
      form: shown,
      selected: { role: ['healer'], level: ['40'], weather: ['NO_WEATHER'], friendship: ['4'] },
      ...made.where,
    });
    await made.router.handle(form as never);
    expect(form.deferUpdate).not.toHaveBeenCalled();
    expect(form.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
    expect(made.pokebattler.maxAsked.at(-1)).toMatchObject({ role: 'healer' });
    const copy = asV2(sent(form.editReply));
    expect(textDisplays(copy)[0]).toContain('your role: Healer (a healer and two defenders)');
    const copyToken = buttonsOf(copy)
      .find((b) => b.label === 'Change options…')
      ?.customId?.split(':')[1];
    expect(keptHere(copyToken ?? '')).toMatchObject({
      kind: 'max',
      askerId: BOB,
      partyId: null,
    });
  });

  it('refuses a role or level not of its lists before the submit is counted', async () => {
    const made = await maxSetup();
    const forged = async (selected: Record<string, string[]>) => {
      const form = fakeModal({
        customId: `counters:${made.token}:dialog:${ALICE}`,
        userId: ALICE,
        askedBy: ALICE,
        selected: {
          role: ['attacker'],
          level: ['40'],
          weather: ['NO_WEATHER'],
          friendship: ['4'],
          ...selected,
        },
        ...made.where,
      });
      await made.router.handle(form as never);
      return sent(form.reply).content;
    };
    expect(await forged({ role: ['wizard'] })).toBe('Pick the role from its list.');
    expect(await forged({ level: ['51'] })).toBe(
      'A max battle team is simulated at level 20, 25, 30, 35, 40, 45 or 50: pick one of those.',
    );
    expect(await forged({ level: ['box'] })).toMatch(/cannot use your Pokébox/);
    expect(made.pokebattler.maxAsked).toHaveLength(1);
    // None of them counted: the command's use and two submits are the three of a minute.
    const shown = (await made.open(ALICE)).showModal.mock.calls[0]?.[0];
    for (let i = 0; i < 2; i += 1) {
      const form = fakeModal({
        customId: `counters:${made.token}:dialog:${ALICE}`,
        userId: ALICE,
        askedBy: ALICE,
        form: shown,
        selected: { role: ['healer'], level: ['40'], weather: ['NO_WEATHER'], friendship: ['4'] },
        ...made.where,
      });
      await made.router.handle(form as never);
    }
    expect(made.pokebattler.maxAsked).toHaveLength(3);
  });
});
