import type { AppContext } from '../../app-context.js';
import type { LocatedInteraction } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import { readPin } from '../../domain/geo/pin-input.js';
import type { MaxParty, MaxSpot, PowerSpot, RaidBossRef } from '../../domain/party/party.js';
import { typedMaxBoss } from '../../domain/pogo/max-boss-list.js';
import type { MaxBoss } from '../../domain/pogo/max-bosses.js';
import {
  battleKindOf,
  isEternamaxForm,
  isMaxTier,
  MAX_TIERS,
  maxBossTitle,
  maxTierLabel,
  type BattleKind,
  type MaxTier,
} from '../../domain/pogo/max-tier.js';
import { defaultMaxEnd, lastBattleOn, type MaxEndInput } from '../../domain/time/max-end.js';
import { resolvePartyTime } from '../../domain/time/party-time.js';
import { plain, truncate } from '../../render/text.js';
import { currentMaxBossChoices } from '../../services/max-boss-service.js';
import { placeValue } from '../../services/place-finder.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import {
  namedPlace,
  pickedPlace,
  PIN_NOT_HERE,
  PLACE_GONE,
  type PlaceKindsOnly,
} from '../place-option.js';
import { between } from '../raids/raid-input.js';

const MINUTE = 60_000;

/*
 * What `/max` reads (plan 8X-3; design 3.2): the boss and its tier, the spot, the end; shared by
 * the command, its dialog and `/boss`, `/end`, `/meet` in a max battle's post.
 */

/** What the reading of a max battle needs of the bot. */
export type MaxReading = Pick<
  AppContext,
  'config' | 'maxBosses' | 'raidEvents' | 'pokemon' | 'gameData'
>;

/** A max boss as a member named it: the reference to store, its tier, and how to say it. */
export interface ReadMaxBoss {
  boss: RaidBossRef;
  tier: MaxTier;
  /** `Dynamax Machamp (2★)`, made plain. */
  label: string;
}

/** The value of a boss choice of `/max`: `m:<tier>:<key>` (at most 100 characters). */
export function maxChoiceValue(boss: Pick<MaxBoss, 'tier' | 'key'>): string {
  return `m:${boss.tier}:${boss.key}`;
}

/**
 * The choices of `/max`'s `boss`: the list in its order (`currentMaxBossChoices`), narrowed; of
 * one kind only for `/boss` in a battle (`kind`: a battle never changes kind, review B, B7).
 */
export function maxBossOptions(
  ctx: MaxReading,
  typed: string,
  now: number,
  kind?: BattleKind,
): Choice[] {
  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fits = (name: string): boolean => words.every((word) => name.toLowerCase().includes(word));
  return currentMaxBossChoices(maxDeps(ctx), now)
    .filter((choice) => kind === undefined || battleKindOf(choice.boss.tier) === kind)
    .filter((choice) => fits(choice.name))
    .map((choice) => ({
      name: truncate(choice.name, CHOICE_NAME),
      value: maxChoiceValue(choice.boss),
    }))
    .filter((choice) => choice.value.length <= 100)
    .slice(0, MAX_CHOICES);
}

/** What `currentMaxBossChoices` reads, from the bot's context. */
function maxDeps(ctx: MaxReading) {
  return {
    maxBosses: ctx.maxBosses,
    maxEvents: ctx.raidEvents,
    pokemon: ctx.pokemon,
    gameData: ctx.gameData,
    zone: ctx.config.settings.timezone,
  };
}

/** The tier option's choices: `D1` … `D5`, `G` (design section 10, review 16). */
export const TIER_CHOICES = MAX_TIERS.map((tier) => ({ name: maxTierLabel(tier), value: tier }));

/** Said when a boss on no list was typed without `tier:`. */
export const WHICH_TIER = 'Which tier? Add `tier:`.';

/**
 * Said of a typed boss that names no Pokémon: `shown` is the text as typed, made plain. Its words
 * name the list that appears while one types in Discord; the map says its own of `shown`
 * (8X-5 final review F3).
 */
export class UnknownMaxBoss extends UserError {
  constructor(readonly shown: string) {
    super(
      `I know no Pokémon called "${shown}". Pick a boss from the list that appears while you type.`,
    );
  }
}

/** A reference of a listed boss: its catalogue key, or the feed's name. */
function refOf(boss: MaxBoss): RaidBossRef {
  return boss.entry ? { key: boss.entry.key } : { name: boss.name };
}

