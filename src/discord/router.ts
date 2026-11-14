import { randomBytes } from 'node:crypto';
import {
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type CommandInteractionOption,
  type Interaction,
  type MessageComponentInteraction,
  type MessageContextMenuCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../app-context.js';
import {
  declaredSubcommands,
  isMessageCommand,
  MAX_OPTION_TEXT,
  subcommandPath,
  type CommandHandler,
  type CommandModule,
  type ComponentHandler,
  type ControlThrottle,
  type Guard,
  type GuardableInteraction,
  type LocatedInteraction,
  type MessageCommand,
} from './command.js';
import { channelContext } from './channel-context.js';
import { decodeCustomId, type CustomId } from './custom-id.js';
import { UserError } from './errors.js';
import { answerApart, deferLate, LATE_DEFER_MS } from './late-reply.js';
import { Throttles, waitText, type Throttle } from './throttle.js';
import { LockOverdueError } from '../services/keyed-lock.js';
import { REHEARSAL_REFUSAL } from '../services/rehearsal.js';
import { BEING_READIED, inSetupWords, notSetUpIn, notSetUpWords } from './set-up.js';
import { isServerAdmin } from './guards.js';

export const STALE_COMPONENT = 'This no longer works.';
/**
 * What a member is told whose change waited for an earlier one that has not settled in time
 * (`LockOverdueError`: a save that does not answer). None of their doing: the use goes back.
 */
export const STILL_BUSY = 'I am still busy with an earlier change to this. Try again in a moment.';

/**
 * Whether any option of an interaction, the one being typed or one filled in before, under a
 * subcommand or not, holds a text longer than an option takes (`MAX_OPTION_TEXT`).
 */
function overlong(options: readonly CommandInteractionOption[]): boolean {
  return options.some(
    (option) =>
      (typeof option.value === 'string' && option.value.length > MAX_OPTION_TEXT) ||
      (option.options !== undefined && overlong(option.options)),
  );
}

/** What the router answers: a command (slash or message) or a control. */
type Answered = GuardableInteraction | MessageContextMenuCommandInteraction;
const UNKNOWN_COMMAND = 'That command is not available.';
/** Discord refuses a message longer than this. */
const MESSAGE_LIMIT = 2000;
const genericError = (ref: string) =>
  `Something went wrong. Try again in a moment; if it happens again, tell staff the code \`${ref}\`.`;

/**
 * Tells the member something only they can see, whatever was sent before. After a public
 * deferral with no answer yet, the "thinking…" message is removed first: the first follow-up
 * would take its place and be as public as the deferral.
 */
export async function replyEphemeral(interaction: Answered, content: string): Promise<void> {
  const payload = {
    content: content.length > MESSAGE_LIMIT ? `${content.slice(0, MESSAGE_LIMIT - 1)}…` : content,
    flags: MessageFlags.Ephemeral,
  } as const;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply(payload);
    return;
  }
  // If deleting the public "thinking…" message fails, this throws and the follow-up is deliberately
  // not sent: a follow-up to a pending public deferral takes its place and would make the error
  // public. The caller only logs the failure.
  if (!interaction.replied && interaction.ephemeral === false) await interaction.deleteReply();
  await interaction.followUp(payload);
}

/** Answer options with the Ephemeral flag added (text, or options with numeric flags). */
function ephemeral(options: unknown): unknown {
  const given: Record<string, unknown> =
    typeof options === 'string'
      ? { content: options }
      : typeof options === 'object' && options !== null
        ? { ...(options as Record<string, unknown>) }
        : {};
  const flags = typeof given.flags === 'number' ? given.flags : 0;
  return { ...given, flags: flags | MessageFlags.Ephemeral };
}

/**
 * The interaction with every reply, deferral and follow-up made private (rehearsal mode,
 * `answeredInRehearsal`); everything else is the interaction's own.
 */
function privately<T extends object>(interaction: T): T {
  return new Proxy(interaction, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => unknown;
      if (key === 'reply' || key === 'deferReply' || key === 'followUp') {
        return (options?: unknown) => method.call(target, ephemeral(options));
      }
      return method.bind(target);
    },
  });
}

