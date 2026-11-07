import type { AppContext } from '../../app-context.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import type { PokemonHit } from '../../domain/pogo/pokemon-search.js';
import { UserError } from '../../discord/errors.js';
import {
  notificationTiers,
  pokemonTarget,
  sameNotificationTarget,
  type NotificationScope,
  type NotificationTarget,
  type Want,
} from '../../domain/pogo/notification-target.js';
import {
  entryWant,
  formReader,
  hasForms,
  kindWordTargets,
  parseWantToken,
  pokemonWantName,
  raidsOnly,
  readWantText,
  SHADOW_OF,
  wantSpeciesFinder,
  wantTargetLabel,
  wantToken,
  wantWord,
  wantWordGuesses,
} from '../../domain/pogo/wants.js';
import { searchText, searchTokens } from '../../domain/search/text.js';
import { plain, truncate } from '../../render/text.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';

/** How a scope reads after "for": `raids and spawns`, `raids`, `spawns`. */
export const SCOPE_WORDS: Readonly<Record<NotificationScope, string>> = {
  both: 'raids and spawns',
  raid: 'raids',
  spawn: 'spawns',
};

/** What a target is called in a list (`wantTargetLabel`), with the game data in use. */
export function wantLabel(ctx: AppContext, target: NotificationTarget): string {
  return wantTargetLabel(ctx.gameData.catalogue, target);
}

/**
 * What a target is called in a sentence about a raid or a spawn of it: as in a list, but a
 * species by its bare name (`a Giratina raid`).
 */
export function wantName(ctx: AppContext, target: NotificationTarget): string {
  return target.kind === 'pokemon'
    ? pokemonWantName(ctx.gameData.catalogue, target)
    : wantLabel(ctx, target);
}

/** The tiers and the IV targets, in the order a list offers them. */
function fixedTargets(): NotificationTarget[] {
  return [
    ...notificationTiers().map((tier): NotificationTarget => ({ kind: 'tier', tier })),
    { kind: 'iv', iv: 'perfect' },
    { kind: 'iv', iv: 'zero' },
  ];
}

/**
 * Whether every typed word stands somewhere in a name, both folded as the search folds text
 * (`flabebe` for Flabébé, `nidoran female` for Nidoran♀): `words` are `searchTokens`.
 */
function fits(name: string, words: readonly string[]): boolean {
  const folded = searchText(name);
  return words.every((word) => folded.includes(word));
}

/** Whether every typed word begins a word of a label (`tyr base` for `Tyranitar (base form)`). */
function beginsWords(label: string, typed: readonly string[]): boolean {
  const words = searchTokens(label);
  return typed.every((begun) => words.some((word) => word.startsWith(begun)));
}

/** The words a label adds to the name of a Pokémon: `(every form)`, `(base form)`. */
const LABEL_WORDS = ['every', 'base', 'form'];

/** What a label adds to the name of a tier or an IV target: `T5 raids`, `Perfect IV spawns`. */
const FIXED_LABEL_WORDS: ReadonlySet<string> = new Set(['raids', 'spawns', 'iv']);

/**
 * Whether a text begins the label of a tier or an IV target by what names it: every typed word
 * begins a word of the label, and one of them a word that is the target's own (`perf`, `t5`,
 * `shadow`, `el`). What the label only adds finds nothing by itself: `ra` is Raikou, not ten
 * tiers of raids, and `sp` is Spinda (the whole word alone does: `kindWordTargets`).
 */
function beginsFixedLabel(label: string, typed: readonly string[]): boolean {
  const words = searchTokens(label);
  const own = words.filter((word) => !FIXED_LABEL_WORDS.has(word));
  return (
    typed.every((begun) => words.some((word) => word.startsWith(begun))) &&
    typed.some((begun) => own.some((word) => word.startsWith(begun)))
  );
}

/** Whether a target is shadow raids: of a Pokémon, or of a tier. */
function isShadowLabel(target: NotificationTarget): boolean {
  return target.kind === 'pokemon'
    ? target.shadow === true
    : target.kind === 'tier' && target.tier.shadow;
}