function read(boss: RaidBossRef, name: string, tier: MaxTier): ReadMaxBoss {
  return {
    boss,
    tier,
    label: plain(maxBossTitle({ name, key: 'key' in boss ? boss.key : undefined }, tier)),
  };
}

/**
 * A typed `Gigantamax Machamp` or `G-Max Machamp`, `Dynamax Machamp`: the kind and the rest.
 * `Eternamax Eternatus`, as Eternatus's choice is offered (`maxBossChoiceName`), is of the
 * Gigantamax kind (tier `G`).
 */
export function kindOfText(text: string): {
  gigantamax?: boolean;
  eternamax?: true;
  rest: string;
} {
  const match = /^(gigantamax|g-?max|eternamax|dynamax|d-?max)\s+(.+)$/i.exec(text.trim());
  if (!match?.[1] || !match[2]) return { rest: text.trim() };
  const eternamax = /^e/i.test(match[1]);
  return {
    gigantamax: eternamax || /^g/i.test(match[1]),
    ...(eternamax ? { eternamax: true as const } : {}),
    rest: match[2],
  };
}

/**
 * The boss a member picked or typed for a max battle (design 3.2): a choice of the list
 * (`m:<tier>:<key>`, still on it); otherwise a Pokémon typed in full (`exact`, `Gigantamax ` or
 * `Dynamax ` before it names the kind): its listed boss (Dynamax before Gigantamax, Gigantamax
 * loses design conflicts; the tier `tier:` names when given), else, for a Pokémon the game master
 * lets battle so, the tier `tier:` names (required then: `WHICH_TIER`), Gigantamax where it is
 * named so (it has no stars to ask). `fallback` is the tier of the battle `/boss` changes: a
 * name that says no kind takes the listed boss of the battle's kind first, and in a Gigantamax
 * battle a Pokémon the game lets battle so; a Dynamax boss on no list needs `tier:` there too
 * (plan 8X-F). Refused with a sentence for anything else.
 */
export function readMaxBoss(
  ctx: MaxReading,
  text: string,
  tierText: string | null,
  now: number,
  fallback?: MaxTier,
): ReadMaxBoss {
  const tier = tierText === null ? undefined : tierText.trim().toUpperCase();
  if (tier !== undefined && !isMaxTier(tier)) {
    throw new UserError('That is no max battle tier: pick one from the list.');
  }
  const bosses = ctx.maxBosses.bosses();
  const picked = /^m:(D[1-5]|G):(.{1,95})$/.exec(text.trim());
  if (picked) {
    const pickedTier = picked[1] as MaxTier;
    const key = picked[2];
    const listed = [...bosses, ...ctx.maxBosses.coming()].find(
      (boss) => boss.key === key && boss.tier === pickedTier,
    );
    const offered = currentMaxBossChoices(maxDeps(ctx), now).find(
      (choice) => choice.boss.key === key && choice.boss.tier === pickedTier,
    );
    const boss = offered?.boss ?? listed;
    if (!boss) throw new UserError('That boss is no longer on the list: pick it again.');
    return read(refOf(boss), boss.name, boss.tier);
  }
  const { gigantamax, eternamax, rest } = kindOfText(text);
  const named = ctx.pokemon.exact(rest);
  const shown = plain(truncate(text.trim(), 80));
  if (!named) throw new UnknownMaxBoss(shown);
  // `Eternamax Eternatus` names the species; the list has its Eternamax form.
  const form = eternamax
    ? bosses.find(
        (boss) => boss.tier === 'G' && isEternamaxForm(boss.entry) && boss.entry?.dex === named.dex,
      )?.entry
    : undefined;
  const entry = form ?? named;
  const typed = typedMaxBoss(entry, bosses, ctx.gameData.catalogue);
  // `/boss` in a battle (`fallback`) with a name that says no kind (review B, B7): a boss of the
  // battle's own kind first, listed; in a Gigantamax battle one the game lets battle so (it has no
  // stars to ask); only then the rest, which the battle refuses with its reason
  // (`max-kind-change`). A Dynamax boss on no list is never given the battle's stars in silence:
  // its tier is asked as `/max` asks it (plan 8X-F).
  if (fallback !== undefined && gigantamax === undefined && tier === undefined) {
    const own = (one: MaxTier): boolean => battleKindOf(one) === battleKindOf(fallback);
    const mine = typed.listed.find((boss) => own(boss.tier));
    if (mine) return read(refOf(mine), mine.name, mine.tier);
    if (fallback === 'G' && typed.others.includes('G')) {
      return read({ key: entry.key }, entry.name, 'G');
    }
    // Listed only as Gigantamax, but it may battle as a Dynamax boss of the battle's kind: its
    // stars are asked, not the Gigantamax one read and refused by the battle (review r0, F-A1).
    if (fallback !== 'G' && typed.others.some((one) => one !== 'G')) {
      throw new UserError(WHICH_TIER);
    }
  }
  const ofKind = (one: MaxTier): boolean =>
    gigantamax === undefined || (one === 'G') === gigantamax;
  const listed = typed.listed
    .filter((boss) => ofKind(boss.tier) && (tier === undefined || boss.tier === tier))
    .sort((a, b) => Number(a.tier === 'G') - Number(b.tier === 'G'));
  const first = listed[0];
  if (first) return read(refOf(first), first.name, first.tier);
  const allowed = typed.others.filter(ofKind);
  if (tier !== undefined && allowed.includes(tier))
    return read({ key: entry.key }, entry.name, tier);
  if (tier === undefined && gigantamax === true && allowed.includes('G')) {
    return read({ key: entry.key }, entry.name, 'G');
  }
  if (allowed.length === 0 && typed.listed.every((boss) => !ofKind(boss.tier))) {
    throw new UserError(`${plain(entry.name)} is no max battle boss in the game.`);
  }
  if (tier !== undefined) {
    throw new UserError(`${plain(entry.name)} is no ${maxTierLabel(tier)} boss.`);
  }
  throw new UserError(WHICH_TIER);
}

