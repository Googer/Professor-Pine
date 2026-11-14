import {
  ApplicationCommandOptionType,
  Collection,
  ComponentType,
  MessageFlags,
  MessageFlagsBitField,
  PermissionFlagsBits,
  PermissionsBitField,
  type APIEmbed,
} from 'discord.js';
import { basename } from 'node:path';
import { vi } from 'vitest';
import type { OutgoingMessage, V2Message } from '../../src/discord/party-gateway.js';
import { checkMenu, FakePartyGateway, refusedBody, type MenuLike } from './fake-gateway.js';

/**
 * The `attachment://` addresses among these components, nested ones included: of file
 * components, thumbnails and the pictures of galleries.
 */
function fileUrls(components: readonly unknown[]): string[] {
  return components.flatMap((component) => {
    const {
      file,
      media,
      items,
      accessory,
      components: inner,
    } = component as {
      file?: { url?: unknown };
      media?: { url?: unknown };
      items?: { media?: { url?: unknown } }[];
      accessory?: unknown;
      components?: unknown[];
    };
    const urls = [file?.url, media?.url, ...(items ?? []).map((item) => item.media?.url)];
    const own = urls.filter(
      (url): url is string => typeof url === 'string' && url.startsWith('attachment://'),
    );
    return [
      ...own,
      ...fileUrls([...(inner ?? []), ...(accessory === undefined ? [] : [accessory])]),
    ];
  });
}

/** The name a file of a payload has in the message: an attachment's, or a path's base name. */
function fileName(file: unknown): unknown {
  return typeof file === 'string' ? basename(file) : (file as { name?: unknown }).name;
}

/** What a test may want to read back from a reply, follow-up or edit. */
export interface SentPayload {
  content?: string;
  flags?: number;
  embeds?: ReadonlyArray<{ toJSON(): APIEmbed }>;
  components?: readonly unknown[];
  files?: readonly unknown[];
  /** The files of the message that stay (an edit without it keeps them all). */
  attachments?: readonly unknown[];
}

type OptionValue = string | number | boolean | null;

/**
 * What a member who may write where an interaction came from has there
 * (`FakeOptions.memberPermissions`): Send Messages, and Send Messages in Threads for a post. A
 * fake member has no permission in the channel unless a test gives one.
 */
export const MAY_WRITE =
  PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads;

/** An option as discord.js's `options.data` holds it (`CommandInteractionOption`). */
interface FakeOptionData {
  name: string;
  type: ApplicationCommandOptionType;
  value?: OptionValue;
  focused?: boolean;
  options?: FakeOptionData[];
}

export interface FakeOptions {
  commandName?: string;
  /** `/gym create` has subcommand `create`; `/operator boss add` has group `boss`, subcommand `add`. */
  subcommand?: string;
  subcommandGroup?: string;
  customId?: string;
  deferred?: boolean;
  replied?: boolean;
  guildId?: string | null;
  /** The name of the server: `interaction.guild.name` ("Test Server" unless given). */
  guildName?: string;
  channelId?: string;
  channelName?: string;
  /** The names of channels of the server by id: `interaction.guild.channels.cache`. */
  guildChannelNames?: Record<string, string>;
  /** The names of roles of the server by id: `interaction.guild.roles.cache`. */
  guildRoleNames?: Record<string, string>;
  /** Name of the category the channel is under. */
  parentName?: string | null;
  /** Id of the category the channel is under (plan 19A-1: the PvP category is one by id). */
  parentId?: string;
  /**
   * Makes the channel a thread (a forum post is one). `parentName` and `parentId` are then
   * ignored: the category is that of the channel the thread belongs to.
   */
  thread?: { parentId?: string; parentName?: string; categoryName?: string; categoryId?: string };
  /** Added to `interaction.channel`: its `type`, and its `messages` and `send` for a test that posts. */
  channelMore?: object;
  /** What the bot may do here: `interaction.appPermissions` (everything unless given). */
  appPermissions?: bigint;
  /** The channel is not in the cache (an archived forum post): `interaction.channel` is null. */
  uncachedChannel?: boolean;
  isDm?: boolean;
  userId?: string;
  /** The account's names, whatever the server: `interaction.user.username` and `.globalName`. */
  username?: string;
  globalName?: string | null;
  roleNames?: string[];
  /**
   * The ids of the roles of the server the member holds, for code that works with role ids
   * (their names come from `guildRoleNames`). As in discord.js, `member.roles.cache` then also
   * has the role every member has (`@everyone`, whose id is the server's), and lacks a role
   * that the server's own cache does not have.
   */
  roleIds?: string[];
  /**
   * What the member may do on the server, as Discord's bit field: `interaction.member.permissions`
   * (a `GuildMember`'s: what their roles grant, whatever the channel; nothing unless a test
   * says so). As in discord.js it cannot be changed, and an administrator has every permission.
   */
  permissions?: bigint;
  /**
   * What the member may do in the channel of the interaction: `interaction.memberPermissions`
   * (null in a DM). A channel's overwrites can add to what the server grants or take from it,
   * so it may differ from `permissions`; without it the channel changes nothing.
   */
  memberPermissions?: bigint;
  /** When the interaction was made: `interaction.createdTimestamp` (now unless a test says so). */
  createdTimestamp?: number;
  /** The member's name in the server: `interaction.member.displayName`. */
  displayName?: string;
  /**
   * The member has not passed the server's membership screening yet (they have not accepted
   * its rules): `interaction.member.pending`.
   */
  pending?: boolean;
  /** Option values by name, for getString, getInteger, getNumber and getBoolean. */
  options?: Record<string, OptionValue>;
  /** Resolved options by name, for getUser, getMember, getRole, getChannel and getAttachment. */
  resolved?: Record<string, unknown>;
  /**
   * What `getMember` answers, by option name, when that differs from `resolved`: Discord sends
   * the member with a user option only when that user is in the server, so a user who is not
   * has an entry in `resolved` and `null` here.
   */
  resolvedMembers?: Record<string, unknown>;
  /** Autocomplete: what was typed so far, and in which option. */
  focused?: string;
  focusedName?: string;
  /** Select menu: the chosen values. */
  values?: string[];
  /**
   * Select menu: a channel select (`isChannelSelectMenu`), with the channels picked as Discord
   * resolves them (`interaction.channels`: id, type, and the server they are in), or a role
   * select (`isRoleSelectMenu`, `interaction.roles` by id). Neither: a string select.
   */
  pickedChannels?: Array<{ id: string; type: number; guildId: string }>;
  pickedRoles?: Array<{ id: string; name: string }>;
  /** Modal: the text typed into each input, by the input's custom id. */
  fields?: Record<string, string>;
  /** Modal: what was chosen in each select menu of the form, by the menu's custom id. */
  selected?: Record<string, string[]>;
  /** Modal: what was ticked in each checkbox group of the form, by the group's custom id. */
  checked?: Record<string, string[]>;
  /** Modal: the choice picked in each radio group of the form, by the group's custom id. */
  picked?: Record<string, string>;
  /**
   * Modal: whether each Checkbox of the form (one tick box, `ComponentType.Checkbox`; plan 8R-4)
   * is ticked, by its custom id; one of the form not named is submitted unticked.
   */
  ticks?: Record<string, boolean>;
  /**
   * Modal: the form the opener showed (as passed to `showModal`). The submitted form then has
   * every input of it, and refuses values for inputs it does not have (`submittedForm`).
   */
  form?: unknown;
  /**
   * Modal: the form was opened by a slash command, not by a control of a message
   * (`isFromMessage()` is then false: there is no message to update).
   */
  modalFromCommand?: boolean;
  /**
   * A control: the rows of controls of the message it is on, as Discord's API has them
   * (`interaction.message.components`, each with its `toJSON()`).
   */
  messageRows?: readonly FakeRow[];
  /**
   * A control: the message it is on, for several presses on one message (`fakeMessage`). The
   * press sees the message as it was when the fake was made, as Discord sends it with the
   * interaction; `fetchReply` gives it as it is now, and `editReply` after `deferUpdate`
   * changes its rows and its text. Without it the fake has a message of its own with
   * `messageRows`.
   */
  message?: FakeMessage;
  /**
   * A control (or a form it opened): the member whose command made the message it is on, as
   * Discord says it (`interaction.message.interactionMetadata.user`); without it the message
   * has no metadata.
   */
  askedBy?: string;
  /**
   * The names of the servers the bot is in, by id (`interaction.client.guilds.cache`): a DM's
   * Change… names its server (plan 8R-4).
   */
  serverNames?: Record<string, string>;
  /** The member counts of those servers (`Guild.memberCount`, plan 19C-1); none unless given. */
  serverMembers?: Record<string, number>;
  /** Those of them Discord says are unavailable (`Guild.available` false, plan 19C-1). */
  unavailableServers?: readonly string[];
  /** A control: the message it is on is private (`interaction.message.flags` has Ephemeral). */
  ephemeralMessage?: boolean;
  /**
   * A control (or a form it opened): the message it is on is components v2
   * (`interaction.message.flags` has IsComponentsV2) whatever its rows; without it, it is so
   * when its rows are more than rows of controls.
   */
  v2Message?: boolean;
  /**
   * A message command (Discord's Apps menu on a message): the message it was used on, as Discord
   * sends it with the interaction (`interaction.targetMessage`, `targetId`).
   */
  targetMessage?: FakeTargetMessage;
}