/**
 * The names a typed text may begin with when its last words are words of a label, or the
 * beginning of them: `tyranitar base` and `tyranitar base fo` give `tyranitar`. The search
 * knows the names only, so the name is searched and the label then compared with all of the text.
 */
function namesBeforeLabelWords(typed: readonly string[]): string[] {
  const names: string[] = [];
  for (let tail = 1; tail <= 2 && tail < typed.length; tail += 1) {
    const last = typed.slice(-tail);
    if (!last.every((begun) => LABEL_WORDS.some((word) => word.startsWith(begun)))) break;
    names.push(typed.slice(0, -tail).join(' '));
  }
  return names;
}

/**
 * The choices for the `target` option of `/want`. With nothing typed: the tiers, then the IV
 * targets. With text, in this order (Matt, 2026-10-13):
 *
 * 0. the Pokémon the text names in full, as it would be read if it were sent as it stands
 *    (`readWantText`): `mew` is Mew, also while Mewtwo is a boss;
 * 1. the current raid bosses that the text finds by their name (not by a key or a number, and
 *    not as a guess): a shadow boss as the shadow raids of its species (`Shadow Landorus`), a
 *    boss that is one of several forms as that form, each with its species after it; a boss
 *    that is all there is of its species once, plainly. The words a label adds (`every form`,
 *    `base form`) find no boss; `shadow` alone finds the shadow raids of every shadow boss,
 *    and with text after it those of the shadow bosses that text finds by their name;
 * 2. the tier and IV targets the text names or begins (a tier also answers to `3 star`, so
 *    `star` finds the tiers), and those whose label it begins by a word of their own
 *    (`beginsFixedLabel`);
 * 3. every other Pokémon the text finds properly, in the order of the search (`PokemonSearch`:
 *    what it leads to by name first, a legendary before an ordinary Pokémon): after `shadow`,
 *    the shadow raids of the species the rest of the text finds by their name, those that can
 *    be shadow first and without regard to their class; then a species that has several
 *    entries as `X (every form)`, followed by its entries that were found, each by its name,
 *    and any other species once; and what the words of a label find (`tyranitar base`,
 *    `giratina every form`);
 * 4. guesses (a word read as a misspelling), each only when its label shows the word that was
 *    guessed (`lugai` finds Lugia), and none for a text that is a fixed word in full: `shadow`
 *    is no misspelt Meadow Pattern, `raid` no Urshifu (Rapid Strike Style).
 *
 * A text that only begins `shadow` (`s` to `shado`) begins names too: the shadow raids and
 * shadow tiers its label finds then stand after the Pokémon of 3 that it leads to by name
 * (the audit of 2026-11-07); the bosses it finds by name stay first.
 *
 * Nothing twice, 25 at most. A choice's value is the target's token.
 */