/** `/max`'s `spot` takes power spots only (design 3.2). */
const SPOTS_ONLY: PlaceKindsOnly = {
  kinds: ['powerspot'],
  refusal: 'A max battle is at a Power Spot: pick one from the list, or give a maps link.',
};

/**
 * The spot a member named (design 3.2, Q7): a power spot of the list (`namedPlace`, power spots
 * only: the member's region first), or typed outright; a maps link or coordinates are the
 * nearest power spot within 50 metres (`PlaceFinder.nearestPowerSpot`), else a pin, an
 * "Unlisted power spot". Refused as `namedPlace` refuses (`PLACE_GONE`, `NOT_HERE`,
 * `PIN_NOT_HERE`, a short link…).
 */
export async function readSpot(
  interaction: LocatedInteraction,
  ctx: AppContext,
  text: string,
): Promise<MaxSpot> {
  const place = await namedPlace(interaction, ctx, text, 'or give a maps link', SPOTS_ONLY);
  if (!place) throw new UserError('Name the Power Spot of the battle.');
  if (place.kind === 'powerspot') return place as PowerSpot;
  if (place.kind !== 'pin') throw new UserError(SPOTS_ONLY.refusal);
  const row = await ctx.guilds.idFor(guildIdOf(interaction));
  // `namedPlace` made the pin in a region of this server, so the row is known.
  if (row === undefined) throw new UserError(PIN_NOT_HERE);
  return spotAt(ctx, row, place, { checked: true });
}

/** What naming a spot without an interaction needs: the gyms, Wayspots and the place search. */
export type SpotReading = Pick<AppContext, 'gyms' | 'wayspots' | 'placeFinder'>;

/**
 * The spot of a max battle named without an interaction (the map, plan 8X-5), as `/max` names
 * it: a power spot by its Wayfarer id (`spot`, as `pickedPlace` names a pick of its list:
 * refused `PLACE_GONE` once it is gone or of another kind, or outside the server's regions); a
 * point (`lat`, `lon`; the map keeps it to six decimals) in a region of the server (else `PIN_NOT_HERE`),
 * which is the nearest power spot within 50 metres (`PlaceFinder.nearestPowerSpot`), else a pin,
 * an "Unlisted power spot" (Q7), named by nothing else. `readSpot` names its pins so, with
 * `checked`: `namedPlace` made the pin in a region of the server already (`PlaceFinder.pin`), so
 * it is not looked at again.
 */