export interface RouterOptions {
  /** The clock the throttles use; epoch milliseconds. */
  now?: () => number;
  /** How old an interaction is when a `late` command is acknowledged. Default `LATE_DEFER_MS`. */
  lateDeferMs?: number;
  /** Starts the timer of a late acknowledgement and gives what cancels it. For tests. */
  setTimer?: (run: () => void, ms: number) => () => void;
  /**
   * Where the uses of commands and controls are counted; a router of its own by default. The
   * bot shares it with the live map, whose presses count as the post's controls (plan 8M-3).
   */
  throttles?: Throttles;
}

/**
 * The window in which the uses of a kind of control are counted (`Throttles`), unless its limit
 * counts as a command's: the live map counts its presses of a party's buttons there too.
 */
export function controlThrottleKey(kind: string): string {
  return `component:${kind}`;
}

/**
 * The window of a command or control whose limit depends on the use (`throttle` a function, as
 * `/meet`'s in a timed party): each limit is counted apart, under the key and the limit. The live
 * map counts its uses there too (plan 8M-5M: a meetup's start in `/meet`'s).
 */
export function variedThrottleKey(key: string, throttle: Throttle): string {
  return `${key}\n${throttle.perSeconds}/${throttle.uses}`;
}

/** When the router counted the use of each command or control it runs, by the router's clock. */
const counted = new WeakMap<object, number>();

/**
 * When the router counted this use of a command against its limit (`RouterOptions.now`), for a
 * handler that hands the use on (`/meetup`'s form, `/raid`'s menu: `carriesOn`), so that a
 * failure gives it back to the window it was counted in and no handler reads a clock of its own
 * for it (plan 8S-3); undefined where nothing was counted.
 */
export function whenCounted(interaction: object): number | undefined {
  return counted.get(interaction);
}

export class InteractionRouter {
  private readonly commands = new Map<string, CommandModule>();
  /** The message commands (Discord's Apps menu on a message), by the name the menu shows. */
  private readonly messageCommands = new Map<string, MessageCommand>();
  private readonly components = new Map<string, ComponentHandler>();
  private readonly throttles: Throttles;
  /** The commands Discord shows to staff only (`default_member_permissions`), by name. */
  private readonly staffOnly = new Set<string>();
  private readonly now: () => number;
  private readonly lateDeferMs: number;
  private readonly setTimer: RouterOptions['setTimer'];

  /**
   * `commands` are the slash commands and the message commands (`MessageCommand`) alike; a
   * name used twice among either is refused.
   */
  constructor(
    private readonly ctx: AppContext,
    commands: readonly (CommandModule | MessageCommand)[],
    components: readonly ComponentHandler[],
    options: RouterOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.lateDeferMs = options.lateDeferMs ?? LATE_DEFER_MS;
    this.setTimer = options.setTimer;
    this.throttles = options.throttles ?? ctx.throttles;
    for (const command of commands) {
      if (isMessageCommand(command)) {
        if (this.messageCommands.has(command.data.name))
          throw new Error(`Duplicate command ${command.data.name}`);
        this.messageCommands.set(command.data.name, command);
        continue;
      }
      if (this.commands.has(command.data.name))
        throw new Error(`Duplicate command /${command.data.name}`);
      assertHandlersMatch(command);
      this.commands.set(command.data.name, command);
      const permissions = command.data.toJSON().default_member_permissions;
      if (permissions !== undefined && permissions !== null) this.staffOnly.add(command.data.name);
    }
    for (const handler of components) {
      if (this.components.has(handler.kind))
        throw new Error(`Duplicate component kind "${handler.kind}"`);
      this.components.set(handler.kind, handler);
    }
  }

  /**
   * Handles one interaction; never rejects. Afterwards one line at debug level says what it was
   * and how long it took (autocomplete is left out: it comes with every keystroke): `lateMs` is
   * how old the interaction was when it arrived (the way from Discord, by this machine's clock),
   * `deferMs` how long Discord took to take the deferral of a command that was deferred (one request
   * that asks nothing of the bot, so the measure of a round trip), `ms` everything from arrival.
   */
  async handle(received: Interaction): Promise<void> {
    if (this.beingReadied(received)) return this.answerBeingReadied(received);
    if (!this.admitted(received)) return this.refuseInRehearsal(received);
    if (this.heldInSetup(received)) return this.refuseInSetup(received);
    const interaction = this.answeredInRehearsal(received);
    if (interaction.isAutocomplete()) return this.handleAutocomplete(interaction);
    const started = performance.now();
    const lateMs = Date.now() - interaction.createdTimestamp;
    let deferMs: number | undefined;
    if (interaction.isChatInputCommand()) deferMs = await this.handleCommand(interaction);
    else if (interaction.isMessageContextMenuCommand()) {
      deferMs = await this.handleMessageCommand(interaction);
    } else if (interaction.isMessageComponent() || interaction.isModalSubmit())
      await this.handleComponent(interaction);
    else return;
    this.ctx.log.debug(
      {
        interaction: describe(interaction),
        ms: Math.round(performance.now() - started),
        lateMs,
        ...(deferMs === undefined ? {} : { deferMs }),
      },
      'interaction handled',
    );
  }

