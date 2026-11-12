import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { buttonsOf, selectsOf, textDisplays } from '../../../test/support/messages.js';
import { MemoryLegacyIndex } from '../../../test/support/legacy-fill-ins.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { commandGroup } from '../../discord/command-group.js';
import {
  alsoAs,
  DATE_EXAMPLE,
  type CommandModule,
  type MessageCommand,
  type SimpleCommand,
} from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import { meet } from '../parties/meet.js';
import { end } from '../raids/change.js';
import { help, helpControls } from './help.js';
import { withFeatures } from '../../../test/support/server-values.js';

const noop = () => Promise.resolve();
const sub = (name: string) =>
  new SlashCommandSubcommandBuilder().setName(name).setDescription(`About ${name}`);
const route = commandGroup({
  data: new SlashCommandBuilder().setName('route').setDescription('The route of a train'),
  help: { category: 'train' },
  parts: [
    { data: sub('show'), execute: noop },
    { data: sub('add'), execute: noop },
  ],
});
const gym: CommandModule = commandGroup({
  data: new SlashCommandBuilder().setName('gym').setDescription('Gym administration'),
  help: { category: 'admin' },
  groups: { meta: 'The details of a gym' },
  parts: [
    { data: sub('create'), execute: noop },
    { group: 'meta', data: sub('show'), execute: noop },
  ],
});

const maybe: SimpleCommand = {
  data: new SlashCommandBuilder().setName('interested').setDescription('Say you are interested'),
  help: { category: 'util', details: 'Marks you as interested.' },
  execute: noop,
};
const hmm = alsoAs(maybe, 'hmm');

const { ctx } = createTestContext({ commands: [help, route, gym] });
/** A bot that has a command with another name. */
const named = createTestContext({ commands: [help, maybe, hmm] }).ctx;

