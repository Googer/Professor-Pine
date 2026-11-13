import {
  ChannelType,
  SlashCommandSubcommandBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import {
  SERVER_CHANNEL_ROLES,
  settingChanges,
  type SettingChange,
  type ServerChannelRole,
  type ServerValues,
  type UnmatchedKey,
} from '../../config/server-settings.js';
import type { ComponentHandler, LocatedInteraction } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import { dialog, openToken, withoutOpenToken, TEXT_ROOM } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireBotManagement } from '../../discord/guards.js';
import {
  answer,
  answerPress,
  pressAnswer,
  readOrDeferPress,
  v2Answer,
  type Press,
} from '../../discord/late-reply.js';
import { actorOf } from '../../discord/member-info.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { zoneAbbreviation, zoneNamed } from '../../domain/time/zoned.js';
import { changesSaid, refusalWords } from '../../render/server-settings.js';
import { plain, truncate } from '../../render/text.js';
import { ServerValuesError } from '../../services/server-settings.js';
import {
  ADD,
  ASK,
  channelTypes,
  CONFIRM,
  DIALOGS,
  isSection,
  isWordList,
  KEEP,
  LEFT_UNSET,
  OFF,
  ON,
  PANEL,
  RECENT_CHANGES,
  REMOVE,
  SAID_ROOM,
  UNSET,
  sectionOf,
  SERVER_KIND,
  serverPanel,
  SET,
  SHOW,
  switchesOf,
  type DialogKey,
  type Instance,
  type SectionName,
  type WordListKey,
  wordsTooMany,
} from './server-settings-panel.js';

/** What a change of what is set already says. */
const ALREADY = 'That was so already.';

/** What the instance allows a server (the file, and the intents Pine was granted at login). */
function instanceOf(ctx: AppContext): Instance {
  return {
    passiveReading: ctx.config.settings.ocr.passive && ctx.features.ocrPassive,
    autoAssignRole: ctx.config.settings.autoAssignRole && ctx.features.autoAssignRole,
  };
}

/**
 * The panel of the interaction's server at `section`, read afresh (Recent changes from the
 * staff's log), with what the press changed.
 */
async function panelNow(
  interaction: LocatedInteraction,
  ctx: AppContext,
  section: SectionName,
  said?: string,
  confirming?: UnmatchedKey,
): Promise<V2Message> {
  const serverId = guildIdOf(interaction);
  const records =
    section === 'changes'
      ? // One more than it shows: whether there are earlier ones (H8), as `/audit` reads.
        await ctx.serverSettingsAudit.ofServer(serverId, RECENT_CHANGES + 1)
      : undefined;
  const now = Date.now();
  return serverPanel(
    {
      values: ctx.servers.of(serverId),
      section,
      instance: instanceOf(ctx),
      timezone: ctx.servers.zoneOf(serverId),
      now,
      ...(records === undefined ? {} : { changes: { records, now } }),
      ...(confirming === undefined ? {} : { confirming }),
      // The channels and roles the server has now (review G2), from the client's cache, which is
      // what `PartyGateway.serverChannels` reads.
      ...(interaction.inCachedGuild()
        ? {
            known: {
              channels: new Set(interaction.guild.channels.cache.keys()),
              roles: new Set(interaction.guild.roles.cache.keys()),
            },
          }
        : {}),
    },
    said,
  );
}

/**
 * What a press does: `work` changes what it changes and says what, then the panel of `section`
 * is read afresh and shown in its place with that line (`pressAnswer`: the panel is private, so
 * it is changed in place), acknowledged as it will be answered where that takes longer than
 * `LATE_DEFER_MS`.
 */
async function changed(
  interaction: Press,
  ctx: AppContext,
  section: SectionName,
  work: () => Promise<string | undefined>,
  confirming?: UnmatchedKey,
): Promise<void> {
  const how = pressAnswer(interaction);
  const drawing = (async () => panelNow(interaction, ctx, section, await work(), confirming))();
  await answerPress(interaction, how, await readOrDeferPress(interaction, how, drawing));
}

