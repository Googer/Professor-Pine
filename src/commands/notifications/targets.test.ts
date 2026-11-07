import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { dialogText, shownDialog } from '../../../test/support/dialogs.js';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  fakeSelect,
  answered,
  asV2,
  sent,
  type FakeInteraction,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import {
  buttonsOf,
  componentCount,
  customIdsOf,
  textDisplays,
} from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedMax,
  reportedRaid,
} from '../../../test/support/party-service.js';
import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import {
  ownTargetChoices,
  target,
  targetControls,
  targetListControls,
  targetRemovalControls,
  targets,
  targetsList,
  untarget,
  untargetAll,
} from './targets.js';

const OTHER_GUILD = '499999999999999999';
/** The channels of the fakes' server: the regions West and East. */
const SERVER = { [WEST_CHANNEL]: 'west', [EAST_CHANNEL]: 'east', '600000000000000001': 'general' };
const MAPS = (lat: number, lon: number) =>
  `[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=${String(lat)}%2C${String(lon)}>)`;

function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
  const store = new MemoryGymTargets();
  const { ctx } = createTestContext({ gymTargets: store, ...overrides });
  const router = new InteractionRouter(
    ctx,
    [target, untarget, targets, untargetAll],
    [targetControls, targetRemovalControls, targetListControls],
  );
  const run = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      userId: ALICE,
      guildChannelNames: SERVER,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered: the deferred answer, or a refusal. */
  const answer = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const used = await run(commandName, options, extra);
    const mock = used.editReply.mock.calls.length > 0 ? used.editReply : used.reply;
    return sent(mock).content;
  };
  const choices = async (commandName: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName,
      userId: ALICE,
      guildChannelNames: SERVER,
      focusedName: 'gym',
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
  const gymsOf = (member = ALICE, guild = FAKE_GUILD_ID) =>
    store.rows
      .filter((row) => row.memberId === member && row.guildId === guild)
      .map((row) => row.gym);
  return { ctx, store, router, run, answer, choices, handle, gymsOf };
}

/** The controls of the first row of a reply. */
function controls(interaction: FakeInteraction) {
  const row = answered(interaction).components?.[0] as {
    toJSON(): {
      components: {
        custom_id: string;
        label?: string;
        options?: { label: string; value: string }[];
      }[];
    };
  };
  return row.toJSON().components;
}

describe('the target commands', () => {
  it('exist only where notifications are switched on, with help in the notifications category', () => {
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, notifications: false },
      },
    };
    for (const command of [target, untarget, targets, untargetAll]) {
      expect(command.enabled?.(ctx.config)).toBe(true);
      expect(command.enabled?.(off)).toBe(false);
      expect(command.help.category).toBe('notifications');
      expect(command.help.details).toBeTruthy();
      expect(command.help.examples?.length).toBeGreaterThan(0);
    }
  });

  it('work in a server only, and answer the member alone', async () => {
    const made = setup();
    const dm = await made.run('target', { gym: 'g:1' }, { isDm: true });
    expect(dm.reply).toHaveBeenCalledWith({
      content: 'This only works in a server.',
      flags: MessageFlags.Ephemeral,
    });
    const used = await made.run('target', { gym: 'g:1' });
    expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
  });
});

