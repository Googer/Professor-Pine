import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponentWithCustomId,
  type APIComponentInContainer,
  type APIStringSelectComponent,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { FillInState } from '../../db/repositories/legacy-fill-in-repository.js';
import type { UserSettings } from '../../db/repositories/user-repository.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { RaidPrivacy } from '../../domain/party/status.js';
import {
  actionRow,
  container,
  LIST_COLOUR,
  menuRow,
  section,
  textDisplay,
} from '../../render/v2.js';
import { wantLineCount } from '../notifications/wants.js';
import {
  AUTO_STATUS,
  autoStatusValue,
  BOSS_SET,
  legacyWords,
  PINGS,
  PRIVACY,
  settingsLines,
  type LegacyLine,
  type ServerSettings,
  type SettingLine,
  type SettingName,
} from './settings-lines.js';

/**
 * The custom ids of the panel's controls (plan 8S-5): `settings:<setting>:set:on|off` sets an
 * on/off setting to what the button showed it would (never a toggle of what it reads), the menus
 * `settings:auto-status:set` and `settings:privacy:set` the value picked,
 * `settings:pokebattler:ask` opens the dialog `settings:pokebattler:set:~<token>`,
 * `settings:wants:show` / `settings:targets:show` answer apart with `/wants` / `/targets`, and
 * `settings:legacy:add` asks for the old bot's history (plan 8H-10). The member and the server are
 * the interaction's, never in the id.
 */
export const SETTINGS_KIND = 'settings';
export const SET = 'set';
export const ASK = 'ask';
export const SHOW = 'show';
export const ON = 'on';
export const OFF = 'off';

/** The setting of the Pokebattler id's controls. */
export const POKEBATTLER = 'pokebattler';
/** The old bot's history (plan 8H-10): `settings:legacy:add` asks for its fill-in. */
export const LEGACY = 'legacy';
export const ADD = 'add';
/** The lists of the member in the server: `settings:wants|targets:show`. */
export const LISTS = ['wants', 'targets'] as const;
export type ListName = (typeof LISTS)[number];

/** What the panel shows: the member's settings, and in a server theirs there. */
export interface PanelState {
  settings: UserSettings;
  /** In a server: its settings, and the counts of the lists where it notifies; none in a DM. */
  server?: ServerSettings & { lists?: { wants: number; gyms: number } };
}

/** The interaction a panel is drawn for: its member, and where it was used. */
interface Asking {
  user: { id: string };
  guildId: string | null;
  inGuild(): boolean;
}

/**
 * Everything the panel shows, read afresh: the member's settings, and in a server (a DM by
 * `!inGuild()`) whether they are told of new trains there, named in its history and on its
 * boards, and, where this installation notifies, the lines of `/wants` and their gyms.
 */
export async function readPanel(interaction: Asking, ctx: AppContext): Promise<PanelState> {
  const memberId = interaction.user.id;
  const { guildId } = interaction;
  if (!interaction.inGuild() || guildId === null) {
    return { settings: await ctx.users.get(memberId) };
  }
  const notifies = ctx.config.settings.features.notifications;
  // The member's row first: reading it remembers its id, which the reads of the lists need, so
  // that none of them looks it up again (`round-trips.db.test.ts`).
  const settings = await ctx.users.get(memberId);
  const [newTrain, history, leaderboard, fillIn, hasFile, lists] = await Promise.all([
    ctx.newTrains.isOn(memberId, guildId),
    ctx.historyOptIns.isOptedIn(memberId, guildId),
    ctx.historyOptIns.isOnBoards(memberId, guildId),
    // The old bot's history (plan 8H-10): the request, and whether the index has a file of theirs.
    ctx.legacyFillIns.stateOf(memberId, guildId),
    ctx.legacyIndex?.hasFile(memberId, guildId) ?? false,
    notifies
      ? Promise.all([
          // The lines of `/wants`: both tables, each target once with its boxes (plan 8R-1).
          wantLineCount(ctx, memberId, guildId),
          ctx.gymTargets.count(memberId, guildId),
        ])
      : undefined,
  ]);
  const legacy = legacyLine(fillIn, { indexed: ctx.legacyIndex !== undefined, hasFile, history });
  return {
    settings,
    server: {
      newTrain,
      history,
      leaderboard,
      ...(legacy === undefined ? {} : { legacy }),
      ...(lists === undefined ? {} : { lists: { wants: lists[0], gyms: lists[1] } }),
    },
  };
}

