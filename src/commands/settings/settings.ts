import {
  InteractionContextType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { UserSettings } from '../../db/repositories/user-repository.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import { plain, truncate } from '../../render/text.js';
import { answer } from '../../discord/late-reply.js';
import { UserError } from '../../discord/errors.js';
import { wantLineCount } from '../notifications/wants.js';

/** The settings that are switched on or off, as `UserSettings` names them. */
type Flag =
  'mentions' | 'mentionsGroups' | 'mentionsShouts' | 'mentionsTrainStops' | 'bossSetNotification';

interface FlagSetting {
  /** The subcommand: `/settings <name> enabled:<True|False>`. */
  name: string;
  flag: Flag;
  description: string;
  /** What `/settings show` calls it. */
  label: string;
  /** What the member is told it means now. */
  on: string;
  off: string;
  details: string;
  /** Whether `mentions`, the switch for all pings, also has to be on for this to do anything. */
  underMentions: boolean;
  /** Whether it is about a direct message, which a bot with notifications switched off never sends. */
  dm: boolean;
}

const FLAGS: readonly FlagSetting[] = [
  {
    name: 'mentions',
    flag: 'mentions',
    description:
      'Whether I may ping you in the posts of raids, max battles, trains and meetups at all',
    label: 'Pings in posts',
    on: 'You will be pinged in the posts of raids, max battles, trains and meetups you are signed up for.',
    off:
      'You will no longer be pinged in the posts of raids, max battles, trains and meetups, whatever your ' +
      'other mention settings say.',
    details:
      'The switch for every ping of you as a member in a post: shouts, new groups and meeting ' +
      'times, the moves of a train, the question whether you have completed a raid, the word ' +
      'of a raid that has moved to another region, the warning before a post is archived.\n\n' +
      'While it is off none of them pings you; the messages are still written in the post.',
    underMentions: false,
    dm: false,
  },
  {
    name: 'mentions-groups',
    flag: 'mentionsGroups',
    description: 'Whether I ping you about new groups and meeting times',
    label: 'Pings for groups and times',
    on: 'You will be pinged about new groups and meeting or start times where you are signed up.',
    off: 'You will no longer be pinged when a group is made or a meeting or start time is set.',
    details:
      'Pings in the post of a raid, max battle, train or meetup you are signed up for when somebody makes ' +
      'a new group or sets, moves or cancels a time to meet.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'mentions-shouts',
    flag: 'mentionsShouts',
    description: 'Whether /shout pings you',
    label: 'Pings for shouts',
    on: 'You will be pinged by `/shout` where you are signed up.',
    off: 'You will no longer be pinged by `/shout`.',
    details:
      'Pings by `/shout` in the post of a raid, max battle, train or meetup you are signed up for.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'mentions-train-stops',
    flag: 'mentionsTrainStops',
    description: 'Whether I ping you when a train you are on moves',
    label: 'Pings when a train moves',
    on: 'You will be pinged when a train you are signed up for moves on.',
    off: 'You will no longer be pinged when a train moves on.',
    details: 'Pings in the post of a train you are signed up for when it moves to another stop.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'boss-set',
    flag: 'bossSetNotification',
    description: 'Whether I send you a DM when an egg you signed up for gets its boss',
    label: 'DM when an egg gets its boss',
    on: 'You will get a DM when an egg you are signed up for gets its boss.',
    off: 'You will no longer get a DM when an egg you are signed up for gets its boss.',
    details: 'A direct message when the boss of an egg you are signed up for becomes known.',
    underMentions: false,
    dm: true,
  },
];

/**
 * "Tell me of new trains" is no setting of the member as a whole: it is per server, like the
 * wants (Matt, 2026-10-12), kept by `ctx.newTrains`.
 */
const NEW_TRAIN = {
  name: 'new-train',
  label: 'DM for a new train in this server',
  on: 'You will get a DM when a train is announced in this server, in a region you can see.',
  off: 'You will no longer get a DM when a train is announced in this server.',
  /** Said in a DM with the bot, where there is no server to set it for. */
  inDm:
    'Whether I tell you about new trains is set per server. Use `/settings new-train` in the ' +
    'server you mean.',
} as const;

/**
 * Whether the party history keeps the member's id: per server, like new trains (plan 8H; the
 * history of a server is that server's); also with their reports at stops that end (plan 8H-2).
 */
const HISTORY = {
  name: 'history',
  label: "Named in this server's party history",
  on:
    'The party history of this server keeps your Discord id with what you sign up for and how ' +
    'far you get in every raid, max battle, train and meetup, and with every field research and ' +
    'Team GO Rocket report of yours, that ends from now on, those under way included. ' +
    '`/settings history enabled:False` takes it out again.',
  off: 'The party history of this server no longer keeps your Discord id.',
  /** Said in a DM with the bot, where there is no server to set it for. */
  inDm:
    'Whether the party history keeps your Discord id is set per server. Use `/settings history` ' +
    'in the server you mean.',
} as const;

/**
 * What opting out adds when the history named the member somewhere: in how many records, of
 * parties and of reports at stops (plan 8H-2) together.
 */
function forgottenIn(records: number): string {
  const what =
    records === 1
      ? 'the one record of a raid, max battle, train, meetup or report at a stop'
      : `the ${String(records)} records of raids, max battles, trains, meetups and reports at stops`;
  const count = records === 1 ? 'which still counts' : 'which still count';
  return ` It was taken out of ${what} kept with it so far, ${count}, without it.`;
}

/** As much of a text a member registered as the overview shows: a legacy value may be long. */
const SHOWN_VALUE = 60;

/** What is added when a direct message is switched on where this bot sends none. */
const NOTIFICATIONS_OFF =
  ' Notifications are switched off on this bot, though, so no such DM is sent for now.';

/** What is added when a kind of ping is on while all pings are off. */
const MENTIONS_OFF =
  ' All pings are switched off for you, though: nothing pings you until ' +
  '`/settings mentions enabled:True`.';

const AUTO_STATUS = [
  {
    value: 'interested',
    name: 'Interested',
    status: PartyStatus.Interested,
    says: 'When you report a raid or make a train, you are signed up for it as interested.',
  },
  {
    value: 'coming',
    name: 'Coming',
    status: PartyStatus.Coming,
    says: 'When you report a raid or make a train, you are signed up for it as coming.',
  },
  {
    value: 'here',
    name: 'Here',
    status: PartyStatus.Present,
    says: 'When you report a raid or make a train, you are signed up for it as here.',
  },
  {
    value: 'none',
    name: 'None',
    status: PartyStatus.NotInterested,
    says: 'When you report a raid or make a train, you are not signed up for it.',
  },
] as const;

const PRIVACY = [
  {
    value: 'visible',
    name: 'Visible',
    privacy: RaidPrivacy.Visible,
    says: 'The post of a raid you report or a train you make names you.',
  },
  {
    value: 'anonymous',
    name: 'Anonymous',
    privacy: RaidPrivacy.Anonymous,
    says: 'The post of a raid you report or a train you make does not say who did.',
  },
] as const;

/** The auto status as the choices name it; whatever signs nobody up is `None`. */
function autoStatusName(status: PartyStatus): string {
  return AUTO_STATUS.find((choice) => choice.status === status)?.name ?? 'None';
}

/**
 * Everything a member has set, each line with the command that changes it. `newTrain` is
 * whether they are told of new trains in the server the command was used in, and `history`
 * whether that server's party history keeps their id; undefined in a DM, where the lines say
 * that they are set per server. With `commands: false` the lines leave the commands out, for
 * staff who look at another member's settings (`/admin member-settings`).
 */
export function settingsLines(
  settings: UserSettings,
  newTrain?: boolean,
  options: { commands?: boolean; history?: boolean } = {},
): string[] {
  const commands = options.commands ?? true;
  const via = (command: string): string => (commands ? ` · \`${command}\`` : '');
  const onOff = (value: boolean): string => (value ? 'on' : 'off');
  const lines = FLAGS.map((setting) => {
    const quiet = setting.underMentions && settings[setting.flag] && !settings.mentions;
    return (
      `${setting.label}: **${onOff(settings[setting.flag])}**` +
      `${quiet ? ' (quiet while all pings are off)' : ''}${via(`/settings ${setting.name}`)}`
    );
  });
  lines.push(
    newTrain === undefined
      ? `DM for a new train: set per server${via(`/settings ${NEW_TRAIN.name}`)}${commands ? ' in a server' : ''}`
      : `${NEW_TRAIN.label}: **${onOff(newTrain)}**${via(`/settings ${NEW_TRAIN.name}`)}`,
    options.history === undefined
      ? `Named in the party history: set per server${via(`/settings ${HISTORY.name}`)}${commands ? ' in a server' : ''}`
      : `${HISTORY.label}: **${onOff(options.history)}**${via(`/settings ${HISTORY.name}`)}`,
    `Status when ${commands ? 'you report' : 'they report'} a raid or make a train: **${autoStatusName(settings.autoStatus)}**${via('/settings auto-status')}`,
    `Raid reports and trains: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}**${via('/settings privacy')}`,
  );
  // What a member registered is their own text: shown plain, and only when there is any.
  const friendCode = settings.friendCode?.trim() ?? '';
  if (friendCode !== '') {
    lines.push(
      `Friend code: **${plain(truncate(friendCode, SHOWN_VALUE))}**${via('/friend-code register')}`,
    );
  }
  const nickname = settings.nickname?.trim() ?? '';
  if (nickname !== '') {
    lines.push(
      `In-game name: **${plain(truncate(nickname, SHOWN_VALUE))}**${via('/nickname register')}`,
    );
  }
  if (settings.pokebattlerId !== null) {
    lines.push(
      `Pokebattler user id: **${String(settings.pokebattlerId)}**${via('/settings pokebattler-id')}`,
    );
  }
  return lines;
}

/**
 * What the member has on their lists in the server the command was used in, where this
 * installation notifies at all: nothing in a DM, where there is no server to count for.
 */
async function listLines(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<string[]> {
  const { guildId } = interaction;
  if (guildId === null || !ctx.config.settings.features.notifications) return [];
  const [wanted, targeted] = await Promise.all([
    // The lines of `/wants`: both tables, each target once with its boxes (plan 8R-1).
    wantLineCount(ctx, interaction.user.id, guildId),
    ctx.gymTargets.count(interaction.user.id, guildId),
  ]);
  return [
    `Pokémon, raid tiers and rewards on your list in this server: **${String(wanted)}** · \`/wants\``,
    `Your gyms in this server: **${String(targeted)}** · \`/targets\``,
  ];
}

const show: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('Show everything you have set, and the command that changes each'),
  help: {
    details:
      'Lists your settings for pings and direct messages, the status you get when you report ' +
      'a raid, whether your reports name you, and your friend code and in-game name when ' +
      'you registered them.\n\nIn a server it also says whether you are told of new trains ' +
      'there, and how many Pokémon, raid tiers, rewards and gyms you are notified about there.',
    examples: ['/settings show'],
  },
  defer: 'late',
  async execute(interaction, ctx) {
    const settings = await ctx.users.get(interaction.user.id);
    const { guildId } = interaction;
    const [newTrain, history] =
      guildId === null
        ? [undefined, undefined]
        : await Promise.all([
            ctx.newTrains.isOn(interaction.user.id, guildId),
            ctx.historyOptIns.isOptedIn(interaction.user.id, guildId),
          ]);
    const lines = [
      ...settingsLines(settings, newTrain, history === undefined ? {} : { history }),
      ...(await listLines(interaction, ctx)),
    ];
    await answer(interaction, {
      content: `**Your settings**\n${lines.map((line) => `- ${line}`).join('\n')}`,
    });
  },
};

function flagPart(setting: FlagSetting): SubcommandPart {
  return {
    data: new SlashCommandSubcommandBuilder()
      .setName(setting.name)
      .setDescription(setting.description)
      .addBooleanOption((option) =>
        option.setName('enabled').setDescription('True switches it on').setRequired(true),
      ),
    help: {
      details: setting.underMentions
        ? `${setting.details} It only pings while \`/settings mentions\` is on as well.`
        : setting.details,
      examples: [
        `/settings ${setting.name} enabled:True`,
        `/settings ${setting.name} enabled:False`,
      ],
    },
    defer: 'late',
    throttle: MEMBER_WRITE_THROTTLE,
    async execute(interaction, ctx) {
      const enabled = interaction.options.getBoolean('enabled', true);
      const memberId = interaction.user.id;
      await ctx.users.update(memberId, { [setting.flag]: enabled });
      let content = enabled ? setting.on : setting.off;
      // Read after the write: the master switch as it is now.
      if (enabled && setting.underMentions && !(await ctx.users.get(memberId)).mentions) {
        content += MENTIONS_OFF;
      }
      if (enabled && setting.dm && !ctx.config.settings.features.notifications) {
        content += NOTIFICATIONS_OFF;
      }
      await answer(interaction, { content });
    },
  };
}

const newTrain: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName(NEW_TRAIN.name)
    .setDescription('Whether I send you a DM when a train is announced in this server')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('True switches it on').setRequired(true),
    ),
  help: {
    details:
      'A direct message when somebody announces a raid train in this server, in a region you ' +
      'can see. It is set per server: use it in the server you mean, not in a DM with me.',
    examples: [
      `/settings ${NEW_TRAIN.name} enabled:True`,
      `/settings ${NEW_TRAIN.name} enabled:False`,
    ],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const enabled = interaction.options.getBoolean('enabled', true);
    const { guildId } = interaction;
    if (guildId === null) {
      await answer(interaction, { content: NEW_TRAIN.inDm });
      return;
    }
    await ctx.newTrains.set(interaction.user.id, guildId, enabled, Date.now());
    let content: string = enabled ? NEW_TRAIN.on : NEW_TRAIN.off;
    if (enabled && !ctx.config.settings.features.notifications) content += NOTIFICATIONS_OFF;
    await answer(interaction, { content });
  },
};

