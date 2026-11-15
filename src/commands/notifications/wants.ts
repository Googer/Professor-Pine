import { zoneOf } from '../../discord/server-values.js';
import {
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type Message,
  type APIModalInteractionResponseCallbackData,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { dmMessages } from '../../components/dm-messages.js';
import {
  CHANGE_ACTION,
  changeButtonId,
  rocketChangeButtonId,
  withChanged,
} from '../../render/notify-dm.js';
import { deferSubmit, readInTime } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, partyOf, requireGuild } from '../../discord/guards.js';
import { isBattle, isMax, isRaid, type Party } from '../../domain/party/party.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import type { Want } from '../../domain/pogo/notification-target.js';
import { raidTierLabel } from '../../domain/pogo/raid-tier.js';
import {
  allCostumed,
  boxesOf,
  removalAnswer,
  type BoxAnswer,
  type HeldRow,
} from '../../domain/pogo/species-answer.js';
import { whichHash } from '../../domain/short-hash.js';
import {
  BOX_WORDS,
  baseTarget,
  type BoxSubject,
  type WantBox,
} from '../../domain/pogo/want-boxes.js';
import { hasForms, type SetWantOutcome } from '../../domain/pogo/wants.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { ANY_LEADER, type TargetWant } from '../../domain/notify/target-wants.js';
import type { TargetWantList } from '../../db/repositories/target-want-repository.js';
import { parseStopArgs, stopArgs, type NotifyReason } from '../../domain/notify/reasons.js';
import { renderMemberList } from '../../render/member-list.js';
import { count, plain, truncate } from '../../render/text.js';
import { memberListControls } from './list-controls.js';
import {
  CHOICE_NAME,
  MAX_CHOICES,
  beginningFirst,
  wholeWordsBeforeGuesses,
  type Choice,
} from '../choices.js';
import { removeAllQuestion } from './remove-all.js';
import { NOTIFICATION_THROTTLE, notificationsSetUp } from './shared.js';
import {
  boxWords,
  costumesShown,
  dialogBoxes,
  dialogName,
  dialogSubject,
  isMegaForm,
  readWanted,
  rewardLabel,
  rewardWantChoices,
  rocketLine,
  rocketOptions,
  rocketWantChoices,
  rocketWhos,
  rowsLabel,
  TEAM_ROCKET,
  scopeOf,
  shownBoxes,
  subjectLabel,
  wantEntries,
  whichEntries,
  whichHashOf,
  type Wanted,
  type WantEntry,
} from './want-boxes.js';
import {
  readRocketDialogId,
  readRocketSubmit,
  readWantDialogId,
  readWantSubmit,
  rocketDialog,
  wantDialog,
  WANT_BOX_KIND,
  type WantDialogId,
  type WantDialogView,
} from './want-dialog.js';
import { wantChoices, wantLabel, wantName } from './want-input.js';
import { answer, showInPlace, v2Answer } from '../../discord/late-reply.js';
import { searchText, searchTokens } from '../../domain/search/text.js';

/**
 * A name with its article: `a T5`, `an Elite`, `an Articuno`; by the name's first letter, `shown`
 * as it is shown (in bold).
 */
function withArticle(name: string, shown = name): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${shown}`;
}

/** What a want does, as the member is told: when a direct message comes. */
function promise(ctx: AppContext, want: Want): string {
  const { target, scope } = want;
  const where = 'in a region you can see';
  if (target.kind === 'tier') {
    const label = raidTierLabel(target.tier);
    return `You will get a DM when ${withArticle(label)} raid or egg is reported ${where}.`;
  }
  if (target.kind === 'iv') {
    const ivs = target.iv === 'perfect' ? 'perfect' : 'zero';
    return `You will get a DM when a wild Pokémon with ${ivs} IVs is reported ${where}.`;
  }
  const species = plain(wantName(ctx, { kind: 'pokemon', dex: target.dex }));
  const several = target.form === undefined && hasForms(ctx.gameData.catalogue, target.dex);
  const name = plain(wantName(ctx, target));
  const what = {
    both: `${withArticle(name)} raid or a wild ${name} is`,
    raid: `${withArticle(name)} raid is`,
    spawn: `a wild ${name} is`,
  }[scope];
  let forms = ' Only that form counts.';
  if (target.form === undefined) forms = several ? ` Every form of ${species} counts.` : '';
  return `You will get a DM when ${what} reported ${where}.${forms}`;
}

/** What `/want` answers for IVs (a spawn want, always). */
function ivAnswer(ctx: AppContext, outcome: SetWantOutcome): string {
  const name = plain(wantLabel(ctx, outcome.want.target));
  if (outcome.kind === 'unchanged') {
    return `${name} are on your list already. \`/unwant\` takes them off.`;
  }
  return `${promise(ctx, outcome.want)} \`/unwant\` takes them off again.`;
}

/** How many places of a full list of `/want`'s choices go to research rewards at most (B5). */
const REWARD_ROOM = 5;

/**
 * The boxes no costumed Pokémon has appeared in so far (design 3): Costumed ticked with one of
 * them is said in small print, never refused, so that a later costumed shadow or max boss is told.
 */
export const NEVER_COSTUMED_YET: readonly WantBox[] = ['dynamax', 'gigantamax', 'shadow'];