  /** Whether the member is answered: always, but in rehearsal mode only its allowlist and staff. */
  private admitted(interaction: Interaction): boolean {
    const { rehearsal } = this.ctx;
    if (!rehearsal) return true;
    return rehearsal.admits({
      userId: interaction.user.id,
      permissions: interaction.memberPermissions?.bitfield ?? null,
      roleNames: interaction.inCachedGuild()
        ? interaction.member.roles.cache.map((role) => role.name)
        : [],
    });
  }

  /**
   * In rehearsal mode nothing is answered publicly outside the posts of the rehearsed forums,
   * which only staff and the testers see: there every reply, deferral and follow-up is made
   * private (a channel's members would see it); in such a post, and outside a rehearsal, the
   * interaction is as it came.
   */
  private answeredInRehearsal(interaction: Interaction): Interaction {
    const { rehearsal } = this.ctx;
    if (!rehearsal || interaction.isAutocomplete() || !interaction.inGuild()) return interaction;
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isMessageContextMenuCommand() &&
      !interaction.isMessageComponent() &&
      !interaction.isModalSubmit()
    ) {
      return interaction;
    }
    const where = channelContext(interaction);
    const region =
      where.isThread && where.baseChannelId !== undefined
        ? this.ctx.regions.byForum(where.baseChannelId)
        : undefined;
    const regionName = region
      ? interaction.guild?.channels.cache.get(region.channelId)?.name
      : undefined;
    return region && rehearsal.rehearses(regionName) ? interaction : privately(interaction);
  }

  /** Answers a member the rehearsal does not admit, and nothing else; a failure is only logged. */
  private async refuseInRehearsal(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isAutocomplete()) await interaction.respond([]);
      else if (
        interaction.isChatInputCommand() ||
        interaction.isMessageContextMenuCommand() ||
        interaction.isMessageComponent() ||
        interaction.isModalSubmit()
      ) {
        await replyEphemeral(interaction, REHEARSAL_REFUSAL);
      }
    } catch (err) {
      this.ctx.log.warn({ err }, 'could not refuse a member during the rehearsal');
    }
  }

  /**
   * Whether the interaction came from a server in setup (plan 19C-2, `ServerSettings.inSetup`)
   * and is for anything but what works there (`worksInSetup`: `/help`, `/admin setup`, `/admin
   * settings`, `/admin setup-forums`, `/region import`, `/region edit`, and their controls and
   * dialogs by their custom id). Never in a DM. Asked before anything else of the interaction, so
   * that nothing is counted.
   */
  private heldInSetup(interaction: Interaction): boolean {
    const { guildId } = interaction;
    if (guildId === null || !this.ctx.servers.inSetup(guildId)) return false;
    if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
      return this.find(interaction)?.handler.worksInSetup !== true;
    }
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
      const id = decodeCustomId(interaction.customId);
      if (id === undefined) return true;
      return this.components.get(id.kind)?.worksInSetup?.(id) !== true;
    }
    return true;
  }

  /**
   * Whether the interaction came from a server added back while its data is being deleted (plan
   * 19C-3, fix round 1, 3b: `ServerStandings.pending`). Never in a DM. Asked before anything else,
   * so that nothing is counted, run or read of the server.
   */
  private beingReadied(interaction: Interaction): boolean {
    const { guildId } = interaction;
    return guildId !== null && this.ctx.standings.pending(guildId);
  }

  /**
   * Answers everything of a server whose data is being deleted with one line, privately
   * (`BEING_READIED`), whoever asks; an autocomplete with nothing. A failure is only logged.
   */
  private async answerBeingReadied(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isAutocomplete()) await interaction.respond([]);
      else if (
        interaction.isChatInputCommand() ||
        interaction.isMessageContextMenuCommand() ||
        interaction.isMessageComponent() ||
        interaction.isModalSubmit()
      ) {
        await replyEphemeral(interaction, BEING_READIED);
      }
    } catch (err) {
      this.ctx.log.warn(
        { err, interaction: describe(interaction) },
        'could not answer in a server whose data is being deleted',
      );
    }
  }

  /**
   * Answers what a server in setup does not do (plan 19C-2): privately, "Pine is not set up in

   * this server yet.", and to whoever may set it up (`isServerAdmin`: its owner, who may manage
   * it, its staff) where to go on;
   * an autocomplete with nothing. A failure is only logged.
   */
  private async refuseInSetup(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isAutocomplete()) await interaction.respond([]);
      else if (
        interaction.isChatInputCommand() ||
        interaction.isMessageContextMenuCommand() ||
        interaction.isMessageComponent() ||
        interaction.isModalSubmit()
      ) {
        await replyEphemeral(interaction, inSetupWords(isServerAdmin(interaction, this.ctx)));
      }
    } catch (err) {
      this.ctx.log.warn(
        { err, interaction: describe(interaction) },
        'could not answer in a server in setup',
      );
    }
  }

  /** Answers how long the deferral took, for a command that was deferred. */
  private async handleCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<number | undefined> {
    const found = this.find(interaction);
    let deferMs: number | undefined;
    await this.guarded(interaction, async (spend) => {
      if (!found) {
        this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
        throw new UserError(UNKNOWN_COMMAND);
      }
      const { handler, name, counted: key } = found;
      // Before its guards (plan 19A-1): a command the server has not set up is said so, uncounted.
      const missing = this.notSetUp(interaction, handler);
      if (missing !== undefined) {
        throw new UserError(notSetUpWords(missing, isServerAdmin(interaction, this.ctx)));
      }
      await runGuards(found.guards, interaction, this.ctx);
      const { checks } = handler;
      if (checks) {
        this.refuseWhileFull(checks.as ?? key, interaction.user.id, checks, (wait) =>
          commandRefusal(checks.as ?? name, wait),
        );
      }
      const varies = typeof handler.throttle === 'function';
      const throttle =
        typeof handler.throttle === 'function'
          ? handler.throttle(interaction, this.ctx)
          : handler.throttle;
      if (throttle) {
        // The limits of a command that has several are counted apart, each under what it is.
        const window = varies ? variedThrottleKey(key, throttle) : key;
        const now = this.now();
        const wait = this.throttles.use(window, interaction.user.id, throttle, now);
        if (wait !== undefined) throw new UserError(commandRefusal(name, waitText(wait)));
        spend({ key: window, throttle, countedAt: now });
        counted.set(interaction, now);
      }
      const defer =
        typeof handler.defer === 'function' ? handler.defer(interaction, this.ctx) : handler.defer;
      if (defer === 'late') {
        await this.runLate(
          interaction,
          () => handler.execute(interaction, this.ctx),
          'could not acknowledge a command late',
          (ms) => {
            deferMs = ms;
          },
        );
        return;
      }
      if (defer) {
        const before = performance.now();
        await interaction.deferReply(
          defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {},
        );
        deferMs = Math.round(performance.now() - before);
      }
      await handler.execute(interaction, this.ctx);
    });
    return deferMs;
  }

  /**
   * A message command (the Apps menu on a message): guards, throttle (counted under the name the
   * menu shows), the private acknowledgement it asks for, then the command. Answers how long the
   * acknowledgement took, for one that was acknowledged.
   */
  private async handleMessageCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<number | undefined> {
    const command = this.messageCommands.get(interaction.commandName);
    let deferMs: number | undefined;
    await this.guarded(interaction, async (spend) => {
      if (!command) {
        this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
        throw new UserError(UNKNOWN_COMMAND);
      }
      await runGuards(command.guards ?? [], interaction, this.ctx);
      const { throttle, checks } = command;
      const name = command.data.name;
      if (checks) {
        // The window of the form it opens: a command's (`/report`), or its own.
        this.refuseWhileFull(checks.as ?? name, interaction.user.id, checks, (wait) =>
          checks.as === undefined
            ? `You can use ${name} again in ${wait}.`
            : commandRefusal(checks.as, wait),
        );
      }
      if (throttle) {
        const now = this.now();
        const wait = this.throttles.use(name, interaction.user.id, throttle, now);
        if (wait !== undefined) {
          throw new UserError(`You can use ${name} again in ${waitText(wait)}.`);
        }
        spend({ key: name, throttle, countedAt: now });
        counted.set(interaction, now);
      }
      const defer =
        typeof command.defer === 'function' ? command.defer(interaction, this.ctx) : command.defer;
      if (defer === 'ephemeral') {
        const before = performance.now();
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        deferMs = Math.round(performance.now() - before);
      }
      await command.run(interaction, this.ctx);
    });
    return deferMs;
  }

  /**
   * Answers the list of an option while it is typed. For a command that is for staff
   * (`default_member_permissions`) the guards of the command and of the subcommand typed run
   * first (plan 19C-2: `/admin`'s and `/region`'s are their parts'), and whoever they refuse gets
   * an empty list, never an error: Discord hides such a command, but a server can grant it to
   * anybody, and its lists must tell them no more than the command would. Those guards must
   * therefore read no option: what the member types is not all there yet. The guards of ordinary
   * commands do not run here: some read options.
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      // Before anything reads them: no search is run on a text no option of ours takes.
      if (overlong(interaction.options.data)) {
        await interaction.respond([]);
        return;
      }
      const command = this.commands.get(interaction.commandName);
      if (command && this.staffOnly.has(command.data.name)) {
        try {
          // The subcommand's guards with the command's (plan 19C-2: `/admin`'s and `/region`'s
          // are their parts').
          await runGuards(
            this.find(interaction)?.guards ?? command.guards ?? [],
            interaction,
            this.ctx,
          );
        } catch (err) {
          if (!(err instanceof UserError)) throw err;
          await interaction.respond([]);
          return;
        }
      }
      const handler = this.find(interaction)?.handler;
      // Nothing to offer where the server has not set it up (plan 19A-1).
      if (handler?.autocomplete && this.notSetUp(interaction, handler) === undefined) {
        await handler.autocomplete(interaction, this.ctx);
      } else await interaction.respond([]);
    } catch (err) {
      this.ctx.log.error({ err, interaction: describe(interaction) }, 'autocomplete failed');
      if (!interaction.responded) await interaction.respond([]).catch(() => undefined);
    }
  }

  /** What the server an interaction came from must set for a handler; never in a DM. */
  private notSetUp(
    interaction: { guildId: string | null },
    handler: Pick<CommandHandler, 'setUpIn'>,
  ): string | undefined {
    if (interaction.guildId === null) return undefined;
    return notSetUpIn(
      handler,
      this.ctx.servers.of(interaction.guildId),
      this.ctx,
      interaction.guildId,
    );
  }

  /**
   * The handler of a command or of the subcommand used, with the guards that apply to it, its
   * name as a member types it (`raid`, `gym create`, `hmm`) and the name its uses are counted
   * under (that of the command it is a form of: `interested`).
   */
  private find(
    interaction: ChatInputCommandInteraction | AutocompleteInteraction,
  ):
    | { handler: CommandHandler; guards: readonly Guard[]; name: string; counted: string }
    | undefined {
    const command = this.commands.get(interaction.commandName);
    if (!command) return undefined;
    const name = command.data.name;
    const counted = command.formOf ?? name;
    const path = subcommandOf(interaction) ?? '';
    if (!command.subcommands) {
      // A subcommand of a command that has none: the deployed definition is newer than this code,
      // or the client's older (a subcommand the command had, run as the command is now).
      return path === '' || command.formerSubcommands?.includes(path) === true
        ? { handler: command, guards: command.guards ?? [], name, counted }
        : undefined;
    }
    const handler = command.subcommands.get(path);
    if (!handler) return undefined;
    return {
      handler,
      guards: [...(command.guards ?? []), ...(handler.guards ?? [])],
      name: `${name} ${path}`,
      counted: `${counted} ${path}`,
    };
  }

  private async handleComponent(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
  ): Promise<void> {
    const id = decodeCustomId(interaction.customId);
    const handler = id ? this.components.get(id.kind) : undefined;
    await this.guarded(interaction, async (spend) => {
      const run = id && handler ? runnerFor(handler, interaction, id, this.ctx) : undefined;
      if (!id || !handler || !run) {
        // Not a custom id of this bot (or of its legacy version), a kind nobody handles any more,
        // or a kind that has no control of this type.
        const reason = !id ? 'undecodable' : !handler ? 'unknown-kind' : 'no-such-control';
        this.ctx.log.warn(
          { interaction: describe(interaction), reason },
          'no handler for component',
        );
        throw new UserError(STALE_COMPONENT);
      }
      await runGuards(handler.guards ?? [], interaction, this.ctx);
      const varies = typeof handler.throttle === 'function';
      // A limit shared with a command counts in that command's window, as the command's uses
      // are counted; the others in the kind's own, each limit by itself where they vary.
      const key = controlThrottleKey(handler.kind);
      const windowOf = (limit: ControlThrottle) =>
        limit.as ?? (varies ? variedThrottleKey(key, limit) : key);
      // The window of the form this control opens, before the control counts.
      const checks = handler.checks?.(interaction, id);
      if (checks) {
        this.refuseWhileFull(windowOf(checks), interaction.user.id, checks, (wait) =>
          controlRefusal(checks, wait),
        );
      }
      const throttle: ControlThrottle | undefined =
        typeof handler.throttle === 'function'
          ? handler.throttle(interaction, id, this.ctx)
          : handler.throttle;
      if (throttle) {
        const now = this.now();
        const wait = this.throttles.use(windowOf(throttle), interaction.user.id, throttle, now);
        if (wait !== undefined) throw new UserError(controlRefusal(throttle, waitText(wait)));
        spend({ key: windowOf(throttle), throttle, countedAt: now });
        counted.set(interaction, now);
      }
      // A form whose command counted the use (`/meetup`'s): a failure here gives it back there.
      const carried = handler.carriesOn?.(interaction, id);
      if (carried) {
        spend({ key: windowOf(carried), throttle: carried, countedAt: carried.countedAt });
      }
      const defer = handler.defer?.(interaction, id, this.ctx);
      if (defer === 'late' && interaction.isMessageComponent()) {
        await this.runLate(interaction, run, 'could not acknowledge a press late');
        return;
      }
      await run();
    });
  }

  /**
   * Runs work whose answer may come late (`defer: 'late'`): the interaction is acknowledged for
   * the member alone once it is `lateDeferMs` old without an answer, counted from when it was
   * made (Discord allows three seconds from then, not from when it arrived). Before anything
   * else is sent, an error among it, no acknowledgement is on its way; `took` is told how long
   * the acknowledgement took, if there was one, also when the work failed.
   */
  private async runLate(
    interaction: ChatInputCommandInteraction | MessageComponentInteraction,
    work: () => Promise<void>,
    failed: string,
    took?: (deferMs: number | undefined) => void,
  ): Promise<void> {
    const age = Date.now() - interaction.createdTimestamp;
    const late = deferLate(
      interaction,
      Math.max(0, this.lateDeferMs - (age > 0 ? age : 0)),
      this.setTimer,
    );
    try {
      await work();
    } finally {
      const settled = await late.settle();
      took?.(settled.deferMs);
      if (settled.failure !== undefined) {
        this.ctx.log.warn({ err: settled.failure, interaction: describe(interaction) }, failed);
      }
    }
  }

  /**
   * Refuses a use while the window `key` of `throttle` is full (a form's, before the form opens:
   * `checks`); counts nothing.
   */
  private refuseWhileFull(
    key: string,
    userId: string,
    throttle: Throttle,
    refusal: (wait: string) => string,
  ): void {
    const wait = this.throttles.wait(key, userId, throttle, this.now());
    if (wait !== undefined) throw new UserError(refusal(waitText(wait)));
  }

  /**
   * Runs the work of an interaction and answers what it threw: a `UserError` as its text (or its
   * message), anything else as "Something went wrong" with a reference, logged. `run` notes each
   * use it counted (`spend`); an unexpected error gives them back (plan 8S-3: a `/meetup` whose
   * post Discord refused did not count), at most as many in a window as it allows
   * (`Throttles.giveBack`). A refusal is the member's and stays counted, unless it says it is
   * none of their doing (`UserError.givesBack`: the bot may not make posts in the forum); one the
   * handler has said in its own answer (`UserError.said`) is answered no more.
   */
  private async guarded(
    interaction: Answered,
    run: (spend: (spent: Spent) => void) => Promise<void>,
  ): Promise<void> {
    const spent: Spent[] = [];
    try {
      await run((one) => spent.push(one));
    } catch (err) {
      if (!(err instanceof UserError) || err.givesBack) {
        for (const { key, throttle, countedAt } of spent) {
          this.throttles.giveBack(key, interaction.user.id, throttle, this.now(), countedAt);
        }
      }
      let content: string;
      let ref: string | undefined;
      if (err instanceof UserError) {
        // Told already, in the handler's own answer.
        if (err.said) return;
        content = err.message;
        // A refusal with a message of its own, where it can still be the member's alone.
        const apart =
          !interaction.replied && (!interaction.deferred || interaction.ephemeral === true);
        if (err.answer && apart) {
          const shown = err.answer;
          await answerApart(interaction, shown).catch((replyErr: unknown) =>
            this.ctx.log.warn(
              { err: replyErr, interaction: describe(interaction) },
              'could not send error reply',
            ),
          );
          return;
        }
      } else if (err instanceof LockOverdueError) {
        // Logged where the lock is held too long, once, not by every member who waited.
        content = STILL_BUSY;
      } else {
        ref = randomBytes(3).toString('hex');
        this.ctx.log.error({ err, ref, interaction: describe(interaction) }, 'interaction failed');
        content = genericError(ref);
      }
      await replyEphemeral(interaction, content).catch((replyErr: unknown) =>
        this.ctx.log.warn(
          { err: replyErr, ref, interaction: describe(interaction) },
          'could not send error reply',
        ),
      );
    }
  }
}