const ask = async (o: FakeOptions = {}, context = ctx): Promise<V2Message> => {
  const i = fakeChatInput({ commandName: 'help', ...o });
  await help.execute(i as unknown as ChatInputCommandInteraction, context);
  const payload = sent(i.reply);
  expect(payload.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
  return asV2(payload);
};
const choices = async (focused: string, o: FakeOptions = {}, context = ctx) => {
  const i = fakeAutocomplete({ commandName: 'help', focused, ...o });
  await help.autocomplete?.(i as unknown as AutocompleteInteraction, context);
  return (i.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.value);
};
const MODERATOR = { roleNames: ['moderator'] };

/** The bold headings of the groups an overview lists. */
const groupsOf = (message: V2Message): string[] =>
  textDisplays(message)
    .slice(1)
    .map((text) => /^\*\*(.+?)\*\*/.exec(text)?.[1] ?? '');
/** The title of a help page. */
const titleOf = (message: V2Message | undefined): string | undefined =>
  textDisplays(message)[0]?.split('\n')[0];

// Plan 19A-1: a command a server has not set up is left out of its /help and its autocomplete.
describe('/help: what a server has not set up', () => {
  const want: SimpleCommand = {
    data: new SlashCommandBuilder().setName('want').setDescription('Want a Pokémon'),
    help: { category: 'notifications', details: 'Tells you of it.' },
    setUpIn: (values) => (values.features.notifications ? undefined : 'Turn it on.'),
    execute: noop,
  };
  const quiet = createTestContext({
    commands: [help, want],
    servers: withFeatures({ notifications: false }),
  }).ctx;
  const notifying = createTestContext({ commands: [help, want] }).ctx;

  it('lists it, offers it and explains it only where the server has set it up', async () => {
    expect(JSON.stringify(textDisplays(await ask({}, notifying)))).toContain('/want');
    expect(await choices('wa', {}, notifying)).toEqual(['want']);
    expect(JSON.stringify(textDisplays(await ask({}, quiet)))).not.toContain('/want');
    expect(await choices('wa', {}, quiet)).toEqual([]);
    await expect(ask({ options: { command: 'want' } }, quiet)).rejects.toThrow(
      'There is no /want command.',
    );
    // In a DM, which is no server, it is as registered.
    expect(await choices('wa', { isDm: true }, quiet)).toEqual(['want']);
  });
});

describe('/help: a command with another name', () => {
  it('lists the other name beside the command, not on its own', async () => {
    const message = await ask({}, named);
    expect(textDisplays(message)).toContain('**Utility**\n`/help` · `/interested` `/hmm`');
  });

  it('explains the other name as the command, and says whose name it is', async () => {
    const message = await ask({ options: { command: 'hmm' } }, named);
    expect(textDisplays(message)[0]).toBe(
      '### /hmm\nSay you are interested\n\n`/hmm` is another name for `/interested`.\n\nMarks ' +
        'you as interested.',
    );
  });

  it('offers both names while one is typed', async () => {
    expect(await choices('in', {}, named)).toContain('interested');
    expect(await choices('hm', {}, named)).toContain('hmm');
  });
});

describe('/help: what the installation has besides its settings (HelpFacts)', () => {
  const said = (_settings: unknown, facts?: { oldHistory?: boolean }) =>
    facts?.oldHistory === true ? 'The old history is here.' : 'No old history here.';
  const recall: SimpleCommand = {
    data: new SlashCommandBuilder().setName('recall').setDescription('Recall the past'),
    help: { category: 'util', details: said },
    execute: noop,
  };
  const past = commandGroup({
    data: new SlashCommandBuilder().setName('past').setDescription('The past'),
    help: { category: 'util' },
    parts: [{ data: sub('show'), help: { details: said }, execute: noop }],
  });
  const commands = [help, recall, alsoAs(recall, 'remember'), past];
  const page = async (command: string, legacyIndex?: MemoryLegacyIndex) =>
    textDisplays(
      await ask({ options: { command } }, createTestContext({ commands, legacyIndex }).ctx),
    ).join('\n');

  it('gives them to another name of a command', async () => {
    expect(await page('remember', new MemoryLegacyIndex())).toContain('The old history is here.');
    expect(await page('remember')).toContain('No old history here.');
  });

  it('gives them to a subcommand', async () => {
    expect(await page('past show', new MemoryLegacyIndex())).toContain('The old history is here.');
    expect(await page('past show')).toContain('No old history here.');
  });
});

describe('/help: an example with a date (plan 8X-G, M2)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a date three days from today in the zone, so the example never goes stale', async () => {
    const later: SimpleCommand = {
      data: new SlashCommandBuilder().setName('later').setDescription('Plan ahead'),
      help: { category: 'util', examples: [`/later time:${DATE_EXAMPLE} 6:15pm`, '/later'] },
      execute: noop,
    };
    const dated = createTestContext({ commands: [help, later] }).ctx;
    // 23:30 in New York on 10-13 is 10-14 in UTC: the zone's day counts.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-14T03:30:00Z') });
    const page = await ask({ options: { command: 'later' } }, dated);
    expect(textDisplays(page).join('\n')).toContain('`/later time:10-16 6:15pm`\n`/later`');
  });

  it('shows that date in what /meet and /end say of dates too, never a day long past (final review F4)', async () => {
    const dated = createTestContext({ commands: [help, meet, end] }).ctx;
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-11-20T15:00:00Z') });
    for (const [command, time] of [
      ['meet', '6pm'],
      ['end', '9pm'],
    ] as const) {
      const page = textDisplays(await ask({ options: { command } }, dated)).join('\n');
      expect(page).toContain(`A date comes first, month-day (\`11-23 ${time}\`)`);
      expect(page).not.toContain('10-14');
    }
  });
});

describe('/help: a message command (the Apps menu on a message)', () => {
  const onMessage: MessageCommand = {
    target: 'message',
    data: new ContextMenuCommandBuilder()
      .setName('Report to moderators')
      .setType(ApplicationCommandType.Message),
    help: {
      category: 'util',
      description: 'Tell the moderators about a message',
      details: 'Only they see it.',
    },
    run: noop,
  };
  const withMenu = createTestContext({ commands: [help, maybe], messageCommands: [onMessage] }).ctx;
  const router = new InteractionRouter(withMenu, [help], [helpControls]);

  it('lists it under its name in its group, beside the slash commands', async () => {
    const overview = await ask({}, withMenu);
    expect(textDisplays(overview)).toContain(
      '**Utility**\n`/help` · `/interested` · **Report to moderators** (Apps menu)',
    );
    const pick = fakeSelect({
      customId: 'help:overview:group',
      values: ['util'],
      ephemeralMessage: true,
    });
    await router.handle(pick as never);
    const group = asV2(sent(pick.update));
    expect(textDisplays(group)[1]).toContain(
      '**Report to moderators** (Apps menu) Tell the moderators about a message',
    );
    expect(
      selectsOf(group)[0]?.options.map((option) => [option.label, option.value]),
    ).toContainEqual(['Report to moderators', 'Report to moderators']);
  });

  it('explains it by its name, however typed, and offers it while it is typed', async () => {
    const page = await ask({ options: { command: 'report TO moderators' } }, withMenu);
    expect(textDisplays(page)[0]).toBe(
      '### Report to moderators\nTell the moderators about a message\n\nOnly they see it.',
    );
    expect(textDisplays(page)[1]).toBe(
      '**Usage**\nIn the Apps menu of a message: a right-click on a computer, a long press on a ' +
        'phone, then **Apps** › **Report to moderators**.',
    );
    expect(await choices('rep', {}, withMenu)).toEqual(['Report to moderators']);
    const back = fakeButton({
      customId: 'help:command:report to moderators:back',
      ephemeralMessage: true,
    });
    await router.handle(back as never);
    expect(titleOf(asV2(sent(back.update)))).toBe('### Utility');
  });
});