/** The bot's own user id in the fakes: `interaction.client.user.id`. */
export const FAKE_BOT_ID = '700000000000000999';

/** The message a message command was used on, as Discord sends it with the interaction. */
export interface FakeTargetMessage {
  id: string;
  /** Its channel (a thread's own id for a message in a post); the interaction's by default. */
  channelId?: string;
  content?: string;
  authorId: string;
  /** The author's name in the server (`member.displayName`); none for a member who left. */
  authorName?: string;
  /** The author's account name (`author.username`). */
  authorUsername?: string;
  /** Whether the author is a bot (`author.bot`); the bot itself when `authorId` is `FAKE_BOT_ID`. */
  authorBot?: boolean;
  /** When it was written (`createdTimestamp`). */
  createdTimestamp?: number;
  /** The names of its attachments. */
  attachments?: readonly string[];
  /**
   * Its attachments in full, in the place of `attachments`, for a command that downloads them
   * ("Read screenshot", plan 7M): as `screenshotsWith().screenshot()` gives them.
   */
  files?: readonly { url: string; name: string; contentType: string | null; size: number }[];
  /** A webhook wrote it (`webhookId`). */
  webhook?: boolean;
  /**
   * What the bot does to the message is noted here, in the words `posted()` notes it in
   * (`react 🤔`, `unreact 🤔` for the bot's own reaction taken off, `deleted`): a test passes its
   * own list to read them.
   */
  did?: string[];
  /**
   * The message it forwards, when it is a forward (`messageSnapshots`, one): a forward has no
   * text or attachments of its own.
   */
  forwards?: {
    content?: string;
    attachments?: readonly string[];
    /** Its attachments in full, in the place of `attachments`, as the target's own `files`. */
    files?: FakeTargetMessage['files'];
    /**
     * When the forwarded message was written (the snapshot's `createdTimestamp`, by its id):
     * the target's own time, when the forward was made, unless a test says so.
     */
    createdTimestamp?: number;
  };
}

/** Attachments in full, as discord.js gives them. */
function filesOf(files: NonNullable<FakeTargetMessage['files']>) {
  return new Collection(files.map((file, i) => [String(i), { id: String(i), ...file }]));
}

/** Attachments by name, as discord.js gives them. */
function attachmentsOf(names: readonly string[] = []) {
  return new Collection(names.map((name, i) => [String(i), { id: String(i), name }]));
}