/** Words of a list: `A`, `A and B`, `A, B and C`. */
function listWords(words: readonly string[]): string {
  if (words.length < 2) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/** The boxes in the order a line names them. */
const ANSWER_ORDER: readonly WantBox[] = [
  'raids',
  'dynamax',
  'gigantamax',
  'spawns',
  'research',
  'shadow',
  'shadow-raids',
];

/**
 * What `/want` and the dialog say after a change (design 3, mockup 5): the want as `/wants` names
 * it with its boxes, or that it is off the list; in small print where Costumed meets a box that
 * has never had costumes (`NEVER_COSTUMED_YET`) and a mega ticked without Raids, which is off.
 */
function boxesAnswer(
  ctx: AppContext,
  subject: BoxSubject,
  after: readonly HeldRow[],
  given?: BoxAnswer,
): string {
  const notes: string[] = [];
  const dropped = (given?.remove === true ? [] : (given?.forms ?? [])).filter(
    (form): form is string =>
      form !== undefined &&
      ctx.gameData.catalogue.byKey(form)?.kind === 'mega' &&
      !after.some((row) => row.form === form),
  );
  if (dropped.length > 0) {
    const names = dropped.map((form) => plain(ctx.gameData.catalogue.byKey(form)?.name ?? form));
    notes.push(
      dropped.length === 1
        ? `-# ${names.join('')} is told for raids only: it is off your list without Raids.`
        : `-# ${listWords(names)} are told for raids only: they are off your list without Raids.`,
    );
  }
  if (after.length === 0) {
    return [`**${plain(dialogName(ctx, subject))}** is off your list.`, ...notes].join('\n');
  }
  const held = boxesOf(after);
  const boxes = ANSWER_ORDER.filter((box) => held.has(box));
  const costumed = allCostumed(after, isMegaForm(ctx));
  const quiet = costumed ? NEVER_COSTUMED_YET.filter((box) => held.has(box)) : [];
  if (quiet.length > 0) {
    notes.unshift(
      "-# Costumed Pokémon haven't appeared in max battles or as shadows so far, so " +
        `${listWords(quiet.map((box) => BOX_WORDS[box]))} ${quiet.length === 1 ? 'stays' : 'stay'} ` +
        'quiet unless that changes.',
    );
  }
  return [
    `**${plain(rowsLabel(ctx, subject, after))}**: ${boxWords(boxes)}. You will get a DM when ` +
      'one is reported in a region you can see.',
    ...notes,
  ].join('\n');
}

/**
 * The dialog of a subject for a member (design 3): the boxes, Which, Costumes and Remove that
 * show, ticked as their rows are (`held`) with the post's box beside them (`postBox`, R-M1); for
 * a first want every form (or the one picked), Costumed off, and no box but the post's (Matt's
 * R-M2: outside a post nothing, and Submit waits till one is ticked). Costumes shows also where a
 * row held is costumed (A1), so that a Submit never drops it unseen.
 */
export function wantDialogFor(
  ctx: AppContext,
  subject: BoxSubject,
  held: readonly HeldRow[],
  options: {
    /** When it opens (its id's per-open token, plan 8X-F). */
    openedAt: number;
    picked?: string;
    /** The box of the battle of the post `/want` was used in (R-M1), ticked where shown. */
    postBox?: WantBox;
    server?: { id: string; name: string };
    page?: number;
    /** The zone of the server the dialog is for (plan 19A-2): which bosses are on its lists. */
    zone: string;
  },
): APIModalInteractionResponseCallbackData {
  const which = whichEntries(ctx, subject);
  const keys = which.map((entry) => entry.key);
  const shown = dialogBoxes(ctx, subject, held, options.zone);
  const isMega = isMegaForm(ctx);
  const post =
    options.postBox !== undefined && shown.includes(options.postBox) ? [options.postBox] : [];
  let ticks: WantDialogView['ticks'];
  if (held.length === 0) {
    ticks = {
      boxes: new Set(post),
      forms: new Set(options.picked === undefined ? keys : [options.picked]),
      costumed: false,
    };
  } else {
    const forms = held.some((row) => row.form === undefined)
      ? keys
      : held.flatMap((row) => (row.form === undefined ? [] : [row.form]));
    ticks = {
      boxes: new Set([...[...boxesOf(held)].filter((box) => shown.includes(box)), ...post]),
      forms: new Set([...forms, ...(options.picked === undefined ? [] : [options.picked])]),
      // Costumed only where every row is (review R6: a wrong narrowing loses DMs); a mega's row
      // is always plain and counts for nothing (A-D3).
      costumed: allCostumed(held, isMega),
    };
  }
  // A mega's row is Raids only and plain: it differs from no other by that (A3).
  const own = held.filter((row) => row.form === undefined || !isMega(row.form));
  const first = own[0];
  const differ =
    first !== undefined &&
    own.some(
      (row) =>
        row.costumed !== first.costumed ||
        boxWords([...row.boxes].sort()) !== boxWords([...first.boxes].sort()),
    );
  return wantDialog({
    subject,
    name: dialogName(ctx, subject),
    shown,
    which: which.map((entry) => ({ key: entry.key, name: entry.name })),
    whichHash: whichHash(keys),
    costumes: costumesShown(ctx, subject, options.zone) || held.some((row) => row.costumed),
    remove: held.length > 0,
    ticks,
    differ,
    ...(options.server === undefined ? {} : { server: options.server }),
    ...(options.page === undefined ? {} : { page: options.page }),
    openedAt: options.openedAt,
  });
}

/**
 * The answer a Submit gives, from its id and fields (`readWantSubmit`): a Which field read as its
 * forms, every form ticked as the species row; out of date (`STALE_COMPONENT`) where the Which
 * field the game data shows now is another (review R5) or a field is missing.
 */
export function answerOfSubmit(
  ctx: AppContext,
  interaction: Pick<ModalSubmitInteraction, 'fields'>,
  id: WantDialogId,
): BoxAnswer {
  if (id.which !== whichHashOf(ctx, id.subject)) throw new UserError(STALE_COMPONENT);
  const read = readWantSubmit(interaction, id);
  if (!read) throw new UserError(STALE_COMPONENT);
  const keys = whichEntries(ctx, id.subject).map((entry) => entry.key);
  let forms: (string | undefined)[] = [undefined];
  if (read.forms !== undefined) {
    const picked = keys.filter((key) => read.forms?.includes(key));
    forms = picked.length === keys.length ? [undefined] : picked;
  }
  return {
    scope: scopeOf(ctx, id.subject),
    forms,
    ticked: read.ticked,
    shown: id.shown,
    costumed: read.costumed,
    remove: read.remove,
  };
}

/** What `/want` says of a research reward it added. */
function rewardAnswer(ctx: AppContext, wanted: Wanted & { kind: 'reward' }): string {
  return (
    `You will get a DM when field research that may reward **${plain(rewardLabel(ctx, wanted.want).replace(/ \(research\)$/, ''))}** ` +
    'is reported in a region you can see. `/unwant` takes it off again.'
  );
}

/**
 * What `/want` adds where it wrote at once (one box, no Costumes field) and a row held stays
 * costumed (F3): the dialog of a line's Manage… in `/wants` shows Costumes for it.
 */
const STILL_COSTUMED =
  '-# Only costumed ones are told: Manage… in `/wants` can untick Only costumed.';

/** What `/want` answers where nothing is typed outside the post of a raid or max battle (R-M1). */
export const NAME_A_POKEMON =
  'Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it ' +
  'out for its boss.';

/**
 * What a use of `/want` is about, read once per interaction (A8: its deferral and `execute`
 * decide alike): what it names; for a Pokémon or a tier its dialog's subject, the form picked,
 * whether the dialog opens (`asks`), and the box of the post's battle (R-M1).
 */
interface WantUse {
  wanted: Wanted;
  subject?: BoxSubject;
  picked?: string;
  postBox?: WantBox;
  asks: boolean;
}

const usesRead = new WeakMap<object, WantUse>();

/**
 * The subject `/want` means in the post of a raid or max battle with nothing typed (Matt's
 * R-M1): the boss, an egg's tier. Refused (a `UserError`) anywhere else (`NAME_A_POKEMON`; a raid
 * that has ended is out of the store, so its post is as any other) and where the battle's boss is
 * one the game data does not know (Matt's Q1, F1): a raid's names the tier to want instead.
 */
function postSubject(ctx: AppContext, party: Party | undefined): BoxSubject {
  if (!party || !isBattle(party)) throw new UserError(NAME_A_POKEMON);
  const boss = isRaid(party) ? party.raid.boss : party.max.boss;
  if (boss === null && isRaid(party)) return { kind: 'tier', level: party.raid.tier.level };
  const entry = boss !== null && 'key' in boss ? ctx.gameData.catalogue.byKey(boss.key) : undefined;
  if (!entry) {
    if (!isRaid(party)) {
      throw new UserError('The boss of this battle is not known yet: name a Pokémon.');
    }
    // The tier's dialog asks about its raids and its shadow raids alike: the level names it.
    const tier = raidTierLabel({ level: party.raid.tier.level, shadow: false }).toLowerCase();
    throw new UserError(
      `The boss of this raid is not known yet: name a Pokémon, or \`/want ${tier}\` for the tier.`,
    );
  }
  // A species of one entry is the species; a form of several, picked in its species' dialog.
  return ctx.gameData.catalogue.byDex(entry.dex).length > 1
    ? { kind: 'pokemon', dex: entry.dex, form: entry.key }
    : { kind: 'pokemon', dex: entry.dex };
}

/**
 * The box of a post's battle for a subject (R-M1): a raid's Raids (a shadow raid's Shadow, of a
 * tier Shadow raids), a max battle's Dynamax or Gigantamax; none elsewhere.
 */
function postBoxOf(party: Party | undefined, subject: BoxSubject): WantBox | undefined {
  if (!party) return undefined;
  if (isRaid(party)) {
    const { shadow } = party.raid.tier;
    if (subject.kind === 'tier') return shadow ? 'shadow-raids' : 'raids';
    return shadow ? 'shadow' : 'raids';
  }
  if (isMax(party) && subject.kind === 'pokemon') {
    return party.max.tier === 'G' ? 'gigantamax' : 'dynamax';
  }
  return undefined;
}

function useOf(interaction: ChatInputCommandInteraction, ctx: AppContext): WantUse {
  const known = usesRead.get(interaction);
  if (known) return known;
  // The post's party from its id alone, in memory (`partyOf`): no read before the dialog.
  const party = interaction.inGuild() ? partyOf(interaction, ctx) : undefined;
  const typed = interaction.options.getString('target');
  let wanted: Wanted;
  if (typed === null || typed.trim() === '') {
    const subject = postSubject(ctx, party);
    wanted = { kind: 'subject', subject, target: baseTarget(subject) };
  } else {
    wanted = readWanted(ctx, interaction.guildId, typed);
  }
  let use: WantUse = { wanted, asks: wanted.kind === 'rocket' };
  if (wanted.kind === 'subject') {
    const { subject, picked } = dialogSubject(ctx, wanted.subject);
    const postBox = postBoxOf(party, subject);
    use = {
      wanted,
      subject,
      ...(picked === undefined ? {} : { picked }),
      ...(postBox === undefined ? {} : { postBox }),
      asks: asksAbout(ctx, subject, zoneOf(interaction, ctx)),
    };
  }
  usesRead.set(interaction, use);
  return use;
}

/**
 * Whether a subject's dialog opens (S1), from the game data and the lists alone: when it would
 * show Tell me about (two boxes or more), Which or Costumes. Else it writes at once (Mew).
 */
function asksAbout(ctx: AppContext, subject: BoxSubject, zone: string): boolean {
  return (
    shownBoxes(ctx, subject, zone).length > 1 ||
    whichEntries(ctx, subject).length > 0 ||
    costumesShown(ctx, subject, zone)
  );
}

/**
 * The guard that reads what a use names (`useOf`, F2): nothing typed outside a battle's post, a
 * boss Pine does not know or a name it cannot read is refused before the throttle counts the use
 * (`discord-framework.md`: a use a guard refused does not count).
 */
const readsUse: Guard = (interaction, ctx) => {
  if (interaction.isChatInputCommand()) useOf(interaction, ctx);
};

/** Whether a use opens the dialog (`asksAbout`); decided before any read, so synchronously. */
function opensDialog(interaction: ChatInputCommandInteraction, ctx: AppContext): boolean {
  try {
    // Team GO Rocket always asks (F13: else the router would acknowledge it as `late`).
    return useOf(interaction, ctx).asks;
  } catch {
    // What it names is refused by the guard `readsUse` before this is asked.
    return false;
  }
}

/**
 * `/want` (spec 4.2; plan 8R-1, design 7; plan 8R-4): a Pokémon, a form, a raid tier, perfect or
 * zero IVs, an item or Mega Energy of the task list, or a Team GO Rocket target. A Pokémon, a form
 * or a tier opens a dialog that asks what for (Raids, Dynamax, Gigantamax, Spawns, Research,
 * Shadow; a tier's Raids and Shadow raids), which forms and whether only costumed ones, ticked as
 * the member's rows have them, read within Discord's three seconds (`readInTime`); a form of a
 * species with a Which field (`/want mega charizard y`) opens its species' dialog with that form
 * ticked. One whose dialog would show one box and no other field (S1, `asksAbout`: Mew, a tier
 * without shadow raids), IVs and a reward are written at once. Every Team GO Rocket target opens
 * the Team GO Rocket dialog. A want belongs to the member and the server it was made in.
 */
export const want: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('want')
    .setDescription(
      'Get a DM when a Pokémon, a raid tier, a research reward or Team GO Rocket is reported',
    )
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription(
          'A Pokémon, tier, IVs, item, grunt or leader; leave it out in a raid or max post for its boss',
        )
        .setRequired(false)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Puts a Pokémon, a raid tier, perfect or zero IVs, or a research reward (an item such as ' +
      'Rare Candy, or Mega Energy) on your list for this server: you get a direct message when ' +
      'one is reported in a region you can see.\n\nFor a Pokémon a dialog asks what for: Raids, ' +
      'Dynamax and Gigantamax max battles, Spawns, Research (field research that may reward ' +
      'it) and Shadow (shadow raids and Team GO Rocket catches), each only where the game has ' +
      'it. Tick what you want; untick everything, or press Remove, to take it off your ' +
      'list.\n\nWhere a Pokémon has several forms, the dialog asks which; ticking every form ' +
      'wants the whole species, forms that come later included (megas are told for raids ' +
      'only). Picking a form from the list (`Galarian Corsola`) opens its species with that ' +
      'form ticked.\n\nWhere a Pokémon can wear a costume, "Only costumed" asks for costumed ' +
      'ones only (any costume); otherwise costumed ones come too.\n\nA raid tier asks about its ' +
      'raids and its shadow raids. `/want rocket` (or a grunt type, a leader or Giovanni) asks ' +
      'in one dialog which grunt types (at most one direct message an hour for each), untyped ' +
      'and decoy grunts, Cliff, Arlo, Sierra, any leader and Giovanni you want.\n\nWanting ' +
      'something again shows what you ticked. A first want opens with no box ticked, and ' +
      'Submit waits until one is.\n\nIn the post of a raid or a max battle, `/want` alone ' +
      'wants its boss (for an egg, its tier; a boss I do not know yet has to be named), and ' +
      'the dialog ticks only that kind of battle (Raids, Shadow for a shadow raid, Dynamax or ' +
      'Gigantamax), also for a Pokémon you type there. Anywhere else, name one.\n\nPick from ' +
      'the list that appears while you type, or type a name or a tier such as `t5`, `mega`, ' +
      '`elite`, `perfect` or `zero`.',
    examples: [
      '/want target:Dratini',
      '/want target:t5',
      '/want target:Rare Candy',
      '/want target:Dragon-type grunt',
    ],
  },
  setUpIn: notificationsSetUp,
  guards: [requireGuild, readsUse],
  // The dialog is the first answer where one opens: nothing is deferred before it; every other
  // use writes under the member's lock first, so it is acknowledged when that takes long (B2).
  defer: (interaction, ctx) => (opensDialog(interaction, ctx) ? undefined : 'late'),
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const use = useOf(interaction, ctx);
    const { wanted } = use;
    const memberId = interaction.user.id;
    const guildId = guildIdOf(interaction);
    if (wanted.kind === 'reward') {
      await ctx.targetWants.change(
        memberId,
        guildId,
        { add: [wanted.want], remove: [] },
        Date.now(),
      );
      await answer(interaction, { content: rewardAnswer(ctx, wanted) });
      return;
    }
    if (wanted.kind === 'rocket') {
      // One dialog for every Rocket want (plan 8R-4, design 4b), the target picked ticked.
      const picked = wanted.want?.kind === 'rocket' ? wanted.want.who : undefined;
      const { dialog } = await rocketDialogFor(ctx, interaction, memberId, guildId, {
        openedAt: Date.now(),
        ...(picked === undefined ? {} : { picked }),
      });
      await interaction.showModal(dialog);
      return;
    }
    if (wanted.kind === 'iv') {
      const outcome = await ctx.wants.set(memberId, guildId, wanted.target, 'spawn');
      await answer(interaction, { content: ivAnswer(ctx, outcome) });
      return;
    }
    const { subject, picked, postBox } = use;
    if (!subject) throw new Error('a use of /want without the subject of its dialog');
    const scope = scopeOf(ctx, subject);
    if (!use.asks) {
      // One box and nothing else to ask (S1: Mew, a tier without shadow raids): written at once.
      const shown = shownBoxes(ctx, subject, zoneOf(interaction, ctx));
      const given: BoxAnswer = {
        scope,
        forms: [undefined],
        ticked: new Set(shown),
        shown,
        // Costumes not shown: a costumed row held stays costumed (A1).
        costumed: undefined,
        remove: false,
      };
      const { after } = await ctx.wantBoxes.set(memberId, guildId, given, Date.now());
      const said = boxesAnswer(ctx, subject, after, given);
      // A costumed row stays costumed unseen (F3): where to make it plain is said.
      await answer(interaction, {
        content: after.some((row) => row.costumed) ? `${said}\n${STILL_COSTUMED}` : said,
      });
      return;
    }
    const held = await readInTime(ctx.log, interaction, () =>
      ctx.wantBoxes.held(memberId, guildId, scope),
    );
    await interaction.showModal(
      wantDialogFor(ctx, subject, held, {
        openedAt: Date.now(),
        zone: zoneOf(interaction, ctx),
        ...(picked === undefined ? {} : { picked }),
        ...(postBox === undefined ? {} : { postBox }),
      }),
    );
  },

  async autocomplete(interaction, ctx) {
    const typed = interaction.options.getFocused();
    // The Pokémon, forms, tiers and IVs first; Team GO Rocket's targets (plan 8R-2) and the items
    // and Mega Energy of the task list fill what is left, at most `REWARD_ROOM` places where the
    // Pokémon would fill the list (B5).
    const rewards = [...rocketWantChoices(typed), ...rewardWantChoices(ctx, typed)];
    const others = wantChoices(ctx, interaction.guildId, typed, zoneOf(interaction, ctx)).slice(
      0,
      MAX_CHOICES - Math.min(rewards.length, REWARD_ROOM),
    );
    // A whole-word match before a near one (plan 8R-6): `rocket` gives Team GO Rocket before Rowlet.
    await interaction.respond(
      wholeWordsBeforeGuesses(others, rewards, typed).slice(0, MAX_CHOICES),
    );
  },
};