/** What `legacyLine` goes by besides the request. */
export interface LegacyFacts {
  /** The installation has the member index (`ctx.legacyIndex`). */
  indexed: boolean;
  /** The member index has a file of the member in that server. */
  hasFile: boolean;
  /** The member's history is on in that server. */
  history: boolean;
}

/**
 * What the panel and staff's lines say of the member's old bot's history (plan 8H-10): where they
 * asked, how that stands (whatever else), except that a waiting request says nothing without the
 * index (B5: nothing is waited for any more), and a failed one can be asked again only with the
 * index and a file of theirs; otherwise the offer, only with their history on and a file of
 * theirs in the member index; else nothing.
 */
export function legacyLine(
  fillIn: FillInState | undefined,
  { indexed, hasFile, history }: LegacyFacts,
): LegacyLine | undefined {
  if (fillIn?.state === 'queued') return indexed ? fillIn : undefined;
  if (fillIn?.state === 'failed') return { ...fillIn, retry: indexed && hasFile };
  if (fillIn !== undefined) return fillIn;
  return history && hasFile ? { state: 'offer' } : undefined;
}

/** `legacyLine`, read for a member of a server (staff's lines, the answer of turning history on). */
export async function readLegacyLine(
  ctx: AppContext,
  memberId: string,
  guildId: string,
  history: boolean,
): Promise<LegacyLine | undefined> {
  const [fillIn, hasFile] = await Promise.all([
    ctx.legacyFillIns.stateOf(memberId, guildId),
    ctx.legacyIndex?.hasFile(memberId, guildId) ?? false,
  ]);
  return legacyLine(fillIn, { indexed: ctx.legacyIndex !== undefined, hasFile, history });
}

/** A button of the panel. */
function button(
  setting: string,
  action: string,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success,
  args: string[] = [],
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style,
    label,
    custom_id: encodeCustomId({ kind: SETTINGS_KIND, id: setting, action, args }),
  };
}

/**
 * The button beside an on/off line: what pressing it sets, `Turn on` (blue) or `Turn off` (gray).
 * Green on the panel means only "on now", as in the row of the pings.
 */
function switchButton(
  setting: string,
  on: boolean,
  label?: string,
): APIButtonComponentWithCustomId {
  return on
    ? button(setting, SET, label ?? 'Turn off', ButtonStyle.Secondary, [OFF])
    : button(setting, SET, 'Turn on', ButtonStyle.Primary, [ON]);
}

/** A menu of the panel, the stored value marked as Discord's `default`. */
function menu(
  setting: string,
  placeholder: string,
  options: readonly { value: string; name: string; description: string }[],
  stored: string,
): APIStringSelectComponent {
  return {
    type: ComponentType.StringSelect,
    custom_id: encodeCustomId({ kind: SETTINGS_KIND, id: setting, action: SET }),
    placeholder,
    min_values: 1,
    max_values: 1,
    options: options.map((option) => ({
      label: option.name,
      value: option.value,
      description: option.description,
      ...(option.value === stored ? { default: true } : {}),
    })),
  };
}

/** What a DM's panel says of the settings that are per server (S5). */
export const PER_SERVER =
  'New trains, your history, the boards, wants and gyms are set per server: use `/settings` ' +
  'in that server.';

/**
 * The panel of `/settings` (plan 8S-5): one private container of `LIST_COLOUR`, laid out as the
 * lines of `settingsLines`, each with its control: the four pings with one row of buttons that
 * carry their name and state, the DMs, the history and the boards with a button beside each,
 * the status and the privacy with a menu under each, the Pokebattler id with its dialog's
 * button, the friend code and the in-game name read-only with the command that changes them,
 * and the counts of the lists with Show; the old bot's history (plan 8H-10) with its button in a
 * section of its own while it can be added. `said`: what the last press changed, under the title.
 * The fullest is 39 components of Discord's 40 (36 before 8H-10): the next control the panel
 * gains needs a rework of its layout (a second panel, or lines that share a component).
 */