/**
 * A use counted in a window (`key`) by its limit, given back when its work fails; `countedAt`
 * when it was counted, so that it goes back only to the window it was counted in.
 */
interface Spent {
  key: string;
  throttle: Throttle;
  countedAt: number;
}

/** What a member is told who used a command too often: its name, as typed. */
export function commandRefusal(name: string, wait: string): string {
  return `You can use /${name} again in ${wait}.`;
}

/** What a member is told who used a control too often: as a command's use where it counts as one. */
export function controlRefusal(throttle: ControlThrottle, wait: string): string {
  // A command whose limit varies counts in a window of its name and limit
  // (`variedThrottleKey`): the member is told the name (Meet… in `/meet`'s, plan 8X-1B).
  return throttle.as === undefined
    ? `That was a lot of clicks. Try again in ${wait}.`
    : commandRefusal(throttle.as.split('\n')[0] ?? throttle.as, wait);
}

/** What the handler does with this kind of control; undefined when it has nothing for it. */
function runnerFor(
  handler: ComponentHandler,
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  id: CustomId,
  ctx: AppContext,
): (() => Promise<void>) | undefined {
  const { button, select, modal } = handler;
  if (interaction.isModalSubmit()) return modal && (() => modal(interaction, id, ctx));
  if (interaction.isButton()) return button && (() => button(interaction, id, ctx));
  if (interaction.isAnySelectMenu()) return select && (() => select(interaction, id, ctx));
  return undefined;
}

