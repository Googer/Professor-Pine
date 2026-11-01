import { expect } from 'vitest';
import type { V2Message } from '../../src/discord/party-gateway.js';
import { MAX_COMPONENTS, TEXT_BUDGET } from '../../src/render/party-post.js';
import { FakePartyGateway } from './fake-gateway.js';
import { componentCount } from './messages.js';
import { isStaffRoleName } from '../../src/discord/guards.js';
import type { RoleGateway, RoleWriteOutcome } from '../../src/discord/role-gateway.js';
import {
  addedModeration,
  channelModeration,
  MODERATION_PERMISSIONS,
} from '../../src/discord/role-permissions.js';
import type { ServerRoles, StaffStanding } from '../../src/domain/roles/self-roles.js';
import { SelfRoleService } from '../../src/services/self-role-service.js';
import { FAKE_GUILD_ID, FAKE_USER_ID, type FakeOptions } from './fake-interactions.js';
import { MemorySelfRoles } from './self-roles.js';
import { Tally } from './tally.js';
import { createTestLogger } from './test-logger.js';

/** A role of the fake server, as Discord keeps it. */
interface FakeRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
  /** Everything the role grants, as Discord's bit field. */
  permissions: bigint;
}

/**
 * What a test says about a role: `moderation` names permissions as Discord's settings show
 * them (`MODERATION_PERMISSIONS`) and stands for the role's whole bit field; `permissions`
 * gives the bit field itself.
 */
type FakeRoleChange = Partial<Omit<FakeRole, 'id'>> & { moderation?: readonly string[] };

function permissionsOf(names: readonly string[]): bigint {
  let bits = 0n;
  for (const name of names) {
    const found = MODERATION_PERMISSIONS.find(([, known]) => known === name);
    if (!found) throw new Error(`"${name}" is no permission of moderation the bot knows`);
    bits |= found[0];
  }
  return bits;
}

function changed(change: FakeRoleChange): Partial<FakeRole> {
  const { moderation, ...rest } = change;
  return moderation === undefined ? rest : { ...rest, permissions: permissionsOf(moderation) };
}

/** One server of the fake gateway: its roles, the bot's standing, and who holds what. */
export class FakeRoleServer {
  readonly roles = new Map<string, FakeRole>();
  /** The roles each member holds, by user id, without `@everyone`. */
  readonly members = new Map<string, Set<string>>();
  /** What the overwrites of the server's channels allow a role, all channels together. */
  readonly allowed = new Map<string, bigint>();
  bot = { mayManageRoles: true, highestPosition: 50 };
  /** The server's owner: the member of the fake interactions unless a test says otherwise. */
  ownerId: string = FAKE_USER_ID;

  constructor(
    readonly id: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.roles.set(id, { id, name: '@everyone', position: 0, managed: false, permissions: 0n });
  }

  /** What `@everyone` grants: a role is judged by what it adds to this. */
  everyone(permissions: bigint): this {
    return this.edit(this.id, { permissions });
  }

  /** A role of the server: harmless and below the bot unless `more` says otherwise. */
  role(id: string, name: string, more: FakeRoleChange = {}): this {
    this.roles.set(id, {
      id,
      name,
      position: 5,
      managed: false,
      permissions: 0n,
      ...changed(more),
    });
    return this;
  }

  /** Changes a role as staff would in the server's settings. */
  edit(id: string, change: FakeRoleChange): this {
    const role = this.roles.get(id);
    if (!role) throw new Error(`The fake server has no role ${id}`);
    this.roles.set(id, { ...role, ...changed(change) });
    return this;
  }

  /**
   * What the settings of the server's channels allow a role from now on (the allow bits of its
   * overwrites, all channels together), as a bit field or by the names of moderation
   * permissions; nothing takes the overwrites away again.
   */
  channelAllows(id: string, allowed: bigint | readonly string[]): this {
    if (!this.roles.has(id)) throw new Error(`The fake server has no role ${id}`);
    this.allowed.set(id, typeof allowed === 'bigint' ? allowed : permissionsOf(allowed));
    return this;
  }