const history: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName(HISTORY.name)
    .setDescription("Whether this server's party history keeps your Discord id with what you do")
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('True keeps it from now on').setRequired(true),
    ),
  help: {
    details:
      'Professor Pine keeps a history of every raid, max battle, train and meetup of this server that has ' +
      'ended: what it was, where and when, and how many signed up, came and completed it. You ' +
      'always count in it, without your name.\n\nIt keeps every field research and Team GO ' +
      'Rocket report that ends as well: what was reported, the area and the region of its stop ' +
      '(never the stop itself), when, how it ended and how many others reported the same.\n\n' +
      'With this on, your Discord id is kept as well with what you do from now on (what you sign ' +
      'up for, when, and how far you get, and the reports you make), for statistics of your own ' +
      'later. Off takes your id out of everything kept so far: it all still counts, without ' +
      'it.\n\nWhile a raid, max battle, train or meetup is still going on, or a report stands, I ' +
      'keep who signed up or reported it and when, as I must to run it; when it ends, only the ' +
      'ids of members who opted in are kept, and the rest is deleted.\n\nIt is set per server: use it in the server you mean, not in a DM ' +
      'with me. The history of the old bot, from before this one, is never tied to you.',
    examples: [`/settings ${HISTORY.name} enabled:True`, `/settings ${HISTORY.name} enabled:False`],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const enabled = interaction.options.getBoolean('enabled', true);
    const { guildId } = interaction;
    if (guildId === null) {
      await answer(interaction, { content: HISTORY.inDm });
      return;
    }
    const memberId = interaction.user.id;
    if (enabled) {
      await ctx.historyOptIns.optIn(memberId, guildId, Date.now());
      await answer(interaction, { content: HISTORY.on });
      return;
    }
    const { forgotten } = await ctx.historyOptIns.optOut(memberId, guildId);
    await answer(interaction, {
      content: forgotten > 0 ? HISTORY.off + forgottenIn(forgotten) : HISTORY.off,
    });
  },
};

