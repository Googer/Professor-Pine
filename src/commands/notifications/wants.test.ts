import {
  ComponentType,
  MessageFlags,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  dialogChoices,
  dialogField,
  dialogFields,
  dialogText,
  shownDialog,
} from '../../../test/support/dialogs.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { effectiveBosses } from '../../domain/pogo/raid-bosses.js';
import { sameRaidTier } from '../../domain/pogo/raid-tier.js';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
  answered,
  asV2,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import {
  buttonsOf,
  componentCount,
  customIdsOf,
  textDisplays,
} from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { createdMeetup, reportedMax, reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryWants } from '../../../test/support/wants.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { LATE_DEFER_MS } from '../../discord/late-reply.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import {
  notificationTiers,
  pokemonTarget,
  type Want,
} from '../../domain/pogo/notification-target.js';
import { bossIdsOf, type RaidBoss } from '../../domain/pogo/raid-bosses.js';
import type { WantList } from '../../domain/pogo/wants.js';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { NOTIFICATION_THROTTLE } from './shared.js';
import { wantChoices } from './want-input.js';
import {
  unwant,
  unwantAll,
  want,
  wantBoxControls,
  wantControls,
  wantListControls,
  wants,
  wantsList,
} from './wants.js';
import {
  pageTask,
  researchTasksFixture,
  researchTasksOfPage,
} from '../../../test/support/research.js';
import { boxTarget } from '../../domain/notify/target-wants.js';
import { raidWantsFiring } from '../../domain/notify/reasons.js';
import { wantEntries } from './want-boxes.js';
import { NO_WHICH, wantDialogId } from './want-dialog.js';
import { wantLineCount } from './wants.js';
import type { ResearchTask } from '../../domain/research/task.js';
import type { RocketChoice } from '../../domain/rocket/lineups.js';
import { rocketChoicesOfFeed, rocketLineupsFixture } from '../../../test/support/rocket.js';

const OTHER_GUILD = '499999999999999999';

/**
 * The commands over wants in memory. No task list unless a test gives one (`tasks`), and no Rocket
 * lineups unless a test gives them (`lineups`, plan 8R-2): the choices of the Pokémon, tiers and
 * IVs are those of before plan 8R-1, which the rewards of research and the Rocket targets follow.
 */
function setup(
  tasks: readonly ResearchTask[] = [],
  lineups: readonly RocketChoice[] = [],
  more: Partial<AppContext> = {},
) {
  const store = new MemoryWants();
  const { ctx } = createTestContext({
    wants: store,
    researchTasks: researchTasksFixture(tasks),
    rocketLineups: rocketLineupsFixture(lineups),
    ...more,
  });
  const router = new InteractionRouter(
    ctx,
    [want, unwant, wants, unwantAll],
    [wantControls, wantListControls, wantBoxControls],
  );
  const run = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({ commandName, userId: ALICE, options, ...extra });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered: the deferred answer, or a refusal. */
  const answer = async (commandName: string, options: Record<string, string> = {}) => {
    const used = await run(commandName, options);
    const mock = used.editReply.mock.calls.length > 0 ? used.editReply : used.reply;
    return sent(mock).content;
  };
  const choices = async (commandName: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName,
      userId: ALICE,
      focusedName: 'target',
      focused,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const rows = (member = ALICE, guild = FAKE_GUILD_ID) =>
    store.rows
      .filter((row) => row.memberId === member && row.guildId === guild)
      .map((row) => [row.pokemon, row.type]);
  /** The rows with the form and the shadow flag: `[pokemon, type, form, shadow]`. */
  const formRows = (member = ALICE, guild = FAKE_GUILD_ID) =>
    store.rows
      .filter((row) => row.memberId === member && row.guildId === guild)
      .map((row) => [row.pokemon, row.type, row.form, row.shadow]);
  return { ctx, store, router, run, answer, choices, handle, rows, formRows };
}

describe('the notification commands', () => {
  it('exist only where notifications are switched on, with help in the notifications category', () => {
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, notifications: false },
      },
    };
    for (const command of [want, unwant, wants, unwantAll]) {
      expect(command.enabled?.(ctx.config)).toBe(true);
      expect(command.enabled?.(off)).toBe(false);
      expect(command.help.category).toBe('notifications');
      expect(command.help.details).toBeTruthy();
      expect(command.help.examples?.length).toBeGreaterThan(0);
    }
    expect(want.help.details).toContain('every form');
    expect(want.help.details).toContain('In the post of a raid or a max battle');
    expect(unwant.help.details).toContain('A Pokémon takes all its forms off with it.');
  });

  it('work in a server only, and answer the member alone', async () => {
    const made = setup();
    const dm = await made.run('want', { target: 'iv:perfect' }, { isDm: true });
    expect(dm.reply).toHaveBeenCalledWith({
      content: 'This only works in a server.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.store.rows).toEqual([]);
    const used = await made.run('want', { target: 'iv:perfect' });
    expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
  });
});

describe('/want', () => {
  /** The boxes of a dialog: each box's value, label and whether it is ticked to start with. */
  const boxesOf = (dialog: APIModalInteractionResponseCallbackData) =>
    dialog.components.flatMap((component) => {
      const inner = (
        component as { component?: { type?: number; custom_id?: string; options?: unknown[] } }
      ).component;
      if (inner?.type !== ComponentType.CheckboxGroup || inner.custom_id !== 'boxes') return [];
      return (inner.options as { value: string; label: string; default?: boolean }[]).map(
        (option) => [option.value, option.label, option.default === true] as const,
      );
    });
  /**
   * `/want` used by Alice, and its dialog submitted with these boxes ticked, and the forms of its
   * Which field as it opened (or `forms`).
   */
  const wantWith = async (
    made: ReturnType<typeof setup>,
    target: string,
    ticked: string[],
    forms?: string[],
  ) => {
    const asked = await made.run('want', { target });
    const dialog = shownDialog(asked);
    const which = dialogFields(dialog).find((field) => field.id === 'forms');
    const opened = (which?.options ?? []).filter((one) => one.ticked).map((one) => one.value);
    const submitted = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        checked: { boxes: ticked, ...(which ? { forms: forms ?? opened } : {}) },
        userId: ALICE,
      }),
    );
    return { dialog, said: sent(submitted.editReply).content };
  };

  it('asks in a dialog what a Pokémon is wanted for, only what can happen, and writes what is ticked', async () => {
    const made = setup();
    const asked = await made.run('want', { target: 'pokemon:68' });
    expect(asked.reply).not.toHaveBeenCalled();
    expect(asked.deferReply).not.toHaveBeenCalled();
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('Machamp: what for?');
    // Its Submit names the six boxes it shows (B3).
    // Then its per-open token (plan 8X-F).
    expect(dialog.custom_id).toMatch(/^wantbox:p68:set2:1r:0:0:~[0-9a-z]+$/);
    // A first want: every box that can happen, none ticked (Matt's R-M2).
    expect(boxesOf(dialog)).toEqual([
      ['raids', 'Raids', false],
      ['dynamax', 'Dynamax', false],
      ['gigantamax', 'Gigantamax', false],
      ['spawns', 'Spawns', false],
      ['research', 'Research', false],
      ['shadow', 'Shadow', false],
    ]);
    // Plan 8X-F (Matt): the Dynamax box says no stars (the wording of plan 8R-4's mockups).
    const described = dialog.components.flatMap((component) => {
      const inner = (component as { component?: { type?: number; options?: unknown[] } }).component;
      if (inner?.type !== ComponentType.CheckboxGroup) return [];
      return (inner.options as { value: string; description?: string }[]).map(
        (option) => [option.value, option.description] as const,
      );
    });
    expect(described.slice(1, 3)).toEqual([
      ['dynamax', 'Dynamax max battles'],
      ['gigantamax', 'Gigantamax max battles'],
    ]);
    // A legendary is met in no spawn, can be no max boss here, and has no Research (plan 8R-4).
    expect(
      boxesOf(shownDialog(await made.run('want', { target: 'Mewtwo' }))).map(([box]) => box),
    ).toEqual(['raids', 'shadow']);
    const { said } = await wantWith(made, 'pokemon:68', ['raids', 'gigantamax', 'shadow']);
    expect(said).toBe(
      '**Machamp**: Raids, Gigantamax, Shadow. You will get a DM when one is reported in a region ' +
        'you can see.',
    );
    expect(made.formRows()).toEqual([
      [68, 'raid', null, false],
      [68, 'raid', null, true],
    ]);
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
      boxTarget('gigantamax', 68),
    ]);
  });

  it('ticks what the member has already, changes it, and takes it off with nothing ticked', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'spawn');
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [boxTarget('research-pokemon', 147)], remove: [] },
      0,
    );
    const { dialog, said } = await wantWith(made, 'Dratini', ['raids', 'spawns']);
    expect(boxesOf(dialog)).toEqual([
      ['raids', 'Raids', false],
      ['spawns', 'Spawns', true],
      ['research', 'Research', true],
      ['shadow', 'Shadow', false],
    ]);
    expect(said).toMatch(/^\*\*Dratini\*\*: Raids, Spawns\./);
    expect(made.formRows()).toEqual([[147, 'both', null, false]]);
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([]);
    expect((await wantWith(made, 'Dratini', [])).said).toBe('**Dratini** is off your list.');
    expect(made.formRows()).toEqual([]);
  });

  it('answers once for a species: a Submit of the species takes its forms’ rows away (plan 8R-4)', async () => {
    const made = setup();
    await wantWith(made, 'Alolan Rattata', ['spawns'], ['rattata_alola']);
    expect(made.formRows()).toEqual([[19, 'spawn', 'rattata_alola', false]]);
    await wantWith(made, 'pokemon:19', ['raids'], ['rattata', 'rattata_alola']);
    expect(made.formRows()).toEqual([[19, 'raid', null, false]]);
    // Shadow raids picked from the list are the Shadow box of their Pokémon's dialog.
    const shadow = shownDialog(await made.run('want', { target: 'pokemon:645::shadow' }));
    expect(shadow.title).toBe('Landorus: what for?');
  });

  it('writes what can only be one thing at once: Mew, IVs, a tier without shadow raids', async () => {
    const made = setup();
    expect(await made.answer('want', { target: 'Mew' })).toBe(
      '**Mew**: Raids. You will get a DM when one is reported in a region you can see.',
    );
    expect(await made.answer('want', { target: 'tier:Elite' })).toMatch(/^\*\*Elite\*\*: Raids\./);
    expect(await made.answer('want', { target: 'hundo' })).toBe(
      'You will get a DM when a wild Pokémon with perfect IVs is reported in a region you can ' +
        'see. `/unwant` takes them off again.',
    );
    expect(await made.answer('want', { target: 'iv:perfect' })).toBe(
      'Perfect IV spawns are on your list already. `/unwant` takes them off.',
    );
    expect(made.formRows()).toEqual([
      [151, 'raid', null, false],
      [-20, 'raid', null, false],
      [-6, 'spawn', null, false],
    ]);
  });

  it('asks a tier about its raids and its shadow raids', async () => {
    const made = setup();
    const asked = await made.run('want', { target: 't5' });
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('T5: what for?');
    expect(boxesOf(dialog)).toEqual([
      ['raids', 'Raids', false],
      ['shadow-raids', 'Shadow raids', false],
    ]);
    await wantWith(made, 'shadow 5', ['shadow-raids']);
    expect(made.rows()).toEqual([[-35, 'raid']]);
  });

  it('wants a research reward of the task list at once: an item, Mega Energy', async () => {
    const made = setup([pageTask('Catch a Dragon-type Pokémon'), pageTask('Catch 10 Pokémon')]);
    expect((await made.choices('want', 'rare')).slice(0, 1)).toEqual([
      { name: 'Rare Candy (research)', value: 'research:item:rare-candy' },
    ]);
    expect(await made.answer('want', { target: 'research:item:rare-candy' })).toBe(
      'You will get a DM when field research that may reward **Rare Candy** is reported in a ' +
        'region you can see. `/unwant` takes it off again.',
    );
    await made.run('want', { target: 'Golden Razz Berry' });
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
      { kind: 'research-item', item: 'rare-candy' },
      { kind: 'research-item', item: 'golden-razz-berry' },
    ]);
  });

  it('writes the boxes its dialog showed, and leaves the others as they are (B3)', async () => {
    const made = setup();
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [boxTarget('research-pokemon', 147)], remove: [] },
      0,
    );
    // A dialog that showed Raids and Spawns only (the boxes of another moment).
    const customId = wantDialogId(
      {
        subject: { kind: 'pokemon', dex: 147 },
        shown: ['raids', 'spawns'],
        costumes: false,
        remove: false,
        which: NO_WHICH,
      },
      Date.now(),
    );
    const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
    await made.handle(
      fakeModal({
        customId,
        form: dialog,
        checked: { boxes: ['raids', 'shadow'] },
        userId: ALICE,
      }),
    );
    // Raids ticked; Spawns shown and not ticked; Shadow not shown, so not written; Research kept.
    expect(made.formRows()).toEqual([[147, 'raid', null, false]]);
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
      boxTarget('research-pokemon', 147),
    ]);
  });

  it('offers the Pokémon a text names before the rewards of the task list (B5)', async () => {
    const tasks = researchTasksOfPage();
    const energy = tasks
      .flatMap((task) => task.rewards)
      .find((reward) => reward.kind === 'energy' && reward.dex !== null);
    if (energy?.kind !== 'energy' || energy.dex === null) throw new Error('no Mega Energy');
    const made = setup(tasks);
    const species = catalogueFixture().byDex(energy.dex)[0]?.name ?? '';
    const offered = (await made.choices('want', species)).map((choice) => String(choice.value));
    const reward = offered.indexOf(`research:energy:${String(energy.dex)}`);
    expect(reward).toBeGreaterThan(0);
    expect(offered.slice(0, reward).every((value) => !value.startsWith('research:'))).toBe(true);
    expect(offered[0]).toMatch(/^pokemon:/);
    // The energy named in full is found.
    const named = (await made.choices('want', `${species} mega energy`)).map((choice) =>
      String(choice.value),
    );
    expect(named).toContain(`research:energy:${String(energy.dex)}`);
  });

  // Staging of 2026-11-07: `mega` offered nine "… Mega Energy (research)" right after the boss,
  // and Meganium not in the first dozen; the ruling is Meganium first among the names.
  it('offers a Pokémon whose name the text begins before the rewards that only hold its word', async () => {
    const made = setup(researchTasksOfPage());
    const names = (await made.choices('want', 'mega')).map((choice) => choice.name);
    expect(names[0]).toBe('Mega Blastoise');
    const firstReward = names.findIndex((name) => name.endsWith('(research)'));
    expect(firstReward).toBeGreaterThan(0);
    expect(names.indexOf('Meganium')).toBeGreaterThan(0);
    expect(names.indexOf('Meganium')).toBeLessThan(firstReward);
    // The bosses' species, the tiers and the other megas the text begins stay before them too.
    expect(names.slice(0, firstReward)).toEqual(
      expect.arrayContaining(['Blastoise (every form)', 'Mega raids', 'Mega Diancie']),
    );
  });

  it('gives the rewards at most five places where the Pokémon fill the list (B5)', async () => {
    const made = setup(researchTasksOfPage());
    let withRewards = 0;
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      const offered = (await made.choices('want', letter)).map((choice) => String(choice.value));
      const rewards = offered.filter((value) => value.startsWith('research:'));
      if (rewards.length === 0) continue;
      withRewards += 1;
      // After every Pokémon, tier and IV choice; five at most of a full list.
      expect(offered.slice(-rewards.length), letter).toEqual(rewards);
      if (offered.length === 25) expect(rewards.length, letter).toBeLessThanOrEqual(5);
    }
    expect(withRewards).toBeGreaterThan(0);
  });

  it('refuses a Submit of before plan 8R-4 or of another Which field as out of date', async () => {
    const made = setup();
    const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
    for (const customId of [
      'wantbox:p147:set:1r',
      dialog.custom_id.replace(/:0(:~[0-9a-z]+)$/, ':k3n1x2$1'),
      // Without its per-open token (plan 8X-F): no dialog of this shape was drawn without one.
      dialog.custom_id.replace(/:~[0-9a-z]+$/, ''),
    ]) {
      const submitted = await made.handle(
        fakeModal({ customId, form: dialog, checked: { boxes: ['raids'] }, userId: ALICE }),
      );
      expect(sent(submitted.reply).content).toBe(STALE_COMPONENT);
    }
    expect(made.formRows()).toEqual([]);
  });

  // Plan 8X-F, "For 8R-4": Discord's client shows what was last submitted under a custom id in
  // place of what the dialog ticks, so every opening has an id of its own.
  it('gives every opening of the dialog an id of its own, and a Submit of either writes', async () => {
    const opened = Date.UTC(2026, 9, 22, 16);
    vi.useFakeTimers({ toFake: ['Date'], now: opened });
    try {
      const made = setup();
      const first = shownDialog(await made.run('want', { target: 'Dratini' }));
      vi.setSystemTime(opened + 1000);
      const second = shownDialog(await made.run('want', { target: 'Dratini' }));
      expect(second.custom_id).not.toBe(first.custom_id);
      expect(first.custom_id).toMatch(new RegExp(`:~${opened.toString(36)}$`));
      await made.handle(
        fakeModal({
          customId: first.custom_id,
          form: first,
          checked: { boxes: ['raids'] },
          userId: ALICE,
        }),
      );
      expect(made.formRows()).toEqual([[147, 'raid', null, false]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a Submit without its boxes as out of date, and writes nothing (B4)', async () => {
    const made = setup();
    const dialog = shownDialog(await made.run('want', { target: 'Dratini' }));
    const submitted = await made.handle(
      // A form of another shape: no checkbox group comes back.
      fakeModal({ customId: dialog.custom_id, form: { ...dialog, components: [] }, userId: ALICE }),
    );
    expect(sent(submitted.reply).content).toBe(STALE_COMPONENT);
    expect(made.formRows()).toEqual([]);
  });

  it('is acknowledged when its writing takes long, but never before a dialog (B2)', async () => {
    const made = setup();
    const timers: number[] = [];
    const router = new InteractionRouter(made.ctx, [want], [], {
      setTimer: (_run, ms) => {
        timers.push(ms);
        return () => undefined;
      },
    });
    const use = async (target: string) => {
      const interaction = fakeChatInput({
        commandName: 'want',
        userId: ALICE,
        options: { target },
      });
      await router.handle(interaction as never);
      return interaction;
    };
    // Written at once (Mew, IVs, a reward): a late acknowledgement waits for slow work.
    await use('Mew');
    await use('hundo');
    expect(timers).toHaveLength(2);
    for (const ms of timers) expect(ms).toBeLessThanOrEqual(LATE_DEFER_MS);
    // A dialog is the first answer: nothing waits to acknowledge it.
    const asked = await use('Dratini');
    expect(timers).toHaveLength(2);
    expect(shownDialog(asked).title).toBe('Dratini: what for?');
  });

  it('opens no dialog when the member’s wants take too long to read', async () => {
    const made = setup();
    let asked = (): void => undefined;
    const reading = new Promise<void>((resolve) => (asked = resolve));
    made.ctx.wantBoxes.held = () => {
      asked();
      return new Promise(() => undefined);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const running = made.run('want', { target: 'pokemon:68' });
      await reading;
      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
      const used = await running;
      expect(used.showModal).not.toHaveBeenCalled();
      expect(answered(used).content).toBe(SLOW_READ);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses text that names nothing outright, suggests what it may be, and stores nothing', async () => {
    const made = setup();
    const refused = await made.run('want', { target: 'mewtw' });
    const said = sent(refused.reply).content ?? '';
    expect(said).toMatch(
      /^I do not know "mewtw" as a Pokémon, a raid tier, or perfect or zero IVs\. Did you mean /,
    );
    expect(said).toContain('Mewtwo');
    const gone = await made.run('want', { target: 'pokemon:99999' });
    expect(sent(gone.reply).content).toBe(
      'I do not know that Pokémon any more. Pick again from the list.',
    );
    expect(made.store.rows).toEqual([]);
  });

  it('suggests the shadow tiers alone for the bare word shadow', async () => {
    const made = setup();
    for (const typed of ['shadow', 'Shadow raids']) {
      const refused = await made.run('want', { target: typed });
      expect(sent(refused.reply).content).toBe(
        `I do not know "${typed}" as a Pokémon, a raid tier, or perfect or zero IVs. ` +
          'Did you mean Shadow T1 raids, Shadow T3 raids or Shadow T5 raids? ' +
          'Pick one from the list that appears while you type.',
      );
    }
  });

  it('suggests the tiers for raid sent alone, and no Pokémon (review of 2026-11-07)', async () => {
    const made = setup();
    const said = sent((await made.run('want', { target: 'raid' })).reply).content ?? '';
    expect(said).toMatch(
      /^I do not know "raid" as a Pokémon, a raid tier, or perfect or zero IVs\./,
    );
    expect(said).toContain('T5 raids');
    expect(said).not.toContain('Urshifu');
    expect(made.store.rows).toEqual([]);
  });

  it('allows thirty changes a minute, Submits in a window of their own', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) await made.run('want', { target: 'iv:perfect' });
    const next = await made.run('want', { target: 'pokemon:151' });
    expect(sent(next.reply).content).toMatch(/^You can use \/want again in /);
  });
});