/**
 * Changes the server's values (`ServerSettings.set`, by the presser, logged) and says what
 * changed (`said`; by default a sentence a setting); `ALREADY` where nothing did; a refusal of
 * the values (`ServerValuesError`) in words, nothing changed.
 */
async function setValues(
  interaction: Press,
  ctx: AppContext,
  change: (values: ServerValues) => ServerValues,
  said: (changes: SettingChange[]) => string = (changes) => changesSaid(changes, SAID_ROOM),
): Promise<string> {
  let before: ServerValues | undefined;
  try {
    const after = await ctx.servers.set(
      guildIdOf(interaction),
      (values) => {
        before = values;
        return change(values);
      },
      actorOf(interaction),
    );
    const changes = before === undefined ? [] : settingChanges(before, after);
    return changes.length === 0 ? ALREADY : said(changes);
  } catch (err) {
    if (err instanceof ServerValuesError) return refusalWords(err.problems);
    throw err;
  }
}

/** `channels.moderation` → a change of `channels` that sets (or, undefined, clears) it. */
function setInner(
  key: string,
  value: string | undefined,
): ((v: ServerValues) => ServerValues) | undefined {
  const [outer, inner, ...rest] = key.split('.');
  if (inner === undefined || rest.length > 0) return undefined;
  if (outer !== 'channels' && outer !== 'categories' && outer !== 'roles') return undefined;
  return (values) => {
    const kept: Record<string, string | undefined> = { ...values[outer] };
    if (value === undefined) delete kept[inner];
    else kept[inner] = value;
    return { ...values, [outer]: kept };
  };
}

/** The keys a channel, category or role select sets. */
const SELECT_KEYS: ReadonlySet<string> = new Set([
  ...SERVER_CHANNEL_ROLES.map((role) => `channels.${role}`),
  'categories.pvp',
  'roles.unown',
  'roles.mapMember',
]);

/** The kinds of channel a key's select takes: the PvP category a category. */
const pickedTypes = (key: string): readonly ChannelType[] =>
  key === 'categories.pvp'
    ? [ChannelType.GuildCategory]
    : channelTypes(key.slice('channels.'.length) as ServerChannelRole);

/**
 * Whether a pick of a channel, category or role select is what its setting takes (review G3): a
 * channel select's channel of a kind it takes and of this server, a role select's role other
 * than the server's own (@everyone), as Discord resolved them; none (a select left empty)
 * clears it. A custom id can be sent by anybody with any values: anything else is stale.
 */
function pickedFits(
  interaction: AnySelectMenuInteraction,
  key: string,
  value: string | undefined,
): boolean {
  if (value === undefined) return true;
  const serverId = interaction.guildId;
  if (key.startsWith('roles.')) {
    return interaction.isRoleSelectMenu() && interaction.roles.has(value) && value !== serverId;
  }
  if (!interaction.isChannelSelectMenu()) return false;
  const channel = interaction.channels.get(value);
  if (channel === undefined || !pickedTypes(key).includes(channel.type)) return false;
  const server =
    'guildId' in channel ? channel.guildId : 'guild_id' in channel ? channel.guild_id : undefined;
  return server === serverId;
}

/** A pick of a menu: the sections, a channel, the category, a role, the units. */
function picked(
  interaction: AnySelectMenuInteraction,
  id: CustomId,
  ctx: AppContext,
): Promise<void> {
  const [value, ...more] = interaction.values;
  if (more.length > 0 || id.args.length > 0) throw new UserError(STALE_COMPONENT);
  if (id.id === PANEL && id.action === SHOW) {
    if (!isSection(value)) throw new UserError(STALE_COMPONENT);
    return changed(interaction, ctx, value, () => Promise.resolve(undefined));
  }
  if (id.action !== SET) throw new UserError(STALE_COMPONENT);
  if (id.id === 'distanceUnits') {
    if (value !== 'imperial' && value !== 'metric') throw new UserError(STALE_COMPONENT);
    return changed(interaction, ctx, 'text', () =>
      setValues(interaction, ctx, (values) => ({ ...values, distanceUnits: value })),
    );
  }
  const change = SELECT_KEYS.has(id.id) ? setInner(id.id, value) : undefined;
  if (change === undefined || !pickedFits(interaction, id.id, value)) {
    throw new UserError(STALE_COMPONENT);
  }
  return changed(interaction, ctx, sectionOf(id.id), () => setValues(interaction, ctx, change));
}