/**
 * The guard of the dialog's Submit (plan 8R-4): a server, or one named in its id (a dialog Manage…
 * of a DM opened, which has none).
 */
const requireWantServer: Guard = (interaction) => {
  if (interaction.inGuild()) return;
  const id = 'customId' in interaction ? decodeCustomId(interaction.customId) : undefined;
  const server = id && (readWantDialogId(id)?.server ?? readRocketDialogId(id)?.server);
  if (server === undefined) throw new UserError('This only works in a server.');
};

/** What Manage… from a DM says where wants are switched off. */
export const WANTS_OFF = 'Wants are switched off in that server: there is nothing to change.';
/** What Manage… from a DM says to a member no longer in the server it names. */
export const NOT_A_MEMBER =
  'You are no longer a member of that server: there is nothing to change there.';

/**
 * Why a change from a DM writes nothing for that server: wants switched off, or the member no
 * longer in it; undefined where it may. Asked by a press of Manage… (`dm.ts`) and again by the
 * Submit (B2).
 */
export async function changeRefusal(
  ctx: AppContext,
  guildId: string,
  memberId: string,
): Promise<string | undefined> {
  if (!ctx.servers.of(guildId).features.notifications) return WANTS_OFF;
  return (await ctx.members.find(guildId, memberId)) ? undefined : NOT_A_MEMBER;
}

