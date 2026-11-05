import {
  ApplicationCommandOptionType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buttonsOf, selectsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { commandGroup } from '../../discord/command-group.js';
import type { CommandModule, SimpleCommand } from '../../discord/command.js';
import { MAX_CUSTOM_ID_LENGTH } from '../../discord/custom-id.js';
import { loadSettings } from '../../config/settings.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import type { HelpCategory } from '../categories.js';
import { commands } from '../index.js';
import {
  fitLines,
  helpGroupsOf,
  isStaffCommand,
  renderCommandHelp,
  renderGroupHelp,
  renderHelpOverview,
  renderSubcommandHelp,
  roomsByNeed,
  type HelpGroup,
} from './help-render.js';

const noop = () => Promise.resolve();
const SETTINGS = loadSettings(TEST_SETTINGS_PATH);
/** The British forms Pine's words once had, and their kin (Matt, 2026-10-18: American spelling). */
const BRITISH =
  /metre|centre|colour|cancell|behaviour|favourite|neighbour|\bgrey|licence|organis|recognis|realis|travell|labell/i;

function cmd(
  name: string,
  category: HelpCategory,
  build?: (b: SlashCommandBuilder) => void,
  description = `About ${name}`,
): SimpleCommand {
  const data = new SlashCommandBuilder().setName(name).setDescription(description);
  build?.(data);
  return { data, help: { category }, execute: noop };
}

const all = [
  cmd('join', 'basic-raid'),
  cmd('raid', 'raid-crud'),
  cmd('gym', 'admin'),
  cmd('help', 'util'),
];
const groups = ['basic-raid', 'raid-crud', 'util'];

/** The headings of the groups of an overview, by their bold first lines. */
const groupLabels = (texts: readonly string[]): string[] =>
  texts.slice(1).map((text) => /^\*\*(.+?)\*\*/.exec(text)?.[1] ?? '');

/** The group of this bot's commands that has this label, as staff see them. */
function realGroup(label: string): HelpGroup {
  const found = helpGroupsOf(commands, SETTINGS.helpGroups, true).find((g) => g.label === label);
  if (!found) throw new Error(`no group ${label}`);
  return found;
}

describe('fitLines', () => {
  it('keeps everything that fits', () => {
    expect(fitLines(['one', 'two'], 7)).toBe('one\ntwo');
  });

  it('ends at a whole line and says how many were left out', () => {
    const lines = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    expect(fitLines(lines, 30)).toBe(lines.join('\n'));
    expect(fitLines(lines, 29)).toBe('alpha\nbeta\ngamma\n…and 2 more');
    expect(fitLines(lines, 25)).toBe('alpha\nbeta\n…and 3 more');
    expect(fitLines(lines, 17)).toBe('alpha\n…and 4 more');
  });

  it('cuts a single line that is too long by itself', () => {
    expect(fitLines(['abcdefghij', 'k'], 6)).toBe('abcde…');
    expect(fitLines([], 10)).toBe('');
  });
});

describe('isStaffCommand', () => {
  it('is a command whose category the settings do not list', () => {
    expect(isStaffCommand(cmd('gym', 'admin'), groups)).toBe(true);
    expect(isStaffCommand(cmd('join', 'basic-raid'), groups)).toBe(false);
  });
});

describe('renderHelpOverview', () => {
  it('lists public groups in helpGroups order, with their commands’ names and a menu', () => {
    const message = renderHelpOverview(helpGroupsOf(all, groups, false));
    const texts = textDisplays(message);
    expect(texts[0]).toBe(
      '### Professor Pine commands\n' +
        'Pick a group to see what its commands do, or use `/help command:<name>`.',
    );
    expect(texts.slice(1)).toEqual([
      '**Raid Basics**\n`/join`',
      '**Raid Creation and Maintenance**\n`/raid`',
      '**Utility**\n`/help`',
    ]);
    expect(selectsOf(message)).toEqual([
      {
        customId: 'help:overview:group',
        placeholder: 'Show a group…',
        options: [
          { label: 'Raid Basics', value: 'basic-raid', description: '1 command' },
          { label: 'Raid Creation and Maintenance', value: 'raid-crud', description: '1 command' },
          { label: 'Utility', value: 'util', description: '1 command' },
        ],
      },
    ]);
  });

  it('appends staff-only groups for staff', () => {
    const texts = textDisplays(renderHelpOverview(helpGroupsOf(all, groups, true)));
    expect(groupLabels(texts)).toEqual([
      'Raid Basics',
      'Raid Creation and Maintenance',
      'Utility',
      'Administration',
    ]);
  });

  it('ignores a help group the settings name that no command is filed under', () => {
    expect(helpGroupsOf(all, ['silph', ...groups], false)).toHaveLength(3);
  });

  it('says how many it left out when the names of a group do not fit, never cutting a name', () => {
    const many = Array.from({ length: 400 }, (_, i) => cmd(`command-number-${i}`, 'util'));
    const message = renderHelpOverview(helpGroupsOf(many, ['util'], false));
    expectV2Sendable(message);
    const names = textDisplays(message)[1] ?? '';
    expect(names).toMatch(/ · …and \d+ more$/);
    const shown = names
      .replace(/^\*\*Utility\*\*\n/, '')
      .replace(/ · …and \d+ more$/, '')
      .split(' · ');
    expect(shown.every((name) => /^`\/command-number-\d+`$/.test(name))).toBe(true);
  });

  it('shows every command of this bot that a member may use, within what a message holds', () => {
    const { helpGroups } = SETTINGS;
    const forStaff = renderHelpOverview(helpGroupsOf(commands, helpGroups, true));
    expectV2Sendable(forStaff);
    const text = textOf(forStaff);
    for (const command of commands) expect(text).toContain(`\`/${command.data.name}\``);
    expect(text).not.toContain('more');
    const forMembers = textOf(renderHelpOverview(helpGroupsOf(commands, helpGroups, false)));
    for (const command of commands) {
      expect(forMembers.includes(`\`/${command.data.name}\``)).toBe(
        helpGroups.includes(command.help.category),
      );
    }
  });

  it('writes a command’s other forms beside its name', () => {
    const basics = textDisplays(renderHelpOverview(helpGroupsOf(commands, groups, false)))[1];
    expect(basics).toContain('`/interested` `/hmm` · ');
    expect(basics).toContain('`/join` `/coming` · ');
    const utility = textOf(renderHelpOverview(helpGroupsOf(commands, SETTINGS.helpGroups, false)));
    expect(utility).toContain('`/rank` `/little` `/great` `/ultra` `/master`');
  });
});

describe('roomsByNeed', () => {
  it('gives the small texts all they need and lets the others share the rest', () => {
    expect(roomsByNeed([10, 500, 20, 900], 1000)).toEqual([10, 485, 20, 485]);
    expect(roomsByNeed([10, 20], 1000)).toEqual([10, 20]);
    expect(roomsByNeed([600, 600], 1000)).toEqual([500, 500]);
  });

  it('shows small groups whole beside a group too large for its share', () => {
    const big = Array.from({ length: 400 }, (_, i) => cmd(`command-number-${i}`, 'util'));
    const message = renderHelpOverview(
      helpGroupsOf(
        [...big, cmd('join', 'basic-raid'), cmd('raid', 'raid-crud')],
        ['basic-raid', 'raid-crud', 'util'],
        false,
      ),
    );
    expectV2Sendable(message);
    const [, basics, crud, util] = textDisplays(message);
    expect([basics, crud]).toEqual([
      '**Raid Basics**\n`/join`',
      '**Raid Creation and Maintenance**\n`/raid`',
    ]);
    expect(util).toMatch(/ · …and \d+ more$/);
    // The large group has all the room the small ones left.
    expect(textOf(message).length).toBeGreaterThan(3_800);
  });
});

describe('renderGroupHelp', () => {
  it('lists a group’s commands with what they do, a menu of them and the way back', () => {
    const message = renderGroupHelp(realGroup('Meetups'));
    expect(textDisplays(message)).toEqual([
      '### Meetups\n3 commands',
      [
        '`/info` Write what there is to know about this meetup, in a form',
        '`/meetup` Create a meetup in this region, with a post of its own',
        '`/name` Rename this train or meetup',
      ].join('\n'),
    ]);
    const [menu] = selectsOf(message);
    expect(menu?.customId).toBe('help:group:meetup:command');
    expect(menu?.placeholder).toBe('Details of a command…');
    expect(menu?.options.map((option) => [option.label, option.value])).toEqual([
      ['/info', 'info'],
      ['/meetup', 'meetup'],
      ['/name', 'name'],
    ]);
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['◀ All groups', 'help:group:meetup:overview'],
    ]);
  });

  it('keeps every group of this bot within what a message holds', () => {
    for (const group of helpGroupsOf(commands, SETTINGS.helpGroups, true)) {
      const message = renderGroupHelp(group);
      expectV2Sendable(message);
      expect(textOf(message), group.label).not.toMatch(/…and \d+ more/);
    }
  });

  it('gives a group of more than 25 a second menu, and fits its lines', () => {
    const long = 'x'.repeat(95);
    const many = Array.from({ length: 60 }, (_, i) =>
      cmd(`command-${String(i).padStart(2, '0')}`, 'util', undefined, long),
    );
    const [group] = helpGroupsOf(many, ['util'], false);
    if (!group) throw new Error('no group');
    const message = renderGroupHelp(group);
    expectV2Sendable(message);
    const menus = selectsOf(message);
    expect(menus.map((menu) => [menu.customId, menu.options.length])).toEqual([
      ['help:group:util:command', 25],
      ['help:group:util:more', 25],
    ]);
    expect(textOf(message)).toMatch(/\n…and \d+ more$/);
  });
});