/** A feature's button: sets what it shows it sets. */
function switched(interaction: ButtonInteraction, id: CustomId, ctx: AppContext): Promise<void> {
  const [state, ...rest] = id.args;
  const on = state === ON ? true : state === OFF ? false : undefined;
  const one = switchesOf(instanceOf(ctx)).find((each) => each.key === id.id);
  if (on === undefined || rest.length > 0 || one === undefined)
    throw new UserError(STALE_COMPONENT);
  // `features.roles` is one of the features; `postNewGyms` and the others stand by themselves.
  const feature = one.key.startsWith('features.') ? one.key.slice('features.'.length) : undefined;
  return changed(interaction, ctx, 'features', () =>
    setValues(interaction, ctx, (values) =>
      feature === undefined
        ? { ...values, [one.key]: on }
        : { ...values, features: { ...values.features, [feature]: on } },
    ),
  );
}

/** The settings whose name, not found by the fill, may be left unset. */
const UNMATCHED_KEYS: readonly UnmatchedKey[] = ['channels.moderation', 'roles.mapMember'];

/**
 * Leave unset (fix round 3, H9; fix round 4, I2): a setting the settings file named and the fill
 * did not find is no longer kept closed, nothing chosen in its place. The first press
 * (`server:<key>:unset`) writes nothing: the panel asks in that setting's place, saying what it
 * would do; Leave unset there (`server:<key>:unset:confirm`) writes and logs it as any change and
 * says what it did (`LEFT_UNSET`); Keep it closed (`server:<key>:keep`) shows the panel as it was.
 */
function leftUnset(interaction: ButtonInteraction, id: CustomId, ctx: AppContext): Promise<void> {
  const key = UNMATCHED_KEYS.find((one) => one === id.id);
  const [arg, ...rest] = id.args;
  if (key === undefined || rest.length > 0) throw new UserError(STALE_COMPONENT);
  const section = sectionOf(key);
  if (id.action === KEEP || arg === undefined) {
    if (id.action === KEEP && arg !== undefined) throw new UserError(STALE_COMPONENT);
    const asking = id.action === UNSET ? key : undefined;
    return changed(interaction, ctx, section, () => Promise.resolve(undefined), asking);
  }
  if (arg !== CONFIRM) throw new UserError(STALE_COMPONENT);
  return changed(interaction, ctx, section, () =>
    setValues(
      interaction,
      ctx,
      ({ unmatched, ...values }) => {
        const still = (unmatched ?? []).filter((one) => one !== key);
        return still.length === 0 ? values : { ...values, unmatched: still };
      },
      () => LEFT_UNSET[key],
    ),
  );
}

const isDialogKey = (key: string): key is DialogKey => (DIALOGS as readonly string[]).includes(key);

/** The ids of the dialogs' lines of text. */
const FIELDS = {
  zone: 'zone',
  horizonDays: 'horizonDays',
  postDaysAhead: 'postDaysAhead',
  onThisDay: 'onThisDay',
  words: 'words',
  suffix: 'suffix',
  link: 'link',
  invite: 'invite',
} as const;

/** The words of a list's dialogs: its title, what it does, what empty means, its words in a sentence. */
const WORDS_DIALOG: Readonly<
  Record<WordListKey, { title: string; text: string; empty: string; many: string }>