async function runGuards(
  guards: readonly Guard[],
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<void> {
  for (const guard of guards) await guard(interaction, ctx);
}

/** A command whose definition and handlers disagree would fail when used; fail at start. */
function assertHandlersMatch(command: CommandModule): void {
  const declared = declaredSubcommands(command.data.toJSON().options).sort();
  const handled = [...(command.subcommands?.keys() ?? [])].sort();
  if (declared.join('\n') !== handled.join('\n')) {
    throw new Error(
      `/${command.data.name} declares the subcommands [${declared.join(', ')}] ` +
        `but handles [${handled.join(', ')}]`,
    );
  }
}

function subcommandOf(interaction: Interaction | Answered): string | undefined {
  if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return undefined;
  const path = subcommandPath(
    interaction.options.getSubcommandGroup(false),
    interaction.options.getSubcommand(false),
  );
  return path === '' ? undefined : path;
}

function describe(interaction: Interaction | Answered) {
  return {
    id: interaction.id,
    type: interaction.type,
    user: interaction.user.id,
    guild: interaction.guildId,
    channel: interaction.channelId,
    command: 'commandName' in interaction ? interaction.commandName : undefined,
    subcommand: subcommandOf(interaction),
    customId: 'customId' in interaction ? interaction.customId : undefined,
  };
}