export function wantChoices(ctx: AppContext, typed: string): Choice[] {
  const { catalogue } = ctx.gameData;
  const words = searchTokens(typed);
  const targets: NotificationTarget[] = [];
  const add = (target: NotificationTarget): void => {
    if (targets.length >= MAX_CHOICES) return;
    if (!targets.some((known) => sameNotificationTarget(known, target))) targets.push(target);
  };
  if (words.length === 0) {
    fixedTargets().forEach(add);
  } else {
    const begins = (target: NotificationTarget): boolean =>
      beginsWords(wantLabel(ctx, target), words);
    const hits = ctx.pokemon.find(typed, { limit: MAX_CHOICES * 4 });
    const rest = SHADOW_OF.exec(typed.trim())?.[1];
    const shadowHits = rest === undefined ? [] : shadowFinds(ctx, rest);
    // `s`, `sh` … `shado` begin `shadow` in the label of every shadow boss and shadow tier, but
    // they begin names as well: those shadow raids stand after the Pokémon the text leads to by
    // name (the audit of 2026-11-07), and lead only when nothing else begins with the text.
    const [only] = words;
    const shadowBegun =
      rest === undefined &&
      words.length === 1 &&
      only !== undefined &&
      only !== 'shadow' &&
      'shadow'.startsWith(only);
    const afterNames: NotificationTarget[] = [];
    const addShadow = (target: NotificationTarget): void => {
      if (shadowBegun && isShadowLabel(target)) afterNames.push(target);
      else add(target);
    };
    // A boss goes first for its name: one found by its key, by its number or by the beginning
    // of its number (`3` is Venusaur's number, `5` begins number 576) stands with the other
    // Pokémon, after the tiers. Nor does one found by a word of its form: `for` is
    // Forretress, not every boss that is a Forme. The bosses are asked for by themselves,
    // without a limit: among everything `s` finds, Starmie may stand beyond the hundredth.
    const bosses = ctx.raidBosses.bosses();
    const bossKeys = new Set(bosses.flatMap((boss) => (boss.entry ? [boss.entry.key] : [])));
    const shadowBosses = new Set(
      bosses.flatMap((boss) => (boss.entry && boss.tier.shadow ? [boss.entry.dex] : [])),
    );
    const named = new Set(
      ctx.pokemon
        .find(typed, { filter: (entry) => bossKeys.has(entry.key) })
        .filter((hit) => hit.named)
        .map((hit) => hit.entry.key),
    );
    const namedShadow = new Set(
      rest === undefined
        ? []
        : shadowFinds(ctx, rest, (entry) => shadowBosses.has(entry.dex))
            .filter((hit) => hit.named)
            .map((hit) => hit.entry.dex),
    );

    // 0. The Pokémon the text names in full.
    const read = readWantText(typed, wantSpeciesFinder(catalogue, ctx.pokemon));
    if (read.kind === 'target' && read.target.kind === 'pokemon') add(read.target);

    // 1. The current raid bosses.
    for (const boss of bosses) {
      // A boss the game master does not know has no Pokédex number: its tier can be wanted.
      if (!boss.entry) continue;
      const species = pokemonTarget(boss.entry.dex);
      const shadow = pokemonTarget(boss.entry.dex, undefined, true);
      const offered = boss.tier.shadow
        ? [shadow, species]
        : hasForms(catalogue, boss.entry.dex)
          ? [entryWant(catalogue, boss.entry), species]
          : [species];
      // By the boss's name all of it is offered. Otherwise only its shadow raids: by what the
      // text says after `shadow`, when it says anything (`shadow sh` is Shieldon, though `sh`
      // begins `shadow` in the label of every shadow boss), and without that by the beginning
      // of their label (`shadow` and `shad` find the shadow raids of every shadow boss, not
      // their species besides). What a label adds to a name (`every form`, `base form`) finds
      // no boss.
      const all = named.has(boss.entry.key);
      const byShadow = rest === undefined ? begins(shadow) : namedShadow.has(boss.entry.dex);
      for (const target of offered) {
        if (all) add(target);
        else if (target === shadow && byShadow) addShadow(target);
      }
    }

    // 1b. The Pokémon of today's Rocket lineups the text finds by name (plan 8R-2, design 9.9):
    // their shadows can be caught now. A form that is one of several as that form, with its
    // species after it, as a boss.
    const catchKeys = new Set(
      ctx.rocketLineups
        .choices()
        .flatMap((choice) => choice.catches.flatMap((one) => (one.key === null ? [] : [one.key]))),
    );
    if (catchKeys.size > 0) {
      for (const hit of ctx.pokemon.find(typed, { filter: (entry) => catchKeys.has(entry.key) })) {
        if (!hit.named) continue;
        if (hasForms(catalogue, hit.entry.dex)) add(entryWant(catalogue, hit.entry));
        add(pokemonTarget(hit.entry.dex));
      }
    }

    // 2. The tiers and the IV targets.
    wantWordGuesses(typed).forEach(addShadow);
    kindWordTargets(typed).forEach(add);
    for (const target of fixedTargets()) {
      if (beginsFixedLabel(wantLabel(ctx, target), words)) addShadow(target);
    }

    // 3. Every other proper match.
    if (read.kind === 'target') add(read.target);
    for (const hit of shadowHits) {
      if (hit.match !== 'guess') add(pokemonTarget(hit.entry.dex, undefined, true));
    }
    for (const hit of hits) {
      if (hit.match === 'guess') continue;
      // The shadow raids put after the names stand before what a word of a form finds.
      if (!hit.named) afterNames.splice(0).forEach(add);
      add(pokemonTarget(hit.entry.dex));
      add(entryWant(catalogue, hit.entry));
    }
    afterNames.splice(0).forEach(add);
    for (const name of namesBeforeLabelWords(words)) {
      for (const hit of ctx.pokemon.find(name, { limit: MAX_CHOICES })) {
        if (hit.match === 'guess') continue;
        for (const target of [pokemonTarget(hit.entry.dex), entryWant(catalogue, hit.entry)]) {
          if (begins(target)) add(target);
        }
      }
    }

    // 4. Guesses, where the label shows the word that was guessed.
    const guess = (target: NotificationTarget, guessed: readonly string[]): void => {
      if (showsGuessed(wantLabel(ctx, target), guessed)) add(target);
    };
    for (const hit of shadowHits) {
      if (hit.match === 'guess') guess(pokemonTarget(hit.entry.dex, undefined, true), hit.guessed);
    }
    const fixedWord =
      wantWord(typed) !== undefined ||
      /^shadow$/i.test(typed.trim()) ||
      kindWordTargets(typed).length > 0;
    for (const hit of hits) {
      if (hit.match !== 'guess' || fixedWord) continue;
      guess(pokemonTarget(hit.entry.dex), hit.guessed);
      guess(entryWant(catalogue, hit.entry), hit.guessed);
    }
  }
  return targets.map((target) => ({
    name: truncate(wantLabel(ctx, target), CHOICE_NAME),
    value: wantToken(target),
  }));
}