/** The message a fake message command carries, as discord.js gives `targetMessage`. */
function targetOf(target: FakeTargetMessage, channelId: string, guildId: string | null) {
  const did = target.did ?? [];
  // As discord.js keeps them: by the emoji, each with the users who can be taken off it.
  const reactions = new Collection<string, { users: { remove(userId: string): Promise<void> } }>();
  return {
    id: target.id,
    channelId: target.channelId ?? channelId,
    guildId,
    content: target.content ?? '',
    createdTimestamp: target.createdTimestamp ?? Date.now(),
    author: {
      id: target.authorId,
      bot: target.authorBot ?? target.authorId === FAKE_BOT_ID,
      username: target.authorUsername ?? 'someone',
      globalName: null,
    },
    webhookId: target.webhook === true ? '860000000000000001' : null,
    member: target.authorName === undefined ? null : { displayName: target.authorName },
    attachments: target.files ? filesOf(target.files) : attachmentsOf(target.attachments),
    reactions: { cache: reactions },
    react: (emoji: string) => {
      did.push(`react ${emoji}`);
      reactions.set(emoji, {
        users: {
          remove: (userId: string) => {
            if (userId === FAKE_BOT_ID) did.push(`unreact ${emoji}`);
            return Promise.resolve();
          },
        },
      });
      return Promise.resolve();
    },
    delete: () => {
      did.push('deleted');
      return Promise.resolve();
    },
    messageSnapshots: new Collection(
      target.forwards === undefined
        ? []
        : [
            [
              '800000000000000099',
              {
                content: target.forwards.content ?? '',
                attachments: target.forwards.files
                  ? filesOf(target.forwards.files)
                  : attachmentsOf(target.forwards.attachments),
                createdTimestamp:
                  target.forwards.createdTimestamp ?? target.createdTimestamp ?? Date.now(),
              },
            ],
          ],
    ),
  };
}

/** A row of controls as Discord's API has it. */
export interface FakeRow {
  type: number;
  components: readonly object[];
}

/** A message with controls that several fake presses can share. */
export interface FakeMessage {
  id: string;
  rows: readonly FakeRow[];
  /** Its text: `interaction.message.content`. */
  content: string;
  /**
   * The files attached to it: `interaction.message.attachments`. As in Discord, an edit
   * (`update`, or `editReply` after `deferUpdate`) keeps them unless it says which stay
   * (`attachments`), and adds its own `files`.
   */
  files?: readonly unknown[];
  /**
   * When it was sent: `interaction.message.createdTimestamp`; the interaction's own time unless
   * a test says so.
   */
  createdTimestamp?: number;
}

export const FAKE_MESSAGE_ID = '950000000000000001';

/** The id of the n-th follow-up (from 0) a fake interaction sends: `followUp` answers it. */
export function followUpId(n: number): string {
  return `96000000000000${String(n + 1).padStart(4, '0')}`;
}

/**
 * A message with these rows of controls (and this text), for presses that are made on the same
 * message.
 */
export function fakeMessage(
  rows: readonly FakeRow[],
  id = FAKE_MESSAGE_ID,
  content = '',
  files: readonly unknown[] = [],
): FakeMessage {
  return { id, rows, content, files };
}

type Kind = 'chat' | 'autocomplete' | 'button' | 'select' | 'modal' | 'message';

const TYPE: Record<Kind, number> = {
  chat: 2,
  autocomplete: 4,
  button: 3,
  select: 3,
  modal: 5,
  message: 2,
};
export const FAKE_GUILD_ID = '412345678901234567';
export const FAKE_CHANNEL_ID = '600000000000000001';
export const FAKE_PARENT_ID = '600000000000000002';
export const FAKE_USER_ID = '700000000000000001';

function fakeChannel(o: FakeOptions, id: string) {
  if (o.uncachedChannel) return null;
  const category = (name: string | null | undefined, id: string | undefined) =>
    name || id ? { id: id ?? '600000000000000003', name: name ?? 'category' } : null;
  if (o.thread) {
    const parentId = o.thread.parentId ?? FAKE_PARENT_ID;
    return {
      id,
      name: o.channelName ?? 'post',
      parentId,
      parent: {
        id: parentId,
        name: o.thread.parentName ?? 'forum',
        parentId: o.thread.categoryId ?? null,
        parent: category(o.thread.categoryName, o.thread.categoryId),
      },
      isThread: () => true,
      isDMBased: () => false,
    };
  }
  if (o.isDm) {
    // A real DM channel has no name and no category.
    return {
      id,
      name: undefined,
      parentId: null,
      parent: null,
      isThread: () => false,
      isDMBased: () => true,
    };
  }
  return {
    ...o.channelMore,
    id,
    name: o.channelName ?? 'general',
    parentId: o.parentId ?? null,
    parent: category(o.parentName, o.parentId),
    isThread: () => false,
    isDMBased: () => false,
  };
}

/**
 * Refuses a payload Discord would refuse for its components v2: one with the flag is checked as
 * the fake gateway checks a v2 message (no content or embeds beside it, 40 components, the text,
 * sections with an accessory, unique custom ids), and components that are no rows of controls
 * (a container) without the flag are refused.
 */
function checkComponents(payload: SentPayload | undefined): void {
  if (!payload) return;
  if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0) {
    const message = {
      v2: true,
      components: payload.components ?? [],
      ...('content' in payload ? { content: payload.content } : {}),
      ...('embeds' in payload ? { embeds: payload.embeds } : {}),
    } as unknown as V2Message;
    // Which files the message has is for the caller (`refuseV2`): an edit may keep its own.
    FakePartyGateway.checkV2(message, undefined, 'unchecked');
    return;
  }
  const v2Only = (payload.components ?? []).some((component) => {
    const type = (component as { type?: unknown }).type;
    return typeof type === 'number' && type !== 1;
  });
  if (v2Only) throw new Error('Components other than rows need the IsComponentsV2 flag');
}