describe('/want: the Pokémon dialog (plan 8R-4)', () => {
  /** `/want` used by Alice. */
  const opened = async (made: ReturnType<typeof setup>, target: string) =>
    shownDialog(await made.run('want', { target }));
  /** A dialog submitted by Alice with what the test ticks; the private answer. */
  const submit = async (
    made: ReturnType<typeof setup>,
    dialog: APIModalInteractionResponseCallbackData,
    given: {
      checked?: Record<string, string[]>;
      selected?: Record<string, string[]>;
      ticks?: Record<string, boolean>;
    },
  ) => {
    const submitted = await made.handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE, ...given }),
    );
    return submitted.editReply.mock.calls.length > 0
      ? sent(submitted.editReply).content
      : sent(submitted.reply).content;
  };
  const labels = (dialog: APIModalInteractionResponseCallbackData) =>
    dialogFields(dialog).map((field) => field.label);
  const ticked = (dialog: APIModalInteractionResponseCallbackData, label: string) =>
    (dialogField(dialog, label).options ?? []).filter((one) => one.ticked).map((one) => one.value);

  /** The input of a dialog's field by its custom id, as it was drawn. */
  const inputOf = (dialog: APIModalInteractionResponseCallbackData, id: string) =>
    dialog.components.flatMap((component) => {
      const inner = (component as { component?: { custom_id?: string } }).component;
      return inner?.custom_id === id
        ? [inner as { custom_id: string; required?: boolean; min_values?: number }]
        : [];
    })[0];

  it('opens a first want with nothing ticked, and Submit kept back till one is (Matt’s R-M2)', async () => {
    const made = setup();
    const dialog = await opened(made, 'Corsola');
    expect(ticked(dialog, 'Tell me about')).toEqual([]);
    expect(inputOf(dialog, 'boxes')).toMatchObject({ required: true, min_values: 1 });
    expect(ticked(dialog, 'Which Corsola')).toEqual(['corsola', 'corsola_galarian']);
    expect(inputOf(dialog, 'forms')).toMatchObject({ required: true, min_values: 1 });
    // Discord lets no Submit through with nothing ticked.
    expect(() =>
      fakeModal({ customId: dialog.custom_id, form: dialog, checked: { boxes: [] } }),
    ).toThrow(/at least 1 of boxes/);
    await submit(made, dialog, {
      checked: { boxes: ['raids'], forms: ['corsola', 'corsola_galarian'] },
    });
    // Held: nothing ticked may be submitted, and takes it off (Q1).
    const again = await opened(made, 'Corsola');
    expect(inputOf(again, 'boxes')).toMatchObject({ required: false, min_values: 0 });
    expect(inputOf(again, 'forms')).toMatchObject({ required: false, min_values: 0 });
    expect(
      await submit(made, again, {
        checked: { boxes: [], forms: ['corsola', 'corsola_galarian'] },
      }),
    ).toBe('**Corsola** is off your list.');
    // A tier alike.
    const tier = await opened(made, 't5');
    expect(ticked(tier, 'Tell me about')).toEqual([]);
    expect(inputOf(tier, 'boxes')).toMatchObject({ required: true, min_values: 1 });
  });

  it('asks about a Pokémon of one form with its boxes ticked and Costumes, as the mockup', async () => {
    const made = setup();
    const dialog = await opened(made, 'Pikachu');
    expect(dialog.title).toBe('Pikachu: what for?');
    expect(dialogText(dialog)).toBe('Tick what you want a DM about, in the regions you can see.');
    expect(labels(dialog)).toEqual(['Tell me about', 'Only costumed Pikachu']);
    // A first want: nothing ticked (Matt's R-M2), Costumed off.
    expect(dialogField(dialog, 'Tell me about').options).toEqual([
      {
        value: 'raids',
        label: 'Raids',
        description: 'Pikachu raids and their eggs',
        ticked: false,
      },
      { value: 'dynamax', label: 'Dynamax', description: 'Dynamax max battles', ticked: false },
      {
        value: 'gigantamax',
        label: 'Gigantamax',
        description: 'Gigantamax max battles',
        ticked: false,
      },
      { value: 'spawns', label: 'Spawns', description: 'Wild Pikachu reported', ticked: false },
      {
        value: 'research',
        label: 'Research',
        description: 'Field research that rewards it',
        ticked: false,
      },
    ]);
    expect(dialogField(dialog, 'Only costumed Pikachu')).toEqual({
      label: 'Only costumed Pikachu',
      description: 'Any costume, now or later. Unticked, costumed ones come too.',
      id: 'costumed',
      kind: 'checkbox',
      ticked: false,
    });
    const said = await submit(made, dialog, {
      checked: { boxes: ['raids', 'gigantamax', 'research'] },
      ticks: { costumed: true },
    });
    expect(said).toBe(
      '**Costumed Pikachu**: Raids, Gigantamax, Research. You will get a DM when one is ' +
        'reported in a region you can see.\n' +
        "-# Costumed Pokémon haven't appeared in max battles or as shadows so far, so " +
        'Gigantamax stays quiet unless that changes.',
    );
    expect(made.formRows()).toEqual([[25, 'raid', null, false]]);
    expect(made.store.rows[0]?.costumed).toBe(true);
    // Opened again: as stored, Costumed ticked, and Remove since it is held.
    const again = await opened(made, 'Pikachu');
    expect(labels(again)).toEqual([
      'Tell me about',
      'Only costumed Pikachu',
      'Remove Pikachu from my list',
    ]);
    expect(dialogField(again, 'Only costumed Pikachu').ticked).toBe(true);
    expect(ticked(again, 'Tell me about')).toEqual(['raids', 'gigantamax', 'research']);
  });

  it('builds the largest dialog of five fields: Charizard with its megas, a want held', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid');
    const dialog = await opened(made, 'Charizard');
    expect(dialog.components).toHaveLength(5);
    expect(labels(dialog)).toEqual([
      'Tell me about',
      'Which Charizard',
      'Only costumed ones',
      'Remove Charizard from my list',
    ]);
    expect(dialogText(dialog)).toBe(
      'Tick what you want a DM about, in the regions you can see. A mega is told for raids only.',
    );
    // A Which field: the boxes have no descriptions (the mockup's), the forms are by name.
    expect(dialogField(dialog, 'Tell me about').options?.[0]).toEqual({
      value: 'raids',
      label: 'Raids',
      ticked: true,
    });
    expect(dialogField(dialog, 'Which Charizard')).toMatchObject({
      kind: 'group',
      options: [
        { value: 'charizard', label: 'Charizard', ticked: true },
        { value: 'charizard_mega_x', label: 'Mega Charizard X', ticked: true },
        { value: 'charizard_mega_y', label: 'Mega Charizard Y', ticked: true },
      ],
    });
    expect(dialogField(dialog, 'Only costumed ones').description).toBe(
      'Of the forms ticked, any costume, now or later.',
    );
    expect(dialogField(dialog, 'Remove Charizard from my list')).toMatchObject({
      description: 'Ticked, Submit removes it, whatever else is ticked.',
      id: 'remove',
      ticked: false,
    });
  });

  it('writes every form ticked, a mega for raids only, and says so of a mega without Raids', async () => {
    const made = setup();
    const dialog = await opened(made, 'Charizard');
    const said = await submit(made, dialog, {
      checked: { boxes: ['spawns', 'research'], forms: ['charizard', 'charizard_mega_y'] },
    });
    expect(said).toBe(
      '**Charizard**: Spawns, Research. You will get a DM when one is reported in a region ' +
        'you can see.\n-# Mega Charizard Y is told for raids only: it is off your list ' +
        'without Raids.',
    );
    expect(made.formRows()).toEqual([[6, 'spawn', 'charizard', false]]);
  });

  it('tells of a mega raid when every form and Costumed are ticked: a mega is never costumed (W1)', async () => {
    const made = setup();
    const dialog = await opened(made, 'Charizard');
    await submit(made, dialog, {
      checked: { boxes: ['raids'], forms: ['charizard', 'charizard_mega_x', 'charizard_mega_y'] },
      ticks: { costumed: true },
    });
    const { wants: held } = await made.store.list(ALICE, FAKE_GUILD_ID);
    const charizard = catalogueFixture();
    const raidOf = (key: string, isCostumed: boolean) => {
      const entry = charizard.byKey(key);
      if (!entry) throw new Error(`the fixture has no ${key}`);
      return {
        tier: { level: 'Mega' as const, shadow: false },
        boss: { dex: entry.dex, key: entry.key, costumed: isCostumed },
      };
    };
    expect(raidWantsFiring(charizard, held, raidOf('charizard_mega_y', false))).toHaveLength(1);
    // A plain Charizard raid still needs the costume.
    expect(raidWantsFiring(charizard, held, raidOf('charizard', false))).toEqual([]);
    expect(raidWantsFiring(charizard, held, raidOf('charizard', true))).toHaveLength(1);
  });

  it('opens a species picked as a form with that form alone ticked, and a mega no longer at once', async () => {
    const made = setup();
    const corsola = await opened(made, 'Galarian Corsola');
    expect(corsola.title).toBe('Corsola: what for?');
    expect(ticked(corsola, 'Which Corsola')).toEqual(['corsola_galarian']);
    const mega = await opened(made, 'mega charizard y');
    expect(ticked(mega, 'Which Charizard')).toEqual(['charizard_mega_y']);
    // Every form ticked is the species row.
    await submit(made, corsola, {
      checked: { boxes: ['raids'], forms: ['corsola', 'corsola_galarian'] },
    });
    expect(made.formRows()).toEqual([[222, 'raid', null, false]]);
  });

  it('opens with the member’s rows, says when they differ by form, and Remove takes them all', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 77, 'raid');
    made.store.add(ALICE, FAKE_GUILD_ID, 77, 'spawn', { form: 'ponyta_galarian' });
    const dialog = await opened(made, 'Ponyta');
    expect(dialogText(dialog)).toBe(
      'Tick what you want a DM about, in the regions you can see. Your Ponyta wants differ by ' +
        'form; Submit sets them alike.',
    );
    expect(ticked(dialog, 'Which Ponyta')).toEqual(['ponyta', 'ponyta_galarian']);
    expect(ticked(dialog, 'Tell me about')).toEqual(['raids', 'spawns']);
    expect(
      await submit(made, dialog, {
        checked: { boxes: ['raids'], forms: ['ponyta'] },
        ticks: { remove: true },
      }),
    ).toBe('**Ponyta** is off your list.');
    expect(made.formRows()).toEqual([]);
  });

  it('asks about the forms of a Pokémon told for raids alone in a dropdown, with no boxes', async () => {
    const made = setup();
    const dialog = await opened(made, 'Arceus');
    expect(dialogText(dialog)).toBe(
      'Arceus is told for raids, in the regions you can see. Pick the forms you want.',
    );
    expect(labels(dialog)).toEqual(['Which Arceus']);
    const which = dialogField(dialog, 'Which Arceus');
    expect(which.kind).toBe('select');
    expect(which.options).toHaveLength(18);
    expect(
      await submit(made, dialog, {
        selected: { forms: ['arceus', 'arceus_dragon', 'arceus_fire'] },
      }),
    ).toBe(
      '**Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)**: Raids. You will get a DM when one ' +
        'is reported in a region you can see.',
    );
    expect(made.formRows().map((row) => row[2])).toEqual([
      'arceus',
      'arceus_dragon',
      'arceus_fire',
    ]);
    // None picked takes it off.
    await submit(made, await opened(made, 'Arceus'), { selected: { forms: [] } });
    expect(made.formRows()).toEqual([]);
  });

  it('hides Research of a legendary unless today’s tasks reward it or the member holds it', async () => {
    const made = setup();
    const shownBoxes = (dialog: APIModalInteractionResponseCallbackData) =>
      (dialogField(dialog, 'Tell me about').options ?? []).map((one) => one.value);
    const mewtwo = await opened(made, 'Mewtwo');
    expect(shownBoxes(mewtwo)).toEqual(['raids', 'shadow']);
    expect(ticked(mewtwo, 'Which Mewtwo')).toEqual([
      'mewtwo',
      'mewtwo_a',
      'mewtwo_mega_x',
      'mewtwo_mega_y',
    ]);
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [boxTarget('research-pokemon', 150)], remove: [] },
      0,
    );
    const held = await opened(made, 'Mewtwo');
    expect(ticked(held, 'Tell me about')).toEqual(['research']);
    // Rewarded by a task of today's list: shown (A9).
    const task = pageTask('Catch 10 Pokémon');
    const rewarded = setup([
      {
        ...task,
        rewards: [
          {
            kind: 'encounter',
            name: 'Mewtwo',
            key: 'mewtwo',
            dex: 150,
            shiny: false,
            cp: null,
            image: null,
          },
        ],
      },
    ]);
    expect(shownBoxes(await opened(rewarded, 'Mewtwo'))).toEqual(['raids', 'research', 'shadow']);
  });

  it('shows Costumes where a row held is costumed, and keeps it where Costumes is not shown (A1)', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'raid', { costumed: true });
    const dialog = await opened(made, 'Dratini');
    expect(dialogField(dialog, 'Only costumed Dratini').ticked).toBe(true);
    // Written at once (one box, nothing else to ask): the costume stays.
    made.store.add(ALICE, FAKE_GUILD_ID, 151, 'raid', { costumed: true });
    // Only there is it said where Costumed can be unticked (F3): a plain Mew's answer has no note.
    expect(await made.answer('want', { target: 'Mew' })).toBe(
      '**Costumed Mew**: Raids. You will get a DM when one is reported in a region you can see.\n' +
        '-# Only costumed ones are told: Manage… in `/wants` can untick Only costumed.',
    );
    expect(made.store.rows.find((row) => row.pokemon === 151)?.costumed).toBe(true);
  });

  it('describes its option as a Pokémon or the boss of the post it is used in (F4)', () => {
    const [option] = want.data.toJSON().options ?? [];
    expect(option?.description).toBe(
      'A Pokémon, tier, IVs, item, grunt or leader; leave it out in a raid or max post for its boss',
    );
  });

  it('leaves a mega’s plain row out of Costumed and of rows that differ (A3, A-D3)', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'both', { form: 'charizard', costumed: true });
    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid', { form: 'charizard_mega_x' });
    const dialog = await opened(made, 'Charizard');
    expect(dialogField(dialog, 'Only costumed ones').ticked).toBe(true);
    expect(dialogText(dialog)).not.toContain('differ');
  });

  it('leaves the species’ Mega Energy research want, a line of its own, on Remove (A-D4)', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid');
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [{ kind: 'research-energy', dex: 6 }], remove: [] },
      0,
    );
    const dialog = await opened(made, 'Charizard');
    expect(await submit(made, dialog, { ticks: { remove: true } })).toBe(
      '**Charizard** is off your list.',
    );
    expect(made.formRows()).toEqual([]);
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
      { kind: 'research-energy', dex: 6 },
    ]);
  });

  it('decides once per use whether the dialog opens (A8)', async () => {
    // The raid boss list has Mew costumed until the router has asked whether a dialog opens.
    let asked = false;
    const costumedMew = effectiveBosses(
      [
        {
          pokemonId: 'MEW',
          form: null,
          tier: { level: 'T5', shadow: false },
          shiny: false,
          name: 'Mew wearing a party hat',
        },
      ],
      [],
      catalogueFixture(),
      Date.now(),
    );
    const made = setup([], [], {
      raidBosses: {
        bosses: () => (asked ? [] : costumedMew),
        bossesOf: () => [],
        autoset: () => undefined,
      },
    });
    const defer = want.defer;
    if (typeof defer !== 'function') throw new Error('/want defers by a function');
    const deferring: SimpleCommand = {
      ...want,
      defer: (interaction, ctx) => {
        const deferred = defer(interaction, ctx);
        asked = true;
        return deferred;
      },
    };
    const router = new InteractionRouter(made.ctx, [deferring], []);
    const used = fakeChatInput({ commandName: 'want', userId: ALICE, options: { target: 'Mew' } });
    await router.handle(used as never);
    expect(asked).toBe(true);
    expect(shownDialog(used).title).toBe('Mew: what for?');
  });

  it('writes a Pokémon of one box and no other field at once, as before', async () => {
    const made = setup();
    expect(await made.answer('want', { target: 'Mew' })).toBe(
      '**Mew**: Raids. You will get a DM when one is reported in a region you can see.',
    );
    expect(made.formRows()).toEqual([[151, 'raid', null, false]]);
  });

  it('shows Costumes for a costume the raid boss list has before the game data does', async () => {
    const catalogue = catalogueFixture();
    const feed = [
      {
        pokemonId: 'ZUBAT',
        form: null,
        tier: { level: 'T1', shadow: false },
        shiny: false,
        name: 'Zubat wearing a top hat',
      },
    ] as const;
    const bosses = () =>
      effectiveBosses(
        feed.map((boss) => ({ ...boss, tier: { ...boss.tier } })),
        [],
        catalogue,
        Date.now(),
      );
    const made = setup([], [], {
      raidBosses: {
        bosses,
        bossesOf: (tier) => bosses().filter((boss) => sameRaidTier(boss.tier, tier)),
        autoset: () => undefined,
      },
    });
    expect(labels(await opened(made, 'Zubat'))).toContain('Only costumed Zubat');
    expect(labels(await opened(setup(), 'Zubat'))).not.toContain('Only costumed Zubat');
  });

  it('shows Costumes for a Pokémon an event on lists costumed among its spawns (review R7)', async () => {
    const asked: number[] = [];
    const made = setup([], [], {
      eventSpawns: {
        sightingsAt: (at) => {
          asked.push(at);
          return [{ key: 'zubat', dex: 41, costumed: true }];
        },
      },
    });
    expect(labels(await opened(made, 'Zubat'))).toContain('Only costumed Zubat');
    expect(asked.length).toBeGreaterThan(0);
    // Listed plain only: no costume to ask about.
    const plain = setup([], [], {
      eventSpawns: { sightingsAt: () => [{ key: 'zubat', dex: 41, costumed: false }] },
    });
    expect(labels(await opened(plain, 'Zubat'))).not.toContain('Only costumed Zubat');
  });

  it('keeps Unown’s letters apart: no Which field, a letter’s own dialog', async () => {
    const made = setup();
    const unown = await opened(made, 'Unown');
    expect(labels(unown)).not.toContain('Which Unown');
    await submit(made, unown, { checked: { boxes: ['spawns'] } });
    const letter = await opened(made, 'pokemon:201:unown_a');
    expect(letter.title).toBe('Unown (A): what for?');
    await submit(made, letter, { checked: { boxes: ['raids'] } });
    expect(made.formRows()).toEqual([
      [201, 'spawn', null, false],
      [201, 'raid', 'unown_a', false],
    ]);
  });

  it('refuses a Submit whose Which hash is not that of the forms the game data has now (review R5)', async () => {
    const made = setup();
    const dialog = await opened(made, 'Corsola');
    const forged = dialog.custom_id.replace(/:set2:([^:]+):([^:]+):[^:]+/, ':set2:$1:$2:zzzz');
    const submitted = await made.handle(
      fakeModal({
        customId: forged,
        form: dialog,
        checked: { boxes: ['raids'], forms: ['corsola'] },
        userId: ALICE,
      }),
    );
    expect(sent(submitted.reply).content).toBe(STALE_COMPONENT);
    expect(made.formRows()).toEqual([]);
  });
});

