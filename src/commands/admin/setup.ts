import {
  ButtonStyle,
  ComponentType,
  SlashCommandSubcommandBuilder,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, LocatedInteraction } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireServerAdmin } from '../../discord/guards.js';
import {
  answer,
  answerApart,
  answerPress,
  pressAnswer,
  readOrDeferPress,
  v2Answer,
} from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import {
  OTHER_CHANNELS,
  otherChannels,
  SETUP_ITEMS,
  setupItems,
  type SetupFacts,
  type SetupItem,
  type SetupItemKey,
} from '../../domain/servers/setup.js';
import { unitsWords } from '../../render/distance-words.js';
import { count } from '../../render/text.js';
import { container, LIST_COLOUR, section, textDisplay } from '../../render/v2.js';
import { panelNow } from './server-settings.js';
import type { SectionName } from './server-settings-panel.js';

/**
 * The custom ids of `/admin setup`'s checklist (plan 19C-2): `setup:<item>:show` (`setup:bot-lab:show`)
 * opens the settings panel at the section the item is set in (`ITEMS`) in a private message of its
 * own, the checklist staying where it is; `setup:list:show` (Check again) draws the checklist again in
 * place, after asking whether the server leaves setup. The server is the interaction's.
 */
export const SETUP_KIND = 'setup';
const SHOW = 'show';
const LIST = 'list';

/** Each item's name, and the panel section it is set in (none: a command sets it). */
const ITEMS: Readonly<Record<SetupItemKey, { name: string; section?: SectionName }>> = {
  timezone: { name: 'Time zone and units', section: 'text' },
  'bot-lab': { name: 'Bot lab', section: 'channels' },
  'mod-bot-lab': { name: 'Moderators’ bot lab', section: 'channels' },
  region: { name: 'The first region' },
  moderation: { name: 'Moderators’ channel', section: 'channels' },
  events: { name: 'Events forum', section: 'channels' },
  channels: { name: 'Other channels', section: 'channels' },
  gyms: { name: 'Gyms' },
};

const isItem = (key: string): key is SetupItemKey =>
  (SETUP_ITEMS as readonly string[]).includes(key);

/** The other channels by name, in `OTHER_CHANNELS`' order. */
const OTHER_NAMES: Readonly<Record<(typeof OTHER_CHANNELS)[number], string>> = {
  unown: 'Unown',
  'elite-gym-raids': 'elite gym raids',
  'remote-raids': 'remote raids',
  pvp: 'PvP',
  'bot-updates': 'bot updates',
};

/** What the checklist shows besides its items. */
export interface ChecklistState {
  facts: SetupFacts;
  inSetup: boolean;
  /** The zone the server has meanwhile: the instance's default. */
  defaultZone: string;
  /** The server's distance units. */
  units: 'imperial' | 'metric';
  /** Where the Wayfarer export tool is asked for (`settings.wayspotTool`). */
  tool: string;
  /** Whether this instance has the web pages, and with them the region editor. */
  editor: boolean;
}

/** A channel set, or what it is for while it is not. */
const channelLine = (id: string | undefined, unset: string, set: string): string =>
  id === undefined ? unset : `${set} <#${id}>.`;