describe('renderCommandHelp', () => {
  it('shows what it does, the usage, the examples, and the way back to its group', () => {
    const command = cmd('meet', 'basic-raid', (b) =>
      b
        .addStringOption((o) => o.setName('time').setDescription('When').setRequired(true))
        .addStringOption((o) => o.setName('group').setDescription('Which group')),
    );
    command.help = {
      category: 'basic-raid',
      details: 'Sets your meeting time.',
      examples: ['/meet time:2:30'],
    };
    const message = renderCommandHelp(command, SETTINGS);
    expect(textDisplays(message)).toEqual([
      '### /meet\nAbout meet\n\nSets your meeting time.',
      '**Usage**\n`/meet <time> [group]`\n**Examples**\n`/meet time:2:30`',
    ]);
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['◀ Raid Basics', 'help:command:meet:back'],
      ['All groups', 'help:command:meet:overview'],
    ]);
    expect(selectsOf(message)).toEqual([]);
  });

  it('asks the settings for details that depend on what the installation has', () => {
    const command = cmd('wild', 'notifications');
    command.help = {
      category: 'notifications',
      details: (settings) => (settings.features.notifications ? 'Tells who wants it.' : 'Posts.'),
    };
    const off = { ...SETTINGS, features: { ...SETTINGS.features, notifications: false } };
    expect(textDisplays(renderCommandHelp(command, SETTINGS))[0]).toBe(
      '### /wild\nAbout wild\n\nTells who wants it.',
    );
    expect(textDisplays(renderCommandHelp(command, off))[0]).toBe(
      '### /wild\nAbout wild\n\nPosts.',
    );
  });

  it('lists every subcommand with what it does, a group on one line, and a menu of the groups', () => {
    const message = renderCommandHelp(route(), SETTINGS);
    expect(textDisplays(message)).toEqual([
      '### /route\nThe route of a train\n\nPick a group below, or use ' +
        '`/help command:route saved`, for the subcommands of a group.',
      '**Usage**\n`/route show` Show the route\n`/route add <gym>` Add a stop\n' +
        '`/route saved …` Saved routes',
    ]);
    expect(selectsOf(message)).toEqual([
      {
        customId: 'help:command:route:subgroup',
        placeholder: 'Subcommands of a group…',
        options: [{ label: '/route saved', value: 'saved', description: 'Saved routes' }],
      },
    ]);
    expect(buttonsOf(message).map((button) => button.label)).toEqual(['◀ Trains', 'All groups']);
  });

  it('names every subcommand and group of every command of this bot, within a message', () => {
    for (const command of commands) {
      const json = command.data.toJSON();
      const message = renderCommandHelp(command, SETTINGS);
      expectV2Sendable(message);
      const usage = textDisplays(message)[1] ?? '';
      for (const option of json.options ?? []) {
        const nested =
          option.type === ApplicationCommandOptionType.Subcommand ||
          option.type === ApplicationCommandOptionType.SubcommandGroup;
        if (!nested) continue;
        expect(usage, `/${json.name} ${option.name}`).toContain(`/${json.name} ${option.name}`);
      }
      expect(usage, `/${json.name}`).not.toMatch(/more$/);
      expect(textDisplays(message)[0], `/${json.name}`).not.toMatch(/…$/);
    }
  });

  it('writes American spelling in every command and subcommand of this bot', () => {
    const texts: [string, string][] = [];
    for (const command of commands) {
      const json = command.data.toJSON();
      texts.push([`/${json.name}`, textOf(renderCommandHelp(command, SETTINGS))]);
      for (const option of json.options ?? []) {
        const names =
          option.type === ApplicationCommandOptionType.Subcommand
            ? [option.name]
            : option.type === ApplicationCommandOptionType.SubcommandGroup
              ? (option.options ?? []).map((sub) => `${option.name} ${sub.name}`)
              : [];
        for (const name of names) {
          const message = renderSubcommandHelp(command, name, SETTINGS);
          texts.push([`/${json.name} ${name}`, message ? textOf(message) : '']);
        }
      }
    }
    expect(texts.length).toBeGreaterThan(commands.length);
    for (const [name, text] of texts) expect(text, name).not.toMatch(BRITISH);
  });

  it('explains the commands of a meetup: when it is archived, and how its times are read', () => {
    const explained = (name: string): string => {
      const command = commands.find((c) => c.data.name === name);
      if (!command) throw new Error(`no command ${name}`);
      const texts = textDisplays(renderCommandHelp(command, SETTINGS));
      expect(texts[1]).toMatch(/^\*\*Usage\*\*/);
      return texts[0] ?? '';
    };
    expect(explained('meetup')).toContain(
      'a day after it was made, or after its last time was removed',
    );
    expect(explained('name')).toContain('renamed twice in ten minutes');
    expect(explained('info')).toContain('A form opens with the text as it is now');
    for (const name of ['meet', 'end']) {
      expect(explained(name)).toContain('month-day');
      expect(explained(name)).toContain('and otherwise today');
    }
    expect(explained('end')).toContain('after its last time was removed');
  });

  it('cuts what is too long for a message, and keeps the usage and the controls', () => {
    const command = cmd('long', 'util');
    command.help = {
      category: 'util',
      details: '*'.repeat(5_000),
      examples: Array.from({ length: 100 }, (_, i) => `/long example:${'x'.repeat(30)}${i}`),
    };
    const message = renderCommandHelp(command, SETTINGS);
    expectV2Sendable(message);
    expect(textDisplays(message)[0]).toMatch(/…$/);
    expect(textDisplays(message)[1]).toMatch(/^\*\*Usage\*\*\n`\/long`\n\*\*Examples\*\*\n/);
    expect(textDisplays(message)[1]).toMatch(/…and \d+ more$/);
    expect(buttonsOf(message)).toHaveLength(2);
  });

  it('has custom ids that fit for every command, group and subcommand of this bot', () => {
    for (const command of commands) {
      const json = command.data.toJSON();
      // The paths of its subcommands and groups, after the command's name.
      const paths = (json.options ?? []).flatMap((option) =>
        option.type === ApplicationCommandOptionType.SubcommandGroup
          ? [option.name, ...(option.options ?? []).map((sub) => `${option.name} ${sub.name}`)]
          : option.type === ApplicationCommandOptionType.Subcommand
            ? [option.name]
            : [],
      );
      for (const path of ['', ...paths]) {
        const page =
          path === ''
            ? renderCommandHelp(command, SETTINGS)
            : renderSubcommandHelp(command, path, SETTINGS);
        expect(page, `/${json.name} ${path}`).toBeDefined();
        const ids = [
          ...buttonsOf(page).map((button) => button.customId ?? ''),
          ...selectsOf(page).map((menu) => menu.customId),
        ];
        expect(ids.length, `/${json.name} ${path}`).toBeGreaterThanOrEqual(2);
        for (const id of ids) expect(id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
      }
    }
  });
});