/** What a Submit wrote: its answer, and whether it took the want off. */
interface Written {
  said: string;
  removed: boolean;
}

/**
 * A Submit from a DM (plan 8R-4, R20): acknowledged on the message the Manage… was on
 * (`deferUpdate`), written for the server of the id and the presser alone (`write`), then that
 * message's Manage… (`button`) shown as a disabled `Changed` (`Removed` where it took the want
 * off) under the messages' lock (`dmMessages`, read anew first), and answered below
 * (`followUp`), also when the button could not be changed.
 */
async function submitFromDm(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  server: string,
  button: string | undefined,
  write: () => Promise<Written>,
): Promise<void> {
  const message = interaction.isFromMessage() ? interaction.message : undefined;
  if (message) await interaction.deferUpdate();
  else await deferSubmit(interaction);
  // Asked again (B2): the member may have left, or wants been switched off, since it opened.
  const refusal = await changeRefusal(ctx, server, interaction.user.id);
  if (refusal !== undefined) {
    await (message
      ? interaction.followUp({ content: refusal })
      : interaction.editReply({ content: refusal }));
    return;
  }
  const { said, removed } = await write();
  if (!message) {
    await interaction.editReply({ content: said });
    return;
  }
  await dmMessages.run(message.id, async () => {
    let now: Pick<Message, 'components' | 'flags'> = message;
    try {
      now = await interaction.fetchReply();
    } catch (err) {
      ctx.log.warn({ err }, 'could not read a direct message anew to show a change');
    }
    // A classic DM from before 8B-1 has no Manage… to show (F5).
    if (button === undefined || !now.flags.has(MessageFlags.IsComponentsV2)) return;
    try {
      const components = now.components.map((component) => component.toJSON());
      await interaction.editReply({
        components: withChanged(components, button, removed),
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      ctx.log.warn({ err }, 'could not show a change on a direct message');
    }
  });
  await interaction.followUp({ content: said });
}

/**
 * A Submit of a dialog Manage… of `/wants` opened (plan 8R-4, S3): acknowledged on the list first
 * (`deferUpdate`, B1), written, then the list's page shown again in its place (`showInPlace`, an
 * edit by then) with the answer as a note at its top; its small print (a warning) also below,
 * privately, so that it is not missed.
 */
async function submitFromList(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  page: number,
  write: () => Promise<Written>,
): Promise<void> {
  // Acknowledged first (B1): the writing and the list's read may take longer than Discord waits.
  await interaction.deferUpdate();
  const [said = '', ...warnings] = (await write()).said.split('\n');
  await showInPlace(interaction, await memberWants(interaction, ctx, page, said));
  if (warnings.length > 0) {
    await interaction.followUp({ content: warnings.join('\n'), flags: MessageFlags.Ephemeral });
  }
}

/**
 * A Submit as it came: from a DM (`server`, the Manage… of `button`), from `/wants` (`page`), or
 * from `/want`'s own use (acknowledged privately at once, answered by an edit).
 */
async function answerSubmit(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  from: { server?: string; page?: number; button: (server: string) => string | undefined },
  write: (guildId: string) => Promise<Written>,
): Promise<void> {
  if (!interaction.inGuild()) {
    const { server } = from;
    if (server === undefined) throw new UserError(STALE_COMPONENT);
    await submitFromDm(interaction, ctx, server, from.button(server), () => write(server));
    return;
  }
  const guildId = guildIdOf(interaction);
  if (from.page !== undefined && interaction.isFromMessage()) {
    await submitFromList(interaction, ctx, from.page, () => write(guildId));
    return;
  }
  await deferSubmit(interaction);
  await interaction.editReply({ content: (await write(guildId)).said });
}

/**
 * The Rocket dialog for a member in a server (plan 8R-4, design 4b): their Rocket wants read in
 * time, ticked, with `picked` (a target picked or typed) beside them.
 */
export async function rocketDialogFor(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  memberId: string,
  guildId: string,
  options: {
    /** When it opens (its id's per-open token, plan 8X-F). */
    openedAt: number;
    picked?: string;
    server?: { id: string; name: string };
    page?: number;
  },
): Promise<{ held: Set<string>; dialog: APIModalInteractionResponseCallbackData }> {
  const held = await readInTime(ctx.log, interaction, async () =>
    rocketWhosOf(await ctx.targetWants.list(memberId, guildId)),
  );
  return { held, dialog: rocketDialogOf(held, options) };
}

/** The Rocket dialog of a member's Rocket wants (`held`, read), with `picked` beside them. */
export function rocketDialogOf(
  held: ReadonlySet<string>,
  options: {
    openedAt: number;
    picked?: string;
    server?: { id: string; name: string };
    page?: number;
  },
): APIModalInteractionResponseCallbackData {
  const { grunts, leaders } = rocketOptions();
  const ticked = new Set([...held, ...(options.picked === undefined ? [] : [options.picked])]);
  return rocketDialog({
    grunts,
    leaders,
    ticked,
    remove: held.size > 0,
    ...(options.server === undefined ? {} : { server: options.server }),
    ...(options.page === undefined ? {} : { page: options.page }),
    openedAt: options.openedAt,
  });
}

/** The `who` of a member's Rocket wants. */
export function rocketWhosOf(list: TargetWantList): Set<string> {
  return new Set(list.wants.flatMap((want) => (want.kind === 'rocket' ? [want.who] : [])));
}

/**
 * Writes a Submit of the Rocket dialog (design 4b): the targets picked, in the dialog's order,
 * and every other Rocket target off, in one transaction under the member's lock
 * (`TargetWantStorage.change`); nothing picked or Remove takes them all off.
 */
async function writeRocket(
  ctx: AppContext,
  memberId: string,
  guildId: string,
  read: { picked: string[]; remove: boolean },
): Promise<Written> {
  const all = rocketWhos();
  const picked = read.remove ? [] : all.filter((who) => read.picked.includes(who));
  const rocket = (who: string): TargetWant => ({ kind: 'rocket', who });
  const gone = await ctx.targetWants.change(
    memberId,
    guildId,
    {
      add: picked.map(rocket),
      remove: all.filter((who) => !picked.includes(who)).map(rocket),
    },
    Date.now(),
  );
  if (picked.length === 0) {
    // Whether there was any to take off is decided under the member's lock (B8).
    return gone === 0 && !read.remove
      ? { said: 'Nothing picked: no Team GO Rocket wants.', removed: false }
      : { said: '**Team GO Rocket** is off your list.', removed: true };
  }
  const whos = new Set(picked);
  const grunts = picked.some((who) => who.startsWith('grunt:') || who === 'decoy');
  const lines = [
    `**Team GO Rocket**: ${plain(rocketLine(whos))}. You will get a DM when one is reported in ` +
      `a region you can see${grunts ? ', a grunt type at most once an hour' : ''}.`,
  ];
  const named = rocketOptions().leaders.filter(
    (one) => one.who.startsWith('leader:') && one.who !== ANY_LEADER && whos.has(one.who),
  );
  if (whos.has(ANY_LEADER) && named.length > 0) {
    const names = named.map((one) => one.label);
    const list =
      names.length === 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    lines.push(
      `-# Any leader covers Cliff, Arlo and Sierra already: ${list} ` +
        `${names.length === 1 ? 'adds' : 'add'} nothing.`,
    );
  }
  return { said: lines.join('\n'), removed: false };
}

/**
 * The Submit of `/want`'s dialog (kind `wantbox`): the boxes it shows now, as ticked; every
 * other box as it is; in one transaction under the member's lock (`WantBoxStorage.set`). The
 * limit of `/want`, in the Submit's own window.
 */
export const wantBoxControls: ComponentHandler = {
  kind: WANT_BOX_KIND,
  guards: [requireWantServer],
  throttle: NOTIFICATION_THROTTLE,
  async modal(interaction, id, ctx) {
    const memberId = interaction.user.id;
    const rocket = readRocketDialogId(id);
    if (rocket) {
      const read = readRocketSubmit(interaction, rocket);
      if (!read) throw new UserError(STALE_COMPONENT);
      const from = { ...rocket, button: (server: string) => rocketChangeButtonId(server) };
      await answerSubmit(interaction, ctx, from, (guildId) =>
        writeRocket(ctx, memberId, guildId, read),
      );
      return;
    }
    const submit = readWantDialogId(id);
    // An id of before plan 8R-4 or of another shape: out of date, nothing written. The boxes
    // the dialog showed (B3), not those that can happen now.
    if (!submit) throw new UserError(STALE_COMPONENT);
    const given = answerOfSubmit(ctx, interaction, submit);
    const from = {
      ...(submit.server === undefined ? {} : { server: submit.server }),
      ...(submit.page === undefined ? {} : { page: submit.page }),
      button: (server: string) => changeButtonId(server, submit.subject),
    };
    await answerSubmit(interaction, ctx, from, async (guildId) => {
      const { after } = await ctx.wantBoxes.set(memberId, guildId, given, Date.now());
      return {
        said: boxesAnswer(ctx, submit.subject, after, given),
        removed: given.remove || after.length === 0,
      };
    });
  },
};

/** The member's lines of `/wants` in a server, from both tables. */
async function entriesOf(
  ctx: AppContext,
  memberId: string,
  guildId: string,
): Promise<{
  entries: WantEntry[];
  unreadable: number;
}> {
  const [wanted, targets] = await Promise.all([
    ctx.wants.list(memberId, guildId),
    ctx.targetWants.list(memberId, guildId),
  ]);
  return {
    entries: wantEntries(ctx, wanted, targets),
    unreadable: wanted.unreadable + targets.unreadable,
  };
}

/** How many lines `/wants` shows a member in a server (the panel of `/settings`), both tables. */
export async function wantLineCount(
  ctx: AppContext,
  memberId: string,
  guildId: string,
): Promise<number> {
  return (await entriesOf(ctx, memberId, guildId)).entries.length;
}

/**
 * The names of a member's lines of `/wants` in a server, in its order and as its lines name them
 * ("Costumed Pikachu", "Tier 5 raids", "Team GO Rocket"), with the rows of both tables that cannot
 * be read: what staff's `/admin member-settings` shows of them (one path with the member's list).
 */
export async function wantLineNames(
  ctx: AppContext,
  memberId: string,
  guildId: string,
): Promise<{ names: string[]; unreadable: number }> {
  const { entries, unreadable } = await entriesOf(ctx, memberId, guildId);
  return { names: entries.map((entry) => entry.listLabel ?? entry.label), unreadable };
}

/** A line as `/unwant` lists and reads it: `Dratini: Raids, Research`. */
function entryText(entry: WantEntry): string {
  if (entry.detail !== undefined) return `${entry.label}: ${entry.detail}`;
  return entry.boxes.length === 0 ? entry.label : `${entry.label}: ${boxWords(entry.boxes)}`;
}

/** Takes away what a line is: every box of a subject, IVs, a reward; whether there was any. */
async function removeEntry(
  ctx: AppContext,
  memberId: string,
  guildId: string,
  what: WantEntry['remove'],
): Promise<boolean> {
  if (what.kind === 'subject') {
    const { before } = await ctx.wantBoxes.set(
      memberId,
      guildId,
      removalAnswer(scopeOf(ctx, what.subject)),
      Date.now(),
    );
    return before.length > 0;
  }
  if (what.kind === 'want') return ctx.wants.remove(memberId, guildId, what.target);
  if (what.kind === 'rocket') {
    const held = rocketWhosOf(await ctx.targetWants.list(memberId, guildId));
    if (held.size === 0) return false;
    await writeRocket(ctx, memberId, guildId, { picked: [], remove: true });
    return true;
  }
  return ctx.targetWants.remove(memberId, guildId, what.want);
}

/** What a line of `Wanted` takes away, and what it is called. */
function removalOf(ctx: AppContext, wanted: Wanted): { what: WantEntry['remove']; name: string } {
  if (wanted.kind === 'rocket' && wanted.want === undefined) {
    return { what: { kind: 'rocket' }, name: 'Team GO Rocket' };
  }
  if (wanted.kind === 'reward' || wanted.kind === 'rocket') {
    const want = wanted.want ?? { kind: 'rocket', who: '' };
    return { what: { kind: 'target', want }, name: rewardLabel(ctx, want) };
  }
  if (wanted.kind === 'iv') {
    return { what: { kind: 'want', target: wanted.target }, name: wantLabel(ctx, wanted.target) };
  }
  return {
    what: { kind: 'subject', subject: wanted.subject },
    name: subjectLabel(ctx, wanted.subject),
  };
}

/**
 * What `/unwant` says of a form the member holds no row of while their species row covers it
 * (review R4e): nothing is removed, the row is never split by itself. Undefined otherwise.
 */
async function coveringSpecies(
  ctx: AppContext,
  memberId: string,
  guildId: string,
  wanted: Wanted,
): Promise<string | undefined> {
  if (wanted.kind !== 'subject' || wanted.subject.kind !== 'pokemon') return undefined;
  const { form, dex } = wanted.subject;
  const species: BoxSubject = { kind: 'pokemon', dex };
  if (form === undefined || whichEntries(ctx, species).length === 0) return undefined;
  const held = await ctx.wantBoxes.held(memberId, guildId, scopeOf(ctx, species));
  if (held.some((row) => row.form === form) || !held.some((row) => row.form === undefined)) {
    return undefined;
  }
  const name = dialogName(ctx, species);
  const formName = ctx.gameData.catalogue.byKey(form)?.name ?? form;
  return (
    `Your **${plain(name)}** want covers **${plain(formName)}**. ` +
    `\`/want ${name.toLowerCase()}\` changes which forms.`
  );
}

/** `/unwant` (spec 4.2): takes one thing off the member's list in this server, every box of it. */
export const unwant: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('unwant')
    .setDescription('Stop the DMs for a Pokémon, a raid tier, a research reward or Team GO Rocket')
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription('What to take off your list: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Takes a Pokémon, a raid tier, perfect or zero IVs, a research reward or a Team GO Rocket ' +
      'target off your list for this server, whatever you ticked for it. A Pokémon takes all ' +
      'its forms off with it.\n\nA form (`Galarian Corsola`) is taken off when you want that ' +
      'form by itself. When your want of the whole species covers it, nothing is taken off: ' +
      'use `/want` on the species to change which forms you want. Unown’s letters are wants ' +
      'of their own.\n\n' +
      '"Team GO Rocket" takes every Rocket want off; a grunt type or leader, that one alone.\n\nThe ' +
      'list that appears while you type shows what is on it; you can also type the name as for ' +
      '`/want`. To keep some of what you ticked, use `/want` again instead.',
    examples: ['/unwant target:Mewtwo', '/unwant target:t5'],
  },
  setUpIn: notificationsSetUp,
  guards: [requireGuild],
  defer: 'late',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('target', true);
    const memberId = interaction.user.id;
    const guildId = guildIdOf(interaction);
    // A line of the member's own list named in full first: `Charizard` may be the one form of
    // that name there, which typed text otherwise reads as the species.
    const { entries } = await entriesOf(ctx, memberId, guildId);
    const folded = searchText(typed);
    const named = entries.filter(
      (entry) => searchText(entry.label) === folded || searchText(entryText(entry)) === folded,
    );
    const [only] = named;
    const wanted =
      only && named.length === 1 ? undefined : readWanted(ctx, interaction.guildId, typed, true);
    const covered = wanted && (await coveringSpecies(ctx, memberId, guildId, wanted));
    if (covered !== undefined) {
      await answer(interaction, { content: covered });
      return;
    }
    const { what, name } =
      only && named.length === 1
        ? { what: only.remove, name: only.label }
        : removalOf(ctx, wanted ?? readWanted(ctx, interaction.guildId, typed, true));
    const removed = await removeEntry(ctx, memberId, guildId, what);
    await answer(interaction, {
      content: removed
        ? `**${plain(name)}** is off your list.`
        : `**${plain(name)}** is not on your list. \`/wants\` shows what is.`,
    });
  },

  async autocomplete(interaction, ctx) {
    if (interaction.guildId === null) {
      await interaction.respond([]);
      return;
    }
    const { entries } = await entriesOf(ctx, interaction.user.id, interaction.guildId);
    const words = searchTokens(interaction.options.getFocused());
    const text = interaction.options.getFocused().trim().toLowerCase();
    const choices: Choice[] = entries
      .map((entry) => ({ entry, name: entryText(entry) }))
      .filter(({ name }) => words.every((word) => searchText(name).includes(word)))
      .sort(beginningFirst(text))
      .slice(0, MAX_CHOICES)
      .map(({ entry, name }) => ({ name: truncate(name, CHOICE_NAME), value: entry.token }));
    await interaction.respond(choices);
  },
};

