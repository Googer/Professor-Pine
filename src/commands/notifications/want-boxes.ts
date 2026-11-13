import type { AppContext } from '../../app-context.js';
import {
  ANY_LEADER,
  parseTargetWantToken,
  targetWantToken,
  type TargetWant,
} from '../../domain/notify/target-wants.js';
import { POKEMON_TYPES } from '../../domain/pogo/types.js';
import { LEADERS } from '../../domain/rocket/lineups.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import {
  notificationTiers,
  type NotificationTarget,
  type Want,
} from '../../domain/pogo/notification-target.js';
import {
  isRaidLevel,
  raidTier,
  raidTierLabel,
  type RaidLevel,
} from '../../domain/pogo/raid-tier.js';
import {
  baseTarget,
  pokemonBoxes,
  subjectOf,
  subjectOfTarget,
  rocketTargetLabel,
  targetWantLabel,
  tierBoxes,
  BOX_WORDS,
  POKEMON_BOXES,
  type BoxSubject,
  type WantBox,
} from '../../domain/pogo/want-boxes.js';
import {
  allCostumed,
  answerScopeOf,
  boxesOf,
  heldRows,
  WHICH_CAP,
  type AnswerScope,
  type HeldRow,
} from '../../domain/pogo/species-answer.js';
import { whichHash } from '../../domain/short-hash.js';
import { rewardCostumed } from '../../domain/notify/reasons.js';
import { speciesNameOf, tierWantLabel } from '../../domain/pogo/wants.js';
import { appearsInWild } from '../../domain/pogo/wild.js';
import type { WantList } from '../../domain/pogo/wants.js';
import { foldTaskText } from '../../domain/research/task.js';
import { searchText, searchTokens } from '../../domain/search/text.js';
import type { TargetWantList } from '../../db/repositories/target-want-repository.js';
import { truncate } from '../../render/text.js';
import { listedRewards } from '../research/research-input.js';
import { byName, CHOICE_NAME, type Choice } from '../choices.js';
import { wildExceptionsOf } from './wild.js';
import { typedWant, wantLabel } from './want-input.js';

/*
 * What `/want`, `/unwant` and `/wants` make of the boxes of the dialog (plan 8R-1; design 7, 9.1,
 * 9.9): a target as a member names it (`Wanted`), the boxes a Pokémon's or a tier's dialog shows,
 * the items and Mega Energy of the task list as targets of their own, and the member's wants
 * grouped as the list shows them, one line per target with its boxes.
 */

/**
 * What `/want` and `/unwant` were given: a subject of boxes, IVs, a research reward, or a target
 * of Team GO Rocket (plan 8R-2: a grunt type, a leader, any leader, Giovanni, the decoy).
 */
export type Wanted =
  | { kind: 'subject'; subject: BoxSubject; target: NotificationTarget }
  | { kind: 'iv'; target: NotificationTarget }
  | { kind: 'reward'; want: TargetWant }
  /** A Rocket target, or (none) Team GO Rocket itself, `/want rocket`: its dialog (plan 8R-4). */
  | { kind: 'rocket'; want?: TargetWant };

/**
 * Every target of Team GO Rocket (plan 8R-2; design 7), in the order a list shows them: the grunt
 * types by name, the untyped grunts, the decoy, any leader, Cliff, Arlo, Sierra, Giovanni.
 */
export function rocketTargets(): TargetWant[] {
  return [
    ...[...POKEMON_TYPES].sort().map((type) => `grunt:${type}`),
    'grunt:none',
    'decoy',
    ANY_LEADER,
    ...LEADERS.map((leader) => `leader:${leader}`),
    'giovanni',
  ].map((who): TargetWant => ({ kind: 'rocket', who }));
}

