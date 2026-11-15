import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeButton,
  fakeMessage,
  sent,
  type FakeInteraction,
  type FakeRow,
} from '../../test/support/fake-interactions.js';
import { buttonsOf, dmReasons, textDisplays } from '../../test/support/messages.js';
import type { V2Message } from '../discord/party-gateway.js';
import { MemoryGymTargets } from '../../test/support/gym-targets.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { MemoryNewTrains } from '../../test/support/new-trains.js';
import { createTestContext } from '../../test/support/test-context.js';
import { MemoryUsers } from '../../test/support/users.js';
import { MemoryWants } from '../../test/support/wants.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { InteractionRouter } from '../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../discord/throttle.js';
import { parseStopArgs, type NotifyReason } from '../domain/notify/reasons.js';
import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { entryWant } from '../domain/pogo/wants.js';
import {
  changeButtonId,
  notifyDm,
  rocketChangeButtonId,
  stopButtonId,
} from '../render/notify-dm.js';
import { dmControls } from './dm.js';
import { components } from './index.js';
import { dialogField, dialogFields, dialogText, shownDialog } from '../../test/support/dialogs.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { fakeModal } from '../../test/support/fake-interactions.js';
import type { AppContext } from '../app-context.js';
import { withFeatures } from '../../test/support/server-values.js';
import { THEIR_GYM, twoServerGyms } from '../../test/support/providers.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const ALICE = '200000000000000002';
const BOB = '200000000000000003';
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const YVELTAL = pokemonTarget(717);
const want = (target: NotificationTarget): NotifyReason => ({ kind: 'want', target });

/** The custom ids of the Stop buttons of a message's components that were not pressed. */
function activeStops(components: readonly unknown[]): string[] {
  return buttonsOf({ v2: true, components: components as V2Message['components'] })
    .filter((button) => button.label === 'Stop' && button.customId !== undefined)
    .map((button) => button.customId ?? '');
}

