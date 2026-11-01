import { BoundedMap } from '../bounded-map.js';
import type {
  GroupSaved,
  RoleSaved,
  SelfRoleRows,
  SelfRoleStorage,
} from '../db/repositories/self-role-repository.js';
import type { RoleGateway, RoleRefusal } from '../discord/role-gateway.js';
import type { GroupInput, RoleInput } from '../domain/roles/self-role-edits.js';
import {
  buildRoster,
  displaceable,
  offerProblem,
  planChange,
  roleProblem,
  takeable,
  type ChangeRequest,
  type IntrinsicProblem,
  type OfferProblem,
  type PlannedChange,
  type RoleProblem,
  type Roster,
  type RosterEntry,
  type RosterWrites,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
  type StaffStanding,
} from '../domain/roles/self-roles.js';
import type { Logger } from '../log.js';
import { KeyedLock } from './keyed-lock.js';

/** The member of an interaction: who they are and the roles that interaction showed them with. */
export interface RoleMember {
  id: string;
  /** The ids of the roles they hold, without the role every member has. */
  held: readonly string[];
  /** When the interaction was made (its `createdTimestamp`): `held` is how Discord saw them then. */
  seenAt: number;
}

/** One request to Discord: a role given, or a role taken away. */
interface RoleStep {
  action: 'give' | 'take';
  entry: RosterEntry;
  /**
   * A take the member did not ask for: the other role of a pick-one group, when a new one was
   * given (`PlannedChange.displaced`).
   */
  unasked?: true;
}

/**
 * Why a step that was planned was not sent after all: by the time its turn came, the role had
 * a problem (`RoleProblem`), no row of the server led to it any more (`not-offered`), or the
 * bot could not see the server's roles (`unavailable`).
 */
type Withdrawal = RoleProblem | 'not-offered' | 'unavailable';

/**
 * A step that was not carried out: Discord refused it (`RoleRefusal`), `error` for a failure
 * of another kind after something of the plan had been done already (it is logged), or
 * `withdrawn` for a step Discord was never asked for, because the list or the server had
 * changed since the plan was made (`why`; `entry` is then the role as it stands now, where a
 * row still leads to it).
 */
export type RoleFailure = RoleStep &
  ({ reason: RoleRefusal | 'error' } | { reason: 'withdrawn'; why: Withdrawal });

/** What was really done of a plan. */
interface Carried {
  plan: PlannedChange;
  /** The roles that were given, in the order of the requests. */
  given: RosterEntry[];
  /** The roles that were taken away. */
  taken: RosterEntry[];
  /** What the member holds now, as far as the bot knows: for showing, never for writing. */
  held: string[];
  /**
   * What the server offers, read after the last request of the change (the newest the service
   * saw, should that reading fail): what is shown after a change is the server as it is then.
   */
  roster: Roster;
}

/**
 * What came of a member's request:
 * - `unavailable`: the bot does not know the server's roles at this moment;
 * - `refused`: the change was not begun. `busy`: the member has as many changes running or
 *   waiting as one member may (`MAX_WAITING_CHANGES`). `expired`: when its turn came, the
 *   interaction it was made with could no longer be answered, so nobody would have been told
 *   what it did;
 * - `done`: the plan was carried out (it may have been empty);
 * - `partial`: a step failed, or was withdrawn before it was sent. What had been done before it
 *   stays done (`given`, `taken`; both may be empty), `failed` is the step with the reason, and
 *   `untried` what was to follow it, which was not asked of Discord.
 */
export type RoleChangeOutcome =
  | { kind: 'unavailable' }
  | { kind: 'refused'; reason: 'busy' | 'expired' }
  | ({ kind: 'done' } & Carried)
  | ({ kind: 'partial'; failed: RoleFailure; untried: RoleStep[] } & Carried);

/** What came of staff adding a role or changing one. */
type RoleAdded =
  | { kind: 'unavailable' }
  /** The server has no such role (any more). */
  | { kind: 'no-role' }
  /** A role that is never handed out. */
  | { kind: 'unfit'; problem: IntrinsicProblem; role: ServerRole }
  /** A role this member of staff could not give anybody by hand. */
  | { kind: 'not-yours'; problem: OfferProblem; role: ServerRole }
  /** The rows refuse it: a name or an alias is taken, and the like. */
  | (Extract<RoleSaved, { kind: 'refused' }> & { role: ServerRole })
  | {
      kind: 'added' | 'changed';
      row: SelfRoleRow;
      role: ServerRole;
      /** Saved, but the bot cannot hand anything out while it lacks Manage Roles. */
      botLacksManageRoles: boolean;
    };