/**
 * What the text after `shadow` finds, for the shadow raids of a species: in the order of the
 * search without its preference for legendaries (few of them have shadow raids, and it is not
 * what is likelier meant here), those the game data says can be shadow first. Of the proper
 * hits only those the text leads to by their name (`PokemonHit.named`): the choice is for
 * every form of the species, so a word of one form says nothing for it (`me` is no Scatterbug
 * for its Meadow Pattern, `la` no Furfrou for its La Reine Trim). One letter is
 * not read as the Unown of that letter, and megas and primals are left out: there is no shadow
 * raid of one, and `me` would find every species that has a mega by its nickname. With
 * `among`, only these entries are asked for, however far down the search has them.
 */
function shadowFinds(
  ctx: AppContext,
  rest: string,
  among?: (entry: PokemonEntry) => boolean,
): PokemonHit[] {
  const oneLetter = searchTokens(rest).join('').length < 2;
  const hits = ctx.pokemon
    .find(rest, {
      plain: true,
      filter: (entry) => entry.kind !== 'mega' && (among?.(entry) ?? true),
      ...(among ? {} : { limit: MAX_CHOICES * 2 }),
    })
    .filter((hit) => !(oneLetter && hit.match === 'exact'));
  const proper = hits.filter((hit) => hit.match !== 'guess' && hit.named);
  // Of the species: the choice is for the shadow raids of every form of it.
  const { catalogue } = ctx.gameData;
  const canBeShadow = (hit: PokemonHit): boolean =>
    catalogue.byDex(hit.entry.dex).some((entry) => entry.shadow);
  return [
    ...proper.filter(canBeShadow),
    ...proper.filter((hit) => !canBeShadow(hit)),
    ...hits.filter((hit) => hit.match === 'guess'),
  ].slice(0, MAX_CHOICES);
}

/**
 * Whether a target has a scope to speak of: a Pokémon that can be met in raids and in the wild.
 * A tier, an IV target, the shadow raids of a Pokémon and a mega have the one scope only.
 */
export function hasScope(ctx: AppContext, target: NotificationTarget): boolean {
  return (
    target.kind === 'pokemon' &&
    !raidsOnly(
      target,
      formReader(() => ctx.gameData.catalogue),
    )
  );
}