/** The custom-id kind of the controls of `/wants` (`wants` is the question of `/unwant-all`). */
export const WANT_LIST_KIND = 'wantlist';

/** The reason a line's Remove carries (`stopArgs`). */
function reasonOf(entry: WantEntry): NotifyReason | undefined {
  const { remove } = entry;
  if (remove.kind === 'subject') return { kind: 'subject', subject: remove.subject };
  if (remove.kind === 'want') return { kind: 'want', target: remove.target };
  if (remove.kind === 'rocket') return undefined;
  return { kind: 'target', want: remove.want };
}

/** The arguments of a line's Manage…: its subject as `stopArgs` spells it, or `rocket`. */
function changeArgs(change: NonNullable<WantEntry['change']>): string[] {
  return change === 'rocket' ? [TEAM_ROCKET] : stopArgs({ kind: 'subject', subject: change });
}

/**
 * A line of the list, in at most `room` characters: `**Dratini**: Raids, Research, Shadow`,
 * `**Rare Candy**: Research`. Only the name is cut, before it is made plain.
 */
function entryLine(entry: WantEntry, room: number): string {
  const boxes =
    entry.detail !== undefined
      ? `: ${plain(entry.detail)}`
      : entry.boxes.length === 0
        ? ''
        : `: ${boxWords(entry.boxes)}`;
  const line = (label: string): string => `**${plain(label)}**${boxes}`;
  const label = entry.listLabel ?? entry.label;
  let shown = line(label);
  for (let keep = label.length - 1; shown.length > room && keep > 1; keep--) {
    shown = line(truncate(label, keep));
  }
  return shown;
}