> = {
  flaggedWords: {
    title: 'Flagged words',
    text:
      'Words and phrases that send a meetup at a place whose name has one to the moderators ' +
      'first, besides Pine’s own list. One a line.',
    empty: 'Empty: Pine’s own list alone',
    many: 'flagged words',
  },
  blacklistWords: {
    title: 'Words gym search ignores',
    text:
      'Words that gym search skips in gym names and in what members type, such as “gym” or ' +
      '“raid”, besides common English words. One a line.',
    empty: 'Empty: common English words alone',
    many: 'words gym search ignores',
  },
};

/** How long a zone's name typed may be (the zone database's longest is 32). */
const ZONE_ROOM = 64;

/**
 * The dialog of a setting changed in one, its values as they are to start with (`zone`: the
 * server's zone, its own or the instance's default).
 */
function settingDialog(
  key: DialogKey,
  values: ServerValues,
  zone: string,
  now: number,
  removing = false,
) {
  // A list of words too many to show is added to or taken from, never typed anew (review G5).
  const words = !isWordList(key) || !wordsTooMany(values[key]) ? SET : removing ? REMOVE : ADD;
  const customId = encodeCustomId({
    kind: SERVER_KIND,
    id: key,
    action: words,
    args: [openToken(now)],
  });
  switch (key) {
    case 'timezone':
      return dialog({
        customId,
        title: 'The time zone',
        text:
          'The zone of every time members of this server type and Pine shows them, and of its ' +
          'days: a name such as `America/New_York`, `Europe/Berlin` or `Asia/Kolkata`.',
        field: {
          id: FIELDS.zone,
          label: 'Time zone',
          maxLength: ZONE_ROOM,
          required: true,
          placeholder: 'America/New_York',
          value: zone,
        },
      });
    case 'eventsForum': {
      const number = (id: string, label: string, value: number, description: string) => ({
        id,
        label,
        description,
        maxLength: 3,
        required: true as const,
        value: String(value),
      });
      return dialog({
        customId,
        title: 'The events forum',
        fields: [
          number(FIELDS.horizonDays, 'Days listed', values.eventsForum.horizonDays, '1 to 365'),
          number(
            FIELDS.postDaysAhead,
            'Days before an event that its post opens',
            values.eventsForum.postDaysAhead,
            '0 to 365, at most the days listed',
          ),
          number(
            FIELDS.onThisDay,
            'Big days “On this day” recalls',
            values.eventsForum.onThisDay,
            'The top days of earlier years, 0 to 10; 0 turns it off',
          ),
        ],
      });
    }
    case 'flaggedWords':
    case 'blacklistWords': {
      const list = WORDS_DIALOG[key];
      if (words !== SET) {
        const adding = words === ADD;
        return dialog({
          customId,
          title: adding ? 'Words to add' : 'Words to remove',
          text: adding
            ? `The ${list.many} are too many to show here (${String(values[key].length)}). ` +
              'What you type is added to them, one a line; Remove… on the panel takes some off.'
            : `What you type is taken off the ${list.many}, one a line, whatever its letter case.`,
          field: {
            id: FIELDS.words,
            label: adding ? 'Words to add' : 'Words to remove',
            maxLength: TEXT_ROOM,
            paragraph: true,
            required: true,
          },
        });
      }
      const shown = values[key].join('\n');
      return dialog({
        customId,
        title: list.title,
        text: list.text,
        field: {
          id: FIELDS.words,
          label: 'Words',
          maxLength: TEXT_ROOM,
          paragraph: true,
          placeholder: list.empty,
          ...(shown === '' ? {} : { value: shown }),
        },
      });
    }
    case 'regionForumSuffix':
      return dialog({
        customId,
        title: 'The ending of region forums',
        text:
          'What the name of a region’s forum adds to its channel’s: `north` gets `north-board`. ' +
          'A hyphen and up to 30 letters; empty sets it back to `-board`.',
        field: {
          id: FIELDS.suffix,
          label: 'Ending',
          maxLength: 31,
          placeholder: '-board',
          value: values.regionForumSuffix,
        },
      });
    case 'regionMapLink':
      return dialog({
        customId,
        title: 'The region map link',
        text: 'The address of a map of all regions, which `/maps` gives members. Empty clears it.',
        field: {
          id: FIELDS.link,
          label: 'Link',
          maxLength: 500,
          placeholder: 'https://…',
          ...(values.regionMapLink === undefined ? {} : { value: values.regionMapLink }),
        },
      });
    case 'invite':
      return dialog({
        customId,
        title: 'The invite of this server',
        text:
          'An invite for a visitor of the web map who is not in this server: ' +
          '`https://discord.gg/<code>`. Empty clears it.',
        field: {
          id: FIELDS.invite,
          label: 'Invite',
          maxLength: 100,
          placeholder: 'https://discord.gg/…',
          ...(values.invite === undefined ? {} : { value: values.invite }),
        },
      });
  }
}