describe('/want in the post of a raid or a max battle (plan 8R-4, Matt’s R-M1)', () => {
  const ticked = (dialog: APIModalInteractionResponseCallbackData, label: string) =>
    (dialogField(dialog, label).options ?? []).filter((one) => one.ticked).map((one) => one.value);
  const inPost = (postId: string) => ({ channelId: postId, thread: { parentId: WEST_FORUM } });

  it('wants the raid’s boss with nothing typed, Raids alone ticked; a Pokémon typed alike', async () => {
    const raid = await reportedRaid({
      boss: { key: 'machamp' },
      tier: { level: 'T3', shadow: false },
    });
    const made = setup([], [], { parties: raid.store, regions: raid.regions });
    const post = inPost(raid.postId);
    const dialog = shownDialog(await made.run('want', {}, post));
    expect(dialog.title).toBe('Machamp: what for?');
    expect(ticked(dialog, 'Tell me about')).toEqual(['raids']);
    const typed = shownDialog(await made.run('want', { target: 'Dratini' }, post));
    expect(ticked(typed, 'Tell me about')).toEqual(['raids']);
    // With a want held: the member's rows as stored, and the post's box beside them.
    made.store.add(ALICE, FAKE_GUILD_ID, 68, 'spawn');
    const held = shownDialog(await made.run('want', {}, post));
    expect(ticked(held, 'Tell me about')).toEqual(['raids', 'spawns']);
    expect(dialogFields(held).map((field) => field.label)).toContain('Remove Machamp from my list');
  });

  it('ticks Shadow in the post of a shadow raid, and the egg’s tier where there is no boss yet', async () => {
    const shadow = await reportedRaid({
      boss: { key: 'machamp' },
      tier: { level: 'T3', shadow: true },
    });
    const inShadow = setup([], [], { parties: shadow.store, regions: shadow.regions });
    const dialog = shownDialog(await inShadow.run('want', {}, inPost(shadow.postId)));
    expect(ticked(dialog, 'Tell me about')).toEqual(['shadow']);
    const egg = await reportedRaid();
    const made = setup([], [], { parties: egg.store, regions: egg.regions });
    const tier = shownDialog(await made.run('want', {}, inPost(egg.postId)));
    expect(tier.title).toBe('T5: what for?');
    expect(ticked(tier, 'Tell me about')).toEqual(['raids']);
  });

  it('wants a max battle’s boss with only its kind ticked: Dynamax, or Gigantamax', async () => {
    const max = await reportedMax();
    const made = setup([], [], { parties: max.store, regions: max.regions });
    const dialog = shownDialog(await made.run('want', {}, inPost(max.postId)));
    expect(dialog.title).toBe('Machamp: what for?');
    expect(ticked(dialog, 'Tell me about')).toEqual(['dynamax']);
    const giant = await reportedMax({ tier: 'G' });
    const inGiant = setup([], [], { parties: giant.store, regions: giant.regions });
    const typed = shownDialog(
      await inGiant.run('want', { target: 'Pikachu' }, inPost(giant.postId)),
    );
    expect(ticked(typed, 'Tell me about')).toEqual(['gigantamax']);
  });

  it('needs a Pokémon anywhere else: a region’s channel, a meetup’s post', async () => {
    const said =
      'Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it ' +
      'out for its boss.';
    const made = setup();
    const used = await made.run('want');
    expect(used.showModal).not.toHaveBeenCalled();
    expect(answered(used).content).toBe(said);
    const meetup = await createdMeetup();
    const inMeetup = setup([], [], { parties: meetup.store, regions: meetup.regions });
    expect(answered(await inMeetup.run('want', {}, inPost(meetup.postId))).content).toBe(said);
    expect(made.store.rows).toEqual([]);
  });

  it('ticks Shadow raids in the post of a shadow egg', async () => {
    const egg = await reportedRaid({ tier: { level: 'T5', shadow: true } });
    const made = setup([], [], { parties: egg.store, regions: egg.regions });
    const dialog = shownDialog(await made.run('want', {}, inPost(egg.postId)));
    expect(dialog.title).toBe('T5: what for?');
    expect(ticked(dialog, 'Tell me about')).toEqual(['shadow-raids']);
  });

  it('refuses a raid’s boss the game data does not know, and names the tier to want (Matt’s Q1)', async () => {
    const raid = await reportedRaid({
      boss: { name: 'Mysterymon' },
      tier: { level: 'T3', shadow: false },
    });
    const made = setup([], [], { parties: raid.store, regions: raid.regions });
    const used = await made.run('want', {}, inPost(raid.postId));
    expect(used.showModal).not.toHaveBeenCalled();
    expect(answered(used).content).toBe(
      'The boss of this raid is not known yet: name a Pokémon, or `/want t3` for the tier.',
    );
    // The command it names is the tier's.
    const tier = shownDialog(await made.run('want', { target: 't3' }, inPost(raid.postId)));
    expect(tier.title).toBe('T3: what for?');
    expect(made.store.rows).toEqual([]);
  });

  it('refuses a max battle’s boss the game data does not know (F1)', async () => {
    const max = await reportedMax({ boss: { name: 'Mysterymon' } });
    const made = setup([], [], { parties: max.store, regions: max.regions });
    const used = await made.run('want', {}, inPost(max.postId));
    expect(used.showModal).not.toHaveBeenCalled();
    expect(answered(used).content).toBe(
      'The boss of this battle is not known yet: name a Pokémon.',
    );
  });

  it('does not count a use it refuses for what it names against the limit (F2)', async () => {
    const made = setup();
    for (let n = 0; n < NOTIFICATION_THROTTLE.uses; n++) {
      expect(answered(await made.run('want')).content).toMatch(/^Name a Pokémon/);
      expect(answered(await made.run('want', { target: 'zzqqxxv' })).content).toMatch(
        /^I do not know/,
      );
    }
    expect(await made.answer('want', { target: 'iv:perfect' })).toMatch(/^You will get a DM/);
  });

  it.each([
    ['a dialog that opens', 'Pikachu'],
    ['a one-box write', 'Mew'],
    ['the Team GO Rocket dialog', 'rocket'],
  ])('counts every use of %s against the limit, and refuses the next (G1)', async (_, target) => {
    // The clock stands still: a loaded machine's second between the uses made "59 seconds".
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    try {
      const made = setup();
      // Refused uses first: they leave the whole limit.
      expect(answered(await made.run('want')).content).toMatch(/^Name a Pokémon/);
      for (let n = 0; n < NOTIFICATION_THROTTLE.uses; n++) {
        const used = await made.run('want', { target });
        if (target === 'Mew') expect(answered(used).content).toMatch(/^\*\*Mew\*\*: Raids/);
        else expect(used.showModal).toHaveBeenCalledTimes(1);
      }
      const refused = await made.run('want', { target });
      expect(refused.showModal).not.toHaveBeenCalled();
      expect(answered(refused).content).toBe('You can use /want again in 1 minute.');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('/unwant: a form under a species want (plan 8R-4, R4e)', () => {
  it('removes nothing of a species row for one of its forms, and says what covers it', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 222, 'raid');
    expect(await made.answer('unwant', { target: 'Galarian Corsola' })).toBe(
      'Your **Corsola** want covers **Galarian Corsola**. `/want corsola` changes which forms.',
    );
    expect(made.formRows()).toEqual([[222, 'raid', null, false]]);
    made.store.add(ALICE, FAKE_GUILD_ID, 222, 'spawn', { form: 'corsola_galarian' });
    expect(await made.answer('unwant', { target: 'Galarian Corsola' })).toBe(
      '**Galarian Corsola** is off your list.',
    );
    expect(made.formRows()).toEqual([[222, 'raid', null, false]]);
  });
});

describe('/want: Team GO Rocket (plan 8R-2)', () => {
  /** The values of a field of the Rocket dialog ticked or chosen when it opens. */
  const rocketTicks = (dialog: APIModalInteractionResponseCallbackData) => [
    ...(dialogField(dialog, 'Grunts').options ?? [])
      .filter((one) => one.ticked)
      .map((one) => one.value),
    ...(dialogField(dialog, 'Leaders').options ?? [])
      .filter((one) => one.ticked)
      .map((one) => one.value),
  ];
  /** The Rocket dialog Alice opened with `target`, submitted with these grunts and leaders. */
  const rocketWith = async (
    made: ReturnType<typeof setup>,
    target: string,
    grunts: string[],
    leaders: string[],
    remove = false,
  ) => {
    const dialog = shownDialog(await made.run('want', { target }));
    const submitted = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        selected: { grunts },
        checked: { leaders },
        ...(dialogFields(dialog).some((field) => field.id === 'remove')
          ? { ticks: { remove } }
          : {}),
        userId: ALICE,
      }),
    );
    return { dialog, said: sent(submitted.editReply).content };
  };

  it('opens one dialog for every Rocket want, by /want rocket or any of its targets (plan 8R-4)', async () => {
    const made = setup([], rocketChoicesOfFeed());
    // Through the router: nothing is acknowledged before the dialog (F13).
    const asked = await made.run('want', { target: 'rocket' });
    expect(asked.deferReply).not.toHaveBeenCalled();
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('Team GO Rocket: what for?');
    expect(dialogText(dialog)).toBe(
      'Pick what you want a DM about, in the regions you can see. A grunt type is told at most ' +
        'once an hour.',
    );
    expect(dialogFields(dialog).map((field) => [field.label, field.kind])).toEqual([
      ['Grunts', 'select'],
      ['Leaders', 'group'],
    ]);
    expect(dialogField(dialog, 'Grunts').description).toBe(
      'By type, whatever their lineup. For one Pokémon they give, tick Shadow in its own /want.',
    );
    expect(dialogField(dialog, 'Grunts').options?.map((one) => one.label)).toEqual([
      'Bug-type grunts',
      'Dark-type grunts',
      'Dragon-type grunts',
      'Electric-type grunts',
      'Fairy-type grunts',
      'Fighting-type grunts',
      'Fire-type grunts',
      'Flying-type grunts',
      'Ghost-type grunts',
      'Grass-type grunts',
      'Ground-type grunts',
      'Ice-type grunts',
      'Normal-type grunts',
      'Poison-type grunts',
      'Psychic-type grunts',
      'Rock-type grunts',
      'Steel-type grunts',
      'Water-type grunts',
      'Grunts without a type',
      'Decoy grunt',
    ]);
    expect(dialogField(dialog, 'Leaders').options).toEqual([
      { value: 'leader:cliff', label: 'Cliff', ticked: false },
      { value: 'leader:arlo', label: 'Arlo', ticked: false },
      { value: 'leader:sierra', label: 'Sierra', ticked: false },
      {
        value: 'leader:any',
        label: 'Any leader',
        description: 'Every leader, also future ones',
        ticked: false,
      },
      { value: 'giovanni', label: 'Giovanni', ticked: false },
    ]);
    // A target picked or typed opens it with that one ticked.
    expect(rocketTicks(shownDialog(await made.run('want', { target: 'grunt:water' })))).toEqual([
      'grunt:water',
    ]);
    expect(rocketTicks(shownDialog(await made.run('want', { target: 'Arlo' })))).toEqual([
      'leader:arlo',
    ]);
    for (const target of ['no type', 'No type grunt', 'grunt (no type)']) {
      expect(rocketTicks(shownDialog(await made.run('want', { target }))), target).toEqual([
        'grunt:none',
      ]);
    }
    expect(made.rows()).toEqual([]);
  });

  it('writes the Rocket wants picked, takes the others off, and all with nothing or Remove', async () => {
    const made = setup([], rocketChoicesOfFeed());
    const first = await rocketWith(
      made,
      'rocket',
      ['grunt:water', 'grunt:fire'],
      ['leader:arlo', 'leader:any', 'giovanni'],
    );
    expect(first.said).toBe(
      '**Team GO Rocket**: Fire and Water grunts, Arlo, Any leader, Giovanni. You will get a DM ' +
        'when one is reported in a region you can see, a grunt type at most once an hour.\n' +
        '-# Any leader covers Cliff, Arlo and Sierra already: Arlo adds nothing.',
    );
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
      { kind: 'rocket', who: 'grunt:fire' },
      { kind: 'rocket', who: 'grunt:water' },
      { kind: 'rocket', who: 'leader:arlo' },
      { kind: 'rocket', who: 'leader:any' },
      { kind: 'rocket', who: 'giovanni' },
    ]);
    // Opened again: as held, plus the target picked, and Remove.
    const again = await rocketWith(made, 'decoy', ['grunt:water', 'decoy'], []);
    expect(rocketTicks(again.dialog)).toEqual([
      'grunt:fire',
      'grunt:water',
      'decoy',
      'leader:arlo',
      'leader:any',
      'giovanni',
    ]);
    expect(dialogFields(again.dialog).map((field) => field.label)).toContain(
      'Remove all my Team GO Rocket wants',
    );
    expect((await made.ctx.targetWants.list(ALICE, FAKE_GUILD_ID)).wants).toEqual([
      { kind: 'rocket', who: 'grunt:water' },
      { kind: 'rocket', who: 'decoy' },
    ]);
    const removed = await rocketWith(made, 'rocket', ['grunt:water'], ['giovanni'], true);
    expect(removed.said).toBe('**Team GO Rocket** is off your list.');
    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
    await rocketWith(made, 'rocket', ['grunt:water'], []);
    expect((await rocketWith(made, 'rocket', [], [])).said).toBe(
      '**Team GO Rocket** is off your list.',
    );
    expect(made.rows()).toEqual([]);
    // A first want with nothing picked: nothing was there to take off (B8).
    expect((await rocketWith(made, 'rocket', [], [])).said).toBe(
      'Nothing picked: no Team GO Rocket wants.',
    );
  });

  it('reads none as zero IVs, the legacy word (fix F4), never the untyped grunts', async () => {
    const made = setup([], rocketChoicesOfFeed());
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [{ kind: 'rocket', who: 'grunt:none' }], remove: [] },
      0,
    );
    expect(await made.answer('want', { target: 'none' })).toMatch(/with zero IVs/);
    expect(made.rows()).toHaveLength(1);
    // A legacy member's `/unwant target:none` takes the zero IVs off, and leaves the grunts.
    expect(await made.answer('unwant', { target: 'none' })).toBe(
      '**Zero IV spawns** is off your list.',
    );
    expect(made.rows()).toEqual([]);
    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(1);
  });

  it('offers the Rocket targets a text begins, after the Pokémon', async () => {
    const made = setup([], rocketChoicesOfFeed());
    expect(await made.choices('want', 'giov')).toEqual([
      { name: 'Giovanni (Team GO Rocket boss)', value: 'giovanni' },
    ]);
    const values = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => String(choice.value));
    const rocketOnly = async (typed: string) =>
      (await values(typed)).filter((value) => /^(grunt|leader):|^(giovanni|decoy)$/.test(value));
    // After what the Pokémon search finds.
    const arlo = await values('arl');
    expect(arlo.at(-1)).toBe('leader:arlo');
    expect(arlo.slice(0, -1).every((value) => value.startsWith('pokemon:'))).toBe(true);
    expect(await rocketOnly('any lead')).toEqual(['leader:any']);
    expect(await values('water')).toContain('grunt:water');
    // On what names them alone (fix B3): `grunt`, `leader`, `gr` find no Rocket target.
    expect(await rocketOnly('leader')).toEqual([]);
    expect(await rocketOnly('grunt')).toEqual([]);
    expect(await rocketOnly('gr')).toEqual([]);
    expect(await rocketOnly('gra')).toEqual(['grunt:grass']);
    expect(await rocketOnly('dragon grunt')).toEqual(['grunt:dragon']);
    // The untyped grunts by the words of their label (fix R1).
    expect(await rocketOnly('no type')).toEqual(['grunt:none']);
    expect(await rocketOnly('grunt no')).toEqual(['grunt:none']);
    // `none` offers both: the zero IVs (its legacy meaning, read typed) and the untyped grunts.
    const none = await values('none');
    expect(none).toContain('iv:zero');
    expect(none.filter((value) => /^(grunt|leader):|^(giovanni|decoy)$/.test(value))).toEqual([
      'grunt:none',
    ]);
  });

  it('offers Team GO Rocket itself as a choice of /want and /unwant', async () => {
    const made = setup([], rocketChoicesOfFeed());
    expect(await made.choices('want', 'rocket')).toContainEqual({
      name: 'Team GO Rocket (every grunt, leader and Giovanni)',
      value: 'rocket',
    });
    expect(await made.choices('want', 'team go')).toContainEqual({
      name: 'Team GO Rocket (every grunt, leader and Giovanni)',
      value: 'rocket',
    });
  });

  it('ranks a whole-word match first: Team GO Rocket before Rowlet (plan 8R-6, the staging’s finding 5)', async () => {
    const made = setup([], rocketChoicesOfFeed());
    const offered = (await made.choices('want', 'rocket')).map((one) => one.name);
    expect(offered[0]).toBe('Team GO Rocket (every grunt, leader and Giovanni)');
    // Rowlet, a near match, still comes, after.
    const rowlet = offered.findIndex((name) => name.startsWith('Rowlet'));
    expect(rowlet).toBeGreaterThan(0);
    // Words begun only rank as before: the Pokémon first.
    const dra = (await made.choices('want', 'dra')).map((one) => one.name);
    expect(dra[0]).not.toMatch(/grunt|Rocket/);
  });

  it('puts the Pokémon that begin with the words first, then a whole-word Rocket choice, then the guesses (plan 8R-6)', async () => {
    const offered = (await setup([], rocketChoicesOfFeed()).choices('want', 'dark')).map(
      (one) => one.name,
    );
    // Darkrai begins with "dark"; Arceus (every form) is a guess, by its Dark-Type form, and
    // the guesses keep their order after it.
    expect(offered).toEqual([
      'Darkrai',
      'Dark-type grunt',
      'Arceus (every form)',
      'Arceus (Dark-Type)',
      'Silvally (every form)',
      'Silvally (Type: Dark)',
    ]);
  });

  it('offers the lineups’ catches a text names before other Pokémon (design 9.9)', async () => {
    const without = (await setup().choices('want', 'grim')).map((one) => String(one.value));
    const made = setup([], rocketChoicesOfFeed());
    const offered = (await made.choices('want', 'grim')).map((one) => String(one.value));
    // Alolan Grimer, Arlo's catch, first; without the lineups it is not.
    expect(offered[0]).toBe('pokemon:88:grimer_alola');
    expect(without[0]).not.toBe('pokemon:88:grimer_alola');
  });

  it('shows the Shadow box for a Pokémon in today’s lineups that the game master has as no shadow', async () => {
    const smeargle = catalogueFixture().byDex(235)[0];
    if (!smeargle) throw new Error('no Smeargle');
    const boxes = async (lineups: readonly RocketChoice[]) => {
      const made = setup([], lineups);
      const dialog = shownDialog(await made.run('want', { target: 'Smeargle' }));
      return dialog.components.flatMap((component) => {
        const inner = (component as { component?: { type?: number; options?: unknown[] } })
          .component;
        if (inner?.type !== ComponentType.CheckboxGroup) return [];
        return (inner.options as { value: string }[]).map((option) => option.value);
      });
    };
    expect(await boxes([])).not.toContain('shadow');
    const decoy: RocketChoice = {
      key: 'decoy',
      name: 'Decoy grunt',
      catches: [{ name: 'Smeargle', key: smeargle.key, dex: 235, shiny: false, image: null }],
    };
    expect(await boxes([decoy])).toContain('shadow');
  });

  it('lists Team GO Rocket in one line of /wants with Manage…, and /unwant takes one or all off', async () => {
    const made = setup([], rocketChoicesOfFeed());
    const rocket = (who: string) => ({ kind: 'rocket', who }) as const;
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [rocket('grunt:dragon'), rocket('leader:cliff'), rocket('giovanni')], remove: [] },
      0,
    );
    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'spawn');
    const message = asV2(answered(await made.run('wants')));
    expect(textDisplays(message).slice(1, -1)).toEqual([
      '**Team GO Rocket**: Dragon grunts, Cliff, Giovanni',
      '**Perfect IVs**: Spawns',
    ]);
    expect(customIdsOf(message)).toEqual([
      'wantlist:0:change:rocket',
      'wantlist:0:remove:iv:perfect',
      'wantlist:0:all',
    ]);
    const pressed = await made.handle(
      fakeButton({ customId: 'wantlist:0:change:rocket', userId: ALICE, v2Message: true }),
    );
    expect(shownDialog(pressed).custom_id).toMatch(/:l0:~[0-9a-z]+$/);
    expect(await made.answer('unwant', { target: 'Cliff' })).toBe(
      '**Cliff (Team GO Rocket leader)** is off your list.',
    );
    expect(await made.answer('unwant', { target: 'rocket' })).toBe(
      '**Team GO Rocket** is off your list.',
    );
    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
    // Over three grunt types, by count.
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      {
        add: ['bug', 'dark', 'fire', 'ice'].map((type) => rocket(`grunt:${type}`)),
        remove: [],
      },
      0,
    );
    expect(textDisplays(asV2(answered(await made.run('wants'))))[1]).toBe(
      '**Team GO Rocket**: 4 grunt types',
    );
  });
});