export function settingsPanel(state: PanelState, said?: string): V2Message {
  const { settings, server } = state;
  const lines = settingsLines(settings, server);
  const text = (setting: SettingName): string =>
    lines.find((line: SettingLine) => line.setting === setting)?.text ?? '';
  const pings = PINGS.map((ping) => text(ping.name)).join('\n');
  const pingButtons = PINGS.map((ping) => {
    const on = settings[ping.flag];
    return button(
      ping.name,
      SET,
      `${ping.button}: ${on ? ON : OFF}`,
      on ? ButtonStyle.Success : ButtonStyle.Secondary,
      [on ? OFF : ON],
    );
  });
  const parts: APIComponentInContainer[] = [
    textDisplay(said === undefined ? '### Your settings' : `### Your settings\n${said}`),
    textDisplay(pings),
    actionRow(pingButtons),
    section(text(BOSS_SET.name), switchButton(BOSS_SET.name, settings.bossSetNotification)),
  ];
  if (server === undefined) parts.push(textDisplay(PER_SERVER));
  else {
    parts.push(
      section(text('new-train'), switchButton('new-train', server.newTrain)),
      // Turning the history off may ask first (a dialog): its button says so.
      section(text('history'), switchButton('history', server.history, 'Turn off…')),
      section(text('leaderboard'), switchButton('leaderboard', server.leaderboard)),
    );
    // The old bot's history in the member's own words (plan 8H-10): the offer with its button
    // in a section of its own, else how it stands; nothing where there is nothing to say.
    const { legacy } = server;
    // A failed one with "Try again" (A1) where it can be asked again: the same control, three
    // components as the offer's; without an index or a file of theirs, its words alone.
    if (legacy?.state === 'offer' || (legacy?.state === 'failed' && legacy.retry)) {
      const label = legacy.state === 'offer' ? 'Add my old-bot history' : 'Try again';
      parts.push(section(legacyWords(legacy), button(LEGACY, ADD, label, ButtonStyle.Primary)));
    } else if (legacy !== undefined) parts.push(textDisplay(legacyWords(legacy)));
  }
  parts.push(
    textDisplay(text('auto-status')),
    menuRow(menu('auto-status', 'Your status', AUTO_STATUS, autoStatusValue(settings.autoStatus))),
    textDisplay(text('privacy')),
    menuRow(
      menu(
        'privacy',
        'Your name on reports',
        PRIVACY,
        settings.raidPrivacy === RaidPrivacy.Anonymous ? 'anonymous' : 'visible',
      ),
    ),
    section(text(POKEBATTLER), button(POKEBATTLER, ASK, 'Change…', ButtonStyle.Secondary)),
  );
  // Read-only here: their own commands change them.
  const registered = [
    ...lines
      .filter((line) => line.setting === 'friend-code')
      .map((line) => `${line.text} · \`/friend-code register\``),
    ...lines
      .filter((line) => line.setting === 'nickname')
      .map((line) => `${line.text} · \`/nickname register\``),
  ];
  if (registered.length > 0) parts.push(textDisplay(registered.join('\n')));
  const lists = server?.lists;
  if (lists !== undefined) {
    parts.push(
      section(
        `Wants in this server: **${String(lists.wants)}**`,
        button('wants', SHOW, 'Show', ButtonStyle.Secondary),
      ),
      section(
        `Your gyms in this server: **${String(lists.gyms)}**`,
        button('targets', SHOW, 'Show', ButtonStyle.Secondary),
      ),
    );
  }
  return { v2: true, components: [container(LIST_COLOUR, parts)] };
}

/** The panel as it is now, read afresh, with what the press changed. */
export async function panelNow(
  interaction: Asking,
  ctx: AppContext,
  said?: string,
): Promise<V2Message> {
  return settingsPanel(await readPanel(interaction, ctx), said);
}