/** The names a Rocket target is known by, typed in full and folded. */
function rocketNames(want: TargetWant & { kind: 'rocket' }): string[] {
  const label = rocketTargetLabel(want.who);
  const names = [label, label.replace(/ \(.*\)$/, '')];
  const [head, value] = want.who.split(':');
  if (head === 'grunt' && value !== 'none') names.push(`${value ?? ''} grunt`);
  // Not `none`: typed in full it is zero IVs, the legacy word a legacy member's `/unwant` still
  // uses (fix F4); the list of choices offers the untyped grunts for it beside them.
  if (head === 'grunt' && value === 'none') names.push('grunt', 'no type grunt', 'no type');
  if (want.who === 'decoy') names.push('decoy');
  if (want.who === ANY_LEADER) names.push('any leader', 'leader');
  return names.map(searchText);
}

/**
 * The words that name a Rocket target by themselves (fix B3): a grunt's type, `none` of the
 * untyped, `decoy`, a leader's name, `any` of any leader, `giovanni`. The rest of a label
 * (`grunt`, `leader`, `team go rocket`, `boss`) finds nothing alone.
 */
function ownWords(who: string): string[] {
  if (who === 'giovanni' || who === 'decoy') return [who];
  // "Grunt (no type)": its `no` in full, or `none` (fix R1).
  if (who === 'grunt:none') return ['no', 'none'];
  return [who.split(':')[1] ?? ''];
}

/**
 * Whether a typed text means a Rocket target: every typed word begins a word of its label or its
 * own words, and one of them is one of its own words in full or the beginning of one by three
 * letters or more (`gra` is the Grass-type grunt, `gr` nothing: it begins `grunt` too).
 */
function meansRocket(label: string, own: readonly string[], words: readonly string[]): boolean {
  return (
    begins(`${label} ${own.join(' ')}`, words) &&
    words.some((word) =>
      own.some((one) => one === word || (word.length >= 3 && one.startsWith(word))),
    )
  );
}

/** The value of the choice of Team GO Rocket itself, and the names it is typed by. */
export const TEAM_ROCKET = 'rocket';
const TEAM_ROCKET_NAMES: readonly string[] = [
  'rocket',
  'team rocket',
  'team go rocket',
  'team go rocket every grunt leader and giovanni',
].map(searchText);
const TEAM_ROCKET_LABEL = 'Team GO Rocket (every grunt, leader and Giovanni)';

/**
 * The Rocket targets as choices of `/want` (design 9.9): those a typed text means
 * (`meansRocket`), their value the `TargetWant` token; first Team GO Rocket itself (plan 8R-4:
 * its dialog) for a text that begins its name by three letters or more. None while nothing is
 * typed.
 */
export function rocketWantChoices(typed: string): Choice[] {
  const words = searchTokens(typed);
  const team =
    words.join('').length >= 3 && begins('team go rocket', words)
      ? [{ name: TEAM_ROCKET_LABEL, value: TEAM_ROCKET }]
      : [];
  return [...team, ...rocketTargetChoices(words)];
}

/** The Rocket targets a text's words mean, as choices. */
function rocketTargetChoices(words: readonly string[]): Choice[] {
  return rocketTargets()
    .map((want) => ({ want, label: rocketTargetLabel(targetWantToken(want)) }))
    .filter(({ want, label }) => meansRocket(label, ownWords(targetWantToken(want)), words))
    .map(({ want, label }) => ({
      name: truncate(label, CHOICE_NAME),
      value: targetWantToken(want),
    }));
}

/**
 * The options of the Rocket dialog (plan 8R-4, S12; mockup 8), fixed whatever today's rotation:
 * the grunts (the 18 types by name, the untyped, the decoy) and the leaders (Cliff, Arlo, Sierra,
 * any leader, Giovanni), each with its target's `who`.
 */