describe('/want: the list of choices', () => {
  it('offers the tiers and the IV targets while nothing is typed', async () => {
    const made = setup();
    expect(await made.choices('want', '')).toEqual([
      { name: 'T1 raids', value: 'tier:T1' },
      { name: 'T3 raids', value: 'tier:T3' },
      { name: 'T5 raids', value: 'tier:T5' },
      { name: 'Mega raids', value: 'tier:Mega' },
      { name: 'Mega Legendary raids', value: 'tier:MegaLegendary' },
      { name: 'Super Mega raids', value: 'tier:SuperMega' },
      { name: 'Elite raids', value: 'tier:Elite' },
      { name: 'Shadow T1 raids', value: 'tier:T1:shadow' },
      { name: 'Shadow T3 raids', value: 'tier:T3:shadow' },
      { name: 'Shadow T5 raids', value: 'tier:T5:shadow' },
      { name: 'Perfect IV spawns', value: 'iv:perfect' },
      { name: 'Zero IV spawns', value: 'iv:zero' },
    ]);
  });

  it('puts the current raid bosses that fit first: a shadow boss, a form, each with its species', async () => {
    const made = setup();
    // Shadow Landorus (Incarnate) is a boss of the fixture: the shadow raids of its species,
    // then the species; its forms come after, with what else the search finds.
    const landorus = await made.choices('want', 'land');
    expect(landorus.slice(0, 2)).toEqual([
      { name: 'Shadow Landorus', value: 'pokemon:645::shadow' },
      { name: 'Landorus (every form)', value: 'pokemon:645' },
    ]);
    expect(landorus).toContainEqual({
      name: 'Landorus (Therian Forme)',
      value: 'pokemon:645:landorus_therian',
    });
    expect(new Set(landorus.map((choice) => choice.value)).size).toBe(landorus.length);
    // Mega Blastoise is a boss, one of several entries of Blastoise: that form, then the species.
    expect(await made.choices('want', 'blast')).toEqual([
      { name: 'Mega Blastoise', value: 'pokemon:9:blastoise_mega' },
      { name: 'Blastoise (every form)', value: 'pokemon:9' },
      { name: 'Blastoise (base form)', value: 'pokemon:9:blastoise' },
    ]);
    // Yveltal is a boss and all there is of its species: once, plainly.
    expect(await made.choices('want', 'yvel')).toEqual([{ name: 'Yveltal', value: 'pokemon:717' }]);
    // Shadow Gastly is a boss: its shadow raids, then the species, which has no other entry.
    expect((await made.choices('want', 'gastl')).slice(0, 2)).toEqual([
      { name: 'Shadow Gastly', value: 'pokemon:92::shadow' },
      { name: 'Gastly', value: 'pokemon:92' },
    ]);
  });

  it('offers a species with several entries as every form, then each entry by its name', async () => {
    const made = setup();
    expect(await made.choices('want', 'mewtw')).toEqual([
      { name: 'Mewtwo (every form)', value: 'pokemon:150' },
      { name: 'Mewtwo (base form)', value: 'pokemon:150:mewtwo' },
      { name: 'Armored Mewtwo', value: 'pokemon:150:mewtwo_a' },
      { name: 'Mega Mewtwo X', value: 'pokemon:150:mewtwo_mega_x' },
      { name: 'Mega Mewtwo Y', value: 'pokemon:150:mewtwo_mega_y' },
    ]);
    const giratina = (await made.choices('want', 'giratin')).map((choice) => choice.name);
    expect(giratina).toEqual([
      'Giratina (every form)',
      'Giratina (Altered Forme)',
      'Giratina (Origin Forme)',
    ]);
    // A species that is one entry is offered once, plainly.
    const dratini = await made.choices('want', 'dratin');
    expect(dratini[0]).toEqual({ name: 'Dratini', value: 'pokemon:147' });
    expect(dratini.filter((choice) => String(choice.value).startsWith('pokemon:147'))).toHaveLength(
      1,
    );
  });

  it('puts what the text names in full before everything else', async () => {
    const made = setup();
    expect((await made.choices('want', 'giratina origin')).slice(0, 2)).toEqual([
      { name: 'Giratina (Origin Forme)', value: 'pokemon:487:giratina_origin' },
      { name: 'Giratina (every form)', value: 'pokemon:487' },
    ]);
    expect((await made.choices('want', 'shadow giratina origin'))[0]).toEqual({
      name: 'Shadow Giratina (Origin Forme)',
      value: 'pokemon:487:giratina_origin:shadow',
    });
    expect((await made.choices('want', 'Mewtwo'))[0]).toEqual({
      name: 'Mewtwo (every form)',
      value: 'pokemon:150',
    });
  });

  it('offers shadow raids after the word shadow: the shadow bosses, then what the rest finds', async () => {
    const made = setup();
    // The word alone: the shadow raids of each shadow boss, then the shadow tiers.
    const shadow = (await made.choices('want', 'shadow')).map((choice) => choice.name);
    // Eight shadow bosses in the fixture, each once and none with its species beside it.
    expect(shadow.slice(0, 8).every((name) => /^Shadow (?!T\d)/.test(name))).toBe(true);
    expect(shadow.slice(0, 8)).toContain('Shadow Landorus');
    expect(shadow.slice(0, 8)).toContain('Shadow Gastly');
    expect(shadow.slice(8, 11)).toEqual(['Shadow T1 raids', 'Shadow T3 raids', 'Shadow T5 raids']);
    expect(shadow).not.toContain('Landorus (every form)');
    expect(shadow).not.toContain('Gastly');
    // With the beginning of a name: the shadow raids of the species it finds, no boss needed.
    expect(await made.choices('want', 'shadow mewtw')).toEqual([
      { name: 'Shadow Mewtwo', value: 'pokemon:150::shadow' },
    ]);
    expect((await made.choices('want', 'shadow land'))[0]).toEqual({
      name: 'Shadow Landorus',
      value: 'pokemon:645::shadow',
    });
    // A shadow tier stays a tier.
    expect((await made.choices('want', 'shadow 5'))[0]).toEqual({
      name: 'Shadow T5 raids',
      value: 'tier:T5:shadow',
    });
  });

  it('offers the tier or IV target a text names, and any Pokémon that fits', async () => {
    const made = setup();
    expect((await made.choices('want', 't5'))[0]).toEqual({ name: 'T5 raids', value: 'tier:T5' });
    const shadow = await made.choices('want', 'shadow');
    expect(shadow.map((choice) => choice.value)).toEqual(
      expect.arrayContaining(['tier:T1:shadow', 'tier:T3:shadow', 'tier:T5:shadow']),
    );
    expect(await made.choices('want', 'perf')).toContainEqual({
      name: 'Perfect IV spawns',
      value: 'iv:perfect',
    });
    // No boss right now, found all the same.
    expect(await made.choices('want', 'mewtw')).toContainEqual({
      name: 'Mewtwo (every form)',
      value: 'pokemon:150',
    });
  });

  it('puts the tier or IV target a text names or begins after the bosses and before the rest', async () => {
    const made = setup();
    // `mega` is the Mega tier, and Mega Blastoise is a boss: the boss comes first, with its
    // species, then the tier, then the megas that are no boss.
    expect((await made.choices('want', 'mega')).slice(0, 4)).toEqual([
      { name: 'Mega Blastoise', value: 'pokemon:9:blastoise_mega' },
      { name: 'Blastoise (every form)', value: 'pokemon:9' },
      { name: 'Mega raids', value: 'tier:Mega' },
      { name: 'Mega Legendary raids', value: 'tier:MegaLegendary' },
    ]);
    expect((await made.choices('want', 'zer'))[0]).toEqual({
      name: 'Zero IV spawns',
      value: 'iv:zero',
    });
    // A text with many Pokémon keeps the tier it names.
    const five = await made.choices('want', '5');
    expect(five[0]).toEqual({ name: 'T5 raids', value: 'tier:T5' });
    expect(five.length).toBeLessThanOrEqual(25);
  });

  it('orders as Matt asked after the staging of Phase 4: bosses, tiers, names, guesses', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    // A legendary before an ordinary Pokémon that fits as well.
    expect(await names('gira')).toEqual([
      'Giratina (every form)',
      'Giratina (Altered Forme)',
      'Giratina (Origin Forme)',
      'Girafarig',
    ]);
    // Starmie is a boss: before the tiers (a tier is also called "3 star"), which stand
    // before the other names. Neither Pikachu (a costume's id) nor Tyranitar (`ttar`).
    expect(await names('star')).toEqual([
      'Starmie (base form)',
      'Starmie (every form)',
      'T1 raids',
      'T3 raids',
      'T5 raids',
      'Starly',
      'Staryu',
      'Staravia',
      'Staraptor',
      'Mega Starmie',
      // Found by the word of a trim, not by a name: after the names.
      'Furfrou (every form)',
      'Furfrou (Star Trim)',
    ]);
    // `shadow` is a fixed word in full: nothing is guessed (`meadow` would be a guess for it).
    const shadow = await names('shadow');
    expect(shadow.filter((name) => name.includes('Meadow'))).toEqual([]);
    expect(shadow).not.toContain('Scatterbug (every form)');
    expect(shadow).toContain('Calyrex (Shadow Rider)');
    // A text that is no fixed word keeps its guesses.
    expect(await names('lugai')).toContain('Lugia');
    expect(shadow.indexOf('Shadow T5 raids')).toBeLessThan(
      shadow.indexOf('Calyrex (Shadow Rider)'),
    );
    // `percent` (a key of Zygarde) is a guess for `perfect` that no label shows: left out.
    expect(await names('perfect')).toEqual(['Perfect IV spawns']);
    // Two wrong letters in a short word are no guess any more: `hundo` is the word alone.
    expect(await names('hundo')).toEqual(['Perfect IV spawns']);
    // Two neighbouring letters in the wrong order still are, and the label shows the name.
    expect(await names('lugai')).toEqual(['Lugia']);
  });

  it('finds the Pokémon a text leads to by name before the forms and types that have the word', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    for (const typed of ['ty', 'typ']) {
      const found = await names(typed);
      expect(found.length, typed).toBeLessThanOrEqual(25);
      expect(found[0], typed).toBe('Type: Null');
      expect(found, typed).toContain('Typhlosion (every form)');
    }
    expect(await names('ty')).toContain('Tyranitar (every form)');
    expect((await names('psy'))[0]).toBe('Psyduck');
    expect((await names('bul'))[0]).toBe('Bulbasaur');
    expect(await names('for')).toContain('Forretress');
    expect((await names('for'))[0]).toBe('Forretress');
  });

  it('finds a boss by its name however many Pokémon the text finds before it', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    // Starmie and Mega Blastoise are bosses of the fixture; one letter finds hundreds.
    const s = await names('s');
    expect(s).toContain('Starmie (base form)');
    expect(s.indexOf('Starmie (base form)')).toBeLessThan(s.indexOf('Super Mega raids'));
    const m = await names('m');
    expect(m).toContain('Mega Blastoise');
    expect(m.indexOf('Mega Blastoise')).toBeLessThan(m.indexOf('Mega raids'));
    // And a shadow boss after `shadow`, by one letter of its name.
    expect((await names('shadow l'))[0]).toBe('Shadow Landorus');
  });

  it('orders as a member expects (the audit of 2026-11-07): names before form words and guesses', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    /** The choices before the first shadow raids that are no boss's by its name. */
    /** Where the first such shadow raids stand, -1 for none. */
    const firstShadow = (found: string[]) =>
      found.findIndex((name) => name.startsWith('Shadow ') && name !== 'Shadow Shieldon');
    /** The whole list when it has none. */
    const beforeShadows = (found: string[]) =>
      firstShadow(found) < 0 ? found : found.slice(0, firstShadow(found));
    // `s`, `sh` and `sha` begin names before they begin `shadow`: the Pokémon first (the
    // bosses among them before the rest), the shadow raids after them.
    const sh = await names('sh');
    expect(sh.slice(0, 2)).toEqual(['Shadow Shieldon', 'Shieldon']);
    expect(beforeShadows(sh)).toContain('Shinx');
    expect(beforeShadows(sh)).toContain('Mega Sharpedo');
    expect(beforeShadows(sh)).not.toContain('Shadow Gastly');
    expect(firstShadow(sh)).toBeGreaterThanOrEqual(0);
    expect((await names('s')).filter((name) => name.startsWith('Shadow '))).toEqual([
      'Shadow Shieldon',
    ]);
    const sha = await names('sha');
    expect(sha[0]).toBe('Shaymin (every form)');
    expect(beforeShadows(sha)).toContain('Sharpedo (every form)');
    expect(firstShadow(sha)).toBeGreaterThanOrEqual(0);
    expect(sha).toContain('Shadow Gastly');
    expect(sha.indexOf('Mega Sharpedo')).toBeGreaterThanOrEqual(0);
    expect(sha.indexOf('Shadow T5 raids')).toBeGreaterThan(sha.indexOf('Mega Sharpedo'));
    // Once nothing begins with it but the word, the shadow raids of the bosses lead.
    expect((await names('shad'))[0]).toMatch(/^Shadow (?!T\d)/);
    // `sa`: the Pokémon whose names begin with it before Ho-Oh, which has the nickname `santa`.
    const sa = await names('sa');
    expect(sa.indexOf('Sawk')).toBeLessThan(sa.indexOf('Ho-Oh'));
    expect(sa.indexOf('Sandile')).toBeLessThan(sa.indexOf('Ho-Oh'));
    // `mega` and `alo`: Meganium and Alomomola before the megas and Alolan forms that are no boss.
    const mega = await names('mega');
    expect(mega.indexOf('Meganium')).toBeGreaterThan(0);
    expect(mega.indexOf('Meganium')).toBeLessThan(mega.indexOf('Mega Diancie'));
    const alo = await names('alo');
    expect(alo.indexOf('Alomomola')).toBeGreaterThanOrEqual(0);
    expect(alo.indexOf('Alomomola')).toBeLessThan(alo.indexOf('Alolan Marowak'));
    // The nearer guess first: `latois` is Latios, two letters swapped.
    expect((await names('latois'))[0]).toBe('Latios (every form)');
    // One letter: the names it begins before the Unown of that letter.
    const b = await names('b');
    expect(b).toContain('Buzzwole');
    expect(b.slice(0, b.indexOf('Buzzwole'))).not.toContain('Unown (B)');
  });

  it('puts no boss first that only a nickname begins: Ho-Oh as a boss and `sa` (review of 2026-11-07)', () => {
    const fixture = raidBossesFixture();
    const entry = catalogueFixture().byKey('ho_oh');
    if (!entry) throw new Error('no ho_oh');
    const hoOh: RaidBoss = {
      ...bossIdsOf(entry),
      key: 'ho_oh',
      tier: { level: 'T5', shadow: false },
      shiny: false,
      name: entry.name,
      entry,
      source: 'feed',
      autoset: false,
    };
    const list = [hoOh, ...fixture.bosses()];
    const { ctx } = createTestContext({ raidBosses: { ...fixture, bosses: () => list } });
    const names = (typed: string) => wantChoices(ctx, typed).map((choice) => choice.name);
    // `santa` is a nickname of Ho-Oh: the boss is no reason to put it before Sawk.
    const sa = names('sa');
    expect(sa.indexOf('Sawk')).toBeGreaterThanOrEqual(0);
    expect(sa.indexOf('Sawk')).toBeLessThan(sa.indexOf('Ho-Oh'));
    // By its name it is a boss like any other, first.
    expect(names('ho')[0]).toBe('Ho-Oh');
    expect(names('hoo')[0]).toBe('Ho-Oh');
    // A form word in front of a boss's name still leads to the boss: Mega Blastoise for `mega`.
    expect(names('mega')[0]).toBe('Mega Blastoise');
  });

  it('reads raid and spawn alone as the words of the tiers and IV targets, not as a misspelt Pokémon', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    // `raid` was Urshifu (Rapid Strike Style), `rapid` with a letter left out.
    const raid = await names('raid');
    expect(raid).not.toContain('Urshifu (Rapid Strike Style)');
    expect(raid.slice(0, 3)).toEqual(['T1 raids', 'T3 raids', 'T5 raids']);
    expect(raid.every((name) => name.endsWith(' raids'))).toBe(true);
    expect(await names('raids')).toEqual(raid);
    expect(await names('spawns')).toEqual(['Perfect IV spawns', 'Zero IV spawns']);
    // The word with a name is still that name: `rapid` is the style.
    expect(await names('rapid')).toContain('Urshifu (Rapid Strike Style)');
  });

  it('lets the class fill no list: Arcanine beside Arceus, Silcoon beside Silvally', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    expect(await names('arc')).toContain('Arcanine (every form)');
    expect((await names('sil')).indexOf('Silcoon')).toBeLessThan(8);
    expect((await names('gira')).slice(0, 4)).toEqual([
      'Giratina (every form)',
      'Giratina (Altered Forme)',
      'Giratina (Origin Forme)',
      'Girafarig',
    ]);
    // The beginning of a nickname is the beginning of a name: Ho-Oh before Hoothoot.
    const hoo = await names('hoo');
    expect(hoo.indexOf('Ho-Oh')).toBeGreaterThanOrEqual(0);
    expect(hoo.indexOf('Ho-Oh')).toBeLessThan(hoo.indexOf('Hoothoot'));
  });

  it('matches bosses and tiers on what names them, not on what a label adds', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    // `ba` is no boss's "(base form)": the Pokémon that begin with it.
    const ba = await names('ba');
    expect(ba).not.toContain('Starmie (base form)');
    expect(ba[0]).toBe('Bagon');
    // `e` is the Elite tier and then Pokémon, not "(every form)" of the three bosses with forms.
    const e = await names('e');
    expect(e[0]).toBe('Elite raids');
    expect(e).not.toContain('Starmie (every form)');
    expect(e).not.toContain('Blastoise (every form)');
    // `f` is no "form".
    const f = await names('f');
    expect(f).not.toContain('Starmie (base form)');
    expect(f).not.toContain('Landorus (every form)');
    // One letter is how the search knows a form of Unown, but what begins with it comes first
    // (the audit of 2026-11-07).
    expect(f[0]).toBe('Fezandipiti');
    expect(f.slice(0, f.indexOf('Fezandipiti') + 1)).not.toContain('Unown (F)');
    // `ra` is Raikou and its like, not ten tiers of "raids".
    const ra = await names('ra');
    expect(ra.filter((name) => name.endsWith(' raids'))).toEqual([]);
    expect(ra[0]).toBe('Raikou');
    // `sp` is no "spawns", and `iv` no "IV".
    const sp = await names('sp');
    expect(sp.filter((name) => name.endsWith(' spawns'))).toEqual([]);
    expect((await names('iv')).filter((name) => name.endsWith(' spawns'))).toEqual([]);
    // What names a tier or an IV target still finds it, with what its label adds after it.
    expect((await names('perf'))[0]).toBe('Perfect IV spawns');
    expect((await names('perfect iv'))[0]).toBe('Perfect IV spawns');
    expect((await names('t5 raids'))[0]).toBe('T5 raids');
    expect((await names('el'))[0]).toBe('Elite raids');
    // The shadow raids of the shadow bosses are found by their label, as before.
    expect((await names('shadow'))[0]).toMatch(/^Shadow (?!T\d)/);
  });

  it('puts the Pokémon a text names in full before the bosses, and no boss first for its number', () => {
    const fixture = raidBossesFixture();
    const boss = (key: string, level: 'T3' | 'T5'): RaidBoss => {
      const entry = catalogueFixture().byKey(key);
      if (!entry) throw new Error(`no ${key}`);
      return {
        ...bossIdsOf(entry),
        key,
        tier: { level, shadow: false },
        shiny: false,
        name: entry.name,
        entry,
        source: 'feed',
        autoset: false,
      };
    };
    // Mewtwo is a boss, and so is Venusaur, whose Pokédex number is 3.
    const list = [boss('mewtwo', 'T5'), boss('venusaur', 'T3'), ...fixture.bosses()];
    const { ctx } = createTestContext({ raidBosses: { ...fixture, bosses: () => list } });
    const names = (typed: string) => wantChoices(ctx, typed).map((choice) => choice.name);
    // Mew is what `mew` names: before the choices of the boss Mewtwo.
    expect(names('mew').slice(0, 3)).toEqual(['Mew', 'Mewtwo (base form)', 'Mewtwo (every form)']);
    expect(names('mewt')[0]).toBe('Mewtwo (base form)');
    // `3` is the tier; the boss with that number stands after it, with the other Pokémon.
    const three = names('3');
    expect(three[0]).toBe('T3 raids');
    expect(three.indexOf('Venusaur (every form)')).toBeGreaterThan(three.indexOf('T3 raids'));
    expect(names('venu')[0]).toBe('Venusaur (base form)');
    // A boss found by the beginning of its nickname is found by name: before the tiers.
    const tyranitar = [boss('tyranitar', 'T5'), ...fixture.bosses()];
    const withTtar = createTestContext({
      raidBosses: { ...fixture, bosses: () => tyranitar },
    }).ctx;
    expect(wantChoices(withTtar, 'tta').map((choice) => choice.name)).toEqual([
      'Tyranitar (base form)',
      'Tyranitar (every form)',
    ]);
    expect(wantChoices(withTtar, 't').map((choice) => choice.name)[0]).toBe(
      'Tyranitar (base form)',
    );
  });

  it('offers shadow raids without regard to class, what can be shadow first, and no Unown for a letter', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    const catalogue = catalogueFixture();
    /** By the value of a choice, `pokemon:<dex>::shadow`: whether any form of it can be shadow. */
    const canBeShadow = (value: string): boolean =>
      catalogue.byDex(Number(value.split(':')[1])).some((entry) => entry.shadow);
    // The legendaries are not put first, and what the game data says can be shadow is.
    for (const typed of ['shadow m', 'shadow me', 'shadow la']) {
      const offered = (await made.choices('want', typed)).filter((choice) =>
        String(choice.value).startsWith('pokemon:'),
      );
      expect(offered.map((choice) => choice.name)).not.toContain('Shadow Unown');
      expect(offered.length, typed).toBeGreaterThan(3);
      const able = offered.map((choice) => canBeShadow(String(choice.value)));
      expect(able[0], typed).toBe(true);
      // Every one that can be shadow stands before every one that cannot.
      expect(able.lastIndexOf(true), typed).toBeLessThan(
        able.includes(false) ? able.indexOf(false) : able.length,
      );
    }
    // Latias and Latios are legendary and begin with `la` like Larvitar, which is not: the
    // class puts nobody first here.
    const la = await names('shadow lar');
    expect(la[0]).toBe('Shadow Larvitar');
    // No mega and no primal after `shadow`: `me` begins the nickname `mega` of every mega,
    // and none of those species is offered for it.
    const me = await names('shadow me');
    expect(me).toContain('Shadow Mewtwo');
    for (const mega of ['Shadow Charizard', 'Shadow Venusaur', 'Shadow Gengar', 'Shadow Kyogre']) {
      expect(me, mega).not.toContain(mega);
    }
    expect(await names('shadow mega')).not.toContain('Shadow Charizard');
    expect(await names('shadow primal')).toEqual([]);
    // What the text names in full still stands first: `shadow mew` is the shadow raids of Mew.
    expect((await names('shadow mew')).slice(0, 2)).toEqual(['Shadow Mew', 'Shadow Mewtwo']);
  });

  it('offers after shadow and more text only the shadow bosses the rest finds by name', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    // `sh` begins `shadow` in the label of every shadow boss: it is the rest that counts.
    const sh = await names('shadow sh');
    expect(sh[0]).toBe('Shadow Shieldon');
    expect(sh).not.toContain('Shadow Gastly');
    expect(sh).not.toContain('Shadow Landorus');
    // Without a rest the label is what is begun: every shadow boss, as before.
    for (const typed of ['shadow', 'shad', 'shadow ']) {
      const found = await names(typed);
      expect(found, typed).toContain('Shadow Gastly');
      expect(found, typed).toContain('Shadow Landorus');
    }
  });

  it('offers after shadow no species for a word of a form: only what the rest finds by name', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    // `me` begins the Meadow Pattern of Scatterbug, `la` the La Reine Trim of Furfrou.
    const me = await names('shadow me');
    expect(me).toContain('Shadow Mewtwo');
    expect(me).not.toContain('Shadow Scatterbug');
    expect(me).not.toContain('Shadow Spewpa');
    expect(me).not.toContain('Shadow Vivillon');
    const la = await names('shadow la');
    expect(la).toContain('Shadow Larvitar');
    expect(la).not.toContain('Shadow Furfrou');
  });

  it('finds a choice by the words of its label', async () => {
    const made = setup();
    const names = async (typed: string) =>
      (await made.choices('want', typed)).map((choice) => choice.name);
    expect(await made.choices('want', 'tyranitar base')).toEqual([
      { name: 'Tyranitar (base form)', value: 'pokemon:248:tyranitar' },
    ]);
    expect(await names('tyranitar base form')).toEqual(['Tyranitar (base form)']);
    expect(await names('Tyranitar (base form)')).toEqual(['Tyranitar (base form)']);
    expect(await names('tyranitar ba')).toEqual(['Tyranitar (base form)']);
    expect(await names('giratina every form')).toEqual(['Giratina (every form)']);
    expect(await names('giratina every')).toEqual(['Giratina (every form)']);
    expect(await names('gira ev')).toEqual(['Giratina (every form)']);
    // The words of a form's own name were found before and still are.
    expect((await names('giratina origin forme'))[0]).toBe('Giratina (Origin Forme)');
    expect(await names('shadow mewtwo')).toEqual(['Shadow Mewtwo']);
    // A species that is one entry has neither label.
    expect(await names('dratini base')).toEqual([]);
    // Read as it would be if it were sent: every form of a species with one is the species.
    expect(await names('dratini every form')).toEqual(['Dratini']);
    // Each such choice is read back as what it says: the dialog of that subject.
    const titles: string[] = [];
    for (const typed of ['tyranitar base', 'giratina every form']) {
      for (const choice of await made.choices('want', typed)) {
        titles.push(shownDialog(await made.run('want', { target: String(choice.value) })).title);
      }
    }
    // A form opens its species' dialog with that form ticked (plan 8R-4).
    expect(titles).toEqual(['Tyranitar: what for?', 'Giratina: what for?']);
  });

  it('reads the words of a label that are sent without picking, and nothing looser', async () => {
    const made = setup();
    const title = async (target: string) => shownDialog(await made.run('want', { target })).title;
    expect(await title('giratina every form')).toBe('Giratina: what for?');
    expect(await title('tyranitar base form')).toBe('Tyranitar: what for?');
    // Half a label is offered by the list, but never acted on.
    expect(await made.answer('want', { target: 'tyranitar base' })).toContain(
      'I do not know "tyranitar base"',
    );
    expect(await made.answer('want', { target: 'giratina every' })).toContain(
      'I do not know "giratina every"',
    );
    // `every form` after the name of one form names nothing.
    expect(await made.answer('want', { target: 'giratina origin every form' })).toContain(
      'I do not know',
    );
  });

  it('offers each species once and 25 choices at most', async () => {
    const made = setup();
    const found = await made.choices('want', 'char');
    const values = found.map((choice) => choice.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('pokemon:6');
    expect((await made.choices('want', 'a')).length).toBeLessThanOrEqual(25);
    expect((await made.choices('want', 'ma')).length).toBeLessThanOrEqual(25);
  });

  it('gives values that the command reads back', async () => {
    const made = setup();
    const offered = await made.choices('want', 'gira');
    const titles: string[] = [];
    for (const choice of offered) {
      const dialog = shownDialog(await made.run('want', { target: String(choice.value) }));
      const which = dialogFields(dialog).find((field) => field.id === 'forms');
      const ticked = (which?.options ?? []).filter((one) => one.ticked).map((one) => one.value);
      titles.push(`${dialog.title} ${ticked.join(',')}`.trim());
    }
    // Giratina, a legendary, before Girafarig; a form is its species' dialog, that form ticked.
    expect(titles).toEqual([
      'Giratina: what for? giratina_altered,giratina_origin',
      'Giratina: what for? giratina_altered',
      'Giratina: what for? giratina_origin',
      'Girafarig: what for?',
    ]);
  });
});