describe('/target', () => {
  it('makes a picked gym a target without asking, with its maps link and how to undo it', async () => {
    const made = setup();
    expect(await made.answer('target', { gym: 'g:1' })).toBe(
      '**The Stacks** (Pinewood Public Library) is one of your gyms now: you will get a DM ' +
        `when a raid is reported there. ${MAPS(40.05, -80.05)}\n\`/untarget\` takes it off again.`,
    );
    expect(await made.answer('target', { gym: 'g:1' })).toBe(
      `**The Stacks** (Pinewood Public Library) is one of your gyms already. ${MAPS(40.05, -80.05)}`,
    );
    expect(made.gymsOf()).toEqual(['1']);
  });

  it('acts on text that one gym has every word of, from any channel of the server', async () => {
    const made = setup();
    // The channel is no region: all gyms of the server are searched.
    expect(await made.answer('target', { gym: 'stone fountain' })).toMatch(
      /^\*\*Old Stone Fountain\*\* is one of your gyms now/,
    );
    // From West, a gym deep in East.
    await made.run('target', { gym: 'fresco' }, { channelId: WEST_CHANNEL });
    expect(made.gymsOf()).toEqual(['2', '8']);
  });

  it('offers a menu when the text is unclear, and makes the chosen gym a target', async () => {
    const made = setup();
    const asked = await made.run('target', { gym: 'starbucks' });
    expect(answered(asked).content).toBe('Several gyms fit "starbucks". Which one do you mean?');
    const [menu] = controls(asked);
    expect(menu?.custom_id).toMatch(/^target:[0-9a-f]{16}:gym$/);
    expect(menu?.options?.map((option) => option.value).sort()).toEqual(['5', '9']);
    expect(made.store.rows).toEqual([]);
    const chosen = await made.handle(
      fakeSelect({
        customId: menu?.custom_id ?? '',
        userId: ALICE,
        values: ['9'],
        guildChannelNames: SERVER,
      }),
    );
    expect(chosen.deferUpdate).toHaveBeenCalled();
    expect(answered(chosen).content).toMatch(/^\*\*Starbucks\*\* is one of your gyms now/);
    expect(answered(chosen).components).toEqual([]);
    expect(made.gymsOf()).toEqual(['9']);
    // The menu is answered once.
    const again = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', userId: ALICE, values: ['5'] }),
    );
    expect(again.update).toHaveBeenCalledWith({
      content: 'That choice has expired. Use the command again.',
      components: [],
    });
  });

  it('offers a misspelt gym instead of acting on it', async () => {
    const made = setup();
    const asked = await made.run('target', { gym: 'fountian' }, { channelId: WEST_CHANNEL });
    expect(answered(asked).content).toBe('Did you mean this gym?');
    expect(made.store.rows).toEqual([]);
  });

  it('lets only the asker use the menu, and takes no gym that was not offered', async () => {
    const made = setup();
    const asked = await made.run('target', { gym: 'starbucks' });
    const id = controls(asked)[0]?.custom_id ?? '';
    const other = await made.handle(fakeSelect({ customId: id, userId: BOB, values: ['9'] }));
    expect(other.reply).toHaveBeenCalledWith({
      content: 'That is somebody else’s choice.',
      flags: MessageFlags.Ephemeral,
    });
    const odd = await made.handle(
      fakeSelect({ customId: id, userId: ALICE, values: ['1'], guildChannelNames: SERVER }),
    );
    // The menu is used up, so its own message says so and loses the menu.
    expect(odd.update).toHaveBeenCalledWith({
      content: 'That gym no longer exists. Use the command again.',
      components: [],
    });
    expect(made.store.rows).toEqual([]);
  });

  it('takes only a gym that lies in a region of this server', async () => {
    const made = setup();
    // Gym 10 lies in no region.
    expect(await made.answer('target', { gym: 'g:10' })).toBe(
      'I found no gym of this server for "g:10". Type part of its name and pick it from the list.',
    );
    expect(await made.answer('target', { gym: 'trailhead' })).toMatch(
      /^I found no gym of this server for "trailhead"/,
    );
    // A server that the regions' rows do not name has none of these gyms.
    expect(await made.answer('target', { gym: 'g:1' }, { guildId: OTHER_GUILD })).toMatch(
      /^I found no gym of this server/,
    );
    expect(await made.answer('target', { gym: 'zzzzzz' })).toMatch(
      /^I found no gym of this server/,
    );
    expect(made.store.rows).toEqual([]);
  });

  it('goes by the rows of the regions, not by the channels the bot has in its cache', async () => {
    const made = setup();
    // The text channel of West is gone from the server; its row, and so its gyms, remain.
    expect(
      await made.answer('target', { gym: 'g:1' }, { guildChannelNames: { '1': 'general' } }),
    ).toMatch(/^\*\*The Stacks\*\* \(Pinewood Public Library\) is one of your gyms now/);
    expect(await made.choices('target', 'libr', { guildChannelNames: {}, channelId: '1' })).toEqual(
      [{ name: 'Pinewood Public Library · The Stacks', value: 'g:1' }],
    );
    const listed = await made.run('targets', {}, { guildChannelNames: {} });
    expect(textDisplays(asV2(answered(listed)))[1]).toBe(
      `[The Stacks](<${gymMapsUrl({ lat: 40.05, lon: -80.05 })}>) · <#${WEST_CHANNEL}>`,
    );
  });

  it('means the gym of the raid in whose post it is used', async () => {
    const raid = await reportedRaid();
    const made = setup({ parties: raid.store, regions: raid.regions });
    const inPost = { channelId: raid.postId, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('target', {}, inPost)).toMatch(
      /^\*\*The Stacks\*\* \(Pinewood Public Library\) is one of your gyms now/,
    );
    expect(made.gymsOf()).toEqual(['1']);
    expect(await made.answer('untarget', {}, inPost)).toBe(
      '**The Stacks** (Pinewood Public Library) is no longer one of your gyms.',
    );
    expect(made.gymsOf()).toEqual([]);
  });

  it('means the stop a train is at, and says so when it is at none', async () => {
    const train = await createdTrain({ route: [4, 1] });
    const made = setup({ parties: train.store, regions: train.regions });
    const inPost = { channelId: train.postId, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('target', {}, inPost)).toMatch(
      /^\*\*Veterans Memorial Bridge\*\* is one of your gyms now/,
    );
    const empty = await createdTrain();
    const other = setup({ parties: empty.store, regions: empty.regions });
    expect(
      await other.answer(
        'target',
        {},
        { channelId: empty.postId, thread: { parentId: WEST_FORUM } },
      ),
    ).toBe('This train is at no gym right now. Say which gym with the `gym` option.');
  });

  it('says how to name a gym outside a post, and in the post of a meetup', async () => {
    const made = setup();
    const said =
      'Say which gym: type part of its name in `gym` and pick it from the list. In the post of a ' +
      'raid or a train you can leave it out, for the gym of that raid or the stop the train is at.';
    expect(await made.answer('target')).toBe(said);
    expect(await made.answer('untarget')).toBe(said);
    const meetup = await createdMeetup();
    const inMeetup = setup({ parties: meetup.store, regions: meetup.regions });
    expect(
      await inMeetup.answer(
        'target',
        {},
        { channelId: meetup.postId, thread: { parentId: WEST_FORUM } },
      ),
    ).toBe('This meetup is at no gym right now. Say which gym with the `gym` option.');
  });

  // Final review, X3-F6: a max battle is at a power spot, which is no gym.
  it('says that a max battle is at a Power Spot, in its post', async () => {
    const max = await reportedMax();
    const made = setup({ parties: max.store, regions: max.regions });
    const inPost = { channelId: max.postId, thread: { parentId: WEST_FORUM } };
    for (const name of ['target', 'untarget']) {
      expect(await made.answer(name, {}, inPost)).toBe(
        'A max battle is at a Power Spot, not a gym: name the gym with `gym`.',
      );
    }
  });

  it('keeps targets per server and per member, without a limit', async () => {
    const made = setup();
    for (let gym = 100; gym < 230; gym++) made.store.addRow(ALICE, FAKE_GUILD_ID, String(gym));
    made.store.addRow(ALICE, OTHER_GUILD, '2');
    await made.run('target', { gym: 'g:1' });
    await made.run('target', { gym: 'g:3' }, { userId: BOB });
    expect(made.gymsOf()).toHaveLength(131);
    expect(made.gymsOf(ALICE, OTHER_GUILD)).toEqual(['2']);
    expect(made.gymsOf(BOB)).toEqual(['3']);
  });

  it('lists the gyms of this server that fit, the region’s own first', async () => {
    const made = setup();
    expect(await made.choices('target', 'libr', { channelId: WEST_CHANNEL })).toEqual([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
    const anywhere = await made.choices('target', 'starbucks');
    expect(anywhere.map((choice) => choice.value).sort()).toEqual(['g:5', 'g:9']);
    // Nothing typed: the region's own gyms; outside a region, nothing to go by.
    expect((await made.choices('target', '', { channelId: WEST_CHANNEL })).length).toBeGreaterThan(
      5,
    );
    expect(await made.choices('target', '')).toEqual([]);
    // Gym 10 is in no region of the server.
    expect(await made.choices('target', 'trailhead')).toEqual([]);
  });
});

describe('/untarget', () => {
  it('removes a picked gym, and says when it was none of the member’s', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '2');
    made.store.addRow(BOB, FAKE_GUILD_ID, '3');
    expect(await made.answer('untarget', { gym: 'g:2' })).toBe(
      '**Old Stone Fountain** is no longer one of your gyms.',
    );
    expect(await made.answer('untarget', { gym: 'g:3' })).toBe(
      "**St. Mary's Church** is not one of your gyms. `/targets` shows them.",
    );
    expect(made.store.rows.map((row) => row.gym)).toEqual(['3']);
  });

  it('removes a target whose gym no longer exists', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '999');
    expect(await made.answer('untarget', { gym: 'g:999' })).toBe(
      'That gym is no longer one of your gyms.',
    );
    expect(made.store.rows).toEqual([]);
  });

  it('reads typed text against the member’s own gyms only', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '9');
    made.store.addRow(ALICE, FAKE_GUILD_ID, '2');
    // Two gyms are called Starbucks; only one is the member's.
    expect(await made.answer('untarget', { gym: 'starbucks' })).toBe(
      '**Starbucks** is no longer one of your gyms.',
    );
    expect(made.gymsOf()).toEqual(['2']);
    expect(await made.answer('untarget', { gym: 'library' })).toBe(
      'None of your gyms fits "library". `/targets` shows them.',
    );
  });

  it('offers a menu when the text fits several of the member’s gyms, and removes the chosen one', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '5');
    made.store.addRow(ALICE, FAKE_GUILD_ID, '9');
    const asked = await made.run('untarget', { gym: 'starbucks' });
    const [menu] = controls(asked);
    expect(menu?.options?.map((option) => option.value).sort()).toEqual(['5', '9']);
    const chosen = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', userId: ALICE, values: ['5'] }),
    );
    expect(answered(chosen).content).toBe('**Starbucks** is no longer one of your gyms.');
    expect(made.gymsOf()).toEqual(['9']);
  });

  it('lists the member’s own gyms of this server, by name, narrowed to what was typed', async () => {
    const made = setup();
    for (const gym of ['9', '1', '2', '999', 'nowhere'])
      made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    made.store.addRow(ALICE, OTHER_GUILD, '3');
    made.store.addRow(BOB, FAKE_GUILD_ID, '4');
    // In the channel of West: a gym of another region is named with its region, as in `/target`.
    const inWest = { channelId: WEST_CHANNEL };
    expect(await made.choices('untarget', '', inWest)).toEqual([
      { name: 'Old Stone Fountain', value: 'g:2' },
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
      { name: 'Starbucks · east', value: 'g:9' },
    ]);
    expect(await made.choices('untarget', 'stacks', inWest)).toEqual([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
    // The region is part of what the typed words find.
    expect(await made.choices('untarget', 'east', inWest)).toEqual([
      { name: 'Starbucks · east', value: 'g:9' },
    ]);
    // Outside every region each gym says where it lies.
    expect(await made.choices('untarget', '')).toEqual([
      { name: 'Old Stone Fountain · west', value: 'g:2' },
      { name: 'Pinewood Public Library · The Stacks · west', value: 'g:1' },
      { name: 'Starbucks · east', value: 'g:9' },
    ]);
    // What begins with the text comes before what only holds it.
    expect((await made.choices('untarget', 'st')).map((choice) => choice.value)).toEqual([
      'g:9',
      'g:2',
      'g:1',
    ]);
    expect(await made.choices('untarget', '', { isDm: true })).toEqual([]);
  });

  it('answers the list with nothing when the targets cannot be read', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
    made.store.failing = new Error('the database is away');
    expect(await made.choices('untarget', 'lib')).toEqual([]);
  });

  it('shows 25 of a long list', () => {
    const { ctx } = createTestContext();
    const gym = ctx.gyms.get(1);
    if (!gym) throw new Error('no gym 1');
    const many = Array.from({ length: 60 }, (_unused, index) => ({
      ...gym,
      id: index + 1,
      name: `Gym ${String(index + 1).padStart(2, '0')}`,
      nickname: null,
    }));
    expect(ownTargetChoices(many, '')).toHaveLength(25);
    expect(ownTargetChoices(many, 'gym 4').map((choice) => choice.name)).toEqual([
      'Gym 40',
      'Gym 41',
      'Gym 42',
      'Gym 43',
      'Gym 44',
      'Gym 45',
      'Gym 46',
      'Gym 47',
      'Gym 48',
      'Gym 49',
      // Then those that hold the words elsewhere.
      'Gym 04',
      'Gym 14',
      'Gym 24',
      'Gym 34',
      'Gym 54',
    ]);
  });
});