/** The line under an item's name: what it is set to, or what it needs and where. */
function itemDetail(key: SetupItemKey, state: ChecklistState): string {
  const { channels, timezone } = state.facts.values;
  const units = unitsWords(state.units);
  switch (key) {
    case 'timezone':
      return timezone === undefined
        ? 'Pine reads and shows every time in the server’s time zone. Until you choose one, ' +
            `Pine uses \`${state.defaultZone}\`. Distances are in ${units}.`
        : `\`${timezone}\`. Distances are in ${units}.`;
    case 'bot-lab':
      return channelLine(
        channels['bot-lab'],
        'Where members use most of Pine’s commands.',
        'Members use most of Pine’s commands in',
      );
    case 'mod-bot-lab':
      return channelLine(
        channels['mod-bot-lab'],
        'Where Pine tells staff what needs their attention.',
        'Pine tells staff what needs their attention in',
      );
    case 'region': {
      const { regions } = state.facts;
      if (regions > 0) return `${count(regions, 'region')} with an outline.`;
      const editor = state.editor ? 'draw a channel’s outline with `/region edit`, or ' : '';
      return (
        'A region is a channel with an outline on the map. Its raids and trains are posted in ' +
        `a forum of its own. To make one, ${editor}import a KML file of outlines with ` +
        '`/region import`.'
      );
    }
    case 'moderation':
      return channelLine(
        channels.moderation,
        'Where reports and the meetups held for approval go. Until you pick one, `/report` is ' +
          'refused and meetup safety is off.',
        'Reports and the meetups held for approval go to',
      );
    case 'events':
      return channelLine(
        channels.events,
        'A forum of the game’s events. Pick one, or make one with `/admin setup-forums`.',
        'The game’s events are in',
      );
    case 'channels': {
      const names = OTHER_CHANNELS.map((role) => OTHER_NAMES[role]);
      const named = `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
      return `${named}: ${String(otherChannels(state.facts))} of ${String(OTHER_CHANNELS.length)} set.`;
    }
    case 'gyms':
      // `/gym import` works once the server is set up (S7).
      return state.facts.gyms > 0
        ? `${state.facts.gyms.toLocaleString('en-US')} ${state.facts.gyms === 1 ? 'gym' : 'gyms'}.`
        : `${state.inSetup ? 'Once Pine is set up, import' : 'Import'} your gyms from Wayfarer ` +
            'with `/gym import` and the file the Pine Wayfarer export tool saves. The tool’s ' +
            `owner hands it out: ask for it at <${state.tool}>.`;
  }
}

/** An item's text: its name, required or not, done or not; then its detail. */
function itemText(item: SetupItem, state: ChecklistState): string {
  const marks = [...(item.required ? ['required'] : []), item.done ? 'done' : 'not yet'];
  return `**${ITEMS[item.key].name}** · ${marks.join(' · ')}\n${itemDetail(item.key, state)}`;
}

function button(
  id: string,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary = ButtonStyle.Secondary,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    label,
    custom_id: encodeCustomId({ kind: SETUP_KIND, id, action: SHOW }),
  };
}

/** The panel's button of a section, as the panel's menu names it. */
const SECTION_LABELS: Readonly<Partial<Record<SectionName, string>>> = {
  channels: 'Channels…',
  text: 'Text and numbers…',
};

/**
 * `/admin setup`'s checklist (plan 19C-2): the title, whether the server is set up, then each item
 * (`setupItems`) with its button to the panel's section where it is set there.
 */
export function setupChecklist(state: ChecklistState): V2Message {
  const title =
    '### Setting up Pine\n' +
    (state.inSetup
      ? 'Pine works here once the four required items are done. The rest can follow later.'
      : 'Pine is set up here. The rest can follow whenever you like.');
  const items = setupItems(state.facts).map((item): APIComponentInContainer => {
    const panelSection = ITEMS[item.key].section;
    const label = panelSection === undefined ? undefined : SECTION_LABELS[panelSection];
    return panelSection === undefined || label === undefined
      ? textDisplay(itemText(item, state))
      : section(itemText(item, state), button(item.key, label));
  });
  return {
    v2: true,
    components: [
      container(LIST_COLOUR, [
        textDisplay(title),
        ...items,
        {
          type: ComponentType.ActionRow,
          components: [button(LIST, 'Check again', ButtonStyle.Primary)],
        },
      ]),
    ],
  };
}

/**
 * The checklist of the interaction's server, read afresh: first whether the server leaves setup
 * (`ServerSetup.check`: whatever did its last required item), then what it has.
 */
async function checklistNow(interaction: LocatedInteraction, ctx: AppContext): Promise<V2Message> {
  const serverId = guildIdOf(interaction);
  await ctx.setup.check(serverId);
  const values = ctx.servers.of(serverId);
  return setupChecklist({
    facts: await ctx.setup.facts(serverId),
    inSetup: ctx.servers.inSetup(serverId),
    defaultZone: ctx.servers.defaultZone(),
    units: values.distanceUnits,
    tool: ctx.config.settings.wayspotTool,
    editor: ctx.config.settings.web !== undefined,
  });
}

/**
 * The checklist's buttons (plan 19C-2): for the people who may set the server up
 * (`requireServerAdmin`, asked at every press), reads counted as a member's reads. A section's
 * button answers with the settings panel at that section, apart; Check again draws the checklist
 * again in place. Both work in a server in setup.
 */
export const setupControls: ComponentHandler = {
  kind: SETUP_KIND,
  worksInSetup: () => true,
  guards: [requireServerAdmin],
  throttle: MEMBER_READ_THROTTLE,
  async button(interaction, id, ctx) {
    if (id.action !== SHOW || id.args.length > 0) throw new UserError(STALE_COMPONENT);
    if (id.id === LIST) {
      const how = pressAnswer(interaction);
      await answerPress(
        interaction,
        how,
        await readOrDeferPress(interaction, how, checklistNow(interaction, ctx)),
      );
      return;
    }
    const panelSection = isItem(id.id) ? ITEMS[id.id].section : undefined;
    if (panelSection === undefined) throw new UserError(STALE_COMPONENT);
    await answerApart(interaction, await panelNow(interaction, ctx, panelSection));
  },
};

/**
 * `/admin setup` (plan 19C-2, `servers.md`): the setup's checklist around the settings panel,
 * private, for the people who may set the server up (`requireServerAdmin`: its owner, who may
 * manage it, its staff). Works in a server in setup, and in one set up (what is left of the rest).
 */
export const serverSetup: SubcommandPart = {
  worksInSetup: true,
  // Its guard is `/admin`'s list's (`staffParts`): a setup part.
  data: new SlashCommandSubcommandBuilder()
    .setName('setup')
    .setDescription('Set Pine up: what it needs and what is done'),
  help: {
    details:
      'Shows you, privately, a checklist of what Pine needs and what is done. Each item has a ' +
      'button to where it is set, or names the command that sets it.\n\n' +
      'Four items are required:\n' +
      '- the time zone and units\n' +
      '- the bot lab\n' +
      '- the moderators’ bot lab\n' +
      '- the first region\n\n' +
      'Until they are done, Pine tells members only that it is not set up yet, and posts and ' +
      'sends nothing here. Once they are, Pine is set up for good and says so in the bot lab.' +
      '\n\nThe rest can follow whenever you like: the moderators’ channel, the events forum, ' +
      'the other channels and the gyms.',
    examples: ['/admin setup'],
  },
  defer: 'late',
  async execute(interaction, ctx) {
    await answer(interaction, v2Answer(await checklistNow(interaction, ctx)));
  },
};
