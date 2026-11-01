import {
  ApplicationCommandOptionType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '../../test/support/test-context.js';
import { commandGroup, type SubcommandPart } from './command-group.js';
import { declaredSubcommands, enabledCommands, subcommandPath, type Guard } from './command.js';
import { InteractionRouter } from './router.js';

const sub = (name: string) =>
  new SlashCommandSubcommandBuilder().setName(name).setDescription(name);
const part = (name: string, extra: Partial<SubcommandPart> = {}): SubcommandPart => ({
  data: sub(name),
  execute: vi.fn(() => Promise.resolve()),
  ...extra,
});
const admin = () => new SlashCommandBuilder().setName('admin').setDescription('Administration');
const help = { category: 'admin' } as const;

describe('subcommandPath', () => {
  it('spells a path with and without a group', () => {
    expect(subcommandPath(null, 'create')).toBe('create');
    expect(subcommandPath('boss', 'add')).toBe('boss add');
    expect(subcommandPath(null, null)).toBe('');
  });
});

describe('commandGroup', () => {
  it('adds every part to the definition and keys its handler by path', () => {
    const addRan = vi.fn(() => Promise.resolve());
    const setup = part('setup-forums');
    const add = part('add', { group: 'boss', execute: addRan });
    const hide = part('hide', { group: 'boss' });
    const command = commandGroup({
      data: admin(),
      help,
      groups: { boss: 'Raid bosses' },
      parts: [add, setup, hide],
    });

    expect([...command.subcommands.keys()]).toEqual(['boss add', 'setup-forums', 'boss hide']);
    expect(command.subcommands.get('boss add')).toMatchObject({ execute: addRan });
    const json = command.data.toJSON();
    expect(declaredSubcommands(json.options)).toEqual(['setup-forums', 'boss add', 'boss hide']);
    expect(json.options?.[1]).toMatchObject({
      type: ApplicationCommandOptionType.SubcommandGroup,
      name: 'boss',
      description: 'Raid bosses',
    });
  });

  it('keeps the guards, help and autocomplete of a part, and the guards of the command', () => {
    const everywhere: Guard = () => undefined;
    const here: Guard = () => undefined;
    const autocomplete = vi.fn(() => Promise.resolve());
    const command = commandGroup({
      data: admin(),
      help,
      guards: [everywhere],
      parts: [part('sync', { guards: [here], autocomplete, help: { details: 'Reads the feed.' } })],
    });
    expect(command.guards).toEqual([everywhere]);
    expect(command).not.toHaveProperty('enabled');
    expect(command.subcommands.get('sync')).toMatchObject({
      guards: [here],
      autocomplete,
      help: { details: 'Reads the feed.' },
    });
    expect(command.subcommands.get('sync')).not.toHaveProperty('data');
    expect(command.subcommands.get('sync')).not.toHaveProperty('group');
  });

  it('keeps the condition under which the command is offered', () => {
    const enabled = () => false;
    expect(commandGroup({ data: admin(), help, enabled, parts: [part('sync')] }).enabled).toBe(
      enabled,
    );
  });

  it('leaves out the subcommands an installation is not set up for', () => {
    const { ctx } = createTestContext();
    const on = ctx.config;
    const off = {
      ...on,
      settings: { ...on.settings, features: { ...on.settings.features, roles: false } },
    };
    const roles = (config: typeof on) => config.settings.features.roles;
    const command = commandGroup({
      data: admin(),
      help,
      groups: { 'self-roles': 'Roles', boss: 'Raid bosses' },
      parts: [
        part('setup-forums'),
        part('add', { group: 'self-roles', enabled: roles }),
        part('list', { group: 'self-roles', enabled: roles }),
        part('add', { group: 'boss' }),
        part('export-roles', { enabled: roles }),
      ],
    });
    expect(command.subcommands.get('self-roles add')).not.toHaveProperty('enabled');

    const [whole] = enabledCommands([command], on);
    expect(whole).toBe(command);

    const [narrowed] = enabledCommands([command], off);
    expect([...(narrowed?.subcommands?.keys() ?? [])]).toEqual(['setup-forums', 'boss add']);
    const json = narrowed?.data.toJSON();
    expect(declaredSubcommands(json?.options)).toEqual(['setup-forums', 'boss add']);
    expect(json).toMatchObject({ name: 'admin', description: 'Administration' });
    // A router takes it: what it declares is what it handles.
    expect(() => new InteractionRouter(ctx, narrowed ? [narrowed] : [], [])).not.toThrow();
    // The command itself is unchanged.
    expect(declaredSubcommands(command.data.toJSON().options)).toHaveLength(5);
  });

  it('has nothing to narrow when no subcommand depends on the configuration', () => {
    expect(commandGroup({ data: admin(), help, parts: [part('sync')] })).not.toHaveProperty(
      'forConfig',
    );
  });

  it('refuses a configuration that leaves a command without subcommands', () => {
    const { ctx } = createTestContext();
    const command = commandGroup({
      data: admin(),
      help,
      parts: [part('sync', { enabled: () => false })],
    });
    expect(() => enabledCommands([command], ctx.config)).toThrow(
      '/admin has no subcommands left in this configuration',
    );
  });

  it('refuses a definition that Discord or the router could not use', () => {
    expect(() =>
      commandGroup({ data: admin(), help, parts: [part('sync'), part('sync')] }),
    ).toThrow('Duplicate subcommand /admin sync');
    expect(() =>
      commandGroup({ data: admin(), help, parts: [part('add', { group: 'boss' })] }),
    ).toThrow('/admin boss add: no group "boss" is defined');
    expect(() =>
      commandGroup({ data: admin(), help, groups: { boss: 'Raid bosses' }, parts: [part('sync')] }),
    ).toThrow('/admin: group "boss" has no subcommands');
    expect(() => commandGroup({ data: admin(), help, parts: [] })).toThrow(
      '/admin has no subcommands',
    );
  });
});

describe('declaredSubcommands', () => {
  it('is empty for a command with ordinary options only', () => {
    const json = new SlashCommandBuilder()
      .setName('raid')
      .setDescription('Report a raid')
      .addStringOption((option) => option.setName('boss').setDescription('The boss'))
      .toJSON();
    expect(declaredSubcommands(json.options)).toEqual([]);
    expect(declaredSubcommands(undefined)).toEqual([]);
  });
});