function setup(options: { gyms?: AppContext['gyms'] } = {}) {
  const wants = new MemoryWants();
  const gymTargets = new MemoryGymTargets();
  const users = new MemoryUsers();
  const newTrains = new MemoryNewTrains();
  const { ctx, entries } = createTestContext({ wants, gymTargets, users, newTrains, ...options });
  const router = new InteractionRouter(ctx, [], [dmControls]);
  /**
   * The components of a direct message with a button for each of these reasons, as the fake
   * message of a press carries them (a container at the top, not rows).
   */
  const rows = (reasons: NotifyReason[], guildId = HOME): FakeRow[] =>
    notifyDm(
      { sentence: 'A raid.', links: [] },
      reasons.map((reason, index) => ({
        label: `reason ${String(index)}`,
        stop: stopButtonId(guildId, reason),
      })),
    ).components as unknown as FakeRow[];
  /** A press, in a DM, of the button for `reason` under a message with buttons for `all`. */
  const press = async (
    userId: string,
    reason: NotifyReason,
    all: NotifyReason[] = [reason],
    guildId = HOME,
  ): Promise<FakeInteraction> => {
    const interaction = fakeButton({
      customId: stopButtonId(guildId, reason) ?? '',
      isDm: true,
      userId,
      messageRows: rows(all, guildId),
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const said = (interaction: FakeInteraction) => sent(interaction.followUp).content;
  /** The custom ids of the Stop buttons a press left as they were (not Stopped). */
  const left = (interaction: FakeInteraction): string[] =>
    activeStops(sent(interaction.editReply).components ?? []);
  return { ctx, entries, router, wants, gymTargets, users, newTrains, press, said, left, rows };
}

describe('the "Stop" buttons under a direct message', () => {
  it('removes the want in the server the button names, answers in the DM, and shows the button as Stopped', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.wants.set(ALICE, HOME, YVELTAL, 'both');
    await made.wants.set(ALICE, AWAY, T5, 'raid');
    const pressed = await made.press(ALICE, want(T5), [want(T5), want(YVELTAL)]);
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(made.said(pressed)).toBe(
      'Removed **T5 raids** from your list for that server. `/want` there adds it again.',
    );
    // In a DM nothing is hidden from anybody: the answer is an ordinary message.
    expect(sent(pressed.followUp).flags).toBeUndefined();
    expect(made.left(pressed)).toEqual([stopButtonId(HOME, want(YVELTAL))]);
    // The pressed button stays where it was, disabled, as Stopped; the message stays v2.
    const edit = sent(pressed.editReply);
    expect(edit.flags).toBe(MessageFlags.IsComponentsV2);
    const shown = { v2: true as const, components: edit.components as V2Message['components'] };
    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Stopped', 'Stop']);
    expect(textDisplays(shown)).toEqual(
      textDisplays({
        v2: true,
        components: made.rows([want(T5), want(YVELTAL)]) as unknown as V2Message['components'],
      }),
    );
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: YVELTAL, scope: 'both' },
    ]);
    expect(await made.wants.count(ALICE, AWAY)).toBe(1);
  });

  it('is safe to repeat: what is gone already is said to be gone, and the button still shows as Stopped', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.press(ALICE, want(T5));
    const again = await made.press(ALICE, want(T5));
    expect(made.said(again)).toBe(
      '**T5 raids** was already removed from your list for that server.',
    );
    expect(made.left(again)).toEqual([]);
  });

  it('removes a box of /want’s dialog alone: a Dynamax box, a research reward (plan 8R-1)', async () => {
    const made = setup();
    const dynamax = boxTarget('dynamax', 68);
    const candy: TargetWant = { kind: 'research-item', item: 'rare-candy' };
    await made.ctx.targetWants.change(ALICE, HOME, { add: [dynamax, candy], remove: [] }, 0);
    await made.wants.set(ALICE, HOME, pokemonTarget(68), 'raid');
    const reasons: NotifyReason[] = [
      { kind: 'target', want: dynamax },
      { kind: 'target', want: candy },
    ];
    expect(made.said(await made.press(ALICE, reasons[0]!, reasons))).toBe(
      'Removed **Dynamax Machamp** from your list for that server. `/want` there adds it again.',
    );
    expect(made.said(await made.press(ALICE, reasons[1]!, reasons))).toBe(
      'Removed **Rare Candy (research)** from your list for that server. `/want` there adds it ' +
        'again.',
    );
    expect(await made.ctx.targetWants.count(ALICE, HOME)).toBe(0);
    // The raids of Machamp stay: the box was the max battles' alone.
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });

  it('removes a Team GO Rocket target: a grunt type, any leader (plan 8R-2)', async () => {
    const made = setup();
    const grunt: TargetWant = { kind: 'rocket', who: 'grunt:dragon' };
    const leaders: TargetWant = { kind: 'rocket', who: 'leader:any' };
    await made.ctx.targetWants.change(ALICE, HOME, { add: [grunt, leaders], remove: [] }, 0);
    const reasons: NotifyReason[] = [
      { kind: 'target', want: grunt },
      { kind: 'target', want: leaders },
    ];
    expect(made.said(await made.press(ALICE, reasons[0]!, reasons))).toBe(
      'Removed **Dragon-type grunt** from your list for that server. `/want` there adds it again.',
    );
    expect(made.said(await made.press(ALICE, reasons[1]!, reasons))).toBe(
      'Removed **Any Team GO Rocket leader** from your list for that server. `/want` there adds ' +
        'it again.',
    );
    expect(await made.ctx.targetWants.count(ALICE, HOME)).toBe(0);
  });

  it('says so when the want it removed was for raids and spawns', async () => {
    const made = setup();
    const dratini = pokemonTarget(147);
    await made.wants.set(ALICE, HOME, dratini, 'both');
    expect(made.said(await made.press(ALICE, want(dratini)))).toBe(
      'Removed **Dratini** (raids and spawns) from your list for that server. ' +
        '`/want` there adds it again.',
    );
    await made.wants.set(ALICE, HOME, dratini, 'spawn');
    expect(made.said(await made.press(ALICE, want(dratini)))).toBe(
      'Removed **Dratini** from your list for that server. `/want` there adds it again.',
    );
  });

  it('takes both buttons off when two are pressed at once', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.wants.set(ALICE, HOME, YVELTAL, 'raid');
    await made.gymTargets.add(ALICE, HOME, 1);
    const gym: NotifyReason = { kind: 'gym', gymId: 1 };
    // Three buttons under one message; two presses that both carry it as it was.
    const message = fakeMessage(made.rows([want(T5), want(YVELTAL), gym]));
    const presses = [want(T5), want(YVELTAL)].map((reason) =>
      fakeButton({
        customId: stopButtonId(HOME, reason) ?? '',
        isDm: true,
        userId: ALICE,
        message,
      }),
    );
    await Promise.all(presses.map((pressed) => made.router.handle(pressed as never)));
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
    // Neither press undid the other's: only the gym's button is left as it was.
    expect(activeStops(message.rows)).toEqual([stopButtonId(HOME, gym)]);
    for (const pressed of presses) expect(pressed.fetchReply).toHaveBeenCalledTimes(1);
  });

  it('still answers when the message cannot be read anew or changed, and says so in the log', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    await made.wants.set(ALICE, HOME, YVELTAL, 'raid');
    const answer =
      'Removed **T5 raids** from your list for that server. `/want` there adds it again.';
    // It cannot be read anew: the rows are those the press itself carries.
    const unread = fakeButton({
      customId: stopButtonId(HOME, want(T5)) ?? '',
      isDm: true,
      userId: ALICE,
      messageRows: made.rows([want(T5), want(YVELTAL)]),
    });
    unread.fetchReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
    await made.router.handle(unread as never);
    expect(made.said(unread)).toBe(answer);
    expect(made.left(unread)).toEqual([stopButtonId(HOME, want(YVELTAL))]);
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'could not read a direct message anew to take a button off',
      ),
    ).toMatchObject([{ level: 40 }]);

    // It cannot be changed: the button stays, the want is gone and the answer says so.
    const unchanged = fakeButton({
      customId: stopButtonId(HOME, want(YVELTAL)) ?? '',
      isDm: true,
      userId: ALICE,
      messageRows: made.rows([want(YVELTAL)]),
    });
    unchanged.editReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
    await made.router.handle(unchanged as never);
    expect(made.said(unchanged)).toBe(
      'Removed **Yveltal** from your list for that server. `/want` there adds it again.',
    );
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not take a button off a direct message'),
    ).toMatchObject([{ level: 40 }]);
    expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('takes the button off a classic message sent before the DMs were v2', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    const button = (reason: NotifyReason, label: string) => ({
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: stopButtonId(HOME, reason) ?? '',
      label,
    });
    const legacy: FakeRow[] = [
      {
        type: ComponentType.ActionRow,
        components: [button(want(T5), 'Stop: T5 raids'), button(want(YVELTAL), 'Stop: Yveltal')],
      },
    ];
    const pressed = fakeButton({
      customId: stopButtonId(HOME, want(T5)) ?? '',
      isDm: true,
      userId: ALICE,
      messageRows: legacy,
    });
    await made.router.handle(pressed as never);
    const edit = sent(pressed.editReply);
    expect(edit.flags).toBeUndefined();
    expect(edit.components).toEqual([
      { type: ComponentType.ActionRow, components: [button(want(YVELTAL), 'Stop: Yveltal')] },
    ]);
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
  });

  it('removes one form, the shadow raids and an IV want each by itself', async () => {
    const made = setup();
    const origin = pokemonTarget(487, 'giratina_origin');
    const shadow = pokemonTarget(487, undefined, true);
    const perfect: NotificationTarget = { kind: 'iv', iv: 'perfect' };
    for (const target of [pokemonTarget(487), origin, shadow, perfect]) {
      await made.wants.set(ALICE, HOME, target, 'both');
    }
    expect(made.said(await made.press(ALICE, want(origin)))).toContain(
      'Removed **Giratina (Origin Forme)** (raids and spawns) from your list',
    );
    expect(made.said(await made.press(ALICE, want(shadow)))).toContain('**Shadow Giratina**');
    expect(made.said(await made.press(ALICE, want(perfect)))).toContain('**Perfect IV spawns**');
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: pokemonTarget(487), scope: 'both' },
    ]);
  });

  it('removes a gym target', async () => {
    const made = setup();
    await made.gymTargets.add(ALICE, HOME, 1);
    await made.gymTargets.add(ALICE, HOME, 2);
    const pressed = await made.press(ALICE, { kind: 'gym', gymId: 1 });
    expect(made.said(pressed)).toBe(
      'Removed **The Stacks** from your gyms for that server. `/target` there adds it again.',
    );
    expect((await made.gymTargets.list(ALICE, HOME)).gymIds).toEqual([2]);
    expect(made.said(await made.press(ALICE, { kind: 'gym', gymId: 1 }))).toBe(
      '**The Stacks** was already removed from your gyms for that server.',
    );
  });

  it('names a gym target only as a gym of that server (plan 19B-2)', async () => {
    // Gym 2 is the second server's alone, though it lies in a region of this one.
    const made = setup({ gyms: twoServerGyms().gyms });
    await made.gymTargets.add(ALICE, HOME, THEIR_GYM);
    const pressed = await made.press(ALICE, { kind: 'gym', gymId: THEIR_GYM });
    expect(made.said(pressed)).toBe(
      'Removed **Unknown gym** from your gyms for that server. `/target` there adds it again.',
    );
    expect(made.said(pressed)).not.toContain('Fountain');
  });

  it('switches the settings for the boss of an egg and for new trains off', async () => {
    const made = setup();
    await made.users.update(ALICE, { bossSetNotification: true });
    await made.newTrains.set(ALICE, HOME, true, 1);
    await made.newTrains.set(ALICE, AWAY, true, 1);
    expect(made.said(await made.press(ALICE, { kind: 'boss-set' }))).toBe(
      'Stopped: I will no longer tell you when an egg you are signed up for gets its boss. ' +
        '`/settings` turns it back on.',
    );
    expect(await made.users.get(ALICE)).toMatchObject({ bossSetNotification: false });
    expect(await made.newTrains.isOn(ALICE, HOME)).toBe(true);
    expect(made.said(await made.press(ALICE, { kind: 'boss-set' }))).toBe(
      'That was off already: I do not tell you when an egg you are signed up for gets its boss.',
    );
    expect(made.said(await made.press(ALICE, { kind: 'new-train' }))).toBe(
      'Stopped: I will no longer tell you about new trains in that server. ' +
        '`/settings` there turns it back on.',
    );
    // In the server the button names, and in no other.
    expect(await made.newTrains.isOn(ALICE, HOME)).toBe(false);
    expect(await made.newTrains.isOn(ALICE, AWAY)).toBe(true);
    expect(made.said(await made.press(ALICE, { kind: 'new-train' }))).toBe(
      'That was off already: I do not tell you about new trains in that server.',
    );
  });

  it('removes what the presser has themself, whoever the message was for', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    const pressed = await made.press(BOB, want(T5));
    expect(made.said(pressed)).toBe(
      '**T5 raids** was already removed from your list for that server.',
    );
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });

  it('keeps nothing in memory: a button works on a bot that never sent its message', async () => {
    const first = setup();
    await first.wants.set(ALICE, HOME, T5, 'raid');
    const customId = stopButtonId(HOME, want(T5)) ?? '';
    // Another router and context, as after a restart, over the same stored wants.
    const { ctx } = createTestContext({ wants: first.wants });
    const router = new InteractionRouter(ctx, [], components);
    const pressed = fakeButton({ customId, isDm: true, userId: ALICE });
    await router.handle(pressed as never);
    expect(sent(pressed.followUp).content).toMatch(/^Removed \*\*T5 raids\*\*/);
    expect(await first.wants.count(ALICE, HOME)).toBe(0);
  });

  it('answers a button it cannot read as no longer active, and changes nothing', async () => {
    const made = setup();
    await made.wants.set(ALICE, HOME, T5, 'raid');
    for (const customId of [
      `dm:${HOME}:stop:t:T9`,
      `dm:${HOME}:stop:p:0`,
      `dm:${HOME}:stop:x:1`,
      `dm:${HOME}:stop`,
      `dm:${HOME}:start:t:T5`,
      'dm:not-a-server:stop:t:T5',
      `dm:${HOME}:stop:t:T5:extra`,
    ]) {
      const pressed = fakeButton({ customId, isDm: true, userId: ALICE });
      await made.router.handle(pressed as never);
      expect(sent(pressed.reply).content, customId).toBe('This no longer works.');
      expect(pressed.deferUpdate).not.toHaveBeenCalled();
    }
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });

  it('reports a failure to the member and leaves the button where it is', async () => {
    const made = setup();
    made.wants.failing = new Error('the database is away');
    const pressed = await made.press(ALICE, want(T5));
    expect(pressed.editReply).not.toHaveBeenCalled();
    expect(sent(pressed.followUp).content).toMatch(/^Something went wrong/);
    expect(made.entries.some((entry) => entry.msg === 'interaction failed')).toBe(true);
  });

  it('is throttled like the other writes of a member, and listed with the controls', () => {
    expect(dmControls.throttle).toBe(MEMBER_WRITE_THROTTLE);
    expect(dmControls.guards).toBeUndefined();
    expect(components).toContain(dmControls);
  });

  it('refuses a member who presses more often than the limit allows, through the router', async () => {
    const made = setup();
    for (let use = 0; use < MEMBER_WRITE_THROTTLE.uses; use++) {
      const pressed = await made.press(ALICE, want(T5));
      expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    }
    await made.wants.set(ALICE, HOME, T5, 'raid');
    const refused = await made.press(ALICE, want(T5));
    expect(refused.deferUpdate).not.toHaveBeenCalled();
    expect(sent(refused.reply).content).toMatch(/wait|again in/i);
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
    // Another member is not held back by it.
    expect((await made.press(BOB, want(T5))).deferUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('the custom id of a stop button', () => {
  /** A server with the longest snowflake there can be. */
  const LONGEST_GUILD = '18446744073709551615';
  const catalogue = catalogueFixture();

  it('fits for every entry of the catalogue, as a species, a form and their shadow raids', () => {
    let buttons = 0;
    const leftOut: string[] = [];
    for (const entry of catalogue.all) {
      const targets = [
        pokemonTarget(entry.dex),
        pokemonTarget(entry.dex, entry.key),
        pokemonTarget(entry.dex, undefined, true),
        pokemonTarget(entry.dex, entry.key, true),
        entryWant(catalogue, entry),
      ];
      for (const target of targets) {
        const id = stopButtonId(LONGEST_GUILD, want(target));
        if (id === undefined) {
          leftOut.push(entry.key);
          continue;
        }
        buttons += 1;
        expect(id.length).toBeLessThanOrEqual(100);
        const decoded = decodeCustomId(id);
        expect(decoded).toMatchObject({ kind: 'dm', id: LONGEST_GUILD, action: 'stop' });
        expect(parseStopArgs(decoded?.args ?? [])).toEqual(want(target));
      }
    }
    expect(buttons).toBeGreaterThan(1_000);
    // With the game data of the fixture no key is too long: every want gets its button.
    expect(leftOut).toEqual([]);
  });

  it('is knowingly left out for a form whose key does not fit, and the message names the command', () => {
    const long = pokemonTarget(999_999, 'x'.repeat(64), true);
    expect(stopButtonId(LONGEST_GUILD, want(long))).toBeUndefined();
    const message = notifyDm({ sentence: 'A raid.', links: [] }, [
      { label: 'Shadow Longname', stop: undefined, command: '/unwant' },
      { label: 'T5 raids', stop: stopButtonId(HOME, want(T5)), command: '/unwant' },
    ]);
    expect(dmReasons(message)).toEqual(['T5 raids', 'Shadow Longname']);
    // Plan 8X-F: the reasons without a button before the Stop buttons, which come last.
    expect(textDisplays(message).at(-2)).toBe(
      'Shadow Longname\n-# To stop what has no button here, use `/unwant` in the server.',
    );
    expect(buttonsOf(message)).toMatchObject([
      { label: 'Stop', style: ButtonStyle.Secondary, customId: `dm:${HOME}:stop:t:T5` },
    ]);
  });

  it('fits for the boxes of /want and their lines, or names the command where a form is too long (B9)', () => {
    const longestForm = catalogue.all
      .map((entry) => entry.key)
      .reduce((longest, key) => (key.length > longest.length ? key : longest), '');
    const reasons: NotifyReason[] = [
      { kind: 'target', want: boxTarget('research-pokemon', 1025, longestForm) },
      { kind: 'target', want: boxTarget('dynamax', 1025, longestForm) },
      { kind: 'target', want: boxTarget('gigantamax', 1025, longestForm) },
      { kind: 'target', want: { kind: 'research-item', item: `${'item-'.repeat(7)}items` } },
      { kind: 'target', want: { kind: 'research-energy', dex: 1025 } },
      { kind: 'subject', subject: { kind: 'pokemon', dex: 1025, form: longestForm } },
      { kind: 'subject', subject: { kind: 'tier', level: 'MegaLegendary' } },
    ];
    for (const reason of reasons) {
      const id = stopButtonId(LONGEST_GUILD, reason);
      expect(id?.length, JSON.stringify(reason)).toBeLessThanOrEqual(100);
      expect(parseStopArgs(decodeCustomId(id ?? '')?.args ?? [])).toEqual(reason);
    }
    // A form key of 64 characters does not fit beside the longest snowflake: no button, and the
    // DM names `/unwant` instead (as for a want, above).
    const long = 'f'.repeat(64);
    for (const reason of [
      { kind: 'target', want: boxTarget('research-pokemon', 1025, long) },
      { kind: 'target', want: boxTarget('dynamax', 1025, long) },
      { kind: 'target', want: boxTarget('gigantamax', 1025, long) },
      { kind: 'subject', subject: { kind: 'pokemon', dex: 1025, form: long } },
    ] satisfies NotifyReason[]) {
      expect(stopButtonId(LONGEST_GUILD, reason)).toBeUndefined();
    }
  });

  it('fits for every tier, both IV targets, a gym and the two settings', () => {
    const reasons: NotifyReason[] = [
      want({ kind: 'tier', tier: { level: 'MegaLegendary', shadow: false } }),
      want({ kind: 'tier', tier: { level: 'T5', shadow: true } }),
      want({ kind: 'iv', iv: 'perfect' }),
      want({ kind: 'iv', iv: 'zero' }),
      { kind: 'gym', gymId: 4_294_967_295 },
      { kind: 'boss-set' },
      { kind: 'new-train' },
    ];
    for (const reason of reasons) {
      const id = stopButtonId(LONGEST_GUILD, reason);
      expect(id).toBeDefined();
      expect(parseStopArgs(decodeCustomId(id ?? '')?.args ?? [])).toEqual(reason);
    }
  });
});

describe('Manage… under a direct message (plan 8R-4)', () => {
  const PIKACHU = { kind: 'pokemon', dex: 25 } as const;
  const change = changeButtonId(HOME, PIKACHU) ?? '';

  /** The commands' controls in a DM, over wants in memory, Alice a member of the home server. */
  function changing(more: Partial<AppContext> = {}) {
    const wants = new MemoryWants();
    const members = new FakeMemberDirectory().add(ALICE, 'Alice', HOME);
    const { ctx, entries } = createTestContext({ wants, members, ...more });
    const router = new InteractionRouter(ctx, [], components);
    /** The DM: Manage… of Pikachu (Raids, Research) and a gym's Stop. */
    const message = fakeMessage(
      notifyDm({ sentence: 'A raid.', links: [] }, [
        { label: 'Pikachu', change: { customId: change, name: 'Pikachu', box: 'Raids' } },
        { label: 'a gym', stop: stopButtonId(HOME, { kind: 'gym', gymId: 1 }) },
      ]).components as unknown as FakeRow[],
    );
    const press = async (customId = change) => {
      const pressed = fakeButton({
        customId,
        isDm: true,
        userId: ALICE,
        message,
        serverNames: { [HOME]: 'Pittsburgh Pokémon GO' },
      });
      await router.handle(pressed as never);
      return pressed;
    };
    const submit = async (
      dialog: ReturnType<typeof shownDialog>,
      given: { checked?: Record<string, string[]>; ticks?: Record<string, boolean> },
    ) => {
      const submitted = fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        isDm: true,
        userId: ALICE,
        message,
        ...given,
      });
      await router.handle(submitted as never);
      return submitted;
    };
    return { ctx, entries, wants, members, message, press, submit };
  }

  it('says that nothing is on the list, and opens nothing, where the member holds no want', async () => {
    const made = changing();
    const pressed = await made.press();
    expect(pressed.showModal).not.toHaveBeenCalled();
    expect(sent(pressed.reply).content).toBe('**Pikachu** is not on your list; `/want` adds it.');
  });

  it('opens the dialog of the want as stored, the server named, Remove shown, before any answer', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid', true);
    const pressed = await made.press();
    expect(pressed.deferUpdate).not.toHaveBeenCalled();
    const dialog = shownDialog(pressed);
    expect(dialog.title).toBe('Pikachu: what for?');
    expect(dialogText(dialog)).toBe(
      'Your Pikachu want in Pittsburgh Pokémon GO. Change what you want a DM about, or tick ' +
        'Remove to stop them all.',
    );
    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
      'Tell me about',
      'Only costumed Pikachu',
      'Remove Pikachu from my list',
    ]);
    expect(dialogField(dialog, 'Only costumed Pikachu').ticked).toBe(true);
    // The server rides in the dialog's id: its Submit comes from a DM.
    expect(dialog.custom_id).toMatch(new RegExp(`:${HOME}:~[0-9a-z]+$`));
  });

  it('tells a member no longer in the server, and where wants are switched off, instead', async () => {
    const gone = changing({ members: new FakeMemberDirectory() });
    await gone.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    const pressed = await gone.press();
    expect(pressed.showModal).not.toHaveBeenCalled();
    // Thrown as a `UserError` (B9): the router answers it privately.
    expect(sent(pressed.reply)).toEqual({
      content: 'You are no longer a member of that server: there is nothing to change there.',
      flags: MessageFlags.Ephemeral,
    });
    // A server that notifies nobody (plan 19A-1).
    const off = changing({ servers: withFeatures({ notifications: false }) });
    const refused = await off.press();
    expect(sent(refused.reply).content).toBe(
      'Wants are switched off in that server: there is nothing to change.',
    );
  });

  it('writes from a DM, shows the button as Changed, and answers below', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    const dialog = shownDialog(await made.press());
    const submitted = await made.submit(dialog, {
      checked: { boxes: ['raids', 'spawns'] },
    });
    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: pokemonTarget(25), scope: 'both' },
    ]);
    const shown = {
      v2: true as const,
      components: made.message.rows as unknown as V2Message['components'],
    };
    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Changed', 'Stop']);
    expect(sent(submitted.followUp).content).toBe(
      '**Pikachu**: Raids, Spawns. You will get a DM when one is reported in a region you can see.',
    );
  });

  it('shows Removed where Remove was ticked, and answers even when the button cannot change', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    const dialog = shownDialog(await made.press());
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      isDm: true,
      userId: ALICE,
      message: made.message,
      ticks: { remove: true },
    });
    submitted.editReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
    await createTestContextRouter(made.ctx).handle(submitted as never);
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
    expect(sent(submitted.followUp).content).toBe('**Pikachu** is off your list.');
    expect(
      made.entries.filter((entry) => entry.msg === 'could not show a change on a direct message'),
    ).toMatchObject([{ level: 40 }]);
    const again = await made.submit(dialog, { ticks: { remove: true } });
    const shown = {
      v2: true as const,
      components: made.message.rows as unknown as V2Message['components'],
    };
    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Removed', 'Stop']);
    expect(sent(again.followUp).content).toBe('**Pikachu** is off your list.');
  });

  it('checks again at Submit that the member is in the server and wants are on (B2)', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    const dialog = shownDialog(await made.press());
    made.members.remove(ALICE, HOME);
    const submitted = await made.submit(dialog, { checked: { boxes: ['spawns'] } });
    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    expect(sent(submitted.followUp).content).toBe(
      'You are no longer a member of that server: there is nothing to change there.',
    );
    expect(submitted.editReply).not.toHaveBeenCalled();
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: pokemonTarget(25), scope: 'raid' },
    ]);
    const off = new InteractionRouter(
      { ...made.ctx, servers: withFeatures({ notifications: false }) },
      [],
      components,
    );
    made.members.add(ALICE, 'Alice', HOME);
    const refused = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      isDm: true,
      userId: ALICE,
      message: made.message,
      checked: { boxes: ['spawns'] },
    });
    await off.handle(refused as never);
    expect(sent(refused.followUp).content).toBe(
      'Wants are switched off in that server: there is nothing to change.',
    );
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });

  it('refuses a Submit in a DM whose id names no server, and writes nothing', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    const dialog = shownDialog(await made.press());
    const customId = dialog.custom_id.replace(`:${HOME}`, '');
    const submitted = fakeModal({
      customId,
      form: dialog,
      isDm: true,
      userId: ALICE,
      message: made.message,
      checked: { boxes: ['spawns'] },
    });
    await createTestContextRouter(made.ctx).handle(submitted as never);
    expect(sent(submitted.reply).content).toBe('This only works in a server.');
    expect((await made.wants.list(ALICE, HOME)).wants).toEqual([
      { target: pokemonTarget(25), scope: 'raid' },
    ]);
  });

  it('writes the presser’s own rows alone, never another member’s', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    await made.wants.set(BOB, HOME, pokemonTarget(25), 'raid');
    const dialog = shownDialog(await made.press());
    await made.submit(dialog, { ticks: { remove: true } });
    expect(await made.wants.count(ALICE, HOME)).toBe(0);
    expect((await made.wants.list(BOB, HOME)).wants).toEqual([
      { target: pokemonTarget(25), scope: 'raid' },
    ]);
  });

  it('refuses a Stop of a Pokémon or tier from before Manage… as no longer active', async () => {
    const made = changing();
    await made.wants.set(ALICE, HOME, pokemonTarget(25), 'raid');
    const subject = stopButtonId(HOME, { kind: 'subject', subject: PIKACHU }) ?? '';
    const pressed = await made.press(subject);
    expect(sent(pressed.reply).content).toBe('This no longer works.');
    expect(await made.wants.count(ALICE, HOME)).toBe(1);
  });
});