/**
 * The member's list in a server as a components-v2 message (`renderMemberList`), at a page: one
 * line per species (its forms named together), tier, Team GO Rocket, IV target and reward, with
 * its boxes; a Pokémon's, a tier's and the Team GO Rocket line have Manage… (their dialog, plan
 * 8R-4), the others Remove (every box of it); how many rows this version cannot read under the
 * count.
 */
export function wantsList(
  entries: readonly WantEntry[],
  unreadable: number,
  serverName: string,
  page: number,
  notice?: string,
): V2Message {
  return renderMemberList({
    kind: WANT_LIST_KIND,
    heading: `### Your wants in ${plain(serverName)}`,
    noun: ['want', 'wants'],
    items: entries.map((entry) => ({
      line: (room: number) => entryLine(entry, room),
      removeArgs: ((reason) => (reason === undefined ? [TEAM_ROCKET] : stopArgs(reason)))(
        reasonOf(entry),
      ),
      // Plan 8R-4: a Pokémon's and a tier's line has Manage… (its dialog), the others Remove.
      ...(entry.change === undefined
        ? {}
        : {
            button: {
              action: CHANGE_ACTION,
              label: 'Manage…',
              style: ButtonStyle.Secondary,
              args: changeArgs(entry.change),
              command: '/want',
            },
          }),
    })),
    page,
    ...(notice === undefined ? {} : { notice }),
    notes:
      unreadable > 0
        ? [
            `…and ${count(unreadable, 'entry', 'entries')} I can no longer show; ` +
              '`/unwant-all` removes those too.',
          ]
        : [],
    footer: 'Add one with `/want`.',
    empty: 'You want nothing yet. `/want` adds one.',
    removeCommand: '/unwant',
    removable: entries.length > 0 || unreadable > 0,
  });
}