describe('/help', () => {
  it('answers privately with the overview', async () => {
    expect(groupsOf(await ask())).toEqual(['Trains', 'Utility']);
  });

  it('shows staff the staff groups too', async () => {
    expect(groupsOf(await ask(MODERATOR))).toEqual(['Trains', 'Utility', 'Administration']);
  });

  it('explains one command, however its name was typed', async () => {
    for (const command of ['help', '/help', ' /Help ', '/ help']) {
      expect(titleOf(await ask({ options: { command } }))).toBe('### /help');
    }
  });

  it('explains one subcommand', async () => {
    expect(titleOf(await ask({ options: { command: '/Route  Add' } }))).toBe('### /route add');
  });

  it('rejects an unknown command or subcommand, naming what was asked', async () => {
    await expect(ask({ options: { command: 'nope' } })).rejects.toThrow(
      new UserError('There is no /nope command.'),
    );
    await expect(ask({ options: { command: 'route remove' } })).rejects.toThrow(
      'There is no /route remove command.',
    );
  });

  it('knows no command by a name every object has', async () => {
    for (const command of ['constructor', '__proto__', 'valueof']) {
      await expect(ask({ options: { command } })).rejects.toThrow(
        `There is no /${command} command.`,
      );
    }
  });

  it('tells a member who looks for /delete to use /report', async () => {
    await expect(ask({ options: { command: '/delete' } })).rejects.toThrow(
      'There is no /delete command for members: to tell the moderators about a raid, max battle, ' +
        'train or meetup, use `/report` in its post.',
    );
  });

  it('tells other members that a staff command does not exist, and explains it to staff', async () => {
    await expect(ask({ options: { command: 'gym' } })).rejects.toThrow('There is no /gym command.');
    await expect(ask({ options: { command: 'gym create' } })).rejects.toThrow(
      'There is no /gym create command.',
    );
    expect(titleOf(await ask({ options: { command: 'gym create' }, ...MODERATOR }))).toBe(
      '### /gym create',
    );
  });

  it('explains a group of subcommands to staff, and to members as if it did not exist', async () => {
    await expect(ask({ options: { command: 'gym meta' } })).rejects.toThrow(
      'There is no /gym meta command.',
    );
    const message = await ask({ options: { command: '/Gym Meta' }, ...MODERATOR });
    expect(textDisplays(message)).toEqual([
      '### /gym meta\nThe details of a gym',
      '**Usage**\n`/gym meta show` About show',
    ]);
    expect(buttonsOf(message).map((button) => button.label)).toEqual(['◀ /gym', 'All groups']);
  });

  it('autocompletes command and subcommand names, those that start with the text first', async () => {
    expect(await choices('he')).toEqual(['help']);
    expect(await choices('')).toEqual(['help', 'route', 'route add', 'route show']);
    expect(await choices('/Route a')).toEqual(['route add']);
    expect(await choices('o')).toEqual(['route', 'route add', 'route show']);
    expect(await choices('show')).toEqual(['route show']);
  });

  it('offers staff commands to staff only', async () => {
    expect(await choices('gym')).toEqual([]);
    expect(await choices('gym', MODERATOR)).toEqual([
      'gym',
      'gym create',
      'gym meta',
      'gym meta show',
    ]);
  });

  it('works in a DM, where nobody but the owner is staff', async () => {
    expect(groupsOf(await ask({ isDm: true }))).toEqual(['Trains', 'Utility']);
    const owner = await ask({ isDm: true, userId: ctx.config.env.OWNER_ID });
    expect(groupsOf(owner)).toHaveLength(3);
  });

  it('limits the command option to 100 characters, so an error text stays short', () => {
    const option = help.data.toJSON().options?.find((o) => o.name === 'command');
    expect(option).toMatchObject({ max_length: 100 });
  });

  it('offers at most 25 choices', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...help,
      data: new SlashCommandBuilder().setName(`help${i}`).setDescription('x'),
    }));
    const { ctx: crowded } = createTestContext({ commands: many });
    const i = fakeAutocomplete({ commandName: 'help', focused: 'help' });
    await help.autocomplete?.(i as unknown as AutocompleteInteraction, crowded);
    expect(i.respond.mock.calls[0]?.[0]).toHaveLength(25);
  });
});