const autoStatus: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('auto-status')
    .setDescription('The status you get in a raid you report or a train you make')
    .addStringOption((option) =>
      option
        .setName('status')
        .setDescription('How you are signed up for a raid you report or a train you make')
        .setRequired(true)
        .addChoices(AUTO_STATUS.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    details:
      'Whoever reports a raid with `/raid` or makes a train with `/train` is signed up for it ' +
      'at once. This sets as what: interested, coming, here, or (None) not at all. Whoever ' +
      'makes a meetup is always signed up as interested.',
    examples: ['/settings auto-status status:Coming', '/settings auto-status status:None'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const value = interaction.options.getString('status', true);
    // Discord only sends one of the choices; anything else is the first of them.
    const choice = AUTO_STATUS.find((status) => status.value === value) ?? AUTO_STATUS[0];
    await ctx.users.update(interaction.user.id, { autoStatus: choice.status });
    await answer(interaction, { content: choice.says });
  },
};

const privacy: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('privacy')
    .setDescription('Whether the post of a raid you report or a train you make names you')
    .addStringOption((option) =>
      option
        .setName('visibility')
        .setDescription('Visible names you in the post; Anonymous does not')
        .setRequired(true)
        .addChoices(PRIVACY.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    details:
      'The post of a raid says who reported it and the post of a train who made it, unless ' +
      'you choose Anonymous. It is about raids you report and trains you make from then on; ' +
      'a meetup always names who made it, and so does a report of a wild Pokémon.',
    examples: ['/settings privacy visibility:Anonymous', '/settings privacy visibility:Visible'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const value = interaction.options.getString('visibility', true);
    const choice = PRIVACY.find((entry) => entry.value === value) ?? PRIVACY[0];
    await ctx.users.update(interaction.user.id, { raidPrivacy: choice.privacy });
    await answer(interaction, { content: choice.says });
  },
};

/** The largest id the legacy column (`User.pokebattlerId`, a signed `int`) holds. */
export const MAX_POKEBATTLER_ID = 2_147_483_647;

const pokebattlerId: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('pokebattler-id')
    .setDescription('Your user id on Pokebattler, for /counters with your Pokébox')
    .addIntegerOption((option) =>
      option
        .setName('id')
        .setDescription('The number of your Pokebattler account; leave it out to forget it')
        .setMinValue(1)
        .setMaxValue(MAX_POKEBATTLER_ID),
    ),
  help: {
    details:
      'Saves the user id of your Pokebattler account, so that ' +
      '`/counters level:My Pokébox on Pokebattler` simulates a raid with the Pokémon you entered there. Without an id it is forgotten.',
    examples: ['/settings pokebattler-id id:123456', '/settings pokebattler-id'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const id = interaction.options.getInteger('id');
    if (id !== null && (!Number.isSafeInteger(id) || id < 1 || id > MAX_POKEBATTLER_ID)) {
      throw new UserError('A Pokebattler user id is a whole number from 1 up.');
    }
    await ctx.users.update(interaction.user.id, { pokebattlerId: id });
    await answer(interaction, {
      content:
        id === null
          ? 'Your Pokebattler user id is forgotten.'
          : `Your Pokebattler user id is ${String(id)}: \`/counters level:My Pokébox on ` +
            'Pokebattler` uses the Pokémon of that account.',
    });
  },
};

/**
 * `/settings` (spec 4.2): what a member sets for themself. Every answer is for the member
 * alone, it works in any channel and in a DM with the bot, and nothing is sent to anybody else.
 * The party code reads these settings where it pings or signs somebody up.
 */
export const settings = commandGroup({
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Your own settings: pings, direct messages, raid reports')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'notifications',
    details:
      'What Professor Pine does for you in particular: whether it pings you in posts, which ' +
      'direct messages it sends you, and how you appear in a raid you report. ' +
      '`/settings show` lists it all. Nobody else sees your answers.',
    examples: ['/settings show', '/settings mentions enabled:False'],
  },
  parts: [show, ...FLAGS.map(flagPart), newTrain, history, autoStatus, privacy, pokebattlerId],
});
