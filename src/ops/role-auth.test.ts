import { describe, expect, it } from 'vitest';
import { commands } from '../commands/index.js';
import {
  exportJson,
  exportText,
  LEGACY_COMMANDS,
  newCommandOf,
  roleAuthExport,
} from './role-auth.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';

/**
 * The `name` of every command under the legacy `commands/` (107 files, read on 2026-10-14), and
 * the built-in commands of discord.js-commando that `index.js` registered.
 */
const LEGACY_NAMES = [
  'aar',
  'add-pokemon-nickname',
  'add-role',
  'asar',
  'auto',
  'auto-set',
  'boss',
  'boss-set-notification',
  'boss-tier',
  'bounds',
  'cancel-meet',
  'clear-image-cache',
  'conductor',
  'counters',
  'create-gym',
  'delete',
  'delete-gym',
  'done',
  'duration',
  'edit-gym',
  'export-tsvs',
  'find',
  'find-gym',
  'find-nickname',
  'friend-code',
  'geocode',
  'group',
  'gym',
  'gym-detail',
  'gym-places',
  'gym-queue',
  'hatch',
  'help',
  'here',
  'howmany',
  'iam',
  'iamnot',
  'import',
  'import-gyms',
  'info',
  'join',
  'label',
  'leave',
  'left',
  'local',
  'lsar',
  'maps',
  'mark-not-shiny',
  'mark-shiny',
  'maybe',
  'meet',
  'meetup',
  'mentions',
  'mentions-groups',
  'mentions-shouts',
  'mentions-train-stops',
  'moveset',
  'name',
  'new',
  'new-train-notification',
  'next',
  'not-conductor',
  'not-here',
  'populate-raid-bosses',
  'previous',
  'privacy',
  'raid',
  'raid-boss',
  'raid-bosses',
  'rank',
  'rare',
  'register-friend-code',
  'register-nickname',
  'register-silph',
  'remote',
  'remove-role',
  'request',
  'require-role',
  'route',
  'route-add',
  'route-clear',
  'route-edit',
  'route-remove',
  'rsar',
  'save-party',
  'save-route',
  'setbounds',
  'shout',
  'show-role-authorization',
  'show-role-authorizations',
  'silph-card',
  'skip',
  'spawn',
  'status',
  'target',
  'targets',
  'train',
  'train-finished',
  'untarget',
  'untarget-all',
  'unwant',
  'unwant-all',
  'use-route',
  'view-member-settings',
  'want',
  'wants',
  'where',
];
const COMMANDO_NAMES = [
  'groups',
  'enable',
  'disable',
  'load',
  'unload',
  'reload',
  'ping',
  'unknown-command',
];

describe('the mapping of legacy commands', () => {
  it('maps every command the legacy bot had, and nothing else', () => {
    expect(LEGACY_NAMES).toHaveLength(107);
    for (const name of [...LEGACY_NAMES, ...COMMANDO_NAMES]) {
      expect(newCommandOf(name), name).toBeDefined();
    }
    expect(Object.keys(LEGACY_COMMANDS).sort()).toEqual(
      [...LEGACY_NAMES, ...COMMANDO_NAMES].sort(),
    );
  });

  it('maps the route commands to /route and the framework ones as dropped', () => {
    for (const name of ['route-add', 'route-clear', 'route-edit', 'route-remove']) {
      expect(newCommandOf(name)).toEqual({ kind: 'slash', commands: ['/route'] });
    }
    expect(newCommandOf('ping')).toMatchObject({ kind: 'dropped' });
    expect(newCommandOf('wild')).toBeUndefined();
  });

  const built = new Set(commands.map((command) => `/${command.data.name}`));

  it('names only commands the new bot has for what it became', () => {
    for (const [legacy, becomes] of Object.entries(LEGACY_COMMANDS)) {
      if (becomes.kind !== 'slash') continue;
      for (const command of becomes.commands) {
        expect(built.has(command), `${legacy} -> ${command}`).toBe(true);
      }
    }
  });

  it('names every other form of a command wherever it names the command: staff set each', () => {
    const forms = commands.flatMap((command) =>
      command.formOf === undefined ? [] : [[`/${command.formOf}`, `/${command.data.name}`]],
    );
    expect(forms).toContainEqual(['/interested', '/hmm']);
    expect(forms).toContainEqual(['/join', '/coming']);
    expect(forms).toContainEqual(['/rank', '/great']);
    for (const [legacy, becomes] of Object.entries(LEGACY_COMMANDS)) {
      if (becomes.kind !== 'slash') continue;
      for (const [original, form] of forms) {
        if (original !== undefined && becomes.commands.includes(original)) {
          expect(becomes.commands, `${legacy}: ${form} beside ${original}`).toContain(form);
        }
      }
    }
    expect(newCommandOf('maybe')).toEqual({ kind: 'slash', commands: ['/interested', '/hmm'] });
    expect(newCommandOf('rank')).toEqual({
      kind: 'slash',
      commands: ['/rank', '/little', '/great', '/ultra', '/master'],
    });
  });

  it('knows the legacy names of the spec, without regard to case', () => {
    expect(newCommandOf('meetup')).toEqual({ kind: 'slash', commands: ['/meetup'] });
    expect(newCommandOf(' Left ')).toEqual({ kind: 'slash', commands: ['/end'] });
    expect(newCommandOf('gym')).toEqual({ kind: 'slash', commands: ['/location'] });
    expect(newCommandOf('spawn')).toEqual({ kind: 'slash', commands: ['/wild'] });
    expect(newCommandOf('require-role')).toMatchObject({ kind: 'dropped' });
    expect(newCommandOf('counters')).toEqual({ kind: 'slash', commands: ['/counters'] });
    expect(newCommandOf('find')).toEqual({ kind: 'slash', commands: ['/find-region'] });
    expect(newCommandOf('toString')).toBeUndefined();
    expect(newCommandOf('nonsense')).toBeUndefined();
  });
});