describe('/help: the controls of a page', () => {
  const router = new InteractionRouter(ctx, [help], [helpControls]);
  const pick = async (customId: string, value: string, o: FakeOptions = {}) => {
    const i = fakeSelect({ customId, values: [value], ephemeralMessage: true, ...o });
    await router.handle(i as never);
    return i;
  };
  const press = async (customId: string, o: FakeOptions = {}) => {
    const i = fakeButton({ customId, ephemeralMessage: true, ...o });
    await router.handle(i as never);
    return i;
  };
  const shown = (i: Awaited<ReturnType<typeof press>>): V2Message => asV2(sent(i.update));

  it('lead from the overview to a group, a command and back, in the same message', async () => {
    const overview = await ask(MODERATOR);
    expect(selectsOf(overview)[0]?.options.map((option) => option.value)).toEqual([
      'train',
      'util',
      'admin',
    ]);
    const group = shown(await pick('help:overview:group', 'train'));
    expect(textDisplays(group)[0]).toBe('### Trains\n1 command');
    expect(selectsOf(group)[0]?.customId).toBe('help:group:train:command');
    const command = shown(await pick('help:group:train:command', 'route'));
    expect(titleOf(command)).toBe('### /route');
    expect(buttonsOf(command).map((button) => button.label)).toEqual(['◀ Trains', 'All groups']);
    expect(titleOf(shown(await press('help:command:route:back')))).toBe('### Trains');
    expect(groupsOf(shown(await press('help:command:route:overview')))).toEqual([
      'Trains',
      'Utility',
    ]);
    expect(groupsOf(shown(await press('help:group:train:overview', MODERATOR)))).toEqual([
      'Trains',
      'Utility',
      'Administration',
    ]);
  });

  it('open a group of subcommands from its command, and lead back to the command', async () => {
    const command = await ask({ options: { command: 'gym' }, ...MODERATOR });
    expect(selectsOf(command)[0]?.customId).toBe('help:command:gym:subgroup');
    const meta = shown(await pick('help:command:gym:subgroup', 'meta', MODERATOR));
    expect(titleOf(meta)).toBe('### /gym meta');
    expect(buttonsOf(meta)[0]?.customId).toBe('help:command:gym meta:back');
    expect(titleOf(shown(await press('help:command:gym meta:back', MODERATOR)))).toBe('### /gym');
  });

  it('ask anew who is staff, and answer a staff page as one that does not exist', async () => {
    const group = await pick('help:overview:group', 'admin');
    expect(sent(group.reply)).toEqual({
      content: 'There is no such group of commands.',
      flags: MessageFlags.Ephemeral,
    });
    const command = await pick('help:group:admin:command', 'gym');
    expect(sent(command.reply).content).toBe('There is no /gym command.');
    const back = await press('help:command:gym meta:back');
    expect(sent(back.reply).content).toBe('There is no /gym command.');
    expect(group.update).not.toHaveBeenCalled();
  });

  it('lead from a subcommand of a group back to the group, and from the second menu too', async () => {
    const back = shown(await press('help:command:gym meta show:back', MODERATOR));
    expect(titleOf(back)).toBe('### /gym meta');
    expect(buttonsOf(back)[0]?.label).toBe('◀ /gym');
    expect(titleOf(shown(await pick('help:group:train:more', 'route')))).toBe('### /route');
  });

  it('are throttled as a reading command is', () => {
    expect(helpControls.throttle).toEqual(MEMBER_READ_THROTTLE);
  });

  it('work in a DM, and say so of a control they do not know', async () => {
    const dm = await pick('help:overview:group', 'util', { isDm: true, guildId: null });
    expect(titleOf(shown(dm))).toBe('### Utility');
    expect(sent((await press('help:command:route:sideways')).reply).content).toBe(STALE_COMPONENT);
  });
});