export function rocketOptions(): {
  grunts: { who: string; label: string; description?: string }[];
  leaders: { who: string; label: string; description?: string }[];
} {
  const type = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);
  return {
    grunts: [
      ...[...POKEMON_TYPES].sort().map((name) => ({
        who: `grunt:${name}`,
        label: `${type(name)}-type grunts`,
      })),
      { who: 'grunt:none', label: 'Grunts without a type' },
      { who: 'decoy', label: 'Decoy grunt' },
    ],
    leaders: [
      ...LEADERS.map((name) => ({ who: `leader:${name}`, label: type(name) })),
      { who: ANY_LEADER, label: 'Any leader', description: 'Every leader, also future ones' },
      { who: 'giovanni', label: 'Giovanni' },
    ],
  };
}

/** Every Rocket target's `who`, in the dialog's order. */
export function rocketWhos(): string[] {
  const { grunts, leaders } = rocketOptions();
  return [...grunts, ...leaders].map((one) => one.who);
}

/**
 * The Rocket wants as one line of `/wants` and the answer (design 4b): the grunt types together
 * ("Fire and Water grunts", over three "7 grunt types"), then the untyped grunts, the decoy, the
 * leaders by name, any leader, Giovanni.
 */
export function rocketLine(whos: ReadonlySet<string>): string {
  const types = [...POKEMON_TYPES]
    .sort()
    .filter((name) => whos.has(`grunt:${name}`))
    .map((name) => name.charAt(0).toUpperCase() + name.slice(1));
  const parts: string[] = [];
  if (types.length > 3) parts.push(`${String(types.length)} grunt types`);
  else if (types.length > 0) {
    const named =
      types.length === 1 ? types[0] : `${types.slice(0, -1).join(', ')} and ${types.at(-1) ?? ''}`;
    parts.push(`${named ?? ''} grunts`);
  }
  const { grunts, leaders } = rocketOptions();
  for (const one of [...grunts, ...leaders]) {
    if (one.who.startsWith('grunt:') && one.who !== 'grunt:none') continue;
    if (whos.has(one.who)) parts.push(one.label);
  }
  return parts.join(', ');
}

/** What a subject is called: `Dratini`, `Giratina (every form)`, `Mega Charizard Y`, `T5`. */
export function subjectLabel(ctx: AppContext, subject: BoxSubject): string {
  if (subject.kind === 'tier') {
    const tier = raidTier(subject.level, false);
    return tier ? raidTierLabel(tier) : subject.level;
  }
  return wantLabel(ctx, baseTarget(subject));
}

/** A research reward of `TargetWant`'s, named as the task list names its items. */
export function rewardLabel(ctx: AppContext, want: TargetWant): string {
  return targetWantLabel(ctx.gameData.catalogue, want, listedRewards(ctx).items);
}

/** The entries of a subject: every entry of a species, the one entry of a form. */
function entriesOf(
  ctx: AppContext,
  subject: BoxSubject & { kind: 'pokemon' },
): readonly PokemonEntry[] {
  const { catalogue } = ctx.gameData;
  if (subject.form === undefined) return catalogue.byDex(subject.dex);
  const entry = catalogue.byKey(subject.form);
  return entry?.dex === subject.dex ? [entry] : [];
}

/**
 * Whether today's task list has a Pokémon of this number as a reward (`researchTasks`), as offered
 * in `zone` (the server's, plan 19A-2).
 */
function rewardedToday(ctx: AppContext, dex: number, zone: string): boolean {
  return ctx.researchTasks
    .tasks(zone)
    .some((task) =>
      task.rewards.some((reward) => reward.kind === 'encounter' && reward.dex === dex),
    );
}

/**
 * The boxes the dialog of a subject shows (design 7: only what can happen): of a tier, Raids and
 * its shadow raids where it has them; of a Pokémon, `pokemonBoxes` with the game master, the
 * settings' wild exceptions, the max boss list and the raid boss list of now; no Research for a
 * legendary, mythical or ultra beast (`PokemonEntry.class`, plan 8R-4: never ordinary task
 * rewards) unless today's task list rewards it (the member's own Research box is added by
 * `dialogBoxes`). Decided from the lists alone, so `/want` knows at once whether it asks.
 */