describe('/unwant', () => {
  it('takes every box of a Pokémon, a form or a tier off, and says when there was none', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'raid', { shadow: true });
    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_origin' });
    made.store.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
    made.store.add(ALICE, FAKE_GUILD_ID, -35, 'raid');
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      { add: [boxTarget('research-pokemon', 150)], remove: [] },
      0,
    );
    expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe(
      '**Mewtwo (every form)** is off your list.',
    );
    expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe(
      '**Mewtwo (every form)** is not on your list. `/wants` shows what is.',
    );
    // Typed shadow raids are their Pokémon, and a tier's shadow raids its tier.
    expect(await made.answer('unwant', { target: 'shadow t5' })).toBe('**T5** is off your list.');
    expect(await made.answer('unwant', { target: 'giratina origin' })).toBe(
      '**Giratina (Origin Forme)** is off your list.',
    );
    expect(made.formRows()).toEqual([]);
    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
  });

  it('takes IVs and a research reward off', async () => {
    const made = setup([pageTask('Catch a Dragon-type Pokémon')]);
    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'spawn');
    await made.run('want', { target: 'Rare Candy' });
    expect(await made.answer('unwant', { target: 'perfect' })).toBe(
      '**Perfect IV spawns** is off your list.',
    );
    expect(await made.answer('unwant', { target: 'research:item:rare-candy' })).toBe(
      '**Rare Candy (research)** is off your list.',
    );
    expect(made.rows()).toEqual([]);
    expect(await made.ctx.targetWants.count(ALICE, FAKE_GUILD_ID)).toBe(0);
  });

  it('lists each want of the member once, with its boxes, and reads a line typed in full', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'Both');
    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'spawn');
    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'raid', { shadow: true });
    made.store.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'both');
    made.store.add(ALICE, OTHER_GUILD, 1, 'both');
    made.store.add(BOB, FAKE_GUILD_ID, 2, 'both');
    expect(await made.choices('unwant', '')).toEqual([
      { name: 'Dratini: Spawns, Shadow', value: 'pokemon:147' },
      { name: 'Mewtwo: Raids, Spawns', value: 'pokemon:150' },
      { name: 'Perfect IVs: Spawns', value: 'iv:perfect' },
      { name: 'T5 raids: Raids', value: 'tier:T5' },
    ]);
    expect(await made.choices('unwant', 'mew')).toEqual([
      { name: 'Mewtwo: Raids, Spawns', value: 'pokemon:150' },
    ]);
    expect(await made.choices('unwant', '', { isDm: true })).toEqual([]);
    expect(await made.answer('unwant', { target: 'Dratini: Spawns, Shadow' })).toBe(
      '**Dratini** is off your list.',
    );
  });

  it('removes a want for a species the game data does not have, by its choice', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
    expect(await made.choices('unwant', '')).toEqual([
      { name: 'Pokémon #99999: Raids, Spawns', value: 'pokemon:99999' },
    ]);
    expect(await made.answer('unwant', { target: 'pokemon:99999' })).toBe(
      '**Pokémon #99999** is off your list.',
    );
    expect(made.rows()).toEqual([]);
  });

  it('answers the list with nothing when the wants cannot be read', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.store.failing = new Error('the database is away');
    expect(await made.choices('unwant', 'mew')).toEqual([]);
  });

  it('leaves the wants of other servers and other members alone', async () => {
    const made = setup();
    made.store.add(ALICE, OTHER_GUILD, 150, 'both');
    made.store.add(BOB, FAKE_GUILD_ID, 150, 'both');
    expect(await made.answer('unwant', { target: 'mewtwo' })).toBe(
      '**Mewtwo (every form)** is not on your list. `/wants` shows what is.',
    );
    expect(made.store.rows).toHaveLength(2);
  });

  it('refuses text that names nothing outright', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    const refused = await made.run('unwant', { target: 'mewtw' });
    expect(sent(refused.reply).content).toMatch(
      /^I do not know "mewtw" as a Pokémon, a raid tier, or perfect or zero IVs\./,
    );
    expect(made.store.rows).toHaveLength(1);
  });
});