function route(): CommandModule {
  const sub = (name: string, description: string) =>
    new SlashCommandSubcommandBuilder().setName(name).setDescription(description);
  return commandGroup({
    data: new SlashCommandBuilder().setName('route').setDescription('The route of a train'),
    help: { category: 'train' },
    groups: { saved: 'Saved routes' },
    parts: [
      { data: sub('show', 'Show the route'), execute: noop },
      {
        data: sub('add', 'Add a stop').addStringOption((o) =>
          o.setName('gym').setDescription('Gym').setRequired(true),
        ),
        help: {
          details: 'The stop goes to the end of the route.',
          examples: ['/route add gym:mall'],
        },
        execute: noop,
      },
      {
        group: 'saved',
        data: sub('load', 'Use a saved route').addStringOption((o) =>
          o.setName('name').setDescription('Route').setRequired(true),
        ),
        execute: noop,
      },
    ],
  });
}

describe('renderSubcommandHelp', () => {
  it('explains one subcommand with its own details and examples, and leads back to its command', () => {
    const message = renderSubcommandHelp(route(), 'add', SETTINGS);
    expect(textDisplays(message)).toEqual([
      '### /route add\nAdd a stop\n\nThe stop goes to the end of the route.',
      '**Usage**\n`/route add <gym>`\n**Examples**\n`/route add gym:mall`',
    ]);
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['◀ /route', 'help:command:route add:back'],
      ['All groups', 'help:command:route add:overview'],
    ]);
  });

  it('finds a subcommand inside a group, and leads back to the group', () => {
    const message = renderSubcommandHelp(route(), 'saved load', SETTINGS);
    expect(textDisplays(message)).toEqual([
      '### /route saved load\nUse a saved route',
      '**Usage**\n`/route saved load <name>`',
    ]);
    expect(buttonsOf(message).map((button) => [button.label, button.customId])).toEqual([
      ['◀ /route saved', 'help:command:route saved load:back'],
      ['All groups', 'help:command:route saved load:overview'],
    ]);
  });

  it('is undefined for a subcommand the command does not have', () => {
    expect(renderSubcommandHelp(route(), 'remove', SETTINGS)).toBeUndefined();
    expect(renderSubcommandHelp(route(), 'saved load now', SETTINGS)).toBeUndefined();
    expect(textDisplays(renderSubcommandHelp(route(), 'show', SETTINGS))[0]).toMatch(
      /^### \/route show\n/,
    );
    expect(renderSubcommandHelp(cmd('join', 'basic-raid'), 'now', SETTINGS)).toBeUndefined();
  });

  it('lists the subcommands of a group with what each does', () => {
    const message = renderSubcommandHelp(route(), 'saved', SETTINGS);
    expect(textDisplays(message)).toEqual([
      '### /route saved\nSaved routes',
      '**Usage**\n`/route saved load <name>` Use a saved route',
    ]);
    expect(buttonsOf(message)[0]?.label).toBe('◀ /route');
  });
});