export function shownBoxes(ctx: AppContext, subject: BoxSubject, zone: string): WantBox[] {
  if (subject.kind === 'tier') return tierBoxes(subject.level);
  const boxes = pokemonShownBoxes(ctx, subject, zone);
  const special = entriesOf(ctx, subject).every((entry) => entry.class !== null);
  return special && !rewardedToday(ctx, subject.dex, zone)
    ? boxes.filter((box) => box !== 'research')
    : boxes;
}

/**
 * The boxes a dialog shows for a member: `shownBoxes`, and the Research box where the member
 * holds it though it is not shown any more (a legendary's), so that it can be taken off.
 */
export function dialogBoxes(
  ctx: AppContext,
  subject: BoxSubject,
  held: readonly HeldRow[],
  zone: string,
): WantBox[] {
  const shown = shownBoxes(ctx, subject, zone);
  if (shown.includes('research') || !boxesOf(held).has('research')) return shown;
  return POKEMON_BOXES.filter((box) => box === 'research' || shown.includes(box));
}

/** The forms of a species' Which field: its entries, megas included, where it has 2 to 25. */
export function whichEntries(ctx: AppContext, subject: BoxSubject): PokemonEntry[] {
  if (subject.kind !== 'pokemon' || subject.form !== undefined) return [];
  const entries = ctx.gameData.catalogue.byDex(subject.dex);
  return entries.length > 1 && entries.length <= WHICH_CAP ? [...entries] : [];
}

/** The hash of the Which field a dialog of the subject shows now (`whichHash`). */
export function whichHashOf(ctx: AppContext, subject: BoxSubject): string {
  return whichHash(whichEntries(ctx, subject).map((entry) => entry.key));
}

/**
 * Whether a species' dialog asks about costumes (design 3, review R7): the game data has a
 * costume of any of its forms, or the raid boss list, today's task list or the spawns of an
 * event on (`eventSpawns`) has it costumed now.
 */
export function costumesShown(ctx: AppContext, subject: BoxSubject, zone: string): boolean {
  if (subject.kind !== 'pokemon') return false;
  const { catalogue } = ctx.gameData;
  if (catalogue.hasCostume(subject.dex)) return true;
  if (
    ctx.raidBosses.bosses(zone).some((boss) => boss.costumed && boss.entry?.dex === subject.dex)
  ) {
    return true;
  }
  if (
    ctx.eventSpawns
      .sightingsAt(Date.now(), zone)
      .some((sighting) => sighting.costumed && sighting.dex === subject.dex)
  ) {
    return true;
  }
  return ctx.researchTasks
    .tasks(zone)
    .some((task) =>
      task.rewards.some(
        (reward) =>
          reward.kind === 'encounter' &&
          reward.dex === subject.dex &&
          rewardCostumed(catalogue, reward),
      ),
    );
}

/**
 * The subject a Pokémon's dialog is about, and the form picked (plan 8R-4): a form of a species
 * with a Which field opens the species' dialog with that form ticked (`/want galarian corsola`,
 * `/want mega charizard y`); a form beyond the Which field (an Unown letter) its own.
 */
export function dialogSubject(
  ctx: AppContext,
  subject: BoxSubject,
): { subject: BoxSubject; picked?: string } {
  if (subject.kind !== 'pokemon' || subject.form === undefined) return { subject };
  const species: BoxSubject = { kind: 'pokemon', dex: subject.dex };
  return whichEntries(ctx, species).length > 0
    ? { subject: species, picked: subject.form }
    : { subject };
}

/** The name of a dialog and its answers: a species' own (`Corsola`), else as a list calls it. */
export function dialogName(ctx: AppContext, subject: BoxSubject): string {
  if (subject.kind === 'pokemon' && subject.form === undefined) {
    return speciesNameOf(ctx.gameData.catalogue, subject.dex) ?? subjectLabel(ctx, subject);
  }
  return subjectLabel(ctx, subject);
}