  /** Deletes a role; whoever held it holds it no more, and its overwrites go with it. */
  delete(id: string): this {
    this.roles.delete(id);
    this.allowed.delete(id);
    for (const held of this.members.values()) held.delete(id);
    return this;
  }

  /** Makes somebody a member holding these roles. */
  member(userId: string, ...roleIds: string[]): this {
    for (const id of roleIds) {
      if (!this.roles.has(id)) throw new Error(`The fake server has no role ${id}`);
    }
    this.members.set(userId, new Set(roleIds));
    return this;
  }

  /** The ids of the roles a member holds now, sorted. */
  held(userId: string): string[] {
    return [...(this.members.get(userId) ?? [])].sort();
  }

  /** The names of the roles a member holds now, sorted. */
  heldNames(userId: string): string[] {
    return this.held(userId)
      .map((id) => this.roles.get(id)?.name ?? id)
      .sort();
  }

  /** A member as an interaction made at this moment shows them to the service. */
  seen(userId: string = FAKE_USER_ID) {
    return { id: userId, held: this.held(userId), seenAt: this.now() };
  }

  /** A member as staff: with the roles they hold now, and Manage Roles or not. */
  staff(userId: string = FAKE_USER_ID, mayManageRoles = false): StaffStanding {
    return { id: userId, held: this.held(userId), mayManageRoles };
  }

  /**
   * What a fake interaction of this member needs to show them as Discord would at this moment:
   * the server, its roles by name, the ones the member holds, and the time. A test that keeps
   * the result has an interaction that was made then, whatever happens to the member after.
   */
  interactionOf(userId: string = FAKE_USER_ID): FakeOptions {
    return {
      guildId: this.id,
      userId,
      guildRoleNames: Object.fromEntries([...this.roles].map(([id, role]) => [id, role.name])),
      roleIds: this.held(userId),
      createdTimestamp: this.now(),
    };
  }
}

/** One request the fake gateway got. */
interface FakeRoleCall {
  guildId: string;
  memberId: string;
  action: 'give' | 'take';
  roleId: string;
  reason: string;
}

/**
 * Discord's roles for tests: servers with roles and members, kept in memory. As strict as
 * Discord about giving or taking one role: it is refused (`no-permission`) when the bot lacks
 * Manage Roles or the role is managed or stands at or above the bot's highest role, `no-role`
 * for a role the server does not have, `no-member` for somebody who is no member. Everything
 * else a member holds is left exactly as it is. It throws for a server it does not have and
 * for `@everyone` (which the caller must never send). A role's `moderation` is what its
 * permissions add to those of `@everyone`, its `channelModeration` what the overwrites of
 * channels allow it on top (`FakeRoleServer.channelAllows`), and `staffName` goes by its name,
 * all as in the real gateway. Like Discord it answers in a later turn of the event loop. `calls`
 * records every request, also a refused one, and `requests` counts them as they arrive (a test
 * awaits `requests.reached(n)` for one made in the background).
 */
export class FakeRoleGateway implements RoleGateway {
  readonly servers = new Map<string, FakeRoleServer>();
  readonly calls: FakeRoleCall[] = [];
  /** The requests that have arrived, as a count a test can wait for. */
  readonly requests = new Tally('the requests to the role gateway');
  /** The time the servers' interactions are made at; `selfRolesWith` sets its clock. */
  now: () => number = () => Date.now();
  /** Set to make every request reject, as Discord being away would. */
  failing: Error | undefined;
  /** Set to make every request be refused for this reason. */
  refusing: Exclude<RoleWriteOutcome, 'ok'> | undefined;
  /** While set, a request is answered only once this has resolved: for what happens meanwhile. */
  holding: Promise<void> | undefined;
  /**
   * Runs just before a request is answered, with the request: for what somebody else does to
   * the server between the bot's look at it and the arrival of its request.
   */
  meanwhile: ((call: FakeRoleCall) => void) | undefined;