/** What the audit log of the server says about a change of this bot. */
const AUDIT_REASON = 'Self-assigned roles (/iam)';
/**
 * How long an interaction can be answered (the life of its token): for as long a request made
 * with it can still be waiting its turn or for Discord, so for as long the changes this service
 * made are remembered. Which of them are laid over an interaction is decided by when it was
 * made alone (`heldNow`).
 */
const INTERACTION_TOKEN_MS = 15 * 60_000;
/**
 * By how much the clock of this machine may be behind Discord's (which dates an interaction):
 * a change that finished this little before an interaction was made is still laid over it.
 */
const CLOCK_MARGIN_MS = 2_000;
/** Of as many members recent changes are remembered; the oldest go first. */
const MEMBERS_REMEMBERED = 2_000;
/**
 * How many changes of one member in one server may be running or waiting their turn at a time.
 * A member's changes run one after the other and each may take Discord a while, so more than a
 * few in line are a member clicking faster than Discord answers; the next one is refused at
 * once instead of being carried out minutes later.
 */
const MAX_WAITING_CHANGES = 3;
/**
 * For how long nothing is written for a server after the database did not take what resolving
 * its rows had found (it failed, or it changed no row: a name its collation takes for another
 * row's): every look at the rows finds the same again, and a look comes with every keystroke of
 * an autocomplete.
 */
const REMEMBER_PAUSE_MS = 60_000;

interface RecentChange {
  /** When the change was finished. */
  at: number;
  add: string[];
  remove: string[];
}

/**
 * Whether a planned step may still be sent, by a roster read just now: undefined when it may.
 * A give needs a row that leads to the role and has no problem; a take a row that leads to it
 * and that the bot can change (`takeable`), and a take the member did not ask for a role that
 * has not become one of moderation meanwhile (`displaceable`).
 */
function withdrawal(
  roster: Roster,
  step: RoleStep,
  roleId: string,
): { why: Withdrawal; entry?: RosterEntry } | undefined {
  const entry = roster.entries.find((other) => other.role?.id === roleId);
  if (!entry) {
    // Its row may still be there without the role (deleted on Discord): the row says why.
    const row = roster.entries.find((other) => other.row.id === step.entry.row.id);
    return row?.problem !== undefined && row.role === undefined
      ? { why: row.problem, entry: row }
      : { why: 'not-offered' };
  }
  if (step.action === 'give') {
    return entry.problem === undefined ? undefined : { why: entry.problem, entry };
  }
  const stands = step.unasked ? displaceable(entry) : takeable(entry);
  return stands ? undefined : { why: entry.problem ?? 'gone', entry };
}

/**
 * Self-assigned roles (`ctx.selfRoles`): the rows of the database resolved against the roles a
 * server has, and what members and staff do with them. Commands and menus both go through it;
 * neither touches the storage or the gateway.
 *
 * A member's roles are changed one role at a time (`RoleGateway.giveRole`, `takeRole`), first
 * what is given, then what is taken away, and only roles a row of the server leads to: nothing
 * else a member holds is ever named to Discord, so whatever anybody else changed about the
 * member meanwhile stays as it is. The steps are not one transaction: when one fails, the ones
 * before it stay done, the ones after it are not tried, and the outcome says exactly that.
 *
 * The rule of what may be handed out is asked for every step at the moment it is sent, not only
 * when the plan is made: requests take time (Discord may make the bot wait), and a role can gain
 * a permission or leave the list while an earlier step is on its way. So the roster is read
 * again before every step that follows a request, and a step that no longer stands is withdrawn.
 * And because a roster is read with waits in it (the database, the write of what resolving
 * found), the rule is asked once more of the server's roles as they are in the very turn a role
 * is given (`unfitNow`), with nothing awaited between that look and the request.
 *
 * What a member holds is what their interaction showed. A second interaction can be made before
 * the first one's requests have arrived at Discord, so the changes this service finished for a
 * member after an interaction was made are laid over what it shows (`heldNow`): for planning
 * and for what is shown, never for what is written. They are remembered for as long as an
 * interaction can be answered. A member's requests run one after the other, a few at most in
 * line (`MAX_WAITING_CHANGES`), and one whose interaction has run out by the time its turn comes
 * is dropped.
 */
export class SelfRoleService {
  private readonly storage: SelfRoleStorage;
  private readonly gateway: RoleGateway;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly lock = new KeyedLock<string>();
  /** Per member of a server; set in the order of the newest change's time. */
  private readonly recent = new BoundedMap<string, RecentChange[]>(MEMBERS_REMEMBERED);
  /** How many changes of a member of a server are running or waiting; no entry for none. */
  private readonly inLine = new Map<string, number>();
  /** The write of what resolving found that is on its way, per server. */
  private readonly remembering = new Map<string, Promise<void>>();
  /** Until when nothing is written for a server (`REMEMBER_PAUSE_MS`). */
  private readonly rememberPaused = new Map<string, number>();

