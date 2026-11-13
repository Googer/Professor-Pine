import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { GymHit } from '../../domain/search/gym-lookup.js';
import type { RaidBossRef, RaidParty } from '../../domain/party/party.js';
import { raidBossRef, raidKindOf } from '../../domain/party/raid.js';
import { bossAtTier, MEGA_LEVELS } from '../../domain/pogo/boss-at-tier.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { namedFirst } from '../../domain/pogo/pokemon-search.js';
import type { RaidBoss } from '../../domain/pogo/raid-bosses.js';
import {
  eggNeedsHatchTime,
  isRaidLevel,
  RAID_LEVELS,
  raidDurationKind,
  raidTier,
  raidTierLabel,
  sameRaidTier,
  type RaidTier,
} from '../../domain/pogo/raid-tier.js';
import { leadingTier, spellTiers } from '../../domain/pogo/tier-words.js';
import { searchTokens } from '../../domain/search/text.js';
import { matchNamed } from '../../domain/search/word-match.js';
import { resolvePartyTime } from '../../domain/time/party-time.js';
import { longestRaidDurations, raidDurationRules } from '../../domain/time/raid-durations.js';
import { UserError } from '../../discord/errors.js';
import { isFarOff, plain, timestamp, truncate } from '../../render/text.js';
import { gymInGuild } from '../../services/region-directory.js';
import { byName, CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';

const MINUTE = 60_000;

/**
 * What reading a boss, a tier or a time of a raid needs: the settings, the boss list, the
 * events, the Pokémon search and the game data. `/raid`, the changes of a raid and the live map
 * read with the same functions.
 */
export type RaidReading = Pick<
  AppContext,
  'config' | 'raidBosses' | 'raidEvents' | 'pokemon' | 'gameData'
>;

/** What a report says the raid is: an egg of a tier, or a boss. */
export interface ReportedBoss {
  tier: RaidTier;
  /** Null for an egg. */
  boss: RaidBossRef | null;
  /** How the bot words it back: `T5 egg`, `Yveltal (T5)`. */
  label: string;
}

const tierCode = (tier: RaidTier): string => `${tier.level}:${tier.shadow ? '1' : '0'}`;

function tierFromCode(level: string | undefined, shadow: string | undefined): RaidTier | undefined {
  if (level === undefined || !isRaidLevel(level) || (shadow !== '0' && shadow !== '1')) {
    return undefined;
  }
  return raidTier(level, shadow === '1');
}

/** The name as the autocomplete list shows it: `Yveltal (T5)`. */
function choiceName(boss: RaidBoss): string {
  return `${boss.name} (${raidTierLabel(boss.tier)})`;
}

/** The name as a reply words it. A boss from the feed may carry anything, so it is made plain. */
function bossLabel(boss: Pick<RaidBoss, 'name' | 'tier'>): string {
  return `${plain(boss.name)} (${raidTierLabel(boss.tier)})`;
}

const eggLabel = (tier: RaidTier): string => `${raidTierLabel(tier)} egg`;

/** Every tier a raid can have, in the order of the levels, shadow after plain. */
export function allTiers(): RaidTier[] {
  return RAID_LEVELS.flatMap((level) =>
    [raidTier(level, false), raidTier(level, true)].filter(
      (tier): tier is RaidTier => tier !== undefined,
    ),
  );
}

/** What picking a boss of the list says (`b:yveltal:T5:0`), which `reportedBoss` reads back. */
export const bossChoiceValue = (boss: RaidBoss): string => `b:${boss.key}:${tierCode(boss.tier)}`;

/** What picking the egg of a tier says (`e:T5:0`), which `reportedBoss` reads back. */
export const eggChoiceValue = (tier: RaidTier): string => `e:${tierCode(tier)}`;

/**
 * The choices for the `boss` option: the current bosses first, then an egg for every tier,
 * narrowed to what was typed, a tier spelled as a report reads it (`tier 1`, `level 5` are `t1`,
 * `t5`: `spellTiers`). A choice's value says exactly what was picked, so that the report does not
 * depend on the name being typed back.
 */
export function bossChoices(ctx: AppContext, typed: string, zone: string): Choice[] {
  const words = spellTiers(typed).trim().split(/\s+/).filter(Boolean);
  const fits = (name: string): boolean => {
    const lower = name.toLowerCase();
    return words.every((word) => lower.includes(word));
  };
  const current = ctx.raidBosses.bosses(zone);
  const asChoice = (boss: RaidBoss): Choice => ({
    name: choiceName(boss),
    value: bossChoiceValue(boss),
  });
  // A value is at most 100 characters.
  const bosses = current.map(asChoice).filter((choice) => choice.value.length <= 100);
  const eggs = allTiers().map((tier) => ({ name: eggLabel(tier), value: eggChoiceValue(tier) }));
  // With nothing typed the bosses come first but leave room for every egg; with text typed the
  // list is narrowed to what fits it, then the bosses a nickname (or its beginning) names.
  let chosen: Choice[];
  if (words.length === 0) {
    chosen = [...bosses.slice(0, Math.max(0, MAX_CHOICES - eggs.length)), ...eggs];
  } else {
    const keys = new Set(current.flatMap((boss) => (boss.entry ? [boss.entry.key] : [])));
    const named = new Set(
      ctx.pokemon
        .find(typed, { filter: (entry) => keys.has(entry.key) })
        .filter((hit) => hit.named || hit.match === 'exact')
        .map((hit) => hit.entry.key),
    );
    const byNickname = current
      .filter((boss) => boss.entry !== undefined && named.has(boss.entry.key))
      .map(asChoice)
      .filter((choice) => choice.value.length <= 100);
    const listed = new Set<string>();
    chosen = [...[...bosses, ...eggs].filter((choice) => fits(choice.name)), ...byNickname].filter(
      (choice) => !listed.has(choice.value) && Boolean(listed.add(choice.value)),
    );
  }
  return chosen
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
}

/** Letters and digits only, folded: how two texts are compared for being the same name. */
const compact = (text: string): string => searchTokens(text).join('');

/** The names a typed text may be the beginning or a near miss of. */
function bossNames(boss: RaidBoss): string[] {
  return [
    boss.name,
    boss.key.replace(/_/g, ' '),
    ...(boss.tier.shadow ? [`shadow ${boss.name}`] : []),
  ];
}

/** The names a typed text may be in full: also the label as the list shows it. */
function bossFullNames(boss: RaidBoss): string[] {
  return [...bossNames(boss), choiceName(boss)];
}

/**
 * A boss as `reportedBoss` reports it: of the list, or a Pokémon it does not have at a tier (the
 * screenshot reader's `UnlistedRaidBoss`), named and referred to alike.
 */
const chosenBoss = (boss: Pick<RaidBoss, 'entry' | 'name' | 'tier'>): ReportedBoss => ({
  tier: boss.tier,
  boss: raidBossRef(boss),
  label: bossLabel(boss),
});

/**
 * What a raid reported from a screenshot is, as `reportedBoss` words it: the boss decided (one
 * the list does not have as `t5 azelf` reports it), an egg, or a hatched raid whose boss nobody
 * could tell (`T5 raid`).
 */
export function screenshotBoss(
  tier: RaidTier,
  boss: Pick<RaidBoss, 'entry' | 'name' | 'tier'> | null,
  hatched: boolean,
): ReportedBoss {
  if (boss) return chosenBoss(boss);
  return { tier, boss: null, label: hatched ? `${raidTierLabel(tier)} raid` : eggLabel(tier) };
}

/**
 * A stand-in for what a member reported, for reading a time typed beside a screenshot by the
 * stage the screenshot shows: `reportedTime` reads a hatch time for an egg and an end time for
 * a raid seen hatched. The tier gives the durations; without one, a standard raid's.
 */
export function stageOnly(tier: RaidTier | null, hatched: boolean): ReportedBoss {
  const shown = tier ?? { level: 'T5', shadow: false };
  return { tier: shown, boss: hatched ? { name: 'unknown' } : null, label: '' };
}

/** "could be A, B or C": up to three of the bosses a text fits. */
function couldBe(text: string, bosses: readonly RaidBoss[]): UserError {
  const names = bosses.slice(0, 3).map(bossLabel);
  const last = names.pop();
  const list = names.length === 0 ? (last ?? '') : `${names.join(', ')} or ${last ?? ''}`;
  return new UserError(`"${plain(truncate(text, 80))}" could be ${list}. Pick one from the list.`);
}

/** "could be A, B or C" for catalogue entries (megas that are not on the boss list). */
function couldBeEntries(text: string, entries: readonly PokemonEntry[]): UserError {
  const names = entries.slice(0, 3).map((entry) => plain(entry.name));
  const last = names.pop();
  const list = names.length === 0 ? (last ?? '') : `${names.join(', ')} or ${last ?? ''}`;
  return new UserError(`"${plain(truncate(text, 80))}" could be ${list}: type the full name.`);
}

/** The mega forms of the Pokémon a text names (`mega charizard` or `charizard`). */
function megaForms(ctx: RaidReading, text: string): PokemonEntry[] {
  const species = ctx.pokemon.exact(text.replace(/^mega\b\s*/i, ''));
  if (!species) return [];
  return ctx.gameData.catalogue.byDex(species.dex).filter((entry) => entry.kind === 'mega');
}

function unknownText(text: string): UserError {
  return new UserError(
    `I do not know a raid boss or tier called "${plain(truncate(text, 80))}". Pick one from the list, ` +
      'or type a tier such as `t5` for an egg.',
  );
}

/** The bosses among these that a text names in full. */
function exactBosses(
  bosses: readonly RaidBoss[],
  text: string,
  names: (boss: RaidBoss) => string[],
): RaidBoss[] {
  const typed = compact(text);
  return bosses.filter((boss) => names(boss).some((name) => compact(name) === typed));
}

/** The bosses among these that a text fits in part, best first. */
function partialBosses(
  bosses: readonly RaidBoss[],
  text: string,
  names: (boss: RaidBoss) => string[],
): RaidBoss[] {
  return matchNamed(
    bosses.map((boss) => ({ value: boss, names: names(boss) })),
    text,
  );
}

/**
 * The Mega form a name after a mega tier word names (`mega mewtwo`, `mega legendary rayquaza`):
 * never the plain Pokémon. Throws a `UserError` that names the forms when there are several, or
 * says there is no such Mega Pokémon. A raid's boss and a train's boss read it alike.
 */
function megaEntry(ctx: RaidReading, rest: string): PokemonEntry {
  const entry =
    ctx.pokemon.exact(`mega ${rest}`) ??
    (/^mega\b/i.test(rest) ? ctx.pokemon.exact(rest) : undefined);
  if (entry) return entry;
  const megas = megaForms(ctx, rest);
  if (megas.length > 1) {
    throw couldBeEntries(/^mega\b/i.test(rest) ? rest : `mega ${rest}`, megas);
  }
  throw new UserError(
    `I do not know a Mega Pokémon called "${plain(truncate(rest, 80))}". Pick one from the list.`,
  );
}

/** A tier typed in front of a name: the boss of that tier, or any Pokémon in that tier. */
function reportedWithTier(
  ctx: RaidReading,
  bosses: readonly RaidBoss[],
  typedTier: { tier: RaidTier; rest: string },
): ReportedBoss {
  const { tier, rest } = typedTier;
  const names = (boss: RaidBoss): string[] => [boss.name, boss.key.replace(/_/g, ' ')];
  const inTier = bosses.filter((boss) => sameRaidTier(boss.tier, tier));
  const exact = exactBosses(inTier, rest, names);
  const fits = exact.length > 0 ? exact : partialBosses(inTier, rest, names);
  const [first] = fits;
  if (first && fits.length === 1) return chosenBoss(first);
  if (fits.length > 1) throw couldBe(rest, fits);

  let entry;
  if (MEGA_LEVELS.includes(tier.level)) {
    entry = megaEntry(ctx, rest);
  } else {
    entry = compact(rest).length > 1 ? ctx.pokemon.exact(rest) : undefined;
  }
  if (!entry) throw unknownText(rest);
  // The rule the screenshot reader decides by too (`bossAtTier`).
  const found = bossAtTier(entry, tier, bosses);
  switch (found.kind) {
    case 'other-shadow-kind': {
      // Listed in the same level as a shadow raid (or as the plain one): the member means that boss.
      const kind = found.boss.tier.shadow ? 'a shadow raid, not a plain' : 'a plain raid, not a';
      throw new UserError(
        `${bossLabel(found.boss)} is ${kind} ${raidTierLabel(tier)} raid. Pick it from the list.`,
      );
    }
    case 'listed':
      // Listed in the tier that was typed (found through a nickname, say): that boss of the list.
      return chosenBoss(found.boss);
    case 'listed-elsewhere': {
      // Listed in another level: the member's tier contradicts the list, and the list is right.
      const label = raidTierLabel(found.boss.tier);
      throw new UserError(
        `${plain(found.boss.name)} is ${/^[AEIOU]/.test(label) ? 'an' : 'a'} ${label} raid right now. ` +
          'Pick it from the list, or leave the tier out.',
      );
    }
    case 'not-a-mega':
      throw new UserError(
        `I do not know a Mega Pokémon called "${plain(truncate(rest, 80))}". Pick one from the list.`,
      );
    case 'unlisted':
      return {
        tier,
        boss: { key: entry.key },
        label: `${plain(entry.name)} (${raidTierLabel(tier)})`,
      };
  }
}

/**
 * What the `boss` option names: a choice of the list, or typed text. Typed text is read in
 * this order. The whole text against the current bosses by name, key, label (`Yveltal (T5)`) and
 * `shadow <name>`: exactly one exact fit wins even when it begins another boss's name. A tier
 * alone is an egg. A tier followed by a name is a boss of that tier, or any Pokémon in it.
 * Otherwise a partial fit of one boss, or the error that names the several it could be. A
 * Pokémon (nicknames included) that is a current boss is that boss; one that is not is
 * explained. Throws a `UserError` that says what would work. The bosses are those of the server's
 * `zone` (plan 19A-2; every command and route gives it, a test may leave the instance's default).
 */
export function reportedBoss(ctx: RaidReading, value: string, zone: string): ReportedBoss {
  const text = value.trim();
  const bosses = ctx.raidBosses.bosses(zone);
  const [kind, ...parts] = text.split(':');
  if (kind === 'e' && parts.length === 2) {
    const tier = tierFromCode(parts[0], parts[1]);
    if (tier) return { tier, boss: null, label: eggLabel(tier) };
  }
  if (kind === 'b' && parts.length === 3) {
    const tier = tierFromCode(parts[1], parts[2]);
    const boss = tier && bosses.find((b) => b.key === parts[0] && sameRaidTier(b.tier, tier));
    if (boss) return chosenBoss(boss);
    throw new UserError('That boss is no longer on the list. Pick again from the list.');
  }
  const exact = exactBosses(bosses, text, bossFullNames);
  const [only] = exact;
  if (only && exact.length === 1) return chosenBoss(only);
  const typedTier = leadingTier(text);
  if (typedTier && typedTier.rest === '') {
    return { tier: typedTier.tier, boss: null, label: eggLabel(typedTier.tier) };
  }
  // One letter names an Unown form: too little to act on. Judged on the letters, not the text.
  if (compact(text).length < 2) throw unknownText(text);
  if (exact.length > 1) throw couldBe(text, exact);
  if (typedTier) return reportedWithTier(ctx, bosses, typedTier);

  const fits = partialBosses(bosses, text, bossNames);
  const [first] = fits;
  if (first && fits.length === 1) return chosenBoss(first);
  if (fits.length > 1) throw couldBe(text, fits);

  const entry = ctx.pokemon.exact(text);
  if (!entry) throw unknownText(text);
  const named = bosses.filter((boss) => boss.key === entry.key);
  const [one] = named;
  if (one && named.length === 1) return chosenBoss(one);
  if (named.length > 1) throw couldBe(text, named);
  const name = entry.name.toLowerCase();
  throw new UserError(
    `${entry.name} is not on the current boss list. To report it anyway, put its tier first, ` +
      `for example \`t3 ${name}\` or \`t5 ${name}\`.`,
  );
}

/** A Pokémon as what a train is after: its reference, and its name made plain for a sentence. */
export interface TrainBoss {
  boss: RaidBossRef;
  label: string;
}

const afterBoss = (boss: RaidBoss): TrainBoss => ({
  boss: raidBossRef(boss),
  label: plain(boss.entry?.name ?? boss.name),
});

const afterEntry = (entry: PokemonEntry): TrainBoss => ({
  boss: { key: entry.key },
  label: plain(entry.name),
});

/** The bosses of a list, each Pokémon once, whatever tiers it is a boss in. */
function onePerPokemon(bosses: readonly RaidBoss[]): RaidBoss[] {
  const seen = new Set<string>();
  return bosses.filter((boss) => {
    const identity = boss.entry ? `key:${boss.entry.key}` : `name:${boss.name}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * The choices for the `pokemon` option of `/boss` in the post of a train: the current bosses,
 * each Pokémon once and without its tier; with text, the Pokémon it names in full, then the
 * current bosses it finds by their name, in the order of the search (as the list of `/want`
 * has them; asked for by themselves, so that a boss far down among everything `s` finds is
 * still first), and then any Pokémon the search finds, in its order (a train may be planned
 * for a boss that is coming); a guess only when its name shows the word that was guessed, as
 * in the list of `/want` (`showsGuessed`). No eggs: a train has no tier.
 */
export function trainBossChoices(ctx: AppContext, typed: string, zone: string): Choice[] {
  const words = searchTokens(typed);
  const bosses = onePerPokemon(ctx.raidBosses.bosses(zone));
  const choice = (boss: RaidBoss): Choice => ({
    name: boss.entry?.name ?? boss.name,
    // A boss the game master does not know is found on the list again by its own key.
    value: boss.entry ? `p:${boss.entry.key}` : `b:${boss.key}:${tierCode(boss.tier)}`,
  });
  let choices: Choice[];
  if (words.length === 0) {
    choices = bosses.map(choice);
  } else {
    const hits = ctx.pokemon.find(typed, { limit: MAX_CHOICES * 4 });
    const byKey = new Map(bosses.flatMap((boss) => (boss.entry ? [[boss.entry.key, boss]] : [])));
    // By its name: not by a word of its form, a key or a number, and not as a guess.
    const named = ctx.pokemon
      .find(typed, { filter: (entry) => byKey.has(entry.key) })
      .filter(namedFirst(hits));
    // What the text names in full, boss or not: `mew` is Mew, also while Mewtwo is a boss.
    const [first] = hits;
    const inFull = first?.match === 'exact' ? [first] : [];
    // A boss the game master does not know is found by the words of its own name.
    const begun = (name: string): boolean => {
      const own = searchTokens(name);
      return words.every((word) => own.some((part) => part.startsWith(word)));
    };
    choices = [
      ...inFull.map((hit) => ({ name: hit.entry.name, value: `p:${hit.entry.key}` })),
      ...named.flatMap((hit) => {
        const boss = byKey.get(hit.entry.key);
        return boss ? [choice(boss)] : [];
      }),
      ...bosses.filter((boss) => !boss.entry && begun(boss.name)).map(choice),
      ...hits
        .filter((hit) => hit.match !== 'guess' || showsGuessed(hit.entry.name, hit.guessed))
        .map((hit) => ({ name: hit.entry.name, value: `p:${hit.entry.key}` })),
    ];
  }
  const listed = new Set<string>();
  choices = choices.filter((one) => {
    if (one.value.length > 100 || listed.has(one.value)) return false;
    listed.add(one.value);
    return true;
  });
  return choices
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
}

/**
 * The Pokémon the `pokemon` option of `/boss` names in the post of a train: a choice of the
 * list, or typed text. A train has no tier, so none of what a tier means to a raid applies: a
 * tier typed before a name is ignored, and a tier alone is refused with `noTier`; only a mega
 * tier word still names the Mega form, as in a raid (`megaEntry`). A current
 * boss is found by its name as in a raid; any other Pokémon is taken when the text names it
 * outright (`ctx.pokemon.exact`), also when it is no boss right now. Throws a `UserError` that
 * says what would work, and never speaks of a raid, a tier to put first or a report.
 */
export function trainBoss(ctx: AppContext, value: string, noTier: string, zone: string): TrainBoss {
  const text = value.trim();
  const bosses = ctx.raidBosses.bosses(zone);
  const [kind, ...parts] = text.split(':');
  if (kind === 'e' && parts.length === 2 && tierFromCode(parts[0], parts[1])) {
    throw new UserError(noTier);
  }
  if (kind === 'p' && parts.length === 1) {
    const entry = ctx.gameData.catalogue.byKey(parts[0] ?? '');
    if (entry) return afterEntry(entry);
    throw new UserError('I do not know that Pokémon any more. Pick again from the list.');
  }
  if (kind === 'b' && parts.length === 3) {
    const tier = tierFromCode(parts[1], parts[2]);
    const boss = tier && bosses.find((b) => b.key === parts[0] && sameRaidTier(b.tier, tier));
    if (boss) return afterBoss(boss);
    throw new UserError('That boss is no longer on the list. Pick again from the list.');
  }
  /** The one Pokémon a text names in full: a current boss, or any Pokémon. */
  const named = (name: string): TrainBoss | undefined => {
    const [boss, ...more] = onePerPokemon(exactBosses(bosses, name, bossFullNames));
    if (boss && more.length === 0) return afterBoss(boss);
    const entry = compact(name).length > 1 ? ctx.pokemon.exact(name) : undefined;
    return entry && afterEntry(entry);
  };
  const whole = named(text);
  if (whole) return whole;
  const typedTier = leadingTier(text);
  if (typedTier && typedTier.rest === '') throw new UserError(noTier);
  // A mega tier word names the Mega form, as in a raid: `mega pikachu` is no Pikachu, and
  // `mega charizard` asks which of two (follow-ups, From Phase 3B).
  if (typedTier && MEGA_LEVELS.includes(typedTier.tier.level)) {
    return afterEntry(megaEntry(ctx, typedTier.rest));
  }
  // What is left once the words of a tier are gone, also a lone `shadow`.
  const rest = (typedTier ? typedTier.rest : text).replace(/^shadow\s+/i, '');
  const after = rest === text ? undefined : named(rest);
  if (after) return after;
  // By its name and key alone: `shadow <name>`, which finds a shadow boss for a raid, would
  // make every shadow boss fit the word "shadow".
  const names = (boss: RaidBoss): string[] => [boss.name, boss.key.replace(/_/g, ' ')];
  const [first, ...others] = onePerPokemon(partialBosses(bosses, rest, names));
  if (first && others.length === 0) return afterBoss(first);
  if (first) {
    const names = [first, ...others].slice(0, 3).map((boss) => afterBoss(boss).label);
    const last = names.pop() ?? '';
    throw new UserError(
      `"${plain(truncate(rest, 80))}" could be ${names.join(', ')} or ${last}. ` +
        'Pick one from the list.',
    );
  }
  throw new UserError(
    `I do not know a Pokémon called "${plain(truncate(rest, 80))}". Pick one from the list.`,
  );
}

/**
 * The gyms a text names, seen from a region channel: the region's own and those just outside it,
 * as `ctx.gyms.search` orders them. When none of them has every word, the search goes on to the
 * other regions of the same server (Matt, 2026-10-11), and what it finds there with every word
 * comes before the guesses from here. Without a region channel all gyms are searched.
 *
 * With `accepts`, only the gyms it accepts count (the gyms of one server, a member's targets):
 * the others are left out before anything is decided, and the step to other regions looks at
 * every gym that is accepted, wherever it lies.
 */
function gymHits(
  ctx: AppContext,
  regionChannelId: string | undefined,
  text: string,
  limit: number,
  accepts?: (gym: Gym) => boolean,
): GymHit<Gym>[] {
  // With `accepts` every hit is asked for and then narrowed: a limit would be used up by the
  // gyms that do not count.
  const near = accepts
    ? ctx.gyms
        .search(regionChannelId ?? null, text)
        .filter((hit) => accepts(hit.gym))
        .slice(0, limit)
    : ctx.gyms.search(regionChannelId ?? null, text, { limit });
  const region = regionChannelId === undefined ? undefined : ctx.regions.byChannel(regionChannelId);
  if (!region || near.some((hit) => hit.allWords)) return near;
  const { guildId } = region;
  const sameServer = (gym: Gym): boolean =>
    guildId !== null && gymInGuild(ctx.gyms, ctx.regions, gym.id, guildId);
  const elsewhere = accepts ?? sameServer;
  const far = ctx.gyms
    .search(null, text, accepts ? {} : { limit: limit * 4 })
    .filter((hit) => hit.allWords && elsewhere(hit.gym));
  return [...far, ...near].slice(0, limit);
}

function gymLabel(gym: Gym, region: string | undefined): string {
  const parts = [gym.name, ...(gym.nickname ? [gym.nickname] : []), ...(region ? [region] : [])];
  return truncate(parts.join(' · '), CHOICE_NAME);
}

/**
 * `between <t> and <t>`: the range a time must lie in, with the day only when an end of it is
 * not within half a day of now (an elite raid).
 */
export function between(first: number, last: number, now: number): string {
  const style = isFarOff(first, now) || isFarOff(last, now) ? 'f' : 't';
  return `between ${timestamp(first, style)} and ${timestamp(last, style)}`;
}

/**
 * The choices for the `gym` option: the gyms matching what was typed, the region's own first;
 * while nothing is typed, the region's own gyms by name.
 * `regionName` gives the name of a region channel, to say where a gym of another region lies.
 * `accepts` narrows the list to the gyms it accepts.
 */
export function gymChoices(
  ctx: AppContext,
  regionChannelId: string | undefined,
  typed: string,
  regionName: (channelId: string) => string | undefined,
  accepts?: (gym: Gym) => boolean,
): Choice[] {
  if (typed.trim() === '') {
    // Nothing typed yet: the region's own gyms by name, as many as a list holds.
    if (regionChannelId === undefined) return [];
    return ctx.gyms
      .inRegion(regionChannelId)
      .filter((gym) => accepts?.(gym) ?? true)
      .sort((a, b) => byName(a.name, b.name))
      .slice(0, MAX_CHOICES)
      .map((gym) => ({ name: gymLabel(gym, undefined), value: `g:${String(gym.id)}` }));
  }
  return gymHits(ctx, regionChannelId, typed, MAX_CHOICES, accepts).map(({ gym, place }) => {
    const elsewhere = place === 'local' ? undefined : ctx.gyms.regionsOf(gym.id)[0];
    const region = elsewhere === undefined ? undefined : regionName(elsewhere);
    return { name: gymLabel(gym, region), value: `g:${String(gym.id)}` };
  });
}

/**
 * The gym that typed text clearly means, among what a search found: the only gym that has every
 * word as typed. Undefined when there is none or more than one: text is never acted on by a
 * guess. This is the one rule for acting on a typed gym, for `/raid` and for `/gym` alike.
 */
export function clearGymHit(hits: readonly GymHit<Gym>[]): Gym | undefined {
  const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
  const [only] = clear;
  return only && clear.length === 1 ? only.gym : undefined;
}

export type GymAnswer =
  /** One gym, clearly. */
  | { kind: 'gym'; gym: Gym }
  /**
   * Several gyms fit: the member chooses. `everyWord`: the ids of those with every word as
   * typed (`clearGymHit`'s test), which fit at least as a word's fit (plan 8X-F, `typedStop`).
   */
  | { kind: 'several'; gyms: Gym[]; everyWord: number[] }
  | { kind: 'none' };

/**
 * The gym the `gym` option names: a choice of the list, or typed text. Typed text is acted on
 * only when exactly one gym has every word as typed; otherwise the best few are offered.
 * With `accepts`, a gym it does not accept is never the answer, picked or typed.
 */
export function reportedGym(
  ctx: AppContext,
  regionChannelId: string | undefined,
  value: string,
  accepts?: (gym: Gym) => boolean,
): GymAnswer {
  const text = value.trim();
  const picked = /^g:(\d{1,10})$/.exec(text);
  if (picked) {
    const gym = ctx.gyms.get(Number(picked[1]));
    return gym && (accepts?.(gym) ?? true) ? { kind: 'gym', gym } : { kind: 'none' };
  }
  const hits = gymHits(ctx, regionChannelId, text, 5, accepts);
  if (hits.length === 0) return { kind: 'none' };
  const clear = clearGymHit(hits);
  if (clear) return { kind: 'gym', gym: clear };
  return {
    kind: 'several',
    gyms: hits.map((hit) => hit.gym),
    everyWord: hits.filter((hit) => hit.allWords && !hit.corrected).map((hit) => hit.gym.id),
  };
}

/**
 * What `/raid` and the map answer an Elite egg reported without its time (review 8E-1 of plan
 * 8E): without it the egg would stand for the whole elite incubation, about a day, and keep every
 * other report off its gym.
 */
export const ELITE_EGG_NEEDS_TIME =
  'An Elite egg shows when it hatches: give its hatch time, in minutes from now (`20`) or as a clock time (`6:15pm`).';

/**
 * The time of a report: when the egg hatches, or when a raid that was seen hatched ends.
 * Undefined for no text, except for an Elite egg, which is refused without its hatch time
 * (`ELITE_EGG_NEEDS_TIME`; an Elite raid seen hatched stands its usual time). Throws a
 * `UserError` for a text that is no time or lies outside what such a raid can have. `/raid`, the
 * map and a typed report beside a screenshot that could not be read all ask it; a screenshot that
 * was read carries its countdown and does not ask it without a typed time.
 */
export function reportedTime(
  ctx: RaidReading,
  reported: ReportedBoss,
  text: string | null,
  now: number,
  zone: string,
): { hatch: number } | { end: number } | undefined {
  const kind = raidDurationKind(reported.tier);
  if (text === null || text.trim() === '') {
    if (reported.boss === null && eggNeedsHatchTime(reported.tier)) {
      throw new UserError(ELITE_EGG_NEEDS_TIME);
    }
    return undefined;
  }
  const { settings } = ctx.config;
  const rules = raidDurationRules(settings, ctx.raidEvents.events(zone), zone);
  // A raid reported now hatched at most its own length ago and hatches within the egg time.
  const usual = longestRaidDurations(kind, now, now, rules);
  const durations = longestRaidDurations(
    kind,
    now - usual.hatched * MINUTE,
    now + usual.incubation * MINUTE,
    rules,
  );
  const parameter = reported.boss === null ? 'hatch' : 'end';
  const result = resolvePartyTime({
    text,
    now,
    zone,
    parameter,
    partyType: 'raid',
    raidKind: kind,
    settings,
    durations,
  });
  const what = parameter === 'hatch' ? 'the time the egg hatches' : 'the time the raid ends';
  if (result.kind === 'time')
    return parameter === 'hatch' ? { hatch: result.at } : { end: result.at };
  if (result.kind === 'out-of-range') {
    throw new UserError(
      `"${plain(truncate(text, 80))}" cannot be ${what}: it must be ${between(result.first, result.last, now)}.`,
    );
  }
  throw new UserError(
    `I could not read "${plain(truncate(text, 80))}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
  );
}

/**
 * Whether a text typed beside a screenshot can be a time at all: read as the hatch of an egg or
 * the end of a raid of any tier, it is something other than unreadable (whether it fits the raid
 * is known only once the screenshot was read).
 */
export function readableTime(ctx: RaidReading, text: string, now: number, zone: string): boolean {
  const { settings } = ctx.config;
  const rules = raidDurationRules(settings, ctx.raidEvents.events(zone), zone);
  return (['hatch', 'end'] as const).some((parameter) => {
    const result = resolvePartyTime({
      text,
      now,
      zone,
      parameter,
      partyType: 'raid',
      raidKind: 'standard',
      settings,
      durations: longestRaidDurations('standard', now, now, rules),
    });
    return result.kind !== 'unparseable';
  });
}

/** What a member is told who sets a time for a raid without times that cannot be going on any more. */
export const RAID_IS_OVER =
  'This raid is over by now. If it really lasts longer than usual, set its length first with `/duration`.';

const TIME_WORDS = {
  hatch: 'the time the egg hatches',
  end: 'the time the raid ends',
  meet: 'a meeting time',
} as const;

/**
 * A time a member typed for a raid that exists: its hatch time, its end time, or the meeting
 * time of a group. `'unset'` when the member asked to remove it (`cancel`, `none`). Throws a
 * `UserError` for a text that is no time or lies outside what this raid can have.
 */
export function typedPartyTime(
  ctx: RaidReading,
  party: RaidParty,
  parameter: 'hatch' | 'end' | 'meet',
  text: string,
  now: number,
  zone: string,
): { at: number } | 'unset' {
  const { settings } = ctx.config;
  const kind = raidKindOf(party);
  const rules = raidDurationRules(settings, ctx.raidEvents.events(zone), zone);
  // Every moment the egg can hatch or have hatched: from a raid's length before the report (or
  // before now) to the end of the egg time after it.
  const usual = longestRaidDurations(kind, party.createdAt, party.createdAt, rules);
  const durations = longestRaidDurations(
    kind,
    Math.min(now, party.createdAt) - usual.hatched * MINUTE,
    party.createdAt + usual.incubation * MINUTE,
    rules,
  );
  const result = resolvePartyTime({
    text,
    now,
    zone,
    parameter,
    partyType: 'raid',
    raidKind: kind,
    party: {
      creationTime: party.createdAt,
      hatchTime: party.hatchTime,
      endTime: party.endTime,
      hatchedDuration: party.raid.hatchedDuration,
    },
    settings,
    durations,
  });
  if (result.kind === 'unset') return 'unset';
  const what = TIME_WORDS[parameter];
  const outOfRange = (first: number, last: number): UserError =>
    new UserError(
      `"${plain(truncate(text, 80))}" cannot be ${what}: it must be ${between(first, last, now)}.`,
    );
  if (result.kind === 'time') {
    // A raid that was seen hatched and has no times yet hatched before it was reported: it
    // cannot go on longer than its length from then, whatever an egg of its kind could.
    if (parameter !== 'hatch' && party.hatchTime === null && party.raid.reportedHatched) {
      const length = party.raid.hatchedDuration ?? durations.hatched;
      const last = party.createdAt + length * MINUTE;
      if (result.at > last) throw last < now ? new UserError(RAID_IS_OVER) : outOfRange(now, last);
    }
    return { at: result.at };
  }
  if (result.kind === 'out-of-range') throw outOfRange(result.first, result.last);
  throw new UserError(
    `I could not read "${plain(truncate(text, 80))}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
  );
}