  /** The server with this id, made when it is first asked for. */
  add(guildId: string = FAKE_GUILD_ID): FakeRoleServer {
    let server = this.servers.get(guildId);
    if (!server) {
      server = new FakeRoleServer(guildId, () => this.now());
      this.servers.set(guildId, server);
    }
    return server;
  }

  server(guildId: string): ServerRoles | undefined {
    const server = this.servers.get(guildId);
    if (!server) return undefined;
    const everyone = server.roles.get(guildId)?.permissions ?? 0n;
    return {
      roles: [...server.roles.values()].map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        everyone: role.id === guildId,
        managed: role.managed,
        moderation: addedModeration(role.permissions, everyone),
        channelModeration: channelModeration(
          role.permissions,
          server.allowed.get(role.id) ?? 0n,
          everyone,
        ),
        staffName: isStaffRoleName(role.name),
      })),
      bot: { ...server.bot },
      ownerId: server.ownerId,
    };
  }

  /** The requests so far as short texts: "give North", "take Valor" (the id of a role without a name). */
  said(guildId: string = FAKE_GUILD_ID): string[] {
    const roles = this.servers.get(guildId)?.roles;
    return this.calls
      .filter((call) => call.guildId === guildId)
      .map((call) => `${call.action} ${roles?.get(call.roleId)?.name ?? call.roleId}`);
  }

  giveRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.request({ guildId, memberId, action: 'give', roleId, reason });
  }

  takeRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.request({ guildId, memberId, action: 'take', roleId, reason });
  }

  private request(call: FakeRoleCall): Promise<RoleWriteOutcome> {
    this.calls.push(call);
    this.requests.add();
    const held = this.holding ?? Promise.resolve();
    return new Promise((resolve, reject) => {
      const answer = (): void => {
        try {
          this.meanwhile?.(call);
          if (this.failing) throw this.failing;
          resolve(this.refusing ?? this.apply(call));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      void held.then(() => setImmediate(answer));
    });
  }

  private apply({ guildId, memberId, action, roleId }: FakeRoleCall): RoleWriteOutcome {
    const server = this.servers.get(guildId);
    if (!server) throw new Error(`Unknown Guild ${guildId}`);
    if (roleId === guildId) throw new Error('@everyone is no role to give or take');
    const held = server.members.get(memberId);
    if (!held) return 'no-member';
    const role = server.roles.get(roleId);
    if (!role) return 'no-role';
    if (!server.bot.mayManageRoles || role.managed || role.position >= server.bot.highestPosition) {
      return 'no-permission';
    }
    if (action === 'give') held.add(roleId);
    else held.delete(roleId);
    return 'ok';
  }
}

/** Role ids of the sample server. */
export const ROLE = {
  north: '510000000000000001',
  south: '510000000000000002',
  east: '510000000000000003',
  instinct: '520000000000000001',
  mystic: '520000000000000002',
  valor: '520000000000000003',
  trader: '530000000000000001',
  moderator: '590000000000000001',
  admin: '590000000000000002',
  booster: '590000000000000003',
  bot: '590000000000000004',
} as const;

/**
 * A service over memory and the fake gateway, with a clock a test can move (the service's, and
 * the one the server's interactions are dated by). `server` is the server of the fake
 * interactions, owned by their member: it has region roles (North, South, East), team roles
 * (Instinct, Mystic, Valor), a role without a group (Trader), and what must never be handed
 * out (Moderator and Admin, the booster role, the bot's own role). Nothing is self-assignable
 * until a test says so; `offerSample()` adds the three kinds with their groups, regions first,
 * as the server's owner.
 */
export function selfRolesWith(kept: { storage?: MemorySelfRoles; gateway?: FakeRoleGateway } = {}) {
  const storage = kept.storage ?? new MemorySelfRoles();
  const gateway = kept.gateway ?? new FakeRoleGateway();
  const clock = { now: 1_800_000_000_000 };
  gateway.now = () => clock.now;
  const { log, entries } = createTestLogger();
  const selfRoles = new SelfRoleService({ storage, gateway, log, now: () => clock.now });
  const server = gateway.add(FAKE_GUILD_ID);
  if (!kept.gateway) {
    server
      .role(ROLE.north, 'North')
      .role(ROLE.south, 'South')
      .role(ROLE.east, 'East')
      .role(ROLE.instinct, 'Instinct')
      .role(ROLE.mystic, 'Mystic')
      .role(ROLE.valor, 'Valor')
      .role(ROLE.trader, 'Trader')
      .role(ROLE.moderator, 'Moderator', { position: 40, moderation: ['Kick Members'] })
      .role(ROLE.admin, 'Admin', { position: 60, moderation: ['Administrator'] })
      .role(ROLE.booster, 'Server Booster', { position: 30, managed: true })
      .role(ROLE.bot, 'Professor Pine', { position: 50, managed: true });
  }
  /** The server's owner, who may offer any role. */
  const owner = (): StaffStanding => ({ id: server.ownerId, held: [], mayManageRoles: false });
  /** Regions (any number of them), Teams (pick one) and Trader without a group. */
  const offerSample = async (): Promise<{ regions: number; teams: number }> => {
    const made = async (name: string, pickOne: boolean): Promise<number> => {
      const saved = await storage.saveGroup(FAKE_GUILD_ID, { name, pickOne });
      if (saved.kind === 'refused') throw new Error(`group ${name}: ${saved.reason}`);
      return saved.group.id;
    };
    const regions = await made('Regions', false);
    const teams = await made('Teams', true);
    const offer = async (roleId: string, more: object = {}): Promise<void> => {
      const added = await selfRoles.addRole(FAKE_GUILD_ID, { roleId, ...more }, owner());
      if (added.kind !== 'added') throw new Error(`role ${roleId}: ${added.kind}`);
    };
    await offer(ROLE.north, {
      groupId: regions,
      description: 'North of the river',
      aliases: ['n'],
    });
    await offer(ROLE.south, { groupId: regions });
    await offer(ROLE.east, { groupId: regions });
    await offer(ROLE.instinct, { groupId: teams });
    await offer(ROLE.mystic, { groupId: teams });
    await offer(ROLE.valor, { groupId: teams });
    await offer(ROLE.trader, { description: 'Open to trades' });
    return { regions, teams };
  };
  return { selfRoles, storage, gateway, server, clock, entries, owner, offerSample };
}

/** A select menu or a button as Discord's API has it, as far as the checks below read it. */
interface SentControl {
  type: number;
  custom_id?: string;
  label?: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  options?: { label: string; value: string; description?: string; default?: boolean }[];
}

/** Every component of a message, nested ones included (a builder by its JSON), depth first. */
function everyComponent(
  components: readonly unknown[],
): (SentControl & { components?: unknown[]; content?: string })[] {
  return components.flatMap((component) => {
    const json = (
      typeof (component as { toJSON?: unknown }).toJSON === 'function'
        ? (component as { toJSON(): unknown }).toJSON()
        : component
    ) as SentControl & { components?: unknown[]; content?: string };
    return [json, ...everyComponent(json.components ?? [])];
  });
}

/** Every component of a message, nested ones included, depth first (for what a test reads). */
export function controlsOf(message: { components?: readonly unknown[] }): SentControl[] {
  return everyComponent(message.components ?? []);
}

/** The select menus of a message with controls (in rows, or inside a container), in order. */
export function menusOf(message: {
  components?: readonly unknown[];
}): Required<Pick<SentControl, 'custom_id' | 'options'>>[] {
  return everyComponent(message.components ?? []).flatMap((control) =>
    control.type === 3 && control.custom_id !== undefined && control.options !== undefined
      ? [{ custom_id: control.custom_id, options: control.options }]
      : [],
  );
}

/** The buttons of a message with controls, in their order. */
export function buttonsOf(message: { components?: readonly unknown[] }): SentControl[] {
  return everyComponent(message.components ?? []).filter((control) => control.type === 2);
}

/** The text of a message: the text displays of a components-v2 one by lines, else its content. */
export function textOfMenus(message: {
  content?: string;
  components?: readonly unknown[];
}): string {
  const texts = everyComponent(message.components ?? []).flatMap((component) =>
    component.type === 10 && typeof component.content === 'string' ? [component.content] : [],
  );
  return texts.length === 0 ? (message.content ?? '') : texts.join('\n');
}

/**
 * Throws unless Discord would take this message: its text and its select menus and buttons,
 * checked against the limits Discord enforces (one menu or up to five buttons in a row, 25
 * options, the lengths of labels, descriptions, placeholders and custom ids, no custom id and
 * no option value twice, no more options chosen than may be); a classic message at most five
 * rows, a components-v2 message (plan 8B-4) what the fake gateway holds one to, with at most 40
 * components and the text within `TEXT_BUDGET`.
 */
export function assertSendable(message: {
  content?: string;
  components?: readonly unknown[];
}): void {
  const fail = (what: string): never => {
    throw new Error(`Discord would refuse this message: ${what}`);
  };
  const top = (message.components ?? []) as { type: number }[];
  const v2 = top.some((component) => component.type !== 1);
  if (v2) {
    const sent = { v2: true as const, components: top as V2Message['components'] };
    expect(componentCount(sent)).toBeLessThanOrEqual(MAX_COMPONENTS);
    FakePartyGateway.checkMessage(sent, TEXT_BUDGET);
  }
  const content = message.content ?? '';
  if (content.length > 2000) fail(`content of ${String(content.length)} characters`);
  const rows = (v2 ? everyComponent(top).filter((component) => component.type === 1) : top) as {
    type: number;
    components: SentControl[];
  }[];
  if (content.trim() === '' && rows.length === 0 && !v2) fail('it is empty');
  if (!v2 && rows.length > 5) fail(`${String(rows.length)} rows`);
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.type !== 1) fail(`a top-level component of type ${String(row.type)}`);
    const menus = row.components.filter((control) => control.type === 3);
    const buttons = row.components.filter((control) => control.type === 2);
    if (menus.length + buttons.length !== row.components.length) fail('an unknown control');
    if (row.components.length === 0) fail('an empty row');
    if (menus.length > 0 && row.components.length !== 1) fail('a menu sharing its row');
    if (buttons.length > 5) fail('more than five buttons in a row');
    for (const control of row.components) {
      const id = control.custom_id ?? '';
      if (id.length < 1 || id.length > 100) fail(`the custom id "${id}"`);
      if (ids.has(id)) fail(`the custom id "${id}" twice`);
      ids.add(id);
    }
    for (const button of buttons) {
      const label = button.label ?? '';
      if (label.length < 1 || label.length > 80) fail(`a button labelled "${label}"`);
    }
    for (const menu of menus) {
      const options = menu.options ?? [];
      if (options.length < 1 || options.length > 25) fail(`${String(options.length)} options`);
      if ((menu.placeholder ?? '').length > 150) fail('a placeholder of more than 150');
      const min = menu.min_values ?? 1;
      const max = menu.max_values ?? 1;
      if (min < 0 || max < 1 || min > max || max > options.length) {
        fail(`min ${String(min)}, max ${String(max)} for ${String(options.length)} options`);
      }
      const values = new Set<string>();
      for (const option of options) {
        if (option.label.length < 1 || option.label.length > 100) {
          fail(`an option labelled "${option.label}"`);
        }
        if (option.value.length < 1 || option.value.length > 100) {
          fail(`an option with the value "${option.value}"`);
        }
        if ((option.description ?? '').length > 100) fail('a description of more than 100');
        if (values.has(option.value)) fail(`the value "${option.value}" twice`);
        values.add(option.value);
      }
      const chosen = options.filter((option) => option.default === true).length;
      if (chosen > max) fail(`${String(chosen)} options chosen where ${String(max)} may be`);
    }
  }
}
