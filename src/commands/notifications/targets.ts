import {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { GymTargetList } from '../../db/repositories/gym-notification-repository.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { ComponentHandler, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, partyOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { MAX_NO_GYM } from '../../domain/party/max.js';
import { isMax, isRaid, isTrain, partyWord } from '../../domain/party/party.js';
import { gymIdOf } from '../../domain/party/stops.js';
import { currentStop } from '../../domain/party/train.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { stopArgs } from '../../domain/notify/reasons.js';
import { renderMemberList } from '../../render/member-list.js';
import { gymMapsUrl, gymName } from '../../render/raid-post.js';
import { stopLink } from '../../render/train-stops.js';
import { count, plain, truncate } from '../../render/text.js';
import { memberListControls } from './list-controls.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { gymInGuild, gymRegionsInGuild } from '../../services/region-directory.js';
import { beginningFirst, byName, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { gymChoices, reportedGym } from '../raids/raid-input.js';
import { removeAllQuestion } from './remove-all.js';
import { NOTIFICATION_THROTTLE, notificationsEnabled } from './shared.js';
import { answer, v2Answer } from '../../discord/late-reply.js';

/** The custom-id kind of the gym menu of `/target` and `/untarget`. */
const MENU_KIND = 'target';
const EXPIRED = 'That choice has expired. Use the command again.';

/** A menu that waits for the member to choose one of the gyms their text fits. */
interface PendingChoice {
  /** What choosing does: make the gym a target, or stop it being one. */
  mode: 'add' | 'remove';
  gymIds: number[];
}

const pending = new PendingRequests<PendingChoice>();

type Answerable = ChatInputCommandInteraction | StringSelectMenuInteraction;

/**
 * The row of the server an interaction came from (`Guild.id`), by which its regions are known;
 * undefined outside a server and for a server the bot has no row for (it then has no regions).
 */
async function serverOf(
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<number | undefined> {
  return interaction.guildId === null ? undefined : ctx.guilds.idFor(interaction.guildId);
}

/** Whether a gym lies in a region of a server (`gymInGuild`); no gym does in no server. */
function inServer(ctx: AppContext, guildRow: number | undefined): (gym: Gym) => boolean {
  return (gym) => guildRow !== undefined && gymInGuild(ctx.gyms, ctx.regions, gym.id, guildRow);
}

/** A gym as a sentence names it: `**The Stacks** (Pinewood Public Library)`. */
function gymText(gym: Gym): string {
  // A nickname that was cleared to an empty text names nothing, so it is tested for truth.
  return gym.nickname
    ? `**${plain(gym.nickname)}** (${plain(gym.name)})`
    : `**${plain(gym.name)}**`;
}

const mapsLink = (gym: Gym): string => `[Open in Google Maps](<${gymMapsUrl(gym)}>)`;

const SAY_WHICH =
  'Say which gym: type part of its name in `gym` and pick it from the list. In the post of a ' +
  'raid or a train you can leave it out, for the gym of that raid or the stop the train is at.';

/**
 * The gym a command without the `gym` option means: that of the raid whose post it was used in,
 * or the stop the train of that post is at. Throws a `UserError` that says how to name a gym
 * anywhere else, and in the post of a party that is at no gym.
 */
function gymOfPost(interaction: ChatInputCommandInteraction, ctx: AppContext): Gym {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(SAY_WHICH);
  if (isMax(party)) throw new UserError(MAX_NO_GYM);
  let gymId: number | null | undefined;
  if (isRaid(party)) gymId = party.gymId;
  // A train at a power spot (plan 8X-4) is at no gym: gym targets are of gyms only.
  else if (isTrain(party)) gymId = gymIdOf(currentStop(party));
  const gym = gymId === null || gymId === undefined ? undefined : ctx.gyms.get(gymId);
  if (!gym) {
    throw new UserError(
      `This ${partyWord(party)} is at no gym right now. Say which gym with the \`gym\` option.`,
    );
  }
  return gym;
}

async function addTarget(interaction: Answerable, ctx: AppContext, gym: Gym): Promise<void> {
  const outcome = await ctx.gymTargets.add(interaction.user.id, guildIdOf(interaction), gym.id);
  const content =
    outcome === 'added'
      ? `${gymText(gym)} is one of your gyms now: you will get a DM when a raid is reported ` +
        `there. ${mapsLink(gym)}\n\`/untarget\` takes it off again.`
      : `${gymText(gym)} is one of your gyms already. ${mapsLink(gym)}`;
  await answer(interaction, { content, components: [] });
}

async function removeTarget(
  interaction: Answerable,
  ctx: AppContext,
  gymId: number,
): Promise<void> {
  const removed = await ctx.gymTargets.remove(interaction.user.id, guildIdOf(interaction), gymId);
  const gym = ctx.gyms.get(gymId);
  const name = gym ? gymText(gym) : 'That gym';
  await answer(interaction, {
    content: removed
      ? `${name} is no longer one of your gyms.`
      : `${name} is not one of your gyms. \`/targets\` shows them.`,
    components: [],
  });
}

/** Asks which of several gyms is meant; the answer goes to `targetControls`. */
async function askWhich(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  mode: PendingChoice['mode'],
  gyms: readonly Gym[],
  typed: string,
): Promise<void> {
  const token = pending.put(interaction.user.id, { mode, gymIds: gyms.map((gym) => gym.id) });
  const here = regionChannelOf(interaction, ctx);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(encodeCustomId({ kind: MENU_KIND, id: token, action: 'gym' }))
    .setPlaceholder('Choose the gym')
    .addOptions(
      gyms.map((gym) => {
        const regions = ctx.gyms.regionsOf(gym.id);
        const [elsewhere] = regions;
        const region =
          here !== undefined && elsewhere !== undefined && !regions.includes(here)
            ? interaction.guild?.channels.cache.get(elsewhere)?.name
            : undefined;
        const parts = [gym.nickname, region, gym.description].filter(
          (part): part is string => part !== null && part !== undefined && part.trim() !== '',
        );
        return {
          label: truncate(gym.name, 100),
          value: String(gym.id),
          ...(parts.length === 0 ? {} : { description: truncate(parts.join(' · '), 100) }),
        };
      }),
    );
  await answer(interaction, {
    content:
      gyms.length === 1
        ? 'Did you mean this gym?'
        : `Several gyms fit "${plain(truncate(typed, 80))}". Which one do you mean?`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

const GYM_OPTION = 'The gym: type part of its name and pick from the list';

/**
 * `/target` (spec 4.2): a gym to be told about by direct message whenever a raid is reported
 * there. Without the option, in the post of a raid or train, the gym of that party. No
 * question before it is stored: the member picked the gym from the list or the menu.
 */
export const target: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('target')
    .setDescription('Get a DM when a raid is reported at a gym')
    .addStringOption((option) =>
      option.setName('gym').setDescription(GYM_OPTION).setMaxLength(100).setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Makes a gym one of your gyms in this server: you get a direct message when a raid is ' +
      'reported there. Pick the gym from the list that appears while you type; any gym of ' +
      'this server can be picked from any channel.\n\nIn the post of a raid or a train you can ' +
      'leave `gym` out, for the gym of that raid or the stop the train is at.',
    examples: ['/target gym:Big Fountain', '/target'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'late',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('gym');
    if (typed === null || typed.trim() === '') {
      await addTarget(interaction, ctx, gymOfPost(interaction, ctx));
      return;
    }
    const answer = reportedGym(
      ctx,
      regionChannelOf(interaction, ctx),
      typed,
      inServer(ctx, await serverOf(interaction, ctx)),
    );
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym of this server for "${plain(truncate(typed, 80))}". Type part of its ` +
          'name and pick it from the list.',
      );
    }
    if (answer.kind === 'gym') await addTarget(interaction, ctx, answer.gym);
    else await askWhich(interaction, ctx, 'add', answer.gyms, typed);
  },

  async autocomplete(interaction, ctx) {
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    await interaction.respond(
      gymChoices(
        ctx,
        regionChannelOf(interaction, ctx),
        interaction.options.getFocused(),
        regionName,
        inServer(ctx, await serverOf(interaction, ctx)),
      ),
    );
  },
};

/** The gyms among these ids that still exist. */
function knownGyms(ctx: AppContext, gymIds: readonly number[]): Gym[] {
  return gymIds.flatMap((id) => {
    const gym = ctx.gyms.get(id);
    return gym ? [gym] : [];
  });
}

/**
 * The choices for the `gym` option of `/untarget`: the member's own gyms, narrowed to what was
 * typed; those whose name begins with it first, then by name. `regionOf` names the region of a
 * gym that lies elsewhere than where the command is used, as the list of `/target` does; the
 * typed words find a gym by its region as well.
 */
export function ownTargetChoices(
  gyms: readonly Gym[],
  typed: string,
  regionOf: (gym: Gym) => string | undefined = () => undefined,
): Choice[] {
  const text = typed.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  return gyms
    .map((gym) => {
      const region = regionOf(gym);
      return {
        gym,
        name: [gym.name, ...(gym.nickname ? [gym.nickname] : []), ...(region ? [region] : [])].join(
          ' · ',
        ),
      };
    })
    .filter(({ name }) => words.every((word) => name.toLowerCase().includes(word)))
    .sort(beginningFirst(text))
    .slice(0, MAX_CHOICES)
    .map(({ gym, name }) => ({ name: truncate(name, CHOICE_NAME), value: `g:${String(gym.id)}` }));
}

/** `/untarget` (spec 4.2): a gym stops being one of the member's gyms in this server. */
export const untarget: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('untarget')
    .setDescription('Stop the DMs for raids at a gym')
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('One of your gyms: pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Takes a gym off your gyms in this server. The list that appears while you type shows ' +
      'your gyms. In the post of a raid or a train you can leave `gym` out, for the gym of ' +
      'that raid or the stop the train is at.',
    examples: ['/untarget gym:Big Fountain', '/untarget'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'late',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('gym');
    if (typed === null || typed.trim() === '') {
      await removeTarget(interaction, ctx, gymOfPost(interaction, ctx).id);
      return;
    }
    // A choice of the list is taken by its id, also for a gym that no longer exists.
    const picked = /^g:(\d{1,10})$/.exec(typed.trim());
    if (picked) {
      await removeTarget(interaction, ctx, Number(picked[1]));
      return;
    }
    const own = new Set(
      (await ctx.gymTargets.list(interaction.user.id, guildIdOf(interaction))).gymIds,
    );
    const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed, (gym) =>
      own.has(gym.id),
    );
    if (answer.kind === 'none') {
      throw new UserError(
        `None of your gyms fits "${plain(truncate(typed, 80))}". \`/targets\` shows them.`,
      );
    }
    if (answer.kind === 'gym') await removeTarget(interaction, ctx, answer.gym.id);
    else await askWhich(interaction, ctx, 'remove', answer.gyms, typed);
  },

  async autocomplete(interaction, ctx) {
    if (interaction.guildId === null) {
      await interaction.respond([]);
      return;
    }
    const { gymIds } = await ctx.gymTargets.list(interaction.user.id, interaction.guildId);
    // As `/target` says it: the region of a gym that is not in the region the command is used
    // in, by the name of its channel.
    const here = regionChannelOf(interaction, ctx);
    const regionOf = (gym: Gym): string | undefined => {
      const regions = ctx.gyms.regionsOf(gym.id);
      const [elsewhere] = regions;
      if (elsewhere === undefined || (here !== undefined && regions.includes(here))) {
        return undefined;
      }
      return interaction.guild?.channels.cache.get(elsewhere)?.name;
    };
    await interaction.respond(
      ownTargetChoices(knownGyms(ctx, gymIds), interaction.options.getFocused(), regionOf),
    );
  },
};

/** The gym menu of `/target` and `/untarget`. */
export const targetControls: ComponentHandler = {
  kind: MENU_KIND,

  async select(interaction, id, ctx) {
    if (id.action !== 'gym' || !interaction.isStringSelectMenu()) throw new UserError(EXPIRED);
    const taken = pending.take(id.id, interaction.user.id);
    if (taken === 'not-yours') throw new UserError('That is somebody else’s choice.');
    if (taken === 'expired') {
      await interaction.update({ content: EXPIRED, components: [] });
      return;
    }
    const { mode, gymIds } = taken.value;
    const gymId = Number(interaction.values[0]);
    const gym = gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
    if (!gym) {
      // The menu is used up: it goes, and its own message says why.
      await interaction.update({
        content: 'That gym no longer exists. Use the command again.',
        components: [],
      });
      return;
    }
    await interaction.deferUpdate();
    try {
      if (mode === 'add') await addTarget(interaction, ctx, gym);
      else await removeTarget(interaction, ctx, gym.id);
    } catch (err) {
      try {
        await answer(interaction, { content: 'Nothing was changed.', components: [] });
      } catch {
        // The message may be gone or the token expired; the error below is what matters.
      }
      throw err;
    }
  },
};

/** The custom-id kind of the controls of `/targets` (`targets` is the question of `/untarget-all`). */
export const TARGET_LIST_KIND = 'targetlist';

/** What a gym's line shows beside its name: where it lies. */
interface ListedGym {
  gym: Gym;
  /** The channel of the region of this server it lies in (the first by name), if any. */
  region: string | undefined;
}

/**
 * A gym's line in the list: its name as a link to its place and the region it lies in (not
 * whether it is an elite raid gym: members are not told any more, Matt, 2026-10-17):
 * `[The Stacks](<maps>) · <#region>`. Only the name is cut, before it is
 * escaped, when the line would be longer than `room`.
 */
export function targetLine({ gym, region }: ListedGym, room: number): string {
  const rest = region === undefined ? 'in no region of this server' : `<#${region}>`;
  const line = (name: string) =>
    `${stopLink({ kind: 'gym', gym: { ...gym, name, nickname: null } })} · ${rest}`;
  const name = gymName(gym);
  let shown = line(name);
  for (let keep = name.length - 1; shown.length > room && keep > 1; keep--) {
    shown = line(truncate(name, keep));
  }
  return shown;
}

/**
 * The member's gyms in a server as a components-v2 message (`renderMemberList`), at a page: by
 * region of this server (the regions by the names of their channels), the gyms of each by name,
 * and those that lie in no region of this server last; each with its Remove. Rows that are no
 * gym id, or name a gym that no longer exists, are counted under the count.
 */
export function targetsList(
  ctx: AppContext,
  list: GymTargetList,
  server: {
    /** The row of this server (`Guild.id`): its regions are those whose row names it. */
    guildRow: number | undefined;
    /** The name of a channel, for the order of the regions. */
    nameOf(channelId: string): string | undefined;
  },
  page: number,
): V2Message {
  const gyms = knownGyms(ctx, list.gymIds);
  const unreadable = list.unreadable + (list.gymIds.length - gyms.length);
  const regionName = (channelId: string) => server.nameOf(channelId) ?? channelId;
  const listed = gyms.map((gym): ListedGym => {
    // A gym on the border of two regions is listed under the first of them by name.
    const lying =
      server.guildRow === undefined
        ? []
        : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, server.guildRow);
    const [region] = lying
      .map(({ channelId }) => channelId)
      .sort((a, b) => byName(regionName(a), regionName(b)));
    return { gym, region };
  });
  listed.sort((a, b) => {
    if ((a.region === undefined) !== (b.region === undefined)) return a.region ? -1 : 1;
    const byRegion =
      a.region === undefined || b.region === undefined
        ? 0
        : byName(regionName(a.region), regionName(b.region));
    return byRegion || byName(gymName(a.gym), gymName(b.gym));
  });
  return renderMemberList({
    kind: TARGET_LIST_KIND,
    heading: '### Gyms you want raids of',
    noun: ['gym', 'gyms'],
    items: listed.map((entry) => ({
      line: (room: number) => targetLine(entry, room),
      removeArgs: stopArgs({ kind: 'gym', gymId: entry.gym.id }),
    })),
    page,
    notes:
      unreadable > 0
        ? [
            `…and ${count(unreadable, 'entry', 'entries')} this version cannot read (a gym ` +
              'that no longer exists, say); `/untarget-all` removes those too.',
          ]
        : [],
    footer: '`/target` adds one.',
    empty: 'You want raids of no gym yet. `/target` adds one.',
    removeCommand: '/untarget',
    removable: list.gymIds.length > 0 || list.unreadable > 0,
  });
}

/** The gyms of the member of an interaction in its server, at a page. */
async function memberTargets(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
  page: number,
): Promise<V2Message> {
  const list = await ctx.gymTargets.list(interaction.user.id, guildIdOf(interaction));
  const guildRow = await serverOf(interaction, ctx);
  // The cache is asked for names only: which regions are this server's is said by their rows.
  const nameOf = (channelId: string): string | undefined =>
    interaction.guild?.channels.cache.get(channelId)?.name;
  return targetsList(ctx, list, { guildRow, nameOf }, page);
}

/**
 * What `/targets` answers the member of an interaction: their gyms in its server, the first page.
 * Show of `/settings` answers it too (plan 8S-5: one path).
 */
export function targetsAnswer(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
): Promise<V2Message> {
  return memberTargets(interaction, ctx, 0);
}

/** `/targets` (spec 4.2): the member's gyms in this server, for the member alone. */
export const targets: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('targets')
    .setDescription('Show the gyms you get DMs for'),
  help: {
    category: 'notifications',
    details:
      'Shows your gyms in this server by region, ten to a page, each with a Remove button; ' +
      '"Remove all…" asks before it removes them all.',
    examples: ['/targets'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'late',

  async execute(interaction, ctx) {
    await answer(interaction, v2Answer(await targetsAnswer(interaction, ctx)));
  },
};

const allTargets = removeAllQuestion({
  kind: 'targets',
  title: 'Remove all your gym targets',
  count: (ctx, memberId, guildId) => ctx.gymTargets.count(memberId, guildId),
  removeAll: (ctx, memberId, guildId) => ctx.gymTargets.removeAll(memberId, guildId),
  none: 'You have no gyms in this server: there is nothing to remove.',
  question: (n) =>
    `Remove ${n === 1 ? 'your one gym' : `all ${String(n)} of your gyms`} in this server? ` +
    'You will get no DMs for raids at particular gyms here any more.',
  removed: (n) => `Removed ${count(n, 'gym')}: you have no gyms in this server any more.`,
});

/** `/untarget-all` (spec 4.2): removes all the member's gyms in this server, after asking. */
export const untargetAll: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('untarget-all')
    .setDescription('Stop the DMs for raids at all your gyms'),
  help: {
    category: 'notifications',
    details:
      'Removes all your gyms in this server, after asking you once, in a dialog. Your gyms ' +
      'in other servers and your list of Pokémon (`/wants`) stay as they are.',
    examples: ['/untarget-all'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  // The dialog is the first answer: nothing is deferred before it.
  throttle: NOTIFICATION_THROTTLE,
  execute: (interaction, ctx) => allTargets.ask(interaction, ctx),
};

/** The Submit of the dialog of `/untarget-all`. */
export const targetRemovalControls = allTargets.controls;

/** The buttons of `/targets`: the pages, Remove, and "Remove all…". */
export const targetListControls = memberListControls({
  kind: TARGET_LIST_KIND,
  command: '/targets',
  render: (interaction, ctx, page) => memberTargets(interaction, ctx, page),
  async remove(interaction, ctx, reason) {
    if (reason.kind !== 'gym') return false;
    await ctx.gymTargets.remove(interaction.user.id, guildIdOf(interaction), reason.gymId);
    return true;
  },
  askAll: (interaction, ctx) => allTargets.ask(interaction, ctx),
});