/** A line of a Submit, '' where it has none (a dialog of another shape is a stale one). */
function line(interaction: ModalSubmitInteraction, id: string): string {
  if (!interaction.fields.fields.has(id)) throw new UserError(STALE_COMPONENT);
  return interaction.fields.getTextInputValue(id).trim();
}

/** A whole number typed, or the refusal of it. */
function wholeNumber(text: string, key: string): number | string {
  return /^\d{1,3}$/u.test(text)
    ? Number(text)
    : refusalWords([{ key, message: 'must be a whole number' }]);
}

/**
 * The words typed: one a line, each once (whatever its letter case); never split at a comma,
 * which a phrase may have (review G5).
 */
function typedWords(text: string): string[] {
  const words: string[] = [];
  for (const word of text.split('\n').map((one) => one.trim())) {
    if (word !== '' && !words.some((kept) => kept.toLowerCase() === word.toLowerCase())) {
      words.push(word);
    }
  }
  return words;
}

/** What a Submit of a setting's dialog changes; a string where it refuses before the change. */
function submitted(
  interaction: ModalSubmitInteraction,
  key: DialogKey,
  action: string,
): ((values: ServerValues) => ServerValues) | string {
  if (action === ADD || action === REMOVE) {
    const typed = typedWords(line(interaction, FIELDS.words));
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    if (!isWordList(key)) throw new UserError(STALE_COMPONENT);
    return (values) => {
      const kept = values[key];
      return {
        ...values,
        [key]:
          action === ADD
            ? [...kept, ...typed.filter((word) => !kept.some((one) => same(one, word)))]
            : kept.filter((one) => !typed.some((word) => same(one, word))),
      };
    };
  }
  switch (key) {
    case 'timezone': {
      const typed = line(interaction, FIELDS.zone);
      const timezone = zoneNamed(typed);
      // Refused in the panel's own words, never the checker's (review G4); an abbreviation follows
      // no place's daylight saving time (fix round 1, K2).
      if (timezone === undefined && zoneAbbreviation(typed)) {
        return (
          `Not changed: “${plain(truncate(typed, ZONE_ROOM))}” is an abbreviation; ` +
          'use a name such as America/New_York.'
        );
      }
      if (timezone === undefined) {
        return (
          `Not changed: “${plain(truncate(typed, ZONE_ROOM))}” is not a time zone I know; ` +
          'use a name such as America/Chicago.'
        );
      }
      return (values) => ({ ...values, timezone });
    }
    case 'eventsForum': {
      const numbers = {
        horizonDays: wholeNumber(line(interaction, FIELDS.horizonDays), 'eventsForum.horizonDays'),
        postDaysAhead: wholeNumber(
          line(interaction, FIELDS.postDaysAhead),
          'eventsForum.postDaysAhead',
        ),
        onThisDay: wholeNumber(line(interaction, FIELDS.onThisDay), 'eventsForum.onThisDay'),
      };
      const refused = Object.values(numbers).find((one) => typeof one === 'string');
      if (typeof refused === 'string') return refused;
      return (values) => ({ ...values, eventsForum: numbers as ServerValues['eventsForum'] });
    }
    case 'flaggedWords':
    case 'blacklistWords': {
      const words = typedWords(line(interaction, FIELDS.words));
      return (values) => ({ ...values, [key]: words });
    }
    case 'regionForumSuffix': {
      const suffix = line(interaction, FIELDS.suffix) || '-board';
      return (values) => ({ ...values, regionForumSuffix: suffix });
    }
    case 'regionMapLink': {
      const link = line(interaction, FIELDS.link);
      return ({ regionMapLink: _gone, ...values }) =>
        link === '' ? values : { ...values, regionMapLink: link };
    }
    case 'invite': {
      const invite = line(interaction, FIELDS.invite);
      return ({ invite: _gone, ...values }) => (invite === '' ? values : { ...values, invite });
    }
  }
}