describe('roleAuthExport', () => {
  it('keeps what is required or has roles, by server, with its warnings', () => {
    const servers = roleAuthExport([
      { guild: HOME, command: 'meetup', roleRequired: true, roleIds: ['501', '502'] },
      { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
      { guild: HOME, command: 'raid', roleRequired: false, roleIds: ['503'] },
      { guild: HOME, command: 'shout', roleRequired: false, roleIds: [] },
      { guild: HOME, command: 'shout2', roleRequired: null, roleIds: [] },
      { guild: AWAY, command: 'oddity', roleRequired: true, roleIds: ['504'] },
    ]);
    expect(servers).toEqual([
      {
        guild: HOME,
        commands: [
          {
            command: 'meetup',
            required: true,
            roleIds: ['501', '502'],
            becomes: { kind: 'slash', commands: ['/meetup'] },
            warnings: [],
          },
          {
            command: 'train',
            required: true,
            roleIds: [],
            becomes: { kind: 'slash', commands: ['/train'] },
            warnings: ['staff-only'],
          },
          {
            command: 'raid',
            required: false,
            roleIds: ['503'],
            becomes: { kind: 'slash', commands: ['/raid'] },
            warnings: ['no-effect'],
          },
        ],
      },
      {
        guild: AWAY,
        commands: [
          {
            command: 'oddity',
            required: true,
            roleIds: ['504'],
            becomes: undefined,
            warnings: ['unknown-command'],
          },
        ],
      },
    ]);
  });
});

describe('exportText and exportJson', () => {
  const servers = roleAuthExport([
    { guild: HOME, command: 'meetup', roleRequired: true, roleIds: ['501', '502'] },
    { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
    { guild: HOME, command: 'rare', roleRequired: false, roleIds: ['503'] },
    { guild: AWAY, command: 'find', roleRequired: true, roleIds: ['504'] },
  ]);

  it('prints a block per server, says that role names are not looked up', () => {
    const text = exportText(servers);
    expect(text).toContain('this export does not ask Discord for their names');
    expect(text).toContain(
      `Server ${HOME}\n` +
        '  meetup: required, roles 501, 502 -> /meetup\n' +
        '  train: required, no roles -> /train\n' +
        '    warning: required with no role listed: only staff could use it\n' +
        '  rare: not required, roles 503 -> dropped: /want and /wild take any Pokémon\n' +
        '    warning: roles are listed but none is required: they had no effect\n',
    );
    expect(text).toContain(`Server ${AWAY}\n  find: required, roles 504 -> /find-region\n`);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('says when there is nothing to export', () => {
    expect(exportText([])).toContain(
      'No server requires a role for any command, and no command has roles listed.',
    );
  });

  it('gives the same as JSON', () => {
    const json = JSON.parse(exportJson(servers)) as { note: string; servers: unknown[] };
    expect(json.note).toContain('does not ask Discord');
    expect(json.servers).toEqual(JSON.parse(JSON.stringify(servers)));
  });
});