/** The list of the member of an interaction in its server, at a page, with a note at its top. */
async function memberWants(
  interaction: { user: { id: string }; guildId: string | null; guild: { name: string } | null },
  ctx: AppContext,
  page: number,
  notice?: string,
): Promise<V2Message> {
  const { entries, unreadable } = await entriesOf(ctx, interaction.user.id, guildIdOf(interaction));
  return wantsList(entries, unreadable, interaction.guild?.name ?? 'this server', page, notice);
}

/**
 * What `/wants` answers the member of an interaction: their list in its server, its first page.
 * Show of `/settings` answers it too (plan 8S-5: one path).
 */
export function wantsAnswer(
  interaction: { user: { id: string }; guildId: string | null; guild: { name: string } | null },
  ctx: AppContext,
): Promise<V2Message> {
  return memberWants(interaction, ctx, 0);
}

/**
 * Manage… of a line of `/wants` (plan 8R-4, S3): the dialog of its species, Unown letter or tier
 * with the member's rows as stored, read in time, before any answer; its id carries the list's
 * page. Nothing held any more is said (S2).
 */
async function changeLine(
  interaction: ButtonInteraction,
  ctx: AppContext,
  args: readonly string[],
  page: number,
): Promise<void> {
  if (args.length === 1 && args[0] === TEAM_ROCKET) {
    const memberId = interaction.user.id;
    const guildId = guildIdOf(interaction);
    const { held, dialog } = await rocketDialogFor(ctx, interaction, memberId, guildId, {
      page,
      openedAt: Date.now(),
    });
    if (held.size === 0) {
      throw new UserError('**Team GO Rocket** is not on your list; `/want` adds it.');
    }
    await interaction.showModal(dialog);
    return;
  }
  const asked = parseStopArgs(args);
  if (asked?.kind !== 'subject') {
    throw new UserError('That list is out of date. Use `/wants` again.');
  }
  const { subject } = asked;
  const memberId = interaction.user.id;
  const guildId = guildIdOf(interaction);
  const held = await readInTime(ctx.log, interaction, () =>
    ctx.wantBoxes.held(memberId, guildId, scopeOf(ctx, subject)),
  );
  if (held.length === 0) {
    throw new UserError(
      `**${plain(dialogName(ctx, subject))}** is not on your list; \`/want\` adds it.`,
    );
  }
  const zone = zoneOf(interaction, ctx);
  await interaction.showModal(
    wantDialogFor(ctx, subject, held, { page, openedAt: Date.now(), zone }),
  );
}