describe('/wants', () => {
  /** The lines of the wants a `/wants` answer (or a press of its buttons) shows. */
  const lines = (payload: SentPayload) => textDisplays(asV2(payload)).slice(1, -1);

  it('says how to add one when the list is empty, without buttons', async () => {
    const made = setup();
    const message = asV2(answered(await made.run('wants')));
    expect(textDisplays(message)).toEqual([
      '### Your wants in Test Server\nYou want nothing yet. `/want` adds one.',
    ]);
    expect(buttonsOf(message)).toEqual([]);
    expectV2Sendable(message);
  });

  it('lists each Pokémon once by name, the tiers, then the Remove lines: rewards, IVs (plan 8R-4)', async () => {
    const made = setup([pageTask('Catch a Dragon-type Pokémon')]);
    for (const [pokemon, type] of [
      [150, 'both'],
      [147, 'raid'],
      [487, 'spawn'],
      [-35, 'raid'],
      [-5, 'raid'],
      [-1, 'raid'],
      [-8, 'spawn'],
    ] as const) {
      made.store.add(ALICE, FAKE_GUILD_ID, pokemon, type);
    }
    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'raid', { shadow: true });
    await made.ctx.targetWants.change(
      ALICE,
      FAKE_GUILD_ID,
      {
        add: [
          boxTarget('research-pokemon', 147),
          boxTarget('dynamax', 68),
          { kind: 'research-item', item: 'rare-candy' },
        ],
        remove: [],
      },
      0,
    );
    made.store.add(ALICE, OTHER_GUILD, 1, 'both');
    const used = await made.run('wants');
    expect(answered(used).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    const message = asV2(answered(used));
    expect(textDisplays(message)[0]).toBe('### Your wants in Test Server\n8 wants');
    expect(lines(answered(used))).toEqual([
      '**Dratini**: Raids, Research, Shadow',
      '**Giratina**: Spawns',
      '**Machamp**: Dynamax',
      '**Mewtwo**: Raids, Spawns',
      '**Tier 1 raids**: Raids',
      '**Tier 5 raids**: Raids, Shadow raids',
      '**Rare Candy**: Research',
      '**Zero IVs**: Spawns',
    ]);
    expect(buttonsOf(message).map((button) => button.label)).toEqual([
      ...Array.from({ length: 6 }, () => 'Manage…'),
      'Remove',
      'Remove',
      'Remove all…',
    ]);
    expect(customIdsOf(message)).toEqual([
      'wantlist:0:change:sp:147',
      'wantlist:0:change:sp:487',
      'wantlist:0:change:sp:68',
      'wantlist:0:change:sp:150',
      'wantlist:0:change:st:T1',
      'wantlist:0:change:st:T5',
      'wantlist:0:remove:ri:rare-candy',
      'wantlist:0:remove:iv:zero',
      'wantlist:0:all',
    ]);
    expect(textDisplays(message).at(-1)).toBe('-# Add one with `/want`.');
  });

  it('names the forms of a species together, up to three, and above that by count', async () => {
    const made = setup();
    for (const form of ['arceus', 'arceus_dragon', 'arceus_fire']) {
      made.store.add(ALICE, FAKE_GUILD_ID, 493, 'raid', { form });
    }
    for (const form of [
      'vivillon',
      'vivillon_archipelago',
      'vivillon_continental',
      'vivillon_elegant',
    ]) {
      made.store.add(ALICE, FAKE_GUILD_ID, 666, 'spawn', { form });
    }
    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid', { costumed: true });
    made.store.add(ALICE, FAKE_GUILD_ID, 222, 'both', { form: 'corsola_galarian' });
    made.store.add(ALICE, FAKE_GUILD_ID, 201, 'spawn');
    made.store.add(ALICE, FAKE_GUILD_ID, 201, 'spawn', { form: 'unown_a' });
    expect(lines(answered(await made.run('wants')))).toEqual([
      '**Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)**: Raids',
      '**Galarian Corsola**: Raids, Spawns',
      '**Costumed Pikachu**: Raids',
      '**Unown**: Spawns',
      '**Unown (A)**: Spawns',
      '**Vivillon (4 of 21 forms)**: Spawns',
    ]);
    expect(await wantLineCount(made.ctx, ALICE, FAKE_GUILD_ID)).toBe(6);
  });

  it('opens the dialog of a line on Manage…, with the page, and shows the page again after its Submit', async () => {
    const made = setup();
    for (let dex = 1; dex <= 12; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
    const pressed = await made.handle(
      fakeButton({ customId: 'wantlist:1:change:sp:8', userId: ALICE, v2Message: true }),
    );
    expect(pressed.update).not.toHaveBeenCalled();
    const dialog = shownDialog(pressed);
    expect(dialog.title).toBe('Wartortle: what for?');
    expect(dialogText(dialog)).toBe(
      'Your Wartortle want. Change what you want a DM about, or tick Remove to stop them all.',
    );
    expect(dialog.custom_id).toMatch(/:l1:~[0-9a-z]+$/);
    const submit = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      checked: { boxes: ['raids', 'shadow'] },
      userId: ALICE,
      v2Message: true,
    });
    // Acknowledged before anything is written (B1): the page is then shown by an edit.
    const set = made.ctx.wantBoxes.set.bind(made.ctx.wantBoxes);
    let acknowledged = false;
    made.ctx.wantBoxes.set = (...args) => {
      acknowledged = submit.deferUpdate.mock.calls.length > 0;
      return set(...args);
    };
    const submitted = await made.handle(submit);
    expect(acknowledged).toBe(true);
    expect(submitted.update).not.toHaveBeenCalled();
    const shown = asV2(sent(submitted.editReply));
    expect(textDisplays(shown)[0]).toBe(
      '### Your wants in Test Server\n' +
        '**Wartortle**: Raids, Shadow. You will get a DM when one is reported in a region you ' +
        'can see.\n12 wants · page 2 of 2',
    );
    expect(submitted.followUp).not.toHaveBeenCalled();
    // Nothing held any more: said, nothing opened.
    made.store.rows.splice(0);
    const gone = await made.handle(
      fakeButton({ customId: 'wantlist:0:change:sp:8', userId: ALICE, v2Message: true }),
    );
    expect(gone.showModal).not.toHaveBeenCalled();
    expect(sent(gone.reply).content).toBe('**Wartortle** is not on your list; `/want` adds it.');
  });

  it('says a warning of its Submit also below, privately', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid');
    const dialog = shownDialog(
      await made.handle(
        fakeButton({ customId: 'wantlist:0:change:sp:25', userId: ALICE, v2Message: true }),
      ),
    );
    const submitted = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        checked: { boxes: ['raids', 'gigantamax'] },
        ticks: { costumed: true },
        userId: ALICE,
        v2Message: true,
      }),
    );
    expect(textDisplays(asV2(sent(submitted.editReply)))[0]).toMatch(
      /^### Your wants in Test Server\n\*\*Costumed Pikachu\*\*: Raids, Gigantamax\./,
    );
    const warned = sent(submitted.followUp);
    expect(warned.content).toBe(
      "-# Costumed Pokémon haven't appeared in max battles or as shadows so far, so " +
        'Gigantamax stays quiet unless that changes.',
    );
    expect(warned.flags).toBe(MessageFlags.Ephemeral);
  });

  it('shows what it cannot read, with Remove all, also when nothing else is left', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
    const message = asV2(answered(await made.run('wants')));
    expect(textDisplays(message)).toEqual([
      '### Your wants in Test Server\n0 wants\n' +
        '…and 1 entry I can no longer show; `/unwant-all` removes those too.',
      '-# Add one with `/want`.',
    ]);
    expect(customIdsOf(message)).toEqual(['wantlist:0:all']);
  });

  it('takes a line off on Remove and shows the list again at the same page', async () => {
    const made = setup();
    for (let dex = 1; dex <= 12; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'spawn');
    made.store.add(ALICE, FAKE_GUILD_ID, -8, 'spawn');
    const first = asV2(answered(await made.run('wants')));
    expect(textDisplays(first)[0]).toBe('### Your wants in Test Server\n14 wants · page 1 of 2');
    const next = await made.handle(fakeButton({ customId: 'wantlist:0:next', userId: ALICE }));
    const second = asV2(sent(next.update));
    const remove = customIdsOf(second).find((id) => id.endsWith(':iv:perfect'));
    expect(remove).toBe('wantlist:1:remove:iv:perfect');
    const pressed = await made.handle(fakeButton({ customId: remove ?? '', userId: ALICE }));
    expect(made.rows().some(([pokemon]) => pokemon === -6)).toBe(false);
    expect(textDisplays(asV2(sent(pressed.update)))[0]).toBe(
      '### Your wants in Test Server\n13 wants · page 2 of 2',
    );
    // Somebody else's rows are untouched by a press, and a press twice is no error.
    made.store.add(BOB, FAKE_GUILD_ID, 1, 'both');
    await made.handle(
      fakeButton({ customId: 'wantlist:0:remove:sp:1', userId: ALICE, v2Message: true }),
    );
    const again = await made.handle(
      fakeButton({ customId: 'wantlist:0:remove:sp:1', userId: ALICE, v2Message: true }),
    );
    expect(again.reply).not.toHaveBeenCalled();
    expect(made.rows(BOB)).toEqual([[1, 'both']]);
    expect(made.rows()).toHaveLength(12);
  });

  it('asks the question of /unwant-all on Remove all… in its dialog, the list staying', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    const pressed = await made.handle(fakeButton({ customId: 'wantlist:0:all', userId: ALICE }));
    expect(pressed.update).not.toHaveBeenCalled();
    expect(shownDialog(pressed).title).toBe('Remove all your wants');
    expect(dialogText(shownDialog(pressed))).toMatch(/^Remove the one entry of your list/);
    expect(made.rows()).toHaveLength(1);
  });

  it('refuses a Remove that names no want', async () => {
    const made = setup();
    const pressed = await made.handle(
      fakeButton({ customId: 'wantlist:0:remove:g:1', userId: ALICE }),
    );
    expect(sent(pressed.reply).content).toBe('That list is out of date. Use `/wants` again.');
  });

  it('keeps every page of the longest list within the components and the text Discord takes', () => {
    const { ctx } = createTestContext();
    const species = ctx.gameData.catalogue.all.filter((entry) => entry.kind === 'species');
    const scopes = ['both', 'raid', 'spawn'] as const;
    const list: WantList = {
      wants: [
        ...species.map((entry, index): Want => ({
          target: { kind: 'pokemon', dex: entry.dex },
          scope: scopes[index % 3] ?? 'both',
        })),
        // Every entry as a form of its own, and the shadow raids of every species.
        ...ctx.gameData.catalogue.all.map((entry, index): Want => ({
          target: pokemonTarget(entry.dex, entry.key),
          scope: scopes[index % 3] ?? 'both',
        })),
        ...species.map((entry): Want => ({
          target: pokemonTarget(entry.dex, undefined, true),
          scope: 'raid',
        })),
        ...notificationTiers().map((tier): Want => ({
          target: { kind: 'tier', tier },
          scope: 'raid',
        })),
        { target: { kind: 'iv', iv: 'perfect' }, scope: 'spawn' },
        { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
      ],
      unreadable: 12_345,
    };
    const targets = {
      wants: species.flatMap((entry) => [
        boxTarget('research-pokemon', entry.dex),
        boxTarget('dynamax', entry.dex),
        boxTarget('gigantamax', entry.dex),
      ]),
      unreadable: 0,
    };
    const entries = wantEntries(ctx, list, targets);
    const pages = Math.ceil(entries.length / 10);
    expect(pages).toBeGreaterThan(100);
    const server = '*_~`|>['.repeat(14);
    for (let page = 0; page < pages; page++) {
      const message = wantsList(entries, list.unreadable, server, page);
      expect(componentCount(message)).toBeLessThanOrEqual(40);
      expectV2Sendable(message);
    }
    // The longest form key (64 characters) still leaves Remove room in its custom id.
    const long = wantsList(
      wantEntries(
        ctx,
        {
          wants: [{ target: pokemonTarget(150, `mewtwo_${'x'.repeat(57)}`), scope: 'raid' }],
          unreadable: 0,
        },
        { wants: [], unreadable: 0 },
      ),
      0,
      server,
      0,
    );
    // A form of Mewtwo, which has a Which field: its species' line, Manage… of the species.
    const [change] = customIdsOf(long);
    expect(change).toBe('wantlist:0:change:sp:150');
  });
});