/**
 * A want as a list names it with its scope: `Dratini · raids and spawns`, `Giratina (Origin
 * Forme) · raids`. Where there is only one scope (`hasScope`) none is said: `T5 raids`, `Shadow
 * Landorus`, `Mega Charizard Y`.
 */
function wantWithScope(ctx: AppContext, want: Want): string {
  const label = wantLabel(ctx, want.target);
  return hasScope(ctx, want.target) ? `${label} · ${SCOPE_WORDS[want.scope]}` : label;
}

/** A text as it is compared with a label: letter case and the width of gaps do not count. */
const folded = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The want of the member's own list that a typed text is a name of, in full: its label, with
 * or without the scope (after ` · ` or in brackets), or its name in a sentence; failing that,
 * the words of one of these without their brackets and signs (`tyranitar base form`).
 * Undefined when the text is no such name or the name of several, and for a token:
 * `typedWant` reads those.
 */
export function ownWantNamed(
  ctx: AppContext,
  wants: readonly Want[],
  typed: string,
): NotificationTarget | undefined {
  if (parseWantToken(typed)) return undefined;
  const namedBy = (same: (text: string) => string): NotificationTarget | undefined => {
    const text = same(typed);
    if (text === '') return undefined;
    const named = wants.filter((want) =>
      [
        wantWithScope(ctx, want),
        `${wantLabel(ctx, want.target)} (${SCOPE_WORDS[want.scope]})`,
        wantLabel(ctx, want.target),
        wantName(ctx, want.target),
      ].some((name) => same(name) === text),
    );
    const [only] = named;
    return only && named.length === 1 ? only.target : undefined;
  };
  return namedBy(folded) ?? namedBy(searchText);
}

/**
 * The choices for the `target` option of `/unwant`: the member's own wants, with their scope,
 * narrowed to what was typed; those that begin with it first, then by name.
 */
export function ownWantChoices(ctx: AppContext, wants: readonly Want[], typed: string): Choice[] {
  const text = typed.trim().toLowerCase();
  // Folded as the list of `/want` folds what is typed.
  const words = searchTokens(typed);
  const word = wantWord(typed);
  return wants
    .map((want) => ({ want, name: wantWithScope(ctx, want) }))
    .filter(
      ({ want, name }) =>
        fits(name, words) || (word !== undefined && sameNotificationTarget(word, want.target)),
    )
    .sort(beginningFirst(text))
    .slice(0, MAX_CHOICES)
    .map(({ want, name }) => ({
      name: truncate(name, CHOICE_NAME),
      value: wantToken(want.target),
    }));
}

/** "A, B or C". */
function orList(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop() ?? '';
  return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
}

/**
 * The target the `target` option names: a choice of the list, or typed text (see
 * `readWantText`). Throws a `UserError` that says what would work; a text that names nothing
 * outright is never guessed at: what it may have meant is only suggested. `own` is for a want
 * the member has (`/unwant`): see `readWantText`.
 */
export function typedWant(ctx: AppContext, value: string, own = false): NotificationTarget {
  const finder = wantSpeciesFinder(ctx.gameData.catalogue, ctx.pokemon);
  const read = readWantText(value, finder, { own });
  if (read.kind === 'target') return read.target;
  if (read.kind === 'gone') {
    throw new UserError('I do not know that Pokémon any more. Pick again from the list.');
  }
  const shown = plain(truncate(value.trim(), 80));
  // A suggested Pokémon is a species, by its bare name: the list shows its forms. After
  // `shadow` it is the shadow raids of that species (`Shadow Mewtwo`).
  const names = [
    ...read.words,
    ...read.suggestions.map((dex): NotificationTarget =>
      pokemonTarget(dex, undefined, read.shadow === true),
    ),
  ].map((target) => plain(wantName(ctx, target)));
  throw new UserError(
    `I do not know "${shown}" as a Pokémon, a raid tier, or perfect or zero IVs. ` +
      (names.length === 0 ? '' : `Did you mean ${orList(names)}? `) +
      'Pick one from the list that appears while you type.',
  );
}