/**
 * The controls of `/admin settings` (plan 19A-1): for the people `/admin` is for
 * (`requireBotManagement`, asked again at every press: a command's guards do not cover its
 * controls), every press counted in one window (`MEMBER_WRITE_THROTTLE`). Each press changes
 * through `ServerSettings.set` (written first, logged with who and when) and shows the panel
 * again in place at the section of what it changed, saying what changed, or why not.
 */
export const serverSettingsControls: ComponentHandler = {
  kind: SERVER_KIND,
  guards: [requireBotManagement],
  throttle: () => MEMBER_WRITE_THROTTLE,
  async button(interaction, id, ctx) {
    const serverId = guildIdOf(interaction);
    if (id.action === ASK && id.args.length === 0 && isDialogKey(id.id)) {
      await interaction.showModal(
        settingDialog(id.id, ctx.servers.of(serverId), ctx.servers.zoneOf(serverId), Date.now()),
      );
      return;
    }
    if (id.action === ASK && isWordList(id.id) && id.args.join(':') === REMOVE) {
      await interaction.showModal(
        settingDialog(
          id.id,
          ctx.servers.of(serverId),
          ctx.servers.zoneOf(serverId),
          Date.now(),
          true,
        ),
      );
      return;
    }
    if (id.action === UNSET || id.action === KEEP) {
      await leftUnset(interaction, id, ctx);
      return;
    }
    if (id.action !== SET) throw new UserError(STALE_COMPONENT);
    await switched(interaction, id, ctx);
  },
  async select(interaction, id, ctx) {
    await picked(interaction, id, ctx);
  },
  async modal(interaction, id, ctx) {
    const words = isWordList(id.id) && (id.action === ADD || id.action === REMOVE);
    if (
      (id.action !== SET && !words) ||
      !isDialogKey(id.id) ||
      withoutOpenToken(id.args).length > 0
    ) {
      throw new UserError(STALE_COMPONENT);
    }
    const change = submitted(interaction, id.id, id.action);
    await changed(interaction, ctx, 'text', () =>
      typeof change === 'string' ? Promise.resolve(change) : setValues(interaction, ctx, change),
    );
  },
};

/**
 * `/admin settings` (plan 19A-1, `servers.md`): the server's settings, which the settings file
 * held before 2.1, as one private panel that changes in place, in sections; for the people
 * `/admin` is for. Opens on the channels.
 */
export const serverSettings: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('settings')
    .setDescription('See and change this server’s settings: channels, roles, features'),
  help: {
    details:
      'Shows this server’s settings, only to you, in sections, with menus and buttons to ' +
      'change them: the channels Pine uses by their role, the PvP category, the Unown role and ' +
      'the map’s member role, and the features.\n\nUnder Text and numbers: the time zone (every ' +
      'time members type and Pine shows in this server, and its days), the distance units, ' +
      'the events forum’s numbers, the flagged words of meetup safety, the words gym search ' +
      'ignores, the ending of region forums, the region map link and the invite of the web ' +
      'map.\n\nEvery change is logged with who made it and when: **Recent ' +
      'changes** shows the last ones, and `/audit member:` lists a member’s. The log keeps 30 ' +
      'days.',
    examples: ['/admin settings'],
  },
  defer: 'late',
  async execute(interaction, ctx) {
    await answer(interaction, v2Answer(await panelNow(interaction, ctx, 'channels')));
  },
};