/** `checkComponents` as discord.js answers: a rejection. */
function refuseInvalid(payload: SentPayload | undefined): Promise<never> | undefined {
  try {
    checkComponents(payload);
    return undefined;
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

/** Discord's limits for a form (a modal), as its documentation gives them. */
const MODAL = {
  title: 45,
  customId: 100,
  components: 5,
  label: 45,
  labelDescription: 100,
  selectOptions: 25,
  checkboxOptions: 10,
  radioLeast: 2,
  radioOptions: 10,
  textDisplay: 4_000,
} as const;

/** The data of a form, from a builder's `toJSON()` or as given. */
function formData(modal: unknown): { custom_id?: string; title?: string; components?: unknown[] } {
  const built =
    typeof modal === 'object' &&
    modal !== null &&
    typeof (modal as { toJSON?: unknown }).toJSON === 'function';
  return (built ? (modal as { toJSON(): unknown }).toJSON() : (modal ?? {})) as {
    custom_id?: string;
    title?: string;
    components?: unknown[];
  };
}

/** An input of a form, as a submitted form has it: its type, and whether it may stay empty. */
interface FormInput {
  type: ComponentType;
  /** A select menu, checkbox group or radio group that may be submitted with nothing chosen. */
  optional: boolean;
  /** A menu's or a group's `min_values` (1 unless it says): fewer chosen is no Submit. */
  least: number;
  /** The values of the choices of a radio group (Discord sends only one of them). */
  values?: readonly unknown[];
}

/** The inputs of a form by their custom ids: the text inputs, select menus and other inputs. */
function formInputs(modal: unknown): Map<string, FormInput> {
  const inputs = new Map<string, FormInput>();
  for (const raw of formData(modal).components ?? []) {
    const component = raw as {
      type?: ComponentType;
      component?: {
        type?: ComponentType;
        custom_id?: unknown;
        required?: unknown;
        min_values?: unknown;
      };
      components?: { type?: ComponentType; custom_id?: unknown }[];
    };
    const inner =
      component.type === ComponentType.ActionRow ? component.components?.[0] : component.component;
    if (typeof inner?.custom_id !== 'string' || inner.type === undefined) continue;
    const optional =
      'required' in inner && inner.required === false
        ? true
        : 'min_values' in inner && inner.min_values === 0;
    inputs.set(inner.custom_id, {
      type: inner.type,
      optional,
      least: 'min_values' in inner && typeof inner.min_values === 'number' ? inner.min_values : 1,
      ...(inner.type === ComponentType.RadioGroup
        ? {
            values: ((inner as { options?: { value?: unknown }[] }).options ?? []).map(
              (option) => option.value,
            ),
          }
        : {}),
    });
  }
  return inputs;
}

/**
 * Refuses a form Discord would refuse: a title of 1 to 45 characters, 1 to 5 components (a label,
 * a text display, or a row with one text input), a label's text of at most 45 and its
 * description of at most 100, custom ids of at most 100 that are unique in the form; a string
 * select with 1 to 25 options and a checkbox group with 1 to 10, as `checkMenu` checks them (a
 * menu that may stay empty, `min_values: 0`, says `required: false`). A builder is read by its
 * `toJSON()`. Throws with what is wrong.
 */
export function checkModal(modal: unknown): void {
  const data = formData(modal);
  const fail = (what: string): never => {
    throw new Error(`Invalid Form Body (modal): ${what}`);
  };
  const ids = new Set<string>();
  const customId = (id: unknown, where: string): void => {
    if (typeof id !== 'string' || id.length < 1 || id.length > MODAL.customId) {
      fail(`${where}: a custom id of 1 to ${MODAL.customId} characters`);
    }
    if (ids.has(id as string)) fail(`${where}: the custom id ${String(id)} is not unique`);
    ids.add(id as string);
  };
  customId(data.custom_id, 'the modal');
  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > MODAL.title) {
    fail(`a title of 1 to ${MODAL.title} characters`);
  }
  const components = data.components ?? [];
  if (components.length < 1 || components.length > MODAL.components) {
    fail(`1 to ${MODAL.components} components, not ${components.length}`);
  }
  for (const [index, raw] of components.entries()) {
    const component = raw as {
      type?: number;
      label?: unknown;
      description?: unknown;
      component?: MenuLike & { type?: number; custom_id?: unknown };
      components?: { type?: number; custom_id?: unknown }[];
    };
    const where = `component ${index}`;
    if (component.type === ComponentType.TextDisplay) {
      const { content } = component as { content?: unknown };
      if (typeof content !== 'string' || content.length < 1 || content.length > MODAL.textDisplay) {
        fail(`${where}: a text display of 1 to ${MODAL.textDisplay} characters`);
      }
      continue;
    }
    if (component.type === ComponentType.ActionRow) {
      const inner = component.components ?? [];
      if (inner.length !== 1 || inner[0]?.type !== ComponentType.TextInput) {
        fail(`${where}: a row in a modal holds one text input`);
      }
      customId(inner[0]?.custom_id, where);
      continue;
    }
    if (component.type !== ComponentType.Label) fail(`${where}: no component of a modal`);
    if (
      typeof component.label !== 'string' ||
      component.label.length < 1 ||
      component.label.length > MODAL.label
    ) {
      fail(`${where}: a label of 1 to ${MODAL.label} characters`);
    }
    if (
      typeof component.description === 'string' &&
      component.description.length > MODAL.labelDescription
    ) {
      fail(`${where}: a label's description of at most ${MODAL.labelDescription} characters`);
    }
    const inner = component.component;
    if (!inner) return fail(`${where}: a label without its component`);
    customId(inner.custom_id, where);
    const menuFail = (what: string): never => fail(`${where}: ${what}`);
    if (inner.type === ComponentType.StringSelect) {
      checkMenu(inner, { most: MODAL.selectOptions, group: false, inForm: true }, menuFail);
    } else if (inner.type === ComponentType.CheckboxGroup) {
      checkMenu(inner, { most: MODAL.checkboxOptions, group: true, inForm: true }, menuFail);
    } else if (inner.type === ComponentType.RadioGroup) {
      // One choice of 2 to 10, each as an option of a menu, at most one picked beforehand; a
      // radio group has none of a menu's min_values, max_values or placeholder.
      for (const key of ['min_values', 'max_values', 'placeholder'] as const) {
        if (key in inner) fail(`${where}: a radio group has no ${key}`);
      }
      checkMenu(
        inner,
        { least: MODAL.radioLeast, most: MODAL.radioOptions, group: false, inForm: true },
        menuFail,
      );
    } else if (inner.type === ComponentType.Checkbox) {
      // One tick box: its custom id and whether it starts ticked, nothing else (the words are
      // its label's).
      for (const key of Object.keys(inner)) {
        if (!['type', 'custom_id', 'default', 'id'].includes(key)) {
          fail(`${where}: a checkbox has no ${key}`);
        }
      }
    } else if (
      inner.type !== ComponentType.TextInput &&
      inner.type !== ComponentType.FileUpload &&
      inner.type !== ComponentType.UserSelect &&
      inner.type !== ComponentType.RoleSelect &&
      inner.type !== ComponentType.ChannelSelect &&
      inner.type !== ComponentType.MentionableSelect
    ) {
      fail(`${where}: no component of a label`);
    }
  }
}

/** A value of a submitted form, by the type of its input. */
type Submitted =
  | { type: ComponentType.TextInput; value: string }
  | { type: ComponentType.StringSelect | ComponentType.CheckboxGroup; values: string[] }
  | { type: ComponentType.RadioGroup; value: string | null }
  | { type: ComponentType.Checkbox; value: boolean };

/**
 * What a fake form was submitted with, by custom id. With the form the opener showed (`form`),
 * every input of it is there (a text left empty as `''`, an unticked checkbox group or a menu
 * that may stay empty as `[]`, a radio group that may as `null`), a required menu or radio group
 * must be given a value (Discord refuses the Submit otherwise), a radio group one of its choices,
 * and a value for an input the form does not have, or of another type, is refused. Without it,
 * the inputs are what `fields`, `selected`, `checked` and `picked` name.
 */
function submittedForm(o: FakeOptions): Map<string, Submitted> {
  const given = new Map<string, Submitted>();
  for (const [id, value] of Object.entries(o.fields ?? {})) {
    given.set(id, { type: ComponentType.TextInput, value });
  }
  for (const [id, values] of Object.entries(o.selected ?? {})) {
    given.set(id, { type: ComponentType.StringSelect, values });
  }
  for (const [id, values] of Object.entries(o.checked ?? {})) {
    given.set(id, { type: ComponentType.CheckboxGroup, values });
  }
  for (const [id, value] of Object.entries(o.picked ?? {})) {
    given.set(id, { type: ComponentType.RadioGroup, value });
  }
  for (const [id, value] of Object.entries(o.ticks ?? {})) {
    given.set(id, { type: ComponentType.Checkbox, value });
  }
  if (o.form === undefined) return given;
  const inputs = formInputs(o.form);
  for (const [id, value] of given) {
    const input = inputs.get(id);
    if (!input) throw new Error(`The fake form has no input ${id}`);
    if (input.type !== value.type) throw new Error(`The input ${id} of the fake form is no such`);
    if (value.type === ComponentType.RadioGroup && !(input.values ?? []).includes(value.value)) {
      throw new Error(
        `The radio group ${id} of the fake form has no choice ${String(value.value)}`,
      );
    }
    // Discord lets no Submit through with fewer than a menu's or a group's `min_values` chosen,
    // unless it may stay empty and is (plan 8R-4).
    if (
      (value.type === ComponentType.CheckboxGroup || value.type === ComponentType.StringSelect) &&
      value.values.length < input.least &&
      !(input.optional && value.values.length === 0)
    ) {
      throw new Error(`The fake form needs at least ${String(input.least)} of ${id}`);
    }
  }
  const all = new Map<string, Submitted>();
  for (const [id, input] of inputs) {
    const value = given.get(id);
    if (value) {
      all.set(id, value);
    } else if (input.type === ComponentType.TextInput) {
      all.set(id, { type: ComponentType.TextInput, value: '' });
    } else if (
      input.type === ComponentType.CheckboxGroup ||
      input.type === ComponentType.StringSelect
    ) {
      if (!input.optional) {
        throw new Error(
          `The fake form has no value for its required ${input.type === ComponentType.StringSelect ? 'menu' : 'checkbox group'} ${id}`,
        );
      }
      all.set(id, { type: input.type, values: [] });
    } else if (input.type === ComponentType.RadioGroup) {
      if (!input.optional) {
        throw new Error(`The fake form has no value for its required radio group ${id}`);
      }
      all.set(id, { type: ComponentType.RadioGroup, value: null });
    } else if (input.type === ComponentType.Checkbox) {
      all.set(id, { type: ComponentType.Checkbox, value: false });
    }
  }
  return all;
}

/**
 * Just enough of a discord.js interaction for router, guard, command and component tests.
 * It keeps `deferred`, `replied` and `ephemeral` the way discord.js does. Cast to the concrete
 * interaction type at the call site.
 */
function base(kind: Kind, o: FakeOptions) {
  const guildId = o.isDm ? null : (o.guildId ?? FAKE_GUILD_ID);
  const channelId = o.channelId ?? FAKE_CHANNEL_ID;
  const isEphemeral = (payload?: SentPayload) =>
    ((payload?.flags ?? 0) & MessageFlags.Ephemeral) !== 0;
  const missing = (name: string) => new Error(`The fake has no option "${name}"`);
  const value = <T extends OptionValue>(
    name: string,
    type: string,
    required?: boolean,
  ): T | null => {
    const found = o.options?.[name];
    if (typeof found === type) return found as T;
    if (required === true) throw missing(name);
    return null;
  };
  const resolved = (name: string, required?: boolean) => {
    const found = o.resolved?.[name] ?? null;
    if (found === null && required === true) throw missing(name);
    return found;
  };
  /**
   * The options as discord.js's `options.data` gives them: each with its name, type and value,
   * the one being typed (autocomplete) `focused`, all of them under the subcommand, and that
   * under its group, when there is one.
   */
  const optionData = (): FakeOptionData[] => {
    const typeOf = (found: OptionValue): ApplicationCommandOptionType =>
      typeof found === 'number'
        ? ApplicationCommandOptionType.Number
        : typeof found === 'boolean'
          ? ApplicationCommandOptionType.Boolean
          : ApplicationCommandOptionType.String;
    const given = Object.entries(o.options ?? {})
      .filter(([name, found]) => found !== null && name !== o.focusedName)
      .map(([name, found]): FakeOptionData => ({ name, type: typeOf(found), value: found }));
    const typed: FakeOptionData[] =
      kind === 'autocomplete'
        ? [
            {
              name: o.focusedName ?? 'option',
              type: ApplicationCommandOptionType.String,
              value: o.focused ?? '',
              focused: true,
            },
          ]
        : [];
    const leaves = [...given, ...typed];
    if (o.subcommand === undefined) return leaves;
    const part: FakeOptionData = {
      name: o.subcommand,
      type: ApplicationCommandOptionType.Subcommand,
      options: leaves,
    };
    if (o.subcommandGroup === undefined) return [part];
    return [
      {
        name: o.subcommandGroup,
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [part],
      },
    ];
  };
  const alreadyReplied = () =>
    new Error('InteractionAlreadyReplied: the fake was already deferred or replied to');
  const notReplied = () =>
    new Error('InteractionNotReplied: the fake was not deferred or replied to');
  /** A rejection when the interaction was acknowledged already; discord.js methods are async. */
  const refuseIfAcknowledged = (): Promise<never> | undefined =>
    interaction.deferred || interaction.replied ? Promise.reject(alreadyReplied()) : undefined;
  const refuseIfFresh = (): Promise<never> | undefined =>
    interaction.deferred || interaction.replied ? undefined : Promise.reject(notReplied());

  /** The message a control is on; shared by the presses a test makes on one message. */
  const shown: FakeMessage = o.message ?? fakeMessage(o.messageRows ?? []);
  /**
   * Whether a message is a components-v2 one: the message the control is on as Discord says it
   * (its rows, or `v2Message`) until a v2 edit makes it so; the answer of its own (a reply, or
   * the edit of a `deferReply`) once it was answered with the flag. Such a message is held to
   * the limits of the fake gateway (`FakePartyGateway.checkV2`), and like Discord the fake
   * refuses to make it classic again. A v2 update of a classic message is refused too: whether
   * Discord takes one is not known, and the bot does not try it (`showInPlace`).
   */
  let shownV2 = o.v2Message === true || shown.rows.some((row) => row.type !== 1);
  let replyV2 = false;
  /** The files the answer of its own has (a reply or the edit of its deferral). */
  let replyFiles: readonly unknown[] = [];
  /**
   * The files a message has after a send or an edit: those it keeps (`attachments`, else all it
   * had) and those it sends; discord.js lists only the files it sends when an edit sends files
   * and does not say which stay, so the old ones go.
   */
  const filesAfter = (payload: SentPayload, before: readonly unknown[]): unknown[] => {
    if (payload.attachments !== undefined)
      return [...payload.attachments, ...(payload.files ?? [])];
    return payload.files !== undefined ? [...payload.files] : [...before];
  };
  /**
   * Refuses what Discord would refuse of a send or an edit of `target`: the message the control
   * is on (`update`, or an edit after `deferUpdate`), the answer of its own (`reply`, or an edit
   * after `deferReply`), or a follow-up, which is a new message.
   */
  const refuseV2 = (
    payload: SentPayload,
    target: 'shown' | 'reply' | 'followUp',
  ): Promise<never> | undefined => {
    const isV2 = target === 'shown' ? shownV2 : target === 'reply' ? replyV2 : false;
    if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) {
      if (isV2 && (payload.content !== undefined || payload.embeds !== undefined)) {
        return Promise.reject(refusedBody('a components-v2 message cannot become classic'));
      }
      return undefined;
    }
    if (target === 'shown' && !shownV2) {
      return Promise.reject(refusedBody('a classic-to-v2 update is not tried'));
    }
    const message = {
      v2: true,
      components: payload.components ?? [],
      ...('content' in payload ? { content: payload.content } : {}),
      ...('embeds' in payload ? { embeds: payload.embeds } : {}),
    } as unknown as OutgoingMessage;
    try {
      FakePartyGateway.checkV2(message, undefined, 'unchecked');
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    // A file component shows a file the message has: one sent with it or one it keeps.
    const before = target === 'shown' ? (shown.files ?? []) : target === 'reply' ? replyFiles : [];
    const names = new Set(filesAfter(payload, before).map(fileName));
    for (const url of fileUrls(payload.components ?? [])) {
      if (!names.has(url.replace(/^attachment:\/\//, ''))) {
        return Promise.reject(refusedBody(`no file ${url} in the message`));
      }
    }
    return undefined;
  };
  /** Notes what a send or an edit that went through made of its target. */
  const sentTo = (payload: SentPayload, target: 'shown' | 'reply'): void => {
    const isV2 = ((payload.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0;
    if (target === 'shown') {
      shownV2 ||= isV2;
      shown.files = filesAfter(payload, shown.files ?? []);
    } else {
      replyV2 ||= isV2;
      replyFiles = filesAfter(payload, replyFiles);
    }
  };
  const createdAt = o.createdTimestamp ?? Date.now();
  const shownMessage = () => ({
    id: shown.id,
    createdTimestamp: shown.createdTimestamp ?? createdAt,
    content: shown.content,
    attachments: shown.files ?? [],
    components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
    // As Discord sets it: a message whose components are more than rows is components v2.
    flags: new MessageFlagsBitField(
      (shownV2 || shown.rows.some((row) => row.type !== 1) ? MessageFlags.IsComponentsV2 : 0) |
        (o.ephemeralMessage === true ? MessageFlags.Ephemeral : 0),
    ).freeze(),
    interactionMetadata: o.askedBy === undefined ? null : { user: { id: o.askedBy } },
  });
  const submitted = kind === 'modal' ? submittedForm(o) : new Map<string, Submitted>();
  const notSubmitted = (id: string, what: string) =>
    new Error(`ModalSubmitInteractionFieldNotFound: the form submitted no ${what} ${id}`);
  /** Whether the interaction was acknowledged with `deferUpdate`. */
  let updating = false;
  /** The follow-ups sent so far: each is a message of its own (`followUpId`). */
  let followUps = 0;
  const memberRoles: [string, { id: string; name: string }][] = (o.roleNames ?? []).map(
    (name, i) => [String(i), { id: String(i), name }],
  );
  if (o.roleIds && guildId !== null) {
    memberRoles.push([guildId, { id: guildId, name: '@everyone' }]);
    for (const id of o.roleIds) {
      const name = o.guildRoleNames?.[id];
      if (name !== undefined) memberRoles.push([id, { id, name }]);
    }
  }
  const interaction = {
    id: '900000000000000001',
    type: TYPE[kind],
    createdTimestamp: createdAt,
    memberPermissions: o.isDm
      ? null
      : new PermissionsBitField(o.memberPermissions ?? o.permissions ?? 0n).freeze(),
    commandName: o.commandName,
    /** Discord's `ApplicationCommandType`: 1 for a slash command, 3 for a message command. */
    commandType: kind === 'message' ? 3 : kind === 'chat' || kind === 'autocomplete' ? 1 : null,
    customId: o.customId,
    guildId,
    channelId,
    client: {
      user: { id: FAKE_BOT_ID },
      // The servers the bot is in, by id, with their names (`serverNames`): what a press in a
      // DM reads a server's name from.
      guilds: {
        cache: new Map(
          Object.entries(o.serverNames ?? {}).map(
            ([id, name]) =>
              [
                id,
                {
                  id,
                  name,
                  available: !(o.unavailableServers ?? []).includes(id),
                  ...(o.serverMembers?.[id] === undefined
                    ? {}
                    : { memberCount: o.serverMembers[id] }),
                },
              ] as const,
          ),
        ),
      },
    },
    ...(kind === 'message' && o.targetMessage
      ? {
          targetId: o.targetMessage.id,
          targetMessage: targetOf(o.targetMessage, channelId, guildId),
        }
      : {}),
    user: {
      id: o.userId ?? FAKE_USER_ID,
      ...(o.username === undefined ? {} : { username: o.username }),
      ...(o.globalName === undefined ? {} : { globalName: o.globalName }),
    },
    member: o.isDm
      ? null
      : {
          displayName: o.displayName ?? 'Member',
          pending: o.pending ?? false,
          permissions: new PermissionsBitField(o.permissions ?? 0n).freeze(),
          roles: {
            cache: new Collection(memberRoles),
          },
        },
    guild:
      guildId === null
        ? null
        : {
            name: o.guildName ?? 'Test Server',
            channels: {
              cache: new Map(
                Object.entries(o.guildChannelNames ?? {}).map(([id, name]) => [id, { id, name }]),
              ),
            },
            roles: {
              cache: new Collection(
                Object.entries(o.guildRoleNames ?? {}).map(([id, name]) => [id, { id, name }]),
              ),
            },
          },
    channel: fakeChannel(o, channelId),
    appPermissions: new PermissionsBitField(o.appPermissions ?? PermissionsBitField.All).freeze(),
    // As in discord.js, only what comes from a message has one: a control, and a modal.
    ...(kind === 'button' || kind === 'select' || kind === 'modal'
      ? { message: shownMessage() }
      : {}),
    deferred: o.deferred ?? false,
    replied: o.replied ?? false,
    /** As in discord.js: null until a reply or deferral says which. */
    ephemeral: null as boolean | null,
    responded: false,
    values: o.values ?? [],
    isChatInputCommand: () => kind === 'chat',
    isMessageContextMenuCommand: () => kind === 'message',
    isContextMenuCommand: () => kind === 'message',
    isAutocomplete: () => kind === 'autocomplete',
    isMessageComponent: () => kind === 'button' || kind === 'select',
    isButton: () => kind === 'button',
    isAnySelectMenu: () => kind === 'select',
    isStringSelectMenu: () =>
      kind === 'select' && o.pickedChannels === undefined && o.pickedRoles === undefined,
    isChannelSelectMenu: () => kind === 'select' && o.pickedChannels !== undefined,
    isRoleSelectMenu: () => kind === 'select' && o.pickedRoles !== undefined,
    channels: new Collection((o.pickedChannels ?? []).map((one) => [one.id, one])),
    roles: new Collection((o.pickedRoles ?? []).map((one) => [one.id, one])),
    isModalSubmit: () => kind === 'modal',
    /** A form that a control of a message opened; `modalFromCommand` says a command did. */
    isFromMessage: () => kind === 'modal' && o.modalFromCommand !== true,
    inCachedGuild: () => guildId !== null,
    inGuild: () => guildId !== null,
    options: {
      get data() {
        return optionData();
      },
      getString: (name: string, required?: boolean) => value<string>(name, 'string', required),
      getInteger: (name: string, required?: boolean) => value<number>(name, 'number', required),
      getNumber: (name: string, required?: boolean) => value<number>(name, 'number', required),
      getBoolean: (name: string, required?: boolean) => value<boolean>(name, 'boolean', required),
      getUser: resolved,
      getMember: (name: string, required?: boolean) =>
        o.resolvedMembers && name in o.resolvedMembers
          ? (o.resolvedMembers[name] ?? null)
          : resolved(name, required),
      getRole: resolved,
      getChannel: resolved,
      getAttachment: resolved,
      /** As in discord.js, a subcommand is required unless the caller says otherwise. */
      getSubcommand: (required?: boolean) => {
        if (o.subcommand === undefined && required !== false) {
          throw new Error('The fake has no subcommand');
        }
        return o.subcommand ?? null;
      },
      /** As in discord.js, a subcommand group is optional unless the caller says otherwise. */
      getSubcommandGroup: (required?: boolean) => {
        if (o.subcommandGroup === undefined && required === true) {
          throw new Error('The fake has no subcommand');
        }
        return o.subcommandGroup ?? null;
      },
      getFocused: (full?: boolean) =>
        full ? { name: o.focusedName ?? 'option', value: o.focused ?? '' } : (o.focused ?? ''),
    },
    // As discord.js: reading an input the form did not submit, or of another type, throws.
    fields: {
      /** As discord.js's `fields.fields`: what the form submitted, by custom id. */
      fields: submitted,
      getTextInputValue: (id: string) => {
        const input = submitted.get(id);
        if (input?.type !== ComponentType.TextInput) throw notSubmitted(id, 'text input');
        return input.value;
      },
      getStringSelectValues: (id: string) => {
        const input = submitted.get(id);
        if (input?.type !== ComponentType.StringSelect) throw notSubmitted(id, 'select menu');
        return input.values;
      },
      getCheckboxGroup: (id: string) => {
        const input = submitted.get(id);
        if (input?.type !== ComponentType.CheckboxGroup) throw notSubmitted(id, 'checkbox group');
        return input.values;
      },
      /** As discord.js: whether one tick box (`ComponentType.Checkbox`) was ticked. */
      getCheckbox: (id: string) => {
        const input = submitted.get(id);
        if (input?.type !== ComponentType.Checkbox) throw notSubmitted(id, 'checkbox');
        return input.value;
      },
      /** As discord.js: `null` for nothing picked, unless `required`, which then throws. */
      getRadioGroup: (id: string, required?: boolean) => {
        const input = submitted.get(id);
        if (input?.type !== ComponentType.RadioGroup) throw notSubmitted(id, 'radio group');
        if (input.value === null && required === true) {
          throw new Error(`ModalSubmitInteractionFieldEmpty: nothing was picked in ${id}`);
        }
        return input.value;
      },
    },
    // As in discord.js, these are async: a refusal rejects.
    reply: vi.fn((payload: SentPayload) => {
      const refused = refuseIfAcknowledged() ?? refuseV2(payload, 'reply');
      if (refused) return refused;
      const invalid = refuseInvalid(payload);
      if (invalid) return invalid;
      sentTo(payload, 'reply');
      interaction.replied = true;
      interaction.ephemeral = isEphemeral(payload);
      return Promise.resolve();
    }),
    deferReply: vi.fn((payload?: SentPayload) => {
      const refused = refuseIfAcknowledged();
      if (refused) return refused;
      interaction.deferred = true;
      interaction.ephemeral = isEphemeral(payload);
      return Promise.resolve();
    }),
    editReply: vi.fn((payload: SentPayload) => {
      // After `deferUpdate` the reply is the message the control is on.
      const target = updating ? 'shown' : 'reply';
      const refused = refuseIfFresh() ?? refuseV2(payload, target);
      if (refused) return refused;
      const invalid = refuseInvalid(payload);
      if (invalid) return invalid;
      interaction.replied = true;
      sentTo(payload, target);
      if (updating && payload.content !== undefined) shown.content = payload.content;
      if (updating && payload.components !== undefined) {
        shown.rows = payload.components.map((row) =>
          typeof (row as { toJSON?: unknown }).toJSON === 'function'
            ? (row as { toJSON(): FakeRow }).toJSON()
            : (row as FakeRow),
        );
      }
      return Promise.resolve();
    }),
    /** The reply as it is now: after `deferUpdate`, the message the control is on. */
    fetchReply: vi.fn(() => {
      const refused = refuseIfFresh();
      if (refused) return refused;
      return Promise.resolve(shownMessage());
    }),
    /** The reply, or the follow-up of this id (as discord.js: `deleteReply(message)`). */
    deleteReply: vi.fn((_message?: string) => {
      const refused = refuseIfFresh();
      if (refused) return refused;
      return Promise.resolve();
    }),
    /** A new message, which discord.js answers: here its id alone (`followUpId`). */
    followUp: vi.fn((payload: SentPayload): Promise<unknown> => {
      const refused = refuseIfFresh() ?? refuseV2(payload, 'followUp');
      if (refused) return refused;
      const invalid = refuseInvalid(payload);
      if (invalid) return invalid;
      interaction.replied = true;
      return Promise.resolve({ id: followUpId(followUps++) });
    }),
    /** Components and modals: acknowledge, or change the message the control is on. */
    deferUpdate: vi.fn(() => {
      const refused = refuseIfAcknowledged();
      if (refused) return refused;
      interaction.deferred = true;
      updating = true;
      return Promise.resolve();
    }),
    update: vi.fn((payload: SentPayload) => {
      const refused = refuseIfAcknowledged() ?? refuseV2(payload, 'shown');
      if (refused) return refused;
      const invalid = refuseInvalid(payload);
      if (invalid) return invalid;
      interaction.replied = true;
      sentTo(payload, 'shown');
      return Promise.resolve();
    }),
    showModal: vi.fn((modal: unknown) => {
      const refused = refuseIfAcknowledged();
      if (refused) return refused;
      try {
        checkModal(modal);
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
      interaction.replied = true;
      return Promise.resolve();
    }),
    respond: vi.fn((_choices: ReadonlyArray<{ name: string; value: string | number }>) => {
      if (interaction.responded) {
        return Promise.reject(new Error('InteractionAlreadyReplied: the fake already responded'));
      }
      interaction.responded = true;
      return Promise.resolve();
    }),
  };
  return interaction;
}

export const fakeChatInput = (o: FakeOptions = {}) => base('chat', { commandName: 'test', ...o });
export const fakeAutocomplete = (o: FakeOptions = {}) =>
  base('autocomplete', { commandName: 'test', ...o });
export const fakeButton = (o: FakeOptions = {}) => base('button', o);
export const fakeSelect = (o: FakeOptions = {}) => base('select', o);
export const fakeModal = (o: FakeOptions = {}) => base('modal', o);
/** A message command used on `o.targetMessage` (Discord's Apps menu on a message). */
export const fakeMessageCommand = (o: FakeOptions = {}) =>
  base('message', { commandName: 'Report to moderators', ...o });
export type FakeInteraction = ReturnType<typeof base>;

/**
 * The payload of the n-th call (default: the first) of any responder mock of a fake: `reply`,
 * `followUp`, `editReply`, `update` or `deferReply`.
 */
/**
 * The n-th answer (default: the first) a fake was given through `reply` or `editReply`, in the
 * order they were sent: what a command with a late deferral said (`answer` of
 * `src/discord/late-reply.ts` replies directly when nothing was acknowledged, and edits
 * otherwise), whichever of the two it used.
 */
export function answered(
  fake: {
    reply: {
      mock: { calls: ReadonlyArray<readonly [SentPayload?]>; invocationCallOrder: number[] };
    };
    editReply: {
      mock: { calls: ReadonlyArray<readonly [SentPayload?]>; invocationCallOrder: number[] };
    };
  },
  call = 0,
): SentPayload {
  const all = [fake.reply, fake.editReply]
    .flatMap(({ mock }) =>
      mock.calls.map((args, index) => ({
        at: mock.invocationCallOrder[index] ?? 0,
        payload: args[0],
      })),
    )
    .sort((a, b) => a.at - b.at);
  const payload = all[call]?.payload;
  if (!payload) throw new Error(`nothing was answered in call ${call}`);
  return payload;
}

export function sent(
  mock: { mock: { calls: ReadonlyArray<readonly [SentPayload?]> } },
  call = 0,
): SentPayload {
  const payload = mock.mock.calls[call]?.[0];
  if (!payload) throw new Error(`nothing was sent in call ${call}`);
  return payload;
}

/**
 * A payload sent with the components-v2 flag (`v2Answer`) as the message it is, for the readers
 * of `test/support/messages.ts`; fails the test for a payload without the flag.
 */
export function asV2(payload: SentPayload): V2Message {
  if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) {
    throw new Error('The payload has no IsComponentsV2 flag');
  }
  const files = (payload.files ?? []).map((file) => String(fileName(file)));
  return {
    v2: true,
    components: (payload.components ?? []) as V2Message['components'],
    ...(files.length === 0 ? {} : { files }),
  };
}