/**
 * What rows of a subject are called, as a line of `/wants` and the answer after a Submit say it
 * (design 4): the species row by the species' name, forms by their names up to three
 * ("Arceus, Dragon Arceus, Fire Arceus") and above that by count ("Arceus (17 of 18 forms)");
 * `Costumed` before it where every row is costumed.
 */
export function rowsLabel(ctx: AppContext, subject: BoxSubject, rows: readonly HeldRow[]): string {
  const { catalogue } = ctx.gameData;
  let label = dialogName(ctx, subject);
  const forms = rows.flatMap((row) => (row.form === undefined ? [] : [row.form]));
  if (subject.kind === 'pokemon' && subject.form === undefined && forms.length === rows.length) {
    const total = whichEntries(ctx, subject).length;
    label =
      forms.length <= 3
        ? forms.map((form) => catalogue.byKey(form)?.name ?? form).join(', ')
        : `${label} (${String(forms.length)} of ${String(total)} forms)`;
  }
  return allCostumed(rows, isMegaForm(ctx)) ? `Costumed ${label}` : label;
}

/** Whether a form's key is a mega's (or a primal's): always plain, Raids only (A-D3, R4c). */
export function isMegaForm(ctx: AppContext): (form: string) => boolean {
  return (form) => ctx.gameData.catalogue.byKey(form)?.kind === 'mega';
}

/** `shownBoxes` of a Pokémon as the game data and the lists have it, Research of any. */
function pokemonShownBoxes(
  ctx: AppContext,
  subject: BoxSubject & { kind: 'pokemon' },
  zone: string,
): WantBox[] {
  const entries = entriesOf(ctx, subject);
  const keys = new Set(entries.map((entry) => entry.key));
  const fits = (entry: PokemonEntry | undefined): boolean =>
    entry !== undefined &&
    (subject.form === undefined ? entry.dex === subject.dex : keys.has(entry.key));
  const maxBosses = ctx.maxBosses.bosses(zone);
  const { species } = wildExceptionsOf(ctx);
  const { catalogue } = ctx.gameData;
  return pokemonBoxes({
    entries,
    wild: (entry) => {
      const full = catalogue.byKey(entry.key);
      return full !== undefined && appearsInWild(full, species);
    },
    canDynamax: (entry) => {
      const full = catalogue.byKey(entry.key);
      return full !== undefined && catalogue.canDynamax(full);
    },
    canGigantamax: (entry) => {
      const full = catalogue.byKey(entry.key);
      return full !== undefined && catalogue.canGigantamax(full);
    },
    dynamaxListed: maxBosses.some((boss) => boss.tier !== 'G' && fits(boss.entry)),
    gigantamaxListed: maxBosses.some((boss) => boss.tier === 'G' && fits(boss.entry)),
    shadowBoss: ctx.raidBosses.bosses(zone).some((boss) => boss.tier.shadow && fits(boss.entry)),
    // A catch of today's Rocket lineups (plan 8R-2): its shadow can be caught now.
    rocketCatch: ctx.rocketLineups
      .choices()
      .some((choice) =>
        choice.catches.some((one) => one.key !== null && fits(catalogue.byKey(one.key))),
      ),
  });
}

/**
 * The rows an answer about a subject covers (plan 8R-4): of a species every row of its Pokédex
 * number in both tables, unless it has more forms than the Which field holds (Unown: its species
 * row and each letter apart); of a form beyond the Which field, and of a tier, its own.
 */
export function scopeOf(ctx: AppContext, subject: BoxSubject): AnswerScope {
  const entries = subject.kind === 'pokemon' ? ctx.gameData.catalogue.byDex(subject.dex).length : 0;
  return answerScopeOf(subject, entries);
}

/** Every box of a kind of subject: what `/unwant` and a list's Remove take away. */
export function allBoxes(subject: BoxSubject): readonly WantBox[] {
  return subject.kind === 'tier' ? ['raids', 'shadow-raids'] : POKEMON_BOXES;
}