export function spotAt(
  ctx: SpotReading,
  row: number,
  named: { spot: string } | { lat: number; lon: number; linkName?: string | null },
  options: { checked?: boolean } = {},
): MaxSpot {
  if ('spot' in named) {
    const known = pickedPlace(ctx, row, placeValue({ kind: 'powerspot', id: named.spot }));
    if (known?.kind !== 'powerspot') throw new UserError(PLACE_GONE);
    return known as PowerSpot;
  }
  const point = { lat: named.lat, lon: named.lon };
  if (options.checked !== true && !ctx.placeFinder.pin(row, point, null, ['powerspot'])) {
    throw new UserError(PIN_NOT_HERE);
  }
  const near = ctx.placeFinder.nearestPowerSpot(row, point);
  const known = near ? pickedPlace(ctx, row, placeValue(near)) : undefined;
  if (known?.kind === 'powerspot') return known as PowerSpot;
  // An unlisted power spot (Q7): named by nothing else, whatever is near it.
  return { kind: 'pin', ...point, near: null, linkName: named.linkName ?? null };
}

/** Whether a text is a maps link or coordinates (a pin): its autocomplete offers nothing. */
export function isPinText(text: string): boolean {
  return readPin(text).kind !== 'none';
}

/** What `defaultMaxEnd` and its dialog read: the events, the hours, the zone. */
export function maxEndInput(ctx: MaxReading, tier: MaxTier, at: number): MaxEndInput {
  const { settings } = ctx.config;
  return {
    tier,
    at,
    events: ctx.raidEvents.maxEvents(),
    big: ctx.raidEvents.bigEvents(),
    hours: settings.maxBattles,
    zone: settings.timezone,
  };
}

/** Said of a report at or after the last battle time (design 3.1). */
export function battlesOver(ctx: Pick<AppContext, 'config'>): string {
  const { firstBattle, lastBattle } = ctx.config.settings.maxBattles;
  return `Max battles are over for today: they can be fought from ${firstBattle} to ${lastBattle}.`;
}

/**
 * A time a member typed for a max battle (`end:` of `/max`, `/end` and `/meet` in its post):
 * read as a raid's time is (`resolvePartyTime`: minutes from now, or a clock time), within the
 * day of the battle (`from`: when it was reported, or now for a report): an end from now to the
 * day's last battle time, a meeting time from now to the battle's end. `unset` for `cancel` (a
 * meeting time; an end cannot be removed: refused). Throws a `UserError` for what is no such time.
 */
export function typedMaxTime(
  ctx: Pick<AppContext, 'config'>,
  parameter: 'end' | 'meet',
  text: string,
  now: number,
  battle?: Pick<MaxParty, 'createdAt' | 'endTime'>,
): { at: number } | 'unset' {
  const { settings } = ctx.config;
  const from = battle?.createdAt ?? now;
  const last = lastBattleOn(from, settings.maxBattles, settings.timezone);
  const until = parameter === 'end' ? last : (battle?.endTime ?? last);
  const minutes = Math.max(1, Math.ceil((until - from) / MINUTE));
  const result = resolvePartyTime({
    text,
    now,
    zone: settings.timezone,
    parameter,
    partyType: 'raid',
    raidKind: 'standard',
    party: { creationTime: from, hatchTime: null, endTime: parameter === 'meet' ? until : null },
    settings,
    durations: { incubation: 0, hatched: minutes },
  });
  const what = parameter === 'end' ? 'the time the battle ends' : 'a meeting time';
  const shown = plain(truncate(text, 80));
  if (result.kind === 'unset') {
    if (parameter === 'end') {
      throw new UserError('A max battle always has an end: give the time it ends.');
    }
    return 'unset';
  }
  if (result.kind === 'time') {
    if (result.at > until || result.at < now) {
      throw new UserError(`"${shown}" cannot be ${what}: it must be ${between(now, until, now)}.`);
    }
    return { at: result.at };
  }
  if (result.kind === 'out-of-range') {
    if (now >= until) throw new UserError(battlesOver(ctx));
    throw new UserError(`"${shown}" cannot be ${what}: it must be ${between(now, until, now)}.`);
  }
  throw new UserError(
    `I could not read "${shown}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
  );
}

/**
 * The end of a reported max battle (design 3.1, Q9): the one `end:` gave, else the default end
 * of its rotation (`defaultMaxEnd`); refused at or after the last battle time (`battlesOver`).
 */
export function reportedEnd(
  ctx: MaxReading,
  tier: MaxTier,
  text: string | null,
  now: number,
): number {
  const decided = defaultMaxEnd(maxEndInput(ctx, tier, now));
  if (decided.kind === 'over') throw new UserError(battlesOver(ctx));
  if (text === null || text.trim() === '') return decided.end;
  const typed = typedMaxTime(ctx, 'end', text, now);
  if (typed === 'unset') return decided.end;
  return typed.at;
}