/** A router over every control, for a fake handled outside a test's own. */
function createTestContextRouter(ctx: AppContext): InteractionRouter {
  return new InteractionRouter(ctx, [], components);
}

describe('Manage… of Team GO Rocket under a direct message (plan 8R-4)', () => {
  it('opens the Rocket dialog for the server, and says so where nothing is held', async () => {
    const wants = new MemoryWants();
    const members = new FakeMemberDirectory().add(ALICE, 'Alice', HOME);
    const { ctx } = createTestContext({ wants, members });
    const router = new InteractionRouter(ctx, [], components);
    const press = async () => {
      const pressed = fakeButton({
        customId: `dm:${HOME}:change:rocket`,
        isDm: true,
        userId: ALICE,
        messageRows: [],
      });
      await router.handle(pressed as never);
      return pressed;
    };
    expect(sent((await press()).reply).content).toBe(
      '**Team GO Rocket** is not on your list; `/want` adds it.',
    );
    await ctx.targetWants.change(
      ALICE,
      HOME,
      { add: [{ kind: 'rocket', who: 'grunt:water' }], remove: [] },
      0,
    );
    const dialog = shownDialog(await press());
    expect(dialog.title).toBe('Team GO Rocket: what for?');
    expect(dialog.custom_id).toContain(`:${HOME}`);
    expect(dialogFields(dialog).map((field) => field.label)).toEqual([
      'Grunts',
      'Leaders',
      'Remove all my Team GO Rocket wants',
    ]);
  });

  /** A DM with the Manage… of Team GO Rocket and a gym's Stop, Alice a member of the server. */
  function rocketDm(more: Partial<AppContext> = {}) {
    const members = new FakeMemberDirectory().add(ALICE, 'Alice', HOME);
    const { ctx } = createTestContext({ wants: new MemoryWants(), members, ...more });
    const router = new InteractionRouter(ctx, [], components);
    const message = fakeMessage(
      notifyDm({ sentence: 'A grunt.', links: [] }, [
        {
          label: 'Water-type grunt',
          change: { customId: rocketChangeButtonId(HOME), name: 'Water-type grunt' },
        },
        { label: 'a gym', stop: stopButtonId(HOME, { kind: 'gym', gymId: 1 }) },
      ]).components as unknown as FakeRow[],
    );
    const press = async () => {
      const pressed = fakeButton({
        customId: rocketChangeButtonId(HOME),
        isDm: true,
        userId: ALICE,
        message,
      });
      await router.handle(pressed as never);
      return pressed;
    };
    const submit = async (
      dialog: ReturnType<typeof shownDialog>,
      given: {
        selected?: Record<string, string[]>;
        checked?: Record<string, string[]>;
        ticks?: Record<string, boolean>;
      },
    ) => {
      const submitted = fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        isDm: true,
        userId: ALICE,
        message,
        ...given,
      });
      await router.handle(submitted as never);
      return submitted;
    };
    const labels = () =>
      buttonsOf({
        v2: true as const,
        components: message.rows as unknown as V2Message['components'],
      }).map((button) => button.label);
    return { ctx, members, press, submit, labels };
  }

  it('writes a Submit from the DM, shows Changed or Removed, and answers below (B6)', async () => {
    const made = rocketDm();
    await made.ctx.targetWants.change(
      ALICE,
      HOME,
      { add: [{ kind: 'rocket', who: 'grunt:water' }], remove: [] },
      0,
    );
    const dialog = shownDialog(await made.press());
    const changed = await made.submit(dialog, {
      selected: { grunts: ['grunt:water', 'grunt:fire'] },
    });
    expect(changed.deferUpdate).toHaveBeenCalledTimes(1);
    expect((await made.ctx.targetWants.list(ALICE, HOME)).wants).toEqual([
      { kind: 'rocket', who: 'grunt:water' },
      { kind: 'rocket', who: 'grunt:fire' },
    ]);
    expect(made.labels()).toEqual(['Changed', 'Stop']);
    expect(sent(changed.followUp).content).toMatch(
      /^\*\*Team GO Rocket\*\*: Fire and Water grunts/,
    );
    const removed = await made.submit(dialog, { ticks: { remove: true } });
    expect(await made.ctx.targetWants.count(ALICE, HOME)).toBe(0);
    expect(made.labels()).toEqual(['Removed', 'Stop']);
    expect(sent(removed.followUp).content).toBe('**Team GO Rocket** is off your list.');
  });

  it('refuses privately where the member has left or wants are off, by the one check (B9)', async () => {
    const gone = rocketDm({ members: new FakeMemberDirectory() });
    const pressed = await gone.press();
    expect(pressed.showModal).not.toHaveBeenCalled();
    expect(sent(pressed.reply)).toEqual({
      content: 'You are no longer a member of that server: there is nothing to change there.',
      flags: MessageFlags.Ephemeral,
    });
    const off = rocketDm({ servers: withFeatures({ notifications: false }) });
    expect(sent((await off.press()).reply)).toEqual({
      content: 'Wants are switched off in that server: there is nothing to change.',
      flags: MessageFlags.Ephemeral,
    });
    const none = rocketDm();
    expect(sent((await none.press()).reply)).toEqual({
      content: '**Team GO Rocket** is not on your list; `/want` adds it.',
      flags: MessageFlags.Ephemeral,
    });
  });
});