describe('/targets', () => {
  /** What `/targets` answered (or a press of its buttons showed), as a v2 message. */
  const shown = (payload: SentPayload) => asV2(payload);
  const link = (
    ctx: { gyms: { get(id: number): { lat: number; lon: number } | undefined } },
    id: number,
    name: string,
  ) => {
    const gym = ctx.gyms.get(id);
    if (!gym) throw new Error(`no gym ${String(id)}`);
    return `[${name}](<${gymMapsUrl(gym)}>)`;
  };

  it('says how to add one when the member has none, without buttons', async () => {
    const made = setup();
    const message = shown(answered(await made.run('targets')));
    expect(textDisplays(message)).toEqual([
      '### Gyms you want raids of\nYou want raids of no gym yet. `/target` adds one.',
    ]);
    expect(buttonsOf(message)).toEqual([]);
    expectV2Sendable(message);
  });

  it('lists the gyms by region, the regions and the gyms by name, each with Remove', async () => {
    const made = setup();
    for (const gym of ['2', '8', '1', '7', '3']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    made.store.addRow(ALICE, OTHER_GUILD, '4');
    const used = await made.run('targets');
    expect(answered(used).flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
    const message = shown(answered(used));
    expect(textDisplays(message)).toEqual([
      '### Gyms you want raids of\n5 gyms',
      `${link(made.ctx, 8, 'Café Élan Fresco')} · <#${EAST_CHANNEL}>`,
      `${link(made.ctx, 7, 'Harbor Lighthouse Mural')} · <#${EAST_CHANNEL}>`,
      `${link(made.ctx, 2, 'Old Stone Fountain')} · <#${WEST_CHANNEL}>`,
      `${link(made.ctx, 3, "St. Mary's Church")} · <#${WEST_CHANNEL}>`,
      `${link(made.ctx, 1, 'The Stacks')} · <#${WEST_CHANNEL}>`,
      '-# `/target` adds one.',
    ]);
    expect(customIdsOf(message)).toEqual([
      'targetlist:0:remove:g:8',
      'targetlist:0:remove:g:7',
      'targetlist:0:remove:g:2',
      'targetlist:0:remove:g:3',
      'targetlist:0:remove:g:1',
      'targetlist:0:all',
    ]);
  });

  it('puts a gym outside the regions of this server last, marks no elite raid gym, and counts what it cannot read', () => {
    const made = setup();
    const base = made.ctx.gyms.get(3);
    if (!base) throw new Error('no gym 3');
    const elite = { ...base, confirmedEx: true };
    const ctx = {
      ...made.ctx,
      gyms: Object.assign(Object.create(made.ctx.gyms) as typeof made.ctx.gyms, {
        get: (id: number) => (id === 3 ? elite : made.ctx.gyms.get(id)),
      }),
    };
    const message = targetsList(
      ctx,
      { gymIds: [1, 10, 3, 999], unreadable: 2 },
      { guildRow: 1, nameOf: (id) => SERVER[id as keyof typeof SERVER] },
      0,
    );
    expect(textDisplays(message)).toEqual([
      '### Gyms you want raids of\n3 gyms\n' +
        '…and 3 entries I can no longer show (a gym that no longer exists, say); ' +
        '`/untarget-all` removes those too.',
      `${link(made.ctx, 3, "St. Mary's Church")} · <#${WEST_CHANNEL}>`,
      `${link(made.ctx, 1, 'The Stacks')} · <#${WEST_CHANNEL}>`,
      `${link(made.ctx, 10, 'Lakeview Trailhead')} · in no region of this server`,
      '-# `/target` adds one.',
    ]);
  });

  it('removes a gym on Remove and shows the list again, also when it was gone already', async () => {
    const made = setup();
    for (const gym of ['1', '2', '3']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    const listed = shown(answered(await made.run('targets')));
    const remove = customIdsOf(listed)[1] ?? '';
    expect(remove).toBe('targetlist:0:remove:g:3');
    const press = () =>
      made.handle(fakeButton({ customId: remove, userId: ALICE, guildChannelNames: SERVER }));
    const pressed = await press();
    expect(made.gymsOf()).toEqual(['1', '2']);
    const after = shown(sent(pressed.update));
    expect(textDisplays(after)[0]).toBe('### Gyms you want raids of\n2 gyms');
    expect(customIdsOf(after)).not.toContain(remove);
    // A second press of the same button (an old message) removes nothing and is no error.
    const again = await press();
    expect(textDisplays(shown(sent(again.update)))[0]).toBe('### Gyms you want raids of\n2 gyms');
    expect(made.gymsOf()).toEqual(['1', '2']);
  });

  it('turns the pages, and shows the last page when the one shown is past the end', async () => {
    const made = setup();
    for (let n = 0; n < 12; n++) made.store.addRow(ALICE, FAKE_GUILD_ID, String((n % 12) + 1));
    const first = shown(answered(await made.run('targets')));
    expect(textDisplays(first)[0]).toBe('### Gyms you want raids of\n12 gyms · page 1 of 2');
    const next = await made.handle(
      fakeButton({ customId: 'targetlist:0:next', userId: ALICE, guildChannelNames: SERVER }),
    );
    const second = shown(sent(next.update));
    expect(textDisplays(second)[0]).toBe('### Gyms you want raids of\n12 gyms · page 2 of 2');
    expect(textDisplays(second)).toHaveLength(1 + 2 + 1);
    // Remove on the second page of a list that then fits one page shows that page.
    const remove = customIdsOf(second).find((id) => id.includes(':remove:')) ?? '';
    made.store.rows.splice(0, 1);
    const removed = await made.handle(
      fakeButton({ customId: remove, userId: ALICE, guildChannelNames: SERVER }),
    );
    expect(textDisplays(shown(sent(removed.update)))[0]).toBe(
      '### Gyms you want raids of\n10 gyms',
    );
    const back = await made.handle(
      fakeButton({ customId: 'targetlist:1:prev', userId: ALICE, guildChannelNames: SERVER }),
    );
    expect(customIdsOf(shown(sent(back.update)))[0]).toMatch(/^targetlist:0:remove:/);
  });

  it('asks the question of /untarget-all on Remove all… in its dialog, the list staying', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
    const pressed = await made.handle(
      fakeButton({ customId: 'targetlist:0:all', userId: ALICE, guildChannelNames: SERVER }),
    );
    expect(pressed.update).not.toHaveBeenCalled();
    expect(shownDialog(pressed).title).toBe('Remove all your gym targets');
    expect(dialogText(shownDialog(pressed))).toMatch(/^Remove your one gym in this server\?/);
    expect(made.gymsOf()).toEqual(['1']);
  });

  it('refuses a button it cannot read', async () => {
    const made = setup();
    for (const customId of [
      'targetlist:0:remove:p:150',
      'targetlist:x:next',
      'targetlist:0:what',
    ]) {
      const pressed = await made.handle(
        fakeButton({ customId, userId: ALICE, guildChannelNames: SERVER }),
      );
      expect(sent(pressed.reply).content).toBe('That list is out of date. Use `/targets` again.');
    }
  });

  it('keeps a full page of long names within the components and the text Discord takes', () => {
    const { ctx } = createTestContext();
    const base = ctx.gyms.get(1);
    if (!base) throw new Error('no gym 1');
    const gyms = new Map(
      Array.from({ length: 25 }, (_unused, index) => [
        index + 1,
        {
          ...base,
          id: index + 1,
          nickname: null,
          confirmedEx: true,
          name: '[*_~`|>'.repeat(35) + String(index),
        },
      ]),
    );
    const [west] = ctx.regions.all();
    if (!west) throw new Error('no region');
    const wide = {
      ...ctx,
      gyms: { ...ctx.gyms, get: (id: number) => gyms.get(id), regionsOf: () => [WEST_CHANNEL] },
      regions: {
        ...ctx.regions,
        byChannel: (channelId: string) => ({ ...west, channelId, guildId: 1 }),
      },
    };
    for (const page of [0, 1, 2]) {
      const message = targetsList(
        wide,
        { gymIds: [...gyms.keys()], unreadable: 12_345 },
        { guildRow: 1, nameOf: () => 'west' },
        page,
      );
      expect(componentCount(message)).toBeLessThanOrEqual(40);
      expectV2Sendable(message);
    }
    const full = targetsList(
      wide,
      { gymIds: [...gyms.keys()], unreadable: 0 },
      { guildRow: 1, nameOf: () => 'west' },
      0,
    );
    expect(
      textDisplays(full)
        .slice(1, -1)
        .every((line) => line.includes('…](<')),
    ).toBe(true);
    expect(buttonsOf(full)).toHaveLength(10 + 3);
  });
});

describe('/untarget-all', () => {
  /** The Submit of the dialog a fake was shown, by Alice. */
  const submit = (made: ReturnType<typeof setup>, asked: FakeInteraction) => {
    const dialog = shownDialog(asked);
    return made.handle(fakeModal({ customId: dialog.custom_id, form: dialog, userId: ALICE }));
  };

  it('asks first in a dialog and removes every row of the member in this server on Submit', async () => {
    const made = setup();
    for (const gym of ['1', '2', 'nowhere']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    made.store.addRow(ALICE, OTHER_GUILD, '3');
    made.store.addRow(BOB, FAKE_GUILD_ID, '1');
    const asked = await made.run('untarget-all');
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('Remove all your gym targets');
    expect(dialogText(dialog)).toBe(
      'Remove all 3 of your gyms in this server? You will get no DMs for raids at particular ' +
        'gyms here any more.\n\nSubmit removes them.',
    );
    expect(made.store.rows).toHaveLength(5);
    const submitted = await submit(made, asked);
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(submitted.editReply)).toEqual({
      content: 'Removed 3 gyms: you have no gyms in this server any more.',
    });
    expect(made.gymsOf()).toEqual([]);
    expect(made.store.rows).toHaveLength(2);
  });

  it('says so when there is nothing to remove, and words one gym as one', async () => {
    const made = setup();
    const none = await made.run('untarget-all');
    expect(none.showModal).not.toHaveBeenCalled();
    expect(answered(none).content).toBe(
      'You have no gyms in this server: there is nothing to remove.',
    );
    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
    const asked = await made.run('untarget-all');
    expect(dialogText(shownDialog(asked))).toMatch(
      /^Remove your one gym in this server\?[^\n]*\n\nSubmit removes it\.$/,
    );
    expect(made.gymsOf()).toEqual(['1']);
  });

  it('gives the buttons of the question it asked before the stale answer', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
    const pressed = await made.handle(
      fakeButton({ customId: 'targets:0123456789abcdef:all', userId: ALICE }),
    );
    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
    expect(made.gymsOf()).toEqual(['1']);
  });
});