/** Whether every typed word begins a word of a name. */
function begins(name: string, words: readonly string[]): boolean {
  const own = searchTokens(name);
  return words.length > 0 && words.every((word) => own.some((one) => one.startsWith(word)));
}

/**
 * The items and Mega Energy of the task list as choices of `/want` (design 7, 9.9: research
 * rewards are targets of their own): those whose name every typed word begins, their value the
 * `TargetWant` token.
 */
export function rewardWantChoices(ctx: AppContext, typed: string): Choice[] {
  const words = searchTokens(typed);
  const { items, energies } = listedRewards(ctx);
  return [
    ...[...items].map(([item, name]): [string, TargetWant] => [
      name,
      { kind: 'research-item', item },
    ]),
    ...[...energies].map(([dex, name]): [string, TargetWant] => [
      name,
      { kind: 'research-energy', dex },
    ]),
  ]
    .filter(([name]) => begins(name, words))
    .sort(([a], [b]) => byName(a, b))
    .map(([, want]) => ({
      name: truncate(rewardLabel(ctx, want), CHOICE_NAME),
      value: targetWantToken(want),
    }));
}

/**
 * What the `target` option of `/want` or `/unwant` names: a research reward (a choice's token,
 * or an item or Mega Energy of the task list named in full), else what `typedWant` reads (a
 * Pokémon, a form, a tier, IVs; shadow raids are the Shadow box of their Pokémon's dialog, and
 * the shadow raids of a tier its tier's). A Pokémon is read by the server's search (`serverId`).
 */
export function readWanted(
  ctx: AppContext,
  serverId: string | null,
  value: string,
  own = false,
): Wanted {
  const token = parseTargetWantToken(value.trim());
  if (token?.kind === 'research-item' || token?.kind === 'research-energy') {
    return { kind: 'reward', want: token };
  }
  if (token?.kind === 'rocket') return { kind: 'rocket', want: token };
  const searched = searchText(value);
  // Team GO Rocket itself (plan 8R-4): its dialog, or all of it for `/unwant`.
  if (TEAM_ROCKET_NAMES.includes(searched)) return { kind: 'rocket' };
  for (const want of rocketTargets()) {
    if (want.kind === 'rocket' && rocketNames(want).includes(searched)) {
      return { kind: 'rocket', want };
    }
  }
  const folded = foldTaskText(value);
  const { items, energies } = listedRewards(ctx);
  for (const [item, name] of items) {
    if (foldTaskText(name) === folded)
      return { kind: 'reward', want: { kind: 'research-item', item } };
  }
  for (const [dex, name] of energies) {
    if (foldTaskText(name) === folded) {
      return { kind: 'reward', want: { kind: 'research-energy', dex } };
    }
  }
  const target = typedWant(ctx, serverId, value, own);
  const subject = subjectOf(target);
  return subject ? { kind: 'subject', subject, target } : { kind: 'iv', target };
}

/**
 * A line of `/wants`: what it is called, its boxes, what its Remove takes away (and `/unwant`
 * does), and the subject whose dialog its Manage… opens (plan 8R-4: a Pokémon's and a tier's
 * line; the others keep Remove).
 */
export interface WantEntry {
  label: string;
  /** What the line of `/wants` calls it where that is not `label`: a tier's "Tier 5 raids" (R-M4). */
  listLabel?: string;
  boxes: WantBox[];
  /** What the line's Remove (or `/unwant`) takes away. */
  remove:
    | { kind: 'subject'; subject: BoxSubject }
    | { kind: 'want'; target: NotificationTarget }
    | { kind: 'target'; want: TargetWant }
    /** Every Team GO Rocket want (plan 8R-4). */
    | { kind: 'rocket' };
  /** The token a choice of `/unwant` gives for it. */
  token: string;
  /** Manage… of the line: the dialog of a species, of an Unown letter, of a tier, of Rocket. */
  change?: BoxSubject | 'rocket';
  /** What follows the label instead of boxes (Team GO Rocket's line: who is wanted). */
  detail?: string;
}

