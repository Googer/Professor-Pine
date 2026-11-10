import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { answer } from '../../discord/late-reply.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { autosetBoss, type RaidBoss } from '../../domain/pogo/raid-bosses.js';
import { raidTierLabel, sameRaidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
import { fitItems, fitMessages, plain, truncate } from '../../render/text.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { entryChoice, namedPokemon, pokemonChoices, pokemonOption } from '../pokemon-option.js';

/** The mark of a boss that can be shiny, and what it means. */
const SHINY = '✨';
const SHINY_LEGEND = `${SHINY} can be shiny.`;

/** `T5`, `T5 ✨`. */
const tierText = (boss: RaidBoss): string =>
  `${raidTierLabel(boss.tier)}${boss.shiny ? ` ${SHINY}` : ''}`;

/** `A, B and C`. */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** Lower case, spaces made single: how names are compared. */
const comparable = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** The words of a name, between single spaces: `Yveltal (Festival)` → ` yveltal festival `. */
const wordsOf = (name: string): string =>
  ` ${name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;

/**
 * The words of the name of a species without what tells its forms apart: `Landorus (Incarnate
 * Forme)` → ` landorus `.
 */
const speciesWords = (name: string): string => wordsOf(name.replace(/\s*\(.*\)\s*$/, ''));

/**
 * How long the list of the other bosses of a species may be: with the sentence about the
 * Pokémon itself (a few tiers at most) the answer stays within Discord's 2,000 characters.
 */
const MAX_KIN_TEXT = 1_500;

/**
 * The sentence about one Pokémon (`name`, already made plain) and the bosses that are it, then
 * the line of others that are bosses beside it (cut with a count when it is long), with the
 * legend of the shiny mark on a line of its own when a mark was shown.
 */
function bossSentence(name: string, own: readonly RaidBoss[], kin: readonly RaidBoss[]): string {
  // A Pokémon that can be shiny in every tier it is in says so in words, without marks.
  const allShiny = own.length > 0 && own.every((boss) => boss.shiny);
  const lines = [
    own.length === 0
      ? `**${name}** is not a raid boss now.`
      : allShiny
        ? `**${name}** is a boss of ${andList(own.map((boss) => raidTierLabel(boss.tier)))} ` +
          'raids now, and can be shiny.'
        : `**${name}** is a boss of ${andList(own.map(tierText))} raids now.`,
  ];
  if (kin.length > 0) {
    const items = kin.map((boss) => `${plain(boss.name)} (${tierText(boss)})`);
    const listed = andList(items);
    lines.push(
      `Also a boss now: ${listed.length <= MAX_KIN_TEXT ? listed : fitItems(items, MAX_KIN_TEXT)}.`,
    );
  }
  const marked = [...(allShiny ? [] : own), ...kin].some((boss) => boss.shiny);
  if (marked) lines.push(SHINY_LEGEND);
  return lines.join('\n');
}

/**
 * What `/boss-tier pokemon` says: every tier the Pokémon is a boss of now, from the boss list
 * members see (the feed with the moderators' overrides), and the other bosses of its species:
 * its other entries (a mega beside the plain Pokémon), and bosses the game data does not know
 * yet whose name has the species' name (a costume newer than the game data). `speciesName` is
 * the name of the species' own entry.
 */
export function bossTierText(
  bosses: readonly RaidBoss[],
  entry: PokemonEntry,
  speciesName: string = entry.name,
): string {
  const own = bosses.filter((boss) => boss.entry?.key === entry.key);
  const species = speciesWords(speciesName);
  const kin = bosses.filter((boss) =>
    boss.entry === undefined
      ? species.trim() !== '' && wordsOf(boss.name).includes(species)
      : boss.entry.key !== entry.key && boss.entry.dex === entry.dex,
  );
  return bossSentence(plain(entry.name), own, kin);
}

/**
 * The bosses the game data does not know yet whose name is the typed text (without regard to
 * case); empty for any other text.
 */
function unknownBossesNamed(bosses: readonly RaidBoss[], typed: string): RaidBoss[] {
  const text = comparable(typed);
  return bosses.filter((boss) => boss.entry === undefined && comparable(boss.name) === text);
}

/**
 * The boss list as members see it, tier by tier: each tier's bosses, those that can be shiny
 * marked, and what eggs of a tier with several bosses hatch as when the moderators said so. No
 * staff details.
 */
export function bossListText(bosses: readonly RaidBoss[]): string[] {
  if (bosses.length === 0) return ['There are no raid bosses now.'];
  const lines = ['**Raid bosses now**'];
  const tiers: RaidTier[] = [];
  for (const boss of bosses) {
    if (!tiers.some((tier) => sameRaidTier(tier, boss.tier))) tiers.push(boss.tier);
  }
  for (const tier of tiers) {
    const ofTier = bosses.filter((boss) => sameRaidTier(boss.tier, tier));
    const names = ofTier.map((boss) => `${plain(boss.name)}${boss.shiny ? ` ${SHINY}` : ''}`);
    // A tier of one boss hatches as it: saying so would only repeat the name.
    const hatches = ofTier.length > 1 ? autosetBoss(bosses, tier) : undefined;
    lines.push(
      `**${raidTierLabel(tier)}**: ${names.join(', ')}` +
        (hatches ? ` · eggs hatch as ${plain(hatches.name)}` : ''),
    );
  }
  if (bosses.some((boss) => boss.shiny)) lines.push(SHINY_LEGEND);
  return lines;
}

/**
 * The choices of the `pokemon` option: the bosses while nothing is typed (one the game data
 * does not know yet by its name, which `execute` reads), else any Pokémon.
 */
function bossTierChoices(ctx: AppContext, typed: string): Choice[] {
  if (typed.trim() !== '') return pokemonChoices(ctx, typed);
  const choices = new Map<string, Choice>();
  for (const boss of ctx.raidBosses.bosses()) {
    if (boss.entry) choices.set(boss.entry.key, entryChoice(boss.entry));
    else if (boss.name.length <= 100) {
      choices.set(boss.name, { name: truncate(boss.name, CHOICE_NAME), value: boss.name });
    }
  }
  return [...choices.values()].slice(0, MAX_CHOICES);
}

/**
 * `/boss-tier` (the legacy `!boss-tier`, `!boss-level`): whether a Pokémon is a raid boss now
 * and of which tiers, from `ctx.raidBosses`; without a Pokémon, the whole boss list by tier.
 * For the member alone.
 */
export const bossTier: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('boss-tier')
    .setDescription('Whether a Pokémon is a raid boss now, and of which tier; or all bosses')
    .addStringOption(pokemonOption('The Pokémon; without one, every raid boss now', false)),
  help: {
    category: 'util',
    details:
      'With a Pokémon: whether it is a raid boss now, of which tiers, and whether it can be ' +
      'shiny. Without one: every raid boss now, tier by tier. Only you see the answer.',
    examples: ['/boss-tier pokemon:Mewtwo', '/boss-tier'],
  },
  defer: 'late',
  throttle: MEMBER_READ_THROTTLE,
  async execute(interaction, ctx) {
    const typed = interaction.options.getString('pokemon');
    const bosses = ctx.raidBosses.bosses();
    if (typed !== null) {
      // A boss the game data does not know yet is named by the feed's name only, and is what
      // the text means only when the text names no Pokémon outright.
      const own = ctx.pokemon.exact(typed) ? [] : unknownBossesNamed(bosses, typed);
      const [unknown] = own;
      if (unknown) {
        await answer(interaction, { content: bossSentence(plain(unknown.name), own, []) });
        return;
      }
      const entry = namedPokemon(ctx, typed);
      const species = ctx.gameData.catalogue.species(entry.dex)?.name ?? entry.name;
      await answer(interaction, { content: bossTierText(bosses, entry, species) });
      return;
    }
    const [first = '', ...rest] = fitMessages(bossListText(bosses));
    await answer(interaction, { content: first });
    for (const more of rest) {
      await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
    }
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(
      focused.name === 'pokemon' ? bossTierChoices(ctx, String(focused.value)) : [],
    );
  },
};