  constructor(options: {
    storage: SelfRoleStorage;
    gateway: RoleGateway;
    log: Logger;
    now?: () => number;
  }) {
    this.storage = options.storage;
    this.gateway = options.gateway;
    this.log = options.log;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * What a server offers, resolved against its roles as they are now; undefined when the bot
   * does not know the server's roles at this moment. The roles are read after the rows, so that
   * what the database's answer took in time is not missing from them. What resolving found (the
   * id of a legacy row, a role's new name) is written on the way; a failure of that is logged
   * and changes nothing about the answer. `remember` says whether the answer waits for that
   * write (`wait`) or the write is left to finish by itself (`aside`: for an autocomplete,
   * which has no time to wait for a database that is slow to write).
   */
  async roster(guildId: string, remember: 'wait' | 'aside' = 'wait'): Promise<Roster | undefined> {
    // Nothing is asked of the database for a server the bot does not know.
    if (!this.gateway.server(guildId)) return undefined;
    const { rows, groups } = await this.storage.list(guildId);
    const server = this.gateway.server(guildId);
    if (!server) return undefined;
    const { roster, writes } = buildRoster(rows, groups, server);
    if (writes.links.length > 0 || writes.renames.length > 0) {
      const written = this.remembered(guildId, writes);
      if (remember === 'wait') await written;
    }
    return roster;
  }

  /**
   * Writes what resolving found; never rejects. One write per server at a time: a look that
   * comes while one is on its way waits for that one at most, and what it found itself is found
   * again by the next look. Nothing is written while the server's writes are paused.
   */
  private remembered(guildId: string, writes: RosterWrites): Promise<void> {
    const running = this.remembering.get(guildId);
    if (running) return running;
    const now = this.now();
    if ((this.rememberPaused.get(guildId) ?? 0) > now) return Promise.resolve();
    this.rememberPaused.delete(guildId);
    const writing = (async (): Promise<void> => {
      try {
        const written = await this.storage.remember(guildId, writes);
        if (written > 0) {
          this.log.info(
            { guild: guildId, linked: writes.links.length, renamed: writes.renames.length },
            'self-assigned roles brought up to date with the server',
          );
        } else {
          this.rememberPaused.set(guildId, now + REMEMBER_PAUSE_MS);
        }
      } catch (err) {
        this.rememberPaused.set(guildId, now + REMEMBER_PAUSE_MS);
        this.log.warn({ err, guild: guildId }, 'could not remember resolved roles');
      } finally {
        this.remembering.delete(guildId);
      }
    })();
    this.remembering.set(guildId, writing);
    return writing;
  }

  /**
   * Why a role may not be given in this very turn, by the server's roles as they are now;
   * undefined when it may. Synchronous on purpose: the caller sends the request in the same
   * turn, so nothing can change between this look and the request leaving.
   */
  private unfitNow(
    guildId: string,
    entry: RosterEntry,
    roleId: string,
  ): { why: Withdrawal; entry: RosterEntry } | undefined {
    const server = this.gateway.server(guildId);
    if (!server) return { why: 'unavailable', entry };
    const role = server.roles.find((other) => other.id === roleId);
    if (!role) return { why: 'gone', entry: { ...entry, role: undefined, problem: 'gone' } };
    const problem = roleProblem(role, server.bot);
    return problem === undefined
      ? undefined
      : { why: problem, entry: { ...entry, role, name: role.name, problem } };
  }

  /** The rows and groups as stored, whatever the server's roles are: for staff's lists. */
  stored(guildId: string): Promise<SelfRoleRows> {
    return this.storage.list(guildId);
  }

  /**
   * The roles a member holds now, as far as the bot knows: those their interaction showed, with
   * the changes this service finished for them after that interaction was made laid over (in
   * their order). For planning a change and for what a member is shown; nothing is ever written
   * to Discord from it.
   */
  heldNow(guildId: string, member: RoleMember): string[] {
    const held = new Set(member.held);
    for (const change of this.recentOf(`${guildId}:${member.id}`)) {
      if (change.at <= member.seenAt - CLOCK_MARGIN_MS) continue;
      for (const id of change.remove) held.delete(id);
      for (const id of change.add) held.add(id);
    }
    return [...held];
  }

  private recentOf(key: string): RecentChange[] {
    const changes = this.recent.get(key);
    if (!changes) return [];
    const fresh = changes.filter((change) => change.at > this.now() - INTERACTION_TOKEN_MS);
    if (fresh.length === 0) this.recent.delete(key);
    return fresh;
  }

  private remember(key: string, given: readonly RosterEntry[], taken: readonly RosterEntry[]) {
    const ids = (entries: readonly RosterEntry[]): string[] =>
      entries.flatMap((entry) => (entry.role ? [entry.role.id] : []));
    const now = this.now();
    // Every entry ends with its newest change, and the newest change of all is set last.
    this.recent.dropWhile((changes) => (changes.at(-1)?.at ?? 0) <= now - INTERACTION_TOKEN_MS);
    this.recent.set(key, [...this.recentOf(key), { at: now, add: ids(given), remove: ids(taken) }]);
  }

  /**
   * Gives a member roles and takes roles away, as far as `planChange` allows it: one request to
   * Discord per role, what is given first, and none when nothing changes. It stops at the first
   * step that fails (so a role of a pick-one group is not taken away when the one that was to
   * replace it could not be given), and before a step that no longer stands when its turn
   * comes (`withdrawal`, `unfitNow`). A failure Discord does not explain is thrown when nothing
   * was done yet, and reported like a refusal when something was.
   *
   * It is refused at once while the member has `MAX_WAITING_CHANGES` changes running or waiting
   * in this server, and dropped when its turn comes only after its interaction has run out.
   */
  change(guildId: string, member: RoleMember, request: ChangeRequest): Promise<RoleChangeOutcome> {
    const key = `${guildId}:${member.id}`;
    const ahead = this.inLine.get(key) ?? 0;
    if (ahead >= MAX_WAITING_CHANGES) {
      this.log.debug(
        { guild: guildId, member: member.id, ahead },
        'a change of self-assigned roles was refused: too many of the member are under way',
      );
      return Promise.resolve({ kind: 'refused', reason: 'busy' });
    }
    this.inLine.set(key, ahead + 1);
    const left = (): void => {
      const still = (this.inLine.get(key) ?? 1) - 1;
      if (still > 0) this.inLine.set(key, still);
      else this.inLine.delete(key);
    };
    return this.lock.run(key, async (): Promise<RoleChangeOutcome> => {
      try {
        return await this.changeNow(guildId, key, member, request);
      } finally {
        left();
      }
    });
  }

  /** A member's change whose turn has come. */
  private async changeNow(
    guildId: string,
    key: string,
    member: RoleMember,
    request: ChangeRequest,
  ): Promise<RoleChangeOutcome> {
    if (member.seenAt + INTERACTION_TOKEN_MS <= this.now()) {
      this.log.debug(
        { guild: guildId, member: member.id, waitedMs: this.now() - member.seenAt },
        'a change of self-assigned roles came too late',
      );
      return { kind: 'refused', reason: 'expired' };
    }
    let roster = await this.roster(guildId);
    if (!roster) return { kind: 'unavailable' };
    const held = new Set(this.heldNow(guildId, member));
    const plan = planChange(roster, held, request);
    const steps: RoleStep[] = [
      ...plan.add.map((entry) => ({ action: 'give' as const, entry })),
      ...plan.remove.map((entry) => ({
        action: 'take' as const,
        entry,
        ...(plan.displaced.includes(entry) ? { unasked: true as const } : {}),
      })),
    ];
    const given: RosterEntry[] = [];
    const taken: RosterEntry[] = [];
    let failed: RoleFailure | undefined;
    let tried = 0;
    /** Whether a request went to Discord since `roster` was read: it took time. */
    let aged = false;
    for (const step of steps) {
      tried += 1;
      const roleId = step.entry.role?.id;
      if (roleId === undefined) continue;
      let outcome: RoleRefusal | 'error' | 'ok';
      try {
        if (aged) {
          const fresh = await this.roster(guildId);
          aged = false;
          if (fresh) roster = fresh;
          const stopped = fresh ? withdrawal(fresh, step, roleId) : { why: 'unavailable' as const };
          if (stopped) {
            failed = {
              action: step.action,
              entry: stopped.entry ?? step.entry,
              reason: 'withdrawn',
              why: stopped.why,
            };
            break;
          }
        }
        if (step.action === 'give') {
          const unfit = this.unfitNow(guildId, step.entry, roleId);
          if (unfit) {
            failed = { action: 'give', entry: unfit.entry, reason: 'withdrawn', why: unfit.why };
            break;
          }
        }
        aged = true;
        outcome =
          step.action === 'give'
            ? await this.gateway.giveRole(guildId, member.id, roleId, AUDIT_REASON)
            : await this.gateway.takeRole(guildId, member.id, roleId, AUDIT_REASON);
      } catch (err) {
        if (given.length + taken.length === 0) throw err;
        this.log.error(
          { err, guild: guildId, member: member.id, role: step.entry.name, action: step.action },
          'a change of self-assigned roles failed half-way',
        );
        outcome = 'error';
      }
      if (outcome !== 'ok') {
        failed = { ...step, reason: outcome };
        break;
      }
      if (step.action === 'give') {
        given.push(step.entry);
        held.add(roleId);
      } else {
        taken.push(step.entry);
        held.delete(roleId);
      }
    }
    const names = (entries: readonly RosterEntry[]): string[] => entries.map((entry) => entry.name);
    if (given.length + taken.length > 0) {
      this.remember(key, given, taken);
      this.log.info(
        { guild: guildId, member: member.id, added: names(given), removed: names(taken) },
        'self-assigned roles changed',
      );
    }
    if (aged || failed?.reason === 'withdrawn') {
      // What is shown after the change is the server as it is after it.
      try {
        roster = (await this.roster(guildId)) ?? roster;
      } catch (err) {
        this.log.warn({ err, guild: guildId }, 'could not read the roles after a change');
      }
    }
    const carried = { plan, given, taken, held: [...held], roster };
    if (!failed) return { kind: 'done', ...carried };
    const untried = steps.slice(tried);
    this.log.warn(
      {
        guild: guildId,
        member: member.id,
        action: failed.action,
        role: failed.entry.name,
        reason: failed.reason,
        ...(failed.reason === 'withdrawn' ? { why: failed.why } : {}),
        untried: untried.map((step) => `${step.action} ${step.entry.name}`),
      },
      failed.reason === 'withdrawn'
        ? 'a change of self-assigned roles was stopped'
        : 'Discord refused a change of self-assigned roles',
    );
    return { kind: 'partial', failed, untried, ...carried };
  }

  /**
   * Staff make a role of the server self-assignable, or change what is said about one that is.
   * A role that is never handed out is refused here, with the reason; the same is asked again
   * every time a role is given. Nor may staff offer a role they could not give anybody by hand
   * (`offerProblem`): the list must not be a way around the server's order of roles.
   *
   * The rows are resolved first, which writes the names the listed roles have now: the new
   * role's name is compared with those, not with what a role was called when somebody last
   * looked. The roles of the server are read after that, with nothing awaited between that look
   * and the checks.
   */
  async addRole(
    guildId: string,
    input: Omit<RoleInput, 'role'> & { roleId: string },
    staff: StaffStanding,
  ): Promise<RoleAdded> {
    if (!(await this.roster(guildId))) return { kind: 'unavailable' };
    const server = this.gateway.server(guildId);
    if (!server) return { kind: 'unavailable' };
    const role = server.roles.find((other) => other.id === input.roleId);
    if (!role) return { kind: 'no-role' };
    const problem = roleProblem(role, server.bot);
    if (problem !== undefined && problem !== 'no-manage-roles') {
      return { kind: 'unfit', problem, role };
    }
    const notTheirs = offerProblem(role, server, staff);
    if (notTheirs) return { kind: 'not-yours', problem: notTheirs, role };
    const { roleId: _roleId, ...said } = input;
    const saved = await this.storage.saveRole(guildId, {
      ...said,
      role: { id: role.id, name: role.name },
      live: server.roles.map((other) => other.id),
    });
    if (saved.kind === 'refused') return { ...saved, role };
    this.log.info(
      { guild: guildId, role: role.name, kind: saved.kind, by: staff.id },
      'self-assigned role saved',
    );
    return {
      kind: saved.kind,
      row: saved.row,
      role,
      botLacksManageRoles: problem === 'no-manage-roles',
    };
  }

  /** Staff take a row away; the Discord role and whoever holds it are left alone. */
  async removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined> {
    const removed = await this.storage.removeRole(guildId, rowId);
    if (removed)
      this.log.info({ guild: guildId, role: removed.name }, 'self-assigned role removed');
    return removed;
  }

  saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    return this.storage.saveGroup(guildId, input);
  }

  removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined> {
    return this.storage.removeGroup(guildId, groupId);
  }

  /**
   * Resolves once no member's change is running or waiting and nothing is being written on the
   * side; for tests and for shutdown.
   */
  async idle(): Promise<void> {
    do {
      await this.lock.whenIdle();
      await Promise.all([...this.remembering.values()]);
    } while (this.lock.size > 0 || this.remembering.size > 0);
  }
}