/**
 * A tier as its line of `/wants` names it (Matt's R-M4): "Tier 5 raids" for the starred tiers,
 * the others as everywhere ("Mega raids", "Elite raids"). Its shadow raids are a box of the line.
 */
function tierListLabel(level: RaidLevel): string {
  const stars = /^T(\d)$/.exec(level)?.[1];
  return stars === undefined ? tierWantLabel({ level, shadow: false }) : `Tier ${stars} raids`;
}

/** A subject's line: its rows named as a want is (`rowsLabel`), their boxes, and Manage…. */
function subjectEntry(ctx: AppContext, subject: BoxSubject, rows: readonly HeldRow[]): WantEntry {
  const held = boxesOf(rows);
  return {
    label:
      subject.kind === 'tier'
        ? tierWantLabel(raidTier(subject.level, false) ?? { level: subject.level, shadow: false })
        : rowsLabel(ctx, subject, rows),
    boxes: BOX_ORDER.filter((box) => held.has(box)),
    ...(subject.kind === 'tier' ? { listLabel: tierListLabel(subject.level) } : {}),
    remove: { kind: 'subject', subject },
    token:
      subject.kind === 'tier'
        ? `tier:${subject.level}`
        : `pokemon:${String(subject.dex)}${subject.form === undefined ? '' : `:${subject.form}`}`,
    change: subject,
  };
}

/**
 * A member's wants of both tables as `/wants` lists them (design 4, plan 8R-4): one line per
 * species with its forms named together (an Unown letter a line of its own), by species name;
 * the tiers in their order; Team GO Rocket; then the lines without a dialog, which keep Remove:
 * the items and Mega Energy by name, Perfect IVs, Zero IVs.
 */