/** `/wants` (spec 4.2): the member's list in this server, for the member alone. */
export const wants: SimpleCommand = {
  data: new SlashCommandBuilder().setName('wants').setDescription('Show what you get DMs for'),
  help: {
    category: 'notifications',
    details:
      'Shows your list for this server, ten to a page: each Pokémon once with its forms and what ' +
      'you want it for (`Dratini: Raids, Research, Shadow`), by name, then the raid tiers, Team ' +
      'GO Rocket, the research rewards and perfect or zero IVs. Only you see it.\n\nA Pokémon ' +
      'or a tier has a Manage… button, which opens its dialog (Remove there takes it off); ' +
      'everything else has a Remove button. "Remove all…" asks before it empties the list.',
    examples: ['/wants'],
  },
  setUpIn: notificationsSetUp,
  guards: [requireGuild],
  defer: 'late',

  async execute(interaction, ctx) {
    await answer(interaction, v2Answer(await wantsAnswer(interaction, ctx)));
  },
};

const allWants = removeAllQuestion({
  kind: 'wants',
  title: 'Remove all your wants',
  count: async (ctx, memberId, guildId) =>
    (await ctx.wants.count(memberId, guildId)) + (await ctx.targetWants.count(memberId, guildId)),
  removeAll: async (ctx, memberId, guildId) =>
    (await ctx.wants.removeAll(memberId, guildId)) +
    (await ctx.targetWants.removeAll(memberId, guildId)),
  none: 'Your list for this server is empty: there is nothing to remove.',
  question: (n) =>
    `Remove ${n === 1 ? 'the one entry' : `all ${String(n)} entries`} of your list for this ` +
    'server? You will get no DMs for Pokémon, raid tiers, research rewards or Team GO Rocket ' +
    'here any more.',
  removed: (n) => `Removed ${count(n, 'entry', 'entries')}: your list for this server is empty.`,
});

/** `/unwant-all` (spec 4.2): empties the member's list in this server, after asking. */
export const unwantAll: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('unwant-all')
    .setDescription('Take everything off your list of wants'),
  help: {
    category: 'notifications',
    details:
      'Empties your list for this server, after asking you once, in a dialog. Your lists in ' +
      'other servers and your gyms (`/targets`) stay as they are.',
    examples: ['/unwant-all'],
  },
  setUpIn: notificationsSetUp,
  guards: [requireGuild],
  // The dialog is the first answer: nothing is deferred before it.
  throttle: NOTIFICATION_THROTTLE,
  execute: (interaction, ctx) => allWants.ask(interaction, ctx),
};

/** The Submit of the dialog of `/unwant-all`. */
export const wantControls = allWants.controls;

/** The buttons of `/wants`: the pages, Remove, and "Remove all…". */
export const wantListControls = memberListControls({
  kind: WANT_LIST_KIND,
  command: '/wants',
  render: (interaction, ctx, page) => memberWants(interaction, ctx, page),
  async remove(interaction, ctx, reason) {
    const memberId = interaction.user.id;
    const guildId = guildIdOf(interaction);
    if (reason.kind === 'subject') {
      await removeEntry(ctx, memberId, guildId, { kind: 'subject', subject: reason.subject });
      return true;
    }
    if (reason.kind === 'want') {
      await ctx.wants.remove(memberId, guildId, reason.target);
      return true;
    }
    if (reason.kind === 'target') {
      await ctx.targetWants.remove(memberId, guildId, reason.want);
      return true;
    }
    return false;
  },
  askAll: (interaction, ctx) => allWants.ask(interaction, ctx),
  actions: { [CHANGE_ACTION]: changeLine },
});
