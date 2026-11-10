import {
  bossOf,
  isRaid,
  memberOf,
  type Party,
  type RaidParty,
  type RaidStage,
} from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { PokemonType } from '../domain/pogo/types.js';
import { typeWord, WEATHER_ICON, weatherWord } from '../domain/pogo/game-icons.js';
import {
  pokemonPicture,
  type PictureSource,
  type PokemonIcons,
} from '../domain/pogo/pokemon-icons.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
import { raidTierLabel, raidWords, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
import { addressLine } from '../domain/geo/google.js';
import { wayspotPicture } from '../domain/wayspots/picture.js';
import { sameDay, zoned } from '../domain/time/zoned.js';
import { bottomControls } from './party-controls.js';
import {
  cutText,
  ENDED_COLOUR,
  fittedLayout,
  inRole,
  KEPT_OPEN,
  renderedPost,
  tidyTitle,
  trainerBlocks,
  trainerCount,
  type Fit,
  type PartyBrief,
  type ForumTag,
  type PostBlock,
  type PostEmoji,
  type PostLayout,
  type RenderedPost,
} from './party-post.js';
import { LIMITS, memberByName, plain, plainLines, timestamp, titleCase, truncate } from './text.js';

const HOUR = 3_600_000;

export const STAGE_COLOURS: Readonly<Record<RaidStage, number>> = {
  egg: 0xf1c40f,
  hatched: 0x2ecc71,
  ended: ENDED_COLOUR,
};

/** What the post needs to know of the gym (`Gym` of the gym repository has all of it). */
export interface PostGym {
  name: string;
  nickname: string | null;
  lat: number;
  lon: number;
  notice: string | null;
  taggedEx: boolean;
  confirmedEx: boolean;
  /** The gym's picture from Wayfarer (`Gym.imageUrl`); shown only as `wayspotPicture` allows. */
  imageUrl?: string | null;
  /** What Google said of the gym's place (`Gym.geodata`): its address line, `addressLine`. */
  geodata?: string | null;
}

/** The boss as it is shown: resolved from the party's reference (see `shownBoss`). */
export interface ShownBoss {
  name: string;
  /** Undefined for a Pokémon the game master does not know: no types, CP or moves to show. */
  entry?: PokemonEntry;
  shiny: boolean;
  image?: string;
  /**
   * The list has this boss costumed in the raid's own tier (plan 8R-4, `Boss.costumed`): what a
   * costumed want is matched against. Never taken from the boss of another tier.
   */
  costumed?: true;
}

export interface RaidPostView {
  party: RaidParty;
  now: number;
  /** Undefined when the gym no longer exists. */
  gym: PostGym | undefined;
  /** Undefined for an egg. */
  boss: ShownBoss | undefined;
  /** What an egg of this tier will hatch as, when that is certain. */
  hatchesAs?: ShownBoss;
  /**
   * The picture of an egg of this tier (`raidEggName`, `eggPictures`), shown while it is an egg:
   * the bot's web server's, or one of the message (`attachment://`), whose file is `eggFile`.
   */
  eggPicture?: string;
  /** The file `eggPicture` names when it is one of the message, which the message then carries. */
  eggFile?: string;
  catalogue: PokemonCatalogue;
  /** Show the moves line also while no move is known (`settings.showUnknownMoves`). */
  showUnknownMoves: boolean;
  /** IANA zone in which "today" is judged (`settings.timezone`). */
  zone: string;
  /**
   * Set for the last showing of a raid that staff closed (`/delete`): the sentence that says so.
   * It stands in the place of the times, and the post is shown as ended whatever the clock says.
   */
  closed?: string;
  emoji: PostEmoji;
  /** The size of the raid's groups, where it has one, and when one splits up (`TrainersView`). */
  lobbySize?: number | undefined;
  splitLobby?: number | null | undefined;
}

/**
 * The boss a party's reference stands for (`bossOf`: what a raid is against, what a train is
 * after), with what the boss list knows about it (shiny, picture): the list's boss of the same
 * Pokémon in the raid's tier, or else in any tier. A train has no tier: the first listed counts.
 * Its picture is the list's, or else the icon of its catalogue entry when `icons` has one
 * (`pokemonPicture`): a boss a moderator added, a train's boss that is no raid boss now.
 */
export function shownBoss(
  party: Party,
  catalogue: PokemonCatalogue,
  bosses: readonly RaidBoss[],
  icons?: PokemonIcons,
): ShownBoss | undefined {
  const ref = bossOf(party);
  if (ref === null) return undefined;
  const inTier = (boss: RaidBoss): boolean =>
    isRaid(party) && sameRaidTier(boss.tier, party.raid.tier);
  if ('name' in ref) {
    // A boss the game master knew only after the party was made has an entry by now, also when
    // the list has moved on; a row of the list without one is the list's word on that name.
    const named = bosses.filter((boss) => boss.name === ref.name);
    const listed = named.find(inTier) ?? named[0];
    const entry = listed ? listed.entry : catalogue.entryNamed(ref.name);
    const image = pokemonPicture(listed?.image, entry, { catalogue, icons });
    return {
      name: entry?.name ?? ref.name,
      ...(entry ? { entry } : {}),
      shiny: listed?.shiny ?? false,
      ...(image === undefined ? {} : { image }),
      ...(named.find(inTier)?.costumed === true ? { costumed: true as const } : {}),
    };
  }
  const entry = catalogue.byKey(ref.key);
  const same = bosses.filter((boss) => boss.entry !== undefined && boss.entry.key === entry?.key);
  const listed = same.find(inTier) ?? same[0];
  const image = pokemonPicture(listed?.image, entry, { catalogue, icons });
  return {
    name: entry?.name ?? titleCase(ref.key),
    ...(entry ? { entry } : {}),
    shiny: listed?.shiny ?? false,
    ...(image === undefined ? {} : { image }),
    // Only the boss of the raid's own tier says (F4): `same[0]` may be of another tier.
    ...(same.find(inTier)?.costumed === true ? { costumed: true as const } : {}),
  };
}

/**
 * What an egg of the raid's tier is sure to hatch as, from the boss list; its picture by the
 * same rule as a boss's, when `pictures` (the game data) is given.
 */
export function shownAutoset(
  tier: RaidTier,
  autoset: RaidBoss | undefined,
  pictures?: PictureSource,
): ShownBoss | undefined {
  if (!autoset || !sameRaidTier(autoset.tier, tier)) return undefined;
  const image = pokemonPicture(autoset.image, autoset.entry, pictures);
  return {
    name: autoset.name,
    ...(autoset.entry ? { entry: autoset.entry } : {}),
    shiny: autoset.shiny,
    ...(image === undefined ? {} : { image }),
  };
}

export function gymName(gym: PostGym | undefined): string {
  // `||`: a nickname that was cleared to an empty text names nothing.
  return gym ? gym.nickname || gym.name : 'Unknown gym';
}

/** The address of a gym's place in Google Maps. */
export function gymMapsUrl(gym: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`;
}

/**
 * The address of a stop's place in Google Maps (plan 8R-7), as `gymMapsUrl` with the coordinates
 * rounded to five decimals (about a meter): a stop kept with fifteen digits costs the post's
 * budget some 20 characters less a line.
 */
export function stopMapsUrl(stop: { lat: number; lon: number }): string {
  return gymMapsUrl({ lat: Number(stop.lat.toFixed(5)), lon: Number(stop.lon.toFixed(5)) });
}

/**
 * A gym's name, made plain, as the text of a masked link: a bracket in the name would end the
 * text of the link early. One that is escaped already (an odd run of backslashes stands before
 * it) stays; after an even run the backslashes escape each other, and the bracket needs one of
 * its own.
 */
export function linkText(gym: PostGym | undefined): string {
  return linkTextOf(gymName(gym));
}

/**
 * Any name as the text of a masked link, as `linkText` makes a gym's (a power spot's title);
 * `made` makes it plain (`plainNoLinks` for a name that reaches other members' DMs, plan 8R-7).
 */
export function linkTextOf(name: string, made: (text: string) => string = plain): string {
  return made(name).replace(/(\\*)([[\]])/g, (whole, slashes: string, bracket: string) =>
    slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
  );
}

/** `Yveltal · Big Fountain`, `T5 egg · Big Fountain`, `T5 raid · Big Fountain`. */
export function raidTitle(view: Pick<RaidPostView, 'party' | 'gym' | 'boss' | 'now'>): string {
  const { party, boss } = view;
  const stage = raidStage(party, view.now);
  const what = boss
    ? boss.name
    : `${raidTierLabel(party.raid.tier)} ${stage === 'egg' ? 'egg' : 'raid'}`;
  // The gym is what tells posts apart, so it is the boss name that gives way.
  const where = truncate(tidyTitle(gymName(view.gym)), 60);
  return tidyTitle(`${truncate(tidyTitle(what), LIMITS.title - where.length - 3)} · ${where}`);
}

/** The stage, the tier and whether it is a shadow raid: three tags at most. */
export function raidTags(party: RaidParty, now: number): ForumTag[] {
  const stage: Record<RaidStage, ForumTag> = { egg: 'Egg', hatched: 'Hatched', ended: 'Ended' };
  const level: Record<RaidTier['level'], ForumTag> = {
    T1: 'T1',
    T3: 'T3',
    T5: 'T5',
    Mega: 'Mega',
    MegaLegendary: 'Mega',
    SuperMega: 'Mega',
    Elite: 'Elite',
  };
  const { tier } = party.raid;
  return [
    stage[raidStage(party, now)],
    level[tier.level],
    ...(tier.shadow ? ['Shadow' as const] : []),
  ];
}

/** What the post says under the times of a raid whose times were guessed from a screenshot. */
export const UNCERTAIN_TIME =
  'These times are a guess from the screenshot (no clock on it, or taken a while before it was posted). `/hatch` or `/end` sets them right.';

function describeTimes(view: RaidPostView, stage: RaidStage): string {
  const times = timesOf(view, stage);
  const uncertain = view.party.raid.screenshot?.timeUncertain === true;
  return uncertain && stage !== 'ended' && view.party.hatchTime !== null
    ? `${times}\n${UNCERTAIN_TIME}`
    : times;
}

function timesOf(view: RaidPostView, stage: RaidStage): string {
  const { party, now, zone } = view;
  const { hatchTime, endTime } = party;
  if (hatchTime === null || endTime === null) {
    return stage === 'ended' ? 'This raid is over.' : 'No time has been set yet.';
  }
  if (stage === 'egg') {
    // A clock time does not say which day it is when the egg was reported far ahead (an
    // elite raid), so the date is shown: until the day itself, when the clock time is enough
    // again. The scheduler shows every post anew at midnight. An ordinary raid never has a date.
    const today = sameDay(zoned(now, zone), zoned(hatchTime, zone));
    const style = hatchTime - party.createdAt > 12 * HOUR && !today ? 'f' : 't';
    return `Hatches ${timestamp(hatchTime, 'R')}, at ${timestamp(hatchTime, style)}. Ends at ${timestamp(endTime, style)}.`;
  }
  if (stage === 'hatched') {
    return `Hatched at ${timestamp(hatchTime)}. Ends ${timestamp(endTime, 'R')}, at ${timestamp(endTime)}.`;
  }
  return `Ended at ${timestamp(endTime, 'f')}.`;
}

/**
 * Types as a line reads them: all by their icons, or all in words, as the weather (a sentence of
 * both reads badly); `×2` after a double weakness.
 */
function typeList(
  types: readonly { type: PokemonType; multiplier?: number }[],
  emoji: Pick<PostEmoji, 'icon'>,
): string {
  const icons = types.map(({ type }) => emoji.icon?.(type));
  const byIcon = icons.every((icon) => icon !== undefined);
  return types
    .map(
      ({ type, multiplier }, index) =>
        `${(byIcon ? icons[index] : undefined) ?? typeWord(type)}` +
        `${(multiplier ?? 0) > 1.6 ? ' ×2' : ''}`,
    )
    .join(byIcon ? ' ' : ', ');
}

/** `**Weaknesses** …`: what a Pokémon is weak to, as a line of a post; none without weaknesses. */
export function weaknessLines(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
  emoji: Pick<PostEmoji, 'icon'>,
): string[] {
  const types = catalogue.weaknesses(entry);
  return types.length === 0 ? [] : [`**Weaknesses** ${typeList(types, emoji)}`];
}

/** `**Types** …`: a Pokémon's own types (a max battle's post, plan 8X-3). */
export function typesLine(entry: PokemonEntry, emoji: Pick<PostEmoji, 'icon'>): string {
  return `**Types** ${typeList(
    entry.types.map((type) => ({ type })),
    emoji,
  )}`;
}

/**
 * What the game master says about a Pokémon as a raid boss, line by line: what it is weak to
 * (`×2` after a double weakness), and the CP it is caught with, plain and boosted, and in what
 * weather (`shadow`: as a shadow raid boss). Types and weather are the game's icons where the
 * emoji exist, and words where they do not. The post of a raid and that of a train both show
 * it.
 */
export function bossFacts(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
  shadow: boolean,
  emoji: Pick<PostEmoji, 'icon'>,
): string[] {
  const lines = weaknessLines(catalogue, entry, emoji);
  const cp = catalogue.raidCatchCp(entry, shadow);
  const boosted = catalogue.boostedIn(entry);
  const weatherIcons = boosted.map((weather) => emoji.icon?.(WEATHER_ICON[weather]));
  const weather =
    boosted.length === 0
      ? ''
      : weatherIcons.every((icon) => icon !== undefined)
        ? ` ${weatherIcons.join(' ')}`
        : ` (${boosted.map(weatherWord).join(', ')})`;
  lines.push(`**Catch CP** ${cp.min}–${cp.max} · ${cp.minBoosted}–${cp.maxBoosted}${weather}`);
  return lines;
}

/**
 * What can be said of a boss held by name that is a mega the game master lacks (`unlistedMega`):
 * the catch CP and its weather, which are its species'. Not its weaknesses: a mega's types may not
 * be its species'. Nothing for any other name.
 */
export function unlistedMegaFacts(
  catalogue: PokemonCatalogue,
  name: string,
  shadow: boolean,
  emoji: Pick<PostEmoji, 'icon'>,
): string[] {
  const entry = catalogue.unlistedMega(name);
  return entry ? bossFacts(catalogue, entry, shadow, emoji) : [];
}

/**
 * What the game master says about a Pokémon as a max battle's boss: what it is weak to and the CP
 * it is caught with (level 20, never boosted, so no weather: plan 8F-1). The post of a max battle
 * and that of a Dynamax or Gigantamax train both show it (review BR-3).
 */
export function maxBossFacts(
  catalogue: PokemonCatalogue,
  entry: PokemonEntry,
  emoji: Pick<PostEmoji, 'icon'>,
): string[] {
  const cp = catalogue.maxCatchCp(entry);
  return [...weaknessLines(catalogue, entry, emoji), `**Catch CP** ${cp.min}–${cp.max}`];
}

/**
 * The notice the moderators gave a gym, made plain; empty when there is none. A notice of nothing
 * but white space is empty once plain. It is written as a paragraph (`/gym edit`), and its lines
 * stay lines. Whether the gym is an elite raid gym is not said to members (Matt, 2026-10-17: it
 * mattered for EX raids, not now; the gym keeps the mark for staff and the `#elite-gym-raids`
 * copies).
 */
function noticeOf(gym: PostGym | undefined): string {
  return gym?.notice ? plainLines(gym.notice) : '';
}

/**
 * The room the notice of a gym may take in a post: a notice is at most 500 characters as typed,
 * and what is left of the text of a post is for the trainers.
 */
export const LOCATION_ROOM = 600;

/** The room the address line of a place may take in a post. */
const ADDRESS_ROOM = 200;

/** Said in place of the address of a place with a picture and no address (often deep in a park). */
export const NO_ADDRESS = '(no address available)';

/** The heading of the section of a post that says where the party is. */
export const WHERE_HEADING = '**Where**';

/** A masked link to a place in Google Maps, in angle brackets so that it shows no preview. */
export function mapMarkdown(place: { lat: number; lon: number }): string {
  return `[Map](<${gymMapsUrl(place)}>)`;
}

/**
 * What a section that says where a place is is made of: its heading, its one line (`line`, given
 * the address part as it is shown: an address, `NO_ADDRESS`, or nothing), the lines under it, and
 * the place's picture beside them. The address is made plain by the caller and cut here to
 * `ADDRESS_ROOM`; the lines under it go as they are (a caller cuts what can be long through
 * `fit.part`). With a picture and no address the line says `NO_ADDRESS`, so that the picture
 * never sits beside a bare name; where the message leaves the picture out, that goes with it
 * (`PostThumbnail.withoutPicture`). Without a picture the section is a text.
 */
export function placeSection(
  fit: Fit,
  place: {
    heading: string;
    line: (address: string) => string;
    address: string;
    picture: string | undefined;
    under: readonly string[];
  },
): PostBlock {
  const { heading, line, address, picture, under } = place;
  const shown =
    address === '' ? '' : fit.part((room) => cutText(address, Math.min(room, ADDRESS_ROOM)));
  const content = (where: string): string => [heading, line(where), ...under].join('\n');
  if (picture === undefined) return { type: 'text', content: content(shown) };
  if (shown !== '') {
    return { type: 'section', content: content(shown), accessory: { thumbnail: picture } };
  }
  return {
    type: 'section',
    content: content(NO_ADDRESS),
    accessory: { thumbnail: picture, withoutPicture: content('') },
  };
}

/**
 * Where a raid or a train's current stop is (Matt, 2026-10-17, like the `/wild` report's Where):
 * under `heading` one line, `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a
 * link; the address `addressLine` made plain), then the gym's notice, cut through `fit.part`,
 * with the gym's picture from Wayfarer beside them (plan 8W-2; only an address `wayspotPicture`
 * allows). A gym that is gone is named as unknown, without a map or a picture.
 */
export function gymWhere(heading: string, gym: PostGym | undefined, fit: Fit): PostBlock {
  const name = `**${plain(gymName(gym))}**`;
  if (!gym) return { type: 'text', content: `${heading}\n${name}` };
  const notice = noticeOf(gym);
  return placeSection(fit, {
    heading,
    line: (address) => [name, ...(address === '' ? [] : [address]), mapMarkdown(gym)].join(' · '),
    address: plain(addressLine(gym.geodata ?? null)),
    picture: wayspotPicture(gym.imageUrl),
    under:
      notice === '' ? [] : [fit.part((room) => cutText(notice, Math.min(room, LOCATION_ROOM)))],
  });
}

/**
 * Whether a raid is shown as its egg: until it hatches, and in the last showing of one that was
 * closed (moved, `/delete`) before it hatched, whose stage is `ended` all the same.
 */
function shownAsEgg(view: RaidPostView): boolean {
  return raidStage(view.party, view.now) === 'egg';
}

/** What the post of a raid shows as the raid's stage: the egg until it hatches. */
function stageOf(view: RaidPostView): RaidStage {
  return view.closed === undefined ? raidStage(view.party, view.now) : 'ended';
}

/**
 * The boss a raid is fought against, once hatched, and the one an egg is expected to hatch as
 * (named by a member, or certain for its tier). An egg is an egg until it hatches, also when its
 * boss is known: what it hatches as is said once, by the heading of the block about that boss
 * (Matt, 2026-10-11).
 */
function bosses(view: RaidPostView) {
  const fought = shownAsEgg(view) ? undefined : view.boss;
  const expected = fought ? undefined : (view.boss ?? view.hatchesAs);
  return { fought, expected };
}

/**
 * `**Level 5 raid against Yveltal** ✨`, `**Level 5 raid** (egg)`: the line of a direct
 * message's brief; the post says it as its heading (`heading`).
 */
function headline(view: RaidPostView): string {
  const { what, after } = headlineParts(view);
  return `**${what}**${after}`;
}

/** `### Level 5 raid against Yveltal ✨`, `### Level 5 raid (egg)`: what opens the post. */
function heading(view: RaidPostView): string {
  const { what, after } = headlineParts(view);
  return `### ${what}${after}`;
}

/**
 * The heading's parts: what the raid is (the boss's name as `name` makes it: `plain` for Discord,
 * as it is for the live map's `raidLook`) and what follows (` (egg)`, or the shiny mark).
 */
function headlineParts(
  view: RaidPostView,
  name: (text: string) => string = plain,
): { what: string; after: string } {
  const words = raidWords(view.party.raid.tier);
  const { fought } = bosses(view);
  if (fought) {
    return {
      what: `${words} against ${name(fought.name)}`,
      after: fought.shiny ? ` ${view.emoji.shiny}` : '',
    };
  }
  return { what: words, after: shownAsEgg(view) ? ' (egg)' : '' };
}

/**
 * The moves of the raid's boss, while one is known, or also then when `unknown` says so
 * (`showUnknownMoves`, for a boss that is there to look at).
 */
function movesLine(view: RaidPostView, unknown: boolean): string[] {
  const { catalogue, party } = view;
  const { fastMove, chargedMove } = party.raid;
  if (!unknown && fastMove === null && chargedMove === null) return [];
  const name = (id: string | null): string => (id && catalogue.move(id)?.name) ?? '????';
  return [`**Moveset** ${name(fastMove)} / ${name(chargedMove)}`];
}

/** What a post says about the boss of a raid (see `bossInfo`). */
interface BossInfo {
  /** For an egg: what it hatches as. */
  hatchesAs?: ShownBoss;
  lines: string[];
}

/**
 * What there is to say about the boss: for a hatched raid what it is weak to, its CP and its
 * moves; for an egg whose boss is known, what it hatches as, with the same but only the moves a
 * member already gave (moves nobody knows are not asked for before there is a boss to look at).
 * Undefined when there is nothing: no boss, or one the game master does not know, but for the
 * catch CP of a mega it lacks (`unlistedMegaFacts`).
 */
function bossInfo(view: RaidPostView): BossInfo | undefined {
  const { catalogue, party, emoji } = view;
  const { fought, expected } = bosses(view);
  const shadow = party.raid.tier.shadow;
  if (fought) {
    if (!fought.entry) {
      const facts = unlistedMegaFacts(catalogue, fought.name, shadow, emoji);
      return facts.length === 0 ? undefined : { lines: facts };
    }
    return {
      lines: [
        ...bossFacts(catalogue, fought.entry, shadow, emoji),
        ...movesLine(view, view.showUnknownMoves),
      ],
    };
  }
  if (!expected) return undefined;
  if (!expected.entry) {
    return {
      hatchesAs: expected,
      lines: unlistedMegaFacts(catalogue, expected.name, shadow, emoji),
    };
  }
  return {
    hatchesAs: expected,
    lines: [
      ...bossFacts(catalogue, expected.entry, shadow, emoji),
      // Not for the boss that is only certain for the tier: the moves are the raid's own.
      ...(expected === view.boss ? movesLine(view, false) : []),
    ],
  };
}

/** An egg is shown as the game's egg until it hatches, also when its boss is known. */
function pictureOf(view: RaidPostView): string | undefined {
  const { fought, expected } = bosses(view);
  return (shownAsEgg(view) ? view.eggPicture : undefined) ?? (fought ?? expected)?.image;
}

/** The file the post's picture names, when it is the egg's and one of the message. */
function pictureFileOf(view: RaidPostView): string | undefined {
  return view.eggFile !== undefined && pictureOf(view) === view.eggPicture
    ? view.eggFile
    : undefined;
}

/**
 * How the live map shows a raid (plan 8M-3): the post's picture, the boss the post names (what
 * it is fought against, or what the egg hatches as), and where it is as Where names it (the
 * gym's name as the post shows it, its place and address line, null when unknown; plan 8M-6:
 * the side panel's raids at gyms the map does not show), decided here as for the post. No place
 * for a gym that is gone.
 */
export function raidLook(view: RaidPostView): {
  /**
   * The post's heading in words (plan 8M-7, fix round 1): `Level 5 raid against Yveltal`,
   * `Level 5 raid (egg)`; by `headlineParts`, as the post's `### …`, without the shiny mark.
   */
  heading: string;
  picture?: string;
  boss?: string;
  place?: { name: string; lat: number; lon: number; address: string | null };
} {
  const { fought, expected } = bosses(view);
  const picture = pictureOf(view);
  const boss = (fought ?? expected)?.name;
  const { gym } = view;
  const { what, after } = headlineParts(view, (text) => text);
  return {
    heading: `${what}${after === ' (egg)' ? after : ''}`,
    ...(picture === undefined ? {} : { picture }),
    ...(boss === undefined ? {} : { boss }),
    ...(gym === undefined
      ? {}
      : {
          place: {
            name: gymName(gym),
            lat: gym.lat,
            lon: gym.lon,
            address: addressLine(gym.geodata ?? null) || null,
          },
        }),
  };
}

/** `Hatches as Yveltal ✨`. */
function hatchesAsLine(view: RaidPostView, boss: ShownBoss): string {
  return `**Hatches as ${plain(boss.name)}**${boss.shiny ? ` ${view.emoji.shiny}` : ''}`;
}

/**
 * The lines about the boss, under the times: what it is weak to, its CP and moves, headed for an
 * egg by what it hatches as.
 */
function bossLines(view: RaidPostView): string[] {
  const info = bossInfo(view);
  if (!info) return [];
  const heading = info.hatchesAs ? [hatchesAsLine(view, info.hatchesAs)] : [];
  return [...heading, ...info.lines];
}

/**
 * The post of a raid laid out (Matt, 2026-10-17): what the raid is, its times and its boss, with
 * the boss's or the egg's picture beside them; where it is (`gymWhere`, with the gym's picture);
 * who comes, with the buttons; the rows of the rest of the controls; who reported it. The gym's
 * name no longer opens the post (the thread's title has it), and the one Map is in Where.
 */
function raidLayout(view: RaidPostView): PostLayout {
  const { party, gym } = view;
  const stage = stageOf(view);
  const header = [
    heading(view),
    view.closed ?? describeTimes(view, stage),
    // Not in the last showing of a raid that was closed: that post is archived.
    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
    ...bossLines(view),
  ].join('\n');
  const picture = pictureOf(view);
  const pictureFile = pictureFileOf(view);
  return fittedLayout((fit) => ({
    accent: STAGE_COLOURS[stage],
    ...(picture === undefined ? {} : { picture }),
    ...(pictureFile === undefined ? {} : { pictureFile }),
    blocks: [
      { type: 'section', content: header, accessory: 'picture', role: 'head' },
      { type: 'separator' },
      inRole('where', gymWhere(WHERE_HEADING, gym, fit)),
      { type: 'separator' },
      // The hint names Meet…, which a raid has only once it has times.
      ...trainerBlocks(
        view,
        { complete: true, lobby: true, meetHint: stage !== 'ended' && party.hatchTime !== null },
        fit,
      ),
      { type: 'separator' },
      { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
      ...(party.anonymous
        ? []
        : [
            {
              type: 'text' as const,
              role: 'note' as const,
              content: `-# Reported by ${memberByName(memberOf(party, party.createdById))}`,
            },
          ]),
    ],
  }));
}

/**
 * The raid in brief, for a direct message: the line of what it is (`Level 5 raid against
 * Yveltal`, `Level 5 raid (egg)`), its times as the post says them (with the note of a guessed
 * time), how many come, the post's colour and picture, and the gym's place for the Map button.
 */
function raidBrief(view: RaidPostView): PartyBrief {
  const { party, gym } = view;
  const picture = pictureOf(view);
  const pictureFile = pictureFileOf(view);
  const { expected } = bosses(view);
  return {
    accent: STAGE_COLOURS[stageOf(view)],
    ...(picture === undefined ? {} : { picture }),
    ...(pictureFile === undefined ? {} : { pictureFile }),
    lines: [
      headline(view),
      // An egg whose boss is known says what it hatches as, as the heading of the post's block.
      ...(expected ? [hatchesAsLine(view, expected)] : []),
      view.closed ?? describeTimes(view, stageOf(view)),
      trainerCount(party),
    ],
    ...(gym ? { map: gymMapsUrl(gym) } : {}),
  };
}

/**
 * The forum post of a raid: title, tags, the components-v2 message (`raidLayout`) and the brief
 * of a direct message. Pure: the same view gives the same post.
 */
export function renderRaidPost(view: RaidPostView): RenderedPost {
  const { party, now } = view;
  return renderedPost({
    title: raidTitle(view),
    tags:
      view.closed === undefined
        ? raidTags(party, now)
        : ['Ended', ...raidTags(party, now).slice(1)],
    layout: raidLayout(view),
    brief: raidBrief(view),
  });
}