export function wantEntries(
  ctx: AppContext,
  wants: WantList,
  targets: TargetWantList,
): WantEntry[] {
  const { catalogue } = ctx.gameData;
  // Each Pokédex number's rows apart, in the order first met: a line reads only its own, so that
  // a list of every species takes no time for each one over the whole list.
  const byDex = new Map<number, { wants: Want[]; targets: TargetWant[] }>();
  const rowsOfDex = (dex: number): { wants: Want[]; targets: TargetWant[] } => {
    let rows = byDex.get(dex);
    if (!rows) {
      rows = { wants: [], targets: [] };
      byDex.set(dex, rows);
    }
    return rows;
  };
  const ivs: NotificationTarget[] = [];
  const tierLevels = new Set<string>();
  for (const want of wants.wants) {
    if (want.target.kind === 'pokemon') rowsOfDex(want.target.dex).wants.push(want);
    else if (want.target.kind === 'tier') tierLevels.add(want.target.tier.level);
    else ivs.push(want.target);
  }
  const rewards: TargetWant[] = [];
  const rocket: TargetWant[] = [];
  for (const want of targets.wants) {
    const subject = subjectOfTarget(want);
    if (subject?.kind === 'pokemon') rowsOfDex(subject.dex).targets.push(want);
    else if (want.kind === 'rocket') rocket.push(want);
    else rewards.push(want);
  }
  const pokemon = [...byDex].flatMap(([dex, own]) => {
    const species: BoxSubject = { kind: 'pokemon', dex };
    const scope = scopeOf(ctx, species);
    const name = speciesNameOf(catalogue, dex) ?? `Pokémon #${String(dex)}`;
    const rows = heldRows(scope, own.wants, own.targets);
    const lines = rows.length > 0 ? [{ name, entry: subjectEntry(ctx, species, rows) }] : [];
    if (scope.wide) return lines;
    // Beyond the Which field (Unown): each form a line of its own, after the species'.
    const forms = new Set<string>();
    for (const want of own.wants) {
      if (want.target.kind === 'pokemon' && want.target.form) forms.add(want.target.form);
    }
    for (const want of own.targets) {
      const of = subjectOfTarget(want);
      if (of?.kind === 'pokemon' && of.form !== undefined) forms.add(of.form);
    }
    const letters = [...forms]
      .map((form) => {
        const subject: BoxSubject = { kind: 'pokemon', dex, form };
        const held = heldRows({ subject, wide: false }, own.wants, own.targets);
        return { name, entry: subjectEntry(ctx, subject, held) };
      })
      .filter(({ entry }) => entry.boxes.length > 0)
      .sort((a, b) => byName(a.entry.label, b.entry.label));
    return [...lines, ...letters];
  });
  // By species name; a species' line before its letters (a stable sort keeps them so).
  pokemon.sort((a, b) => byName(a.name, b.name));
  const tiers = notificationTiers()
    .filter((tier) => !tier.shadow && tierLevels.has(tier.level))
    .flatMap((tier) => {
      const subject: BoxSubject = { kind: 'tier', level: tier.level };
      const rows = heldRows({ subject, wide: false }, wants.wants, targets.wants);
      return rows.length > 0 ? [subjectEntry(ctx, subject, rows)] : [];
    });
  // Shadow tiers without their ordinary tier: the tier's line holds them too.
  const levelOf = (entry: WantEntry): string =>
    typeof entry.change === 'object' && entry.change.kind === 'tier' ? entry.change.level : '';
  for (const level of tierLevels) {
    if (tiers.some((entry) => levelOf(entry) === level)) continue;
    if (!isRaidLevel(level)) continue;
    const subject: BoxSubject = { kind: 'tier', level };
    const rows = heldRows({ subject, wide: false }, wants.wants, targets.wants);
    if (rows.length > 0) tiers.push(subjectEntry(ctx, subject, rows));
  }
  const tierOrder: string[] = notificationTiers().map((tier) => tier.level);
  tiers.sort((a, b) => tierOrder.indexOf(levelOf(a)) - tierOrder.indexOf(levelOf(b)));
  // Team GO Rocket in one line with Manage… (plan 8R-4, design 4b).
  const whos = new Set(rocket.flatMap((want) => (want.kind === 'rocket' ? [want.who] : [])));
  const rocketEntries: WantEntry[] =
    whos.size === 0
      ? []
      : [
          {
            label: 'Team GO Rocket',
            detail: rocketLine(whos),
            boxes: [],
            remove: { kind: 'rocket' },
            token: TEAM_ROCKET,
            change: 'rocket',
          },
        ];
  const rewardEntries = rewards
    .map((want): WantEntry => ({
      label: rewardLabel(ctx, want).replace(/ \(research\)$/, ''),
      boxes: ['research'],
      remove: { kind: 'target', want },
      token: targetWantToken(want),
    }))
    .sort((a, b) => byName(a.label, b.label));
  const ivEntries = (['perfect', 'zero'] as const).flatMap((iv) =>
    ivs
      .filter((target) => target.kind === 'iv' && target.iv === iv)
      .map((target): WantEntry => ({
        label: iv === 'perfect' ? 'Perfect IVs' : 'Zero IVs',
        boxes: ['spawns'],
        remove: { kind: 'want', target },
        token: `iv:${iv}`,
      })),
  );
  return [
    ...pokemon.map(({ entry }) => entry),
    ...tiers,
    ...rocketEntries,
    ...rewardEntries,
    ...ivEntries,
  ];
}

/** The boxes in the order a line names them. */
const BOX_ORDER: readonly WantBox[] = [...POKEMON_BOXES, 'shadow-raids'];

/** A line's boxes in words: `Raids, Research, Shadow`. */
export function boxWords(boxes: readonly WantBox[]): string {
  return boxes.map((box) => BOX_WORDS[box]).join(', ');
}