describe('/unwant-all', () => {
  const filled = () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
    made.store.add(ALICE, OTHER_GUILD, 151, 'both');
    made.store.add(BOB, FAKE_GUILD_ID, 150, 'both');
    return made;
  };
  /** The Submit of the dialog a fake was shown, by Alice. */
  const submit = (made: ReturnType<typeof setup>, asked: FakeInteraction) => {
    const dialog = shownDialog(asked);
    return made.handle(fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE }));
  };

  it('says so when there is nothing to remove, and opens no dialog', async () => {
    const made = setup();
    const used = await made.run('unwant-all');
    expect(used.showModal).not.toHaveBeenCalled();
    expect(answered(used)).toEqual({
      content: 'Your list for this server is empty: there is nothing to remove.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('asks first in a dialog, and removes nothing yet', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    expect(asked.deferReply).not.toHaveBeenCalled();
    expect(asked.reply).not.toHaveBeenCalled();
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('Remove all your wants');
    expect(dialogText(dialog)).toBe(
      'Remove all 3 entries of your list for this server? You will get no DMs for Pokémon, ' +
        'raid tiers, research rewards or Team GO Rocket here any more.\n\nSubmit removes them.',
    );
    expect(dialogChoices(dialog)).toEqual([]);
    expect(made.store.rows).toHaveLength(5);
  });

  it('removes every row of the member in this server on Submit, also unreadable ones', async () => {
    const made = filled();
    const submitted = await submit(made, await made.run('unwant-all'));
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(submitted.editReply)).toEqual({
      content: 'Removed 3 entries: your list for this server is empty.',
    });
    expect(made.rows()).toEqual([]);
    expect(made.rows(ALICE, OTHER_GUILD)).toEqual([[151, 'both']]);
    expect(made.rows(BOB)).toEqual([[150, 'both']]);
  });

  it('removes what the list holds at Submit, and says so when that is nothing', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    made.store.add(ALICE, FAKE_GUILD_ID, 3, 'both');
    expect(sent((await submit(made, asked)).editReply).content).toBe(
      'Removed 4 entries: your list for this server is empty.',
    );
    expect(sent((await submit(made, asked)).editReply).content).toBe(
      'Your list for this server is empty: there is nothing to remove.',
    );
  });

  it('opens no dialog when the count takes too long to read', async () => {
    const made = filled();
    let arrive: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const slow = vi.spyOn(made.store, 'count').mockImplementation(() => {
      arrive();
      return new Promise(() => undefined);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const using = made.run('unwant-all');
      await asked;
      await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
      const used = await using;
      expect(used.showModal).not.toHaveBeenCalled();
      expect(sent(used.reply)).toEqual({ content: SLOW_READ, flags: MessageFlags.Ephemeral });
    } finally {
      vi.useRealTimers();
    }
    expect(made.store.rows).toHaveLength(5);
    // The use came back at the router: the whole limit is still there.
    slow.mockRestore();
    for (let n = 0; n < NOTIFICATION_THROTTLE.uses; n++) {
      expect(shownDialog(await made.run('unwant-all')).title).toBe('Remove all your wants');
    }
  });

  it('says that nothing was removed when the database fails', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    made.store.failing = new Error('the database is away');
    const submitted = await submit(made, asked);
    expect(sent(submitted.editReply)).toEqual({ content: 'Nothing was removed.' });
    made.store.failing = undefined;
    expect(made.rows()).toHaveLength(3);
  });

  it('takes as many Submits a minute as the command takes uses', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    for (let n = 0; n < NOTIFICATION_THROTTLE.uses; n++) {
      expect(sent((await submit(made, asked)).editReply).content).toMatch(/^(Removed|Your list)/);
    }
    const refused = await submit(made, asked);
    expect(refused.deferReply).not.toHaveBeenCalled();
    expect(sent(refused.reply).content).toMatch(/^That was a lot of clicks/);
  });

  it('words one entry as one', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    const asked = await made.run('unwant-all');
    expect(dialogText(shownDialog(asked))).toMatch(
      /^Remove the one entry of your list[^\n]*\n\nSubmit removes it\.$/,
    );
    const submitted = await submit(made, asked);
    expect(sent(submitted.editReply).content).toBe(
      'Removed 1 entry: your list for this server is empty.',
    );
  });

  it('gives the buttons of the question it asked before the stale answer', async () => {
    const made = filled();
    for (const action of ['all', 'keep']) {
      const pressed = await made.handle(
        fakeButton({ customId: `wants:0123456789abcdef:${action}`, userId: ALICE }),
      );
      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
    }
    expect(made.store.rows).toHaveLength(5);
  });
});
