import { SlashCommandSubcommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { bossReport, familyReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
import { MAX_OPS, maxBossesAt } from '../../domain/pogo/max-bosses.js';
import { isMegaLevel } from '../../domain/pogo/raid-boss-feed.js';
import {
  autosetBoss,
  type Boss,
  type BossOverride,
  type NewBossOverride,
} from '../../domain/pogo/raid-bosses.js';
import { raidTierLabel, sameRaidTier } from '../../domain/pogo/raid-tier.js';
import { isoDate } from '../../domain/time/zoned.js';
import { count, plain, truncate } from '../../render/text.js';
import { CHOICE_NAME, MAX_CHOICES } from '../choices.js';
import {
  BOSS_GROUP,
  bossPokemonChoices,
  bossTierLabel,
  bossTiersText,
  chosenPokemon,
  DEFAULT_DAYS,
  expiryOf,
  isMaxBossTier,
  readRaidTier,
  readTier,
  sameBossTier,
  tierOption,
  withDays,
  type BossTier,
  type ChosenPokemon,
} from './boss-input.js';
import { pokemonOption } from '../pokemon-option.js';
import { lasting } from './boss-list.js';

/** The value of an override among the choices of `remove`. */
const OVERRIDE_CHOICE = /^(?:id:|#)?(\d{1,10})$/;

/**
 * The bosses in effect of both lists (plan 8X-2): the raid bosses, then the max bosses.
 */
function allBosses(ctx: AppContext): Boss<BossTier>[] {
  return [...ctx.raidBosses.bosses(), ...ctx.maxBosses.bosses()];
}

/** The overrides in force of both lists; an id names one of either (one table). */
function allOverrides(ctx: AppContext): BossOverride<BossTier>[] {
  return [...ctx.raidBossAdmin.overrides(), ...ctx.maxBossAdmin.overrides()];
}

/**
 * A tier's bosses after a change, on one line: `T5 now: Yveltal, Zekrom · eggs hatch as …`,
 * `Gigantamax now: Machamp`.
 */
export function tierNow(ctx: AppContext, tier: BossTier): string {
  const label = `**${bossTierLabel(tier)}**`;
  const bosses = allBosses(ctx).filter((boss) => sameBossTier(boss.tier, tier));
  if (bosses.length === 0) return `${label} now has no bosses.`;
  const hatches = isMaxBossTier(tier) ? undefined : autosetBoss(ctx.raidBosses.bosses(), tier);
  const names = bosses.map((boss) => `${plain(boss.name)}${boss.shiny ? ' (shiny)' : ''}`);
  return (
    `${label} now: ${names.join(', ')}` + (hatches ? ` · eggs hatch as ${plain(hatches.name)}` : '')
  );
}

/** `#3, until <date>` or `#3, for good`, as the answers say it. */
const numbered = (override: BossOverride<BossTier>): string =>
  `override #${String(override.id)}, ${lasting(override)}`;

/** Every override in force of both lists with the name of its Pokémon, by id. */
function reportedOverrides(ctx: AppContext): Map<number, ReportedOverride<BossTier>> {
  const admin = ctx.raidBossAdmin;
  const now = Date.now();
  const report = bossReport(admin.feedBosses(), admin.overrides(), ctx.gameData.catalogue, now);
  const max = ctx.maxBossAdmin;
  const maxReport = familyReport(
    MAX_OPS,
    maxBossesAt,
    max.feedBosses(),
    max.overrides(),
    ctx.gameData.catalogue,
    now,
  );
  const all: ReportedOverride<BossTier>[] = [
    ...report.bosses.flatMap((one) => one.overrides),
    ...report.hidden,
    ...report.idle,
    ...maxReport.bosses.flatMap((one) => one.overrides),
    ...maxReport.hidden,
    ...maxReport.idle,
  ];
  return new Map(all.map((one) => [one.override.id, one]));
}

/**
 * An override in a sentence or a choice, worded as the list words it: `Zekrom added to T5`,
 * `Starmie hidden from T3`, `Mewtwo: eggs of T5 hatch as it`, `Yveltal: never shiny (any raid
 * tier)`, `Machamp added to Gigantamax`.
 */
function describeOverride(override: BossOverride<BossTier>, name: string): string {
  const tier = override.tier === null ? 'any raid tier' : bossTierLabel(override.tier);
  switch (override.action) {
    case 'add':
      return `${name} added to ${tier}`;
    case 'hide':
      return `${name} hidden from ${tier}`;
    case 'autoset':
      return `${name}: eggs of ${tier} hatch as it`;
    case 'shiny':
      return `${name}: ${override.shiny ? 'can be shiny' : 'never shiny'} (${tier})`;
  }
}

/**
 * Stores an override for the member of staff in the list of its tier (a max tier's in the max
 * boss list; one without a tier is a raid override),
 * refusing what `addOverride` refuses with its own sentence.
 */
async function store(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  chosen: ChosenPokemon,
  override: Omit<NewBossOverride<BossTier>, 'pokemonId' | 'form' | 'createdBy'>,
): Promise<BossOverride<BossTier>> {
  const ids = { ...chosen.ids, createdBy: interaction.user.id };
  const { tier } = override;
  try {
    if (tier !== null && isMaxBossTier(tier)) {
      return await ctx.maxBossAdmin.addOverride({ ...override, ...ids, tier });
    }
    return await ctx.raidBossAdmin.addOverride({ ...override, ...ids, tier });
  } catch (err) {
    if (err instanceof RangeError) throw new UserError(err.message);
    throw err;
  }
}

/**
 * A raid of the mega kind has a mega or primal form for its boss, and only such a raid has one:
 * anything else is refused (a Pokémon the game data does not know is taken as it is). A max
 * battle's boss is never a mega or primal form.
 */
function checkTier(chosen: ChosenPokemon, tier: BossTier): void {
  if (!chosen.entry) return;
  const mega = chosen.entry.kind === 'mega';
  if (isMaxBossTier(tier)) {
    if (mega) {
      throw new UserError(
        `${chosen.label} is a mega or primal form, so it is no max boss. Pick its species.`,
      );
    }
    return;
  }
  if (isMegaLevel(tier.level) && !mega) {
    throw new UserError(
      `${chosen.label} is no mega or primal form, so it cannot be a boss of ` +
        `${raidTierLabel(tier)} raids. Pick its mega form.`,
    );
  }
  if (!isMegaLevel(tier.level) && mega) {
    const what = chosen.entry.tempEvolution === 'PRIMAL' ? 'a primal' : 'a mega';
    throw new UserError(
      `${chosen.label} is ${what} form, so it can only be a boss of Mega, Mega Legendary or ` +
        'Super Mega raids.',
    );
  }
}

/**
 * The warning for a max override of a Pokémon the game data does not list as that kind of max
 * boss (`canDynamax`, `canGigantamax`): a line of the answer, not a refusal, as the game master
 * may lag behind a new boss. None for a raid tier or a Pokémon the game data does not know.
 */
function maxKindWarning(ctx: AppContext, chosen: ChosenPokemon, tier: BossTier): string[] {
  if (!isMaxBossTier(tier) || !chosen.entry) return [];
  const { catalogue } = ctx.gameData;
  const gigantamax = tier === 'G';
  const can = gigantamax
    ? catalogue.canGigantamax(chosen.entry)
    : catalogue.canDynamax(chosen.entry);
  if (can) return [];
  return [
    `The game data does not list ${chosen.label} as a ${gigantamax ? 'Gigantamax' : 'Dynamax'} ` +
      'boss; the override is stored all the same.',
  ];
}

/**
 * Whether a boss of the list is the Pokémon staff named: by its catalogue entry, or for one the
 * game master does not know by its ids (an unknown boss's key can equal a real catalogue key).
 */
function sameBoss(chosen: ChosenPokemon, boss: Boss<BossTier>): boolean {
  return chosen.entry
    ? boss.entry?.key === chosen.entry.key
    : !boss.entry && boss.pokemonId === chosen.ids.pokemonId && boss.form === chosen.ids.form;
}

/** Whether the feed lists this Pokémon in this tier. */
function feedLists(ctx: AppContext, chosen: ChosenPokemon, tier: BossTier): boolean {
  return allBosses(ctx).some(
    (boss) => boss.source === 'feed' && sameBoss(chosen, boss) && sameBossTier(boss.tier, tier),
  );
}

/** The `hide` override in force for this Pokémon and tier, if any. */
function hiddenBy(
  ctx: AppContext,
  chosen: ChosenPokemon,
  tier: BossTier,
): BossOverride<BossTier> | undefined {
  return allOverrides(ctx).find(
    (one) =>
      one.action === 'hide' &&
      one.pokemonId === chosen.ids.pokemonId &&
      one.form === chosen.ids.form &&
      one.tier !== null &&
      sameBossTier(one.tier, tier),
  );
}

/** The tiers this Pokémon is a boss of now; with `raidOnly`, its raid tiers. */
function tiersOf(ctx: AppContext, chosen: ChosenPokemon, raidOnly = false): BossTier[] {
  const tiers: BossTier[] = [];
  const bosses = raidOnly ? ctx.raidBosses.bosses() : allBosses(ctx);
  for (const boss of bosses) {
    if (sameBoss(chosen, boss) && !tiers.some((tier) => sameBossTier(tier, boss.tier))) {
      tiers.push(boss.tier);
    }
  }
  return tiers;
}

/** Whether the Pokémon is a boss of the tier now. */
function isBoss(ctx: AppContext, chosen: ChosenPokemon, tier: BossTier): boolean {
  return tiersOf(ctx, chosen).some((one) => sameBossTier(one, tier));
}

/**
 * What an `add` or `autoset` that moves its boss says (plan 8X-J; review J2: an autoset moves as
 * an add does): the feed's tiers it leaves out (`familyReport`'s `moved`), a hide in force at one
 * of those tiers as no longer needed (review J3: only when the add moves), and the running
 * battles it moved with it in every server (Matt's answer 4, review J5: `BossTierMoves`), a raid
 * that would stand in the way of another at its gym counted apart (J1). Nothing when it moves
 * nothing. Removing the add moves nothing back.
 */
async function moveLines(ctx: AppContext, saved: BossOverride<BossTier>): Promise<string[]> {
  const reported = reportedOverrides(ctx);
  const added = reported.get(saved.id);
  const tier = saved.tier;
  if (!added || tier === null || added.moved.length === 0) return [];
  const { moved, key, movedNames } = added;
  const hides = [...reported.values()].filter(
    ({ override, key: hidden }) =>
      override.action === 'hide' &&
      override.tier !== null &&
      hidden === key &&
      moved.some((one) => override.tier !== null && sameBossTier(one, override.tier)),
  );
  const done = await ctx.bossMoves.move({
    boss: { key, names: movedNames },
    from: moved,
    to: tier,
  });
  return [
    `The feed lists it at ${bossTiersText(moved)}: ` +
      `${moved.length === 1 ? 'that one is' : 'those are'} left out while this lasts.`,
    ...hides.map(
      ({ override }) =>
        `Override #${String(override.id)} already hides it at ` +
        `${bossTierLabel(override.tier ?? tier)}: it is no longer needed.`,
    ),
    ...(done.moved > 0
      ? [`${count(done.moved, 'battle')} running ${done.moved === 1 ? 'was' : 'were'} moved.`]
      : []),
    ...(done.inTheWay > 0
      ? [
          `${count(done.inTheWay, 'raid')} running ${done.inTheWay === 1 ? 'was' : 'were'} left ` +
            'at its tier: at the new one it would stand in the way of another raid at its gym.',
        ]
      : []),
  ];
}

/** The answer: what was done, what to know about it, and the tier's list now. */
async function answer(
  interaction: ChatInputCommandInteraction,
  lines: readonly string[],
): Promise<void> {
  await interaction.editReply({ content: lines.join('\n') });
}

/** The `days` an `add` or `autoset` was given, and what to say about a default. */
function daysOf(interaction: ChatInputCommandInteraction): {
  days: number | null;
  defaulted: boolean;
} {
  const days = interaction.options.getInteger('days');
  return { days, defaulted: days === null };
}

const DEFAULTED =
  `It lapses after ${String(DEFAULT_DAYS)} days unless you give \`days\` (\`days:0\` for good), ` +
  'so it does not outlive the rotation.';

async function respondWithPokemon(
  interaction: Parameters<NonNullable<SubcommandPart['autocomplete']>>[0],
  ctx: AppContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  await interaction.respond(
    focused.name === 'pokemon' ? bossPokemonChoices(ctx, String(focused.value)) : [],
  );
}

/** `/admin boss add`. */
export const addBoss: SubcommandPart = {
  group: BOSS_GROUP,
  data: withDays(
    new SlashCommandSubcommandBuilder()
      .setName('add')
      .setDescription('Make a Pokémon a boss of a tier although the feed does not list it')
      .addStringOption(pokemonOption())
      .addStringOption(tierOption(true))
      .addBooleanOption((option) =>
        option.setName('shiny').setDescription('Whether it can be shiny (default: no)'),
      ),
    `For how many days (default ${String(DEFAULT_DAYS)}; 0 for good)`,
  ),
  help: {
    details:
      'For a boss the feed has not listed yet (a leak, an event) or lists wrongly. A max ' +
      'battle tier (Dynamax 1★ to 5★, Gigantamax) changes the max boss list where max battles ' +
      'are on.\n\nA boss has one tier at a time among the Dynamax tiers, the raid tiers (Elite ' +
      'included) and the shadow raid tiers: adding it at one of them moves it there, and the ' +
      "feed's listing of it at another tier of the same kind is left out while the add lasts " +
      '(Gigantamax and mega tiers are kinds of their own).\n\nBattles running at the tier it ' +
      'moved from, in every server, move with it, said in their posts; removing the add does ' +
      `not move them back (\`/boss\` fixes one battle). It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\`; \`days:0\` keeps ` +
      'it until you remove it with `/admin boss remove`. Adding it again replaces the earlier one.',
    examples: [
      '/admin boss add pokemon:Zekrom tier:T5',
      '/admin boss add pokemon:Mew tier:T5 days:3',
      '/admin boss add pokemon:Machamp tier:Gigantamax',
      '/admin boss add pokemon:Sneasel tier:Dynamax 2★ days:7',
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
    const tier = readTier(interaction.options.getString('tier', true));
    checkTier(chosen, tier);
    const listed = feedLists(ctx, chosen, tier);
    const { days, defaulted } = daysOf(interaction);
    const shiny = interaction.options.getBoolean('shiny');
    const saved = await store(interaction, ctx, chosen, {
      action: 'add',
      tier,
      shiny: shiny ?? false,
      expiresAt: expiryOf(days, DEFAULT_DAYS, Date.now()),
    });
    const hide = hiddenBy(ctx, chosen, tier);
    const moves = await moveLines(ctx, saved);
    await answer(interaction, [
      `${chosen.label} is a boss of ${bossTierLabel(tier)} (${numbered(saved)}).`,
      ...maxKindWarning(ctx, chosen, tier),
      ...(defaulted ? [DEFAULTED] : []),
      ...moves,
      ...(listed && moves.length === 0
        ? [
            'The feed lists it in that tier already, so this changes nothing while it does.' +
              (shiny === null
                ? ''
                : ' To change whether it can be shiny, use `/admin boss shiny`.'),
          ]
        : []),
      ...(hide
        ? [
            `It is hidden by override #${String(hide.id)}, so members do not see it until ` +
              'that is removed.',
          ]
        : []),
      tierNow(ctx, tier),
    ]);
  },
  autocomplete: respondWithPokemon,
};

/** `/admin boss hide`. */
export const hideBoss: SubcommandPart = {
  group: BOSS_GROUP,
  data: withDays(
    new SlashCommandSubcommandBuilder()
      .setName('hide')
      .setDescription('Take a boss off a tier although the feed lists it')
      .addStringOption(pokemonOption())
      .addStringOption(tierOption(true)),
    'For how many days (default: for good)',
  ),
  help: {
    details:
      'For a boss the feed lists wrongly or no longer has, in a raid or a max battle tier. It ' +
      'lasts until you remove it with `/admin boss remove`, or for `days`. A hidden boss beats ' +
      'one you added.',
    examples: ['/admin boss hide pokemon:Starmie tier:T3'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
    const tier = readTier(interaction.options.getString('tier', true));
    const was = isBoss(ctx, chosen, tier);
    const saved = await store(interaction, ctx, chosen, {
      action: 'hide',
      tier,
      shiny: null,
      expiresAt: expiryOf(interaction.options.getInteger('days'), null, Date.now()),
    });
    await answer(interaction, [
      `${chosen.label} is hidden from ${bossTierLabel(tier)} (${numbered(saved)}).`,
      ...maxKindWarning(ctx, chosen, tier),
      ...(was
        ? []
        : [
            `It was no boss of ${bossTierLabel(tier)}; it stays off the list if the feed lists ` +
              'it there.',
          ]),
      tierNow(ctx, tier),
    ]);
  },
  autocomplete: respondWithPokemon,
};

/** `/admin boss autoset`. */
export const autosetBossPart: SubcommandPart = {
  group: BOSS_GROUP,
  data: withDays(
    new SlashCommandSubcommandBuilder()
      .setName('autoset')
      .setDescription('Choose what eggs of a tier hatch as when nobody says')
      .addStringOption(pokemonOption())
      .addStringOption(tierOption(true, 'The raid tier', true)),
    `For how many days (default ${String(DEFAULT_DAYS)}; 0 for good)`,
  ),
  help: {
    details:
      'An egg of the tier hatches as this Pokémon when nobody says otherwise, and it is a boss ' +
      'of the tier. A tier with one boss does that by itself; this is for a tier with several.\n\n' +
      `It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\` (\`days:0\` for good). ` +
      'A tier has one choice: a new one replaces the earlier one, which then is no boss of the ' +
      "tier unless the feed lists it.\n\nIt moves the boss from the feed's tier as `add` does. " +
      'Raid tiers only: a max battle has no egg.',
    examples: ['/admin boss autoset pokemon:Yveltal tier:T5'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
    const tier = readRaidTier(interaction.options.getString('tier', true));
    checkTier(chosen, tier);
    const { days, defaulted } = daysOf(interaction);
    // The choice in force for the tier, which the new one replaces (`replacesOverride`).
    const earlier = [...reportedOverrides(ctx).values()].filter(
      ({ override }) =>
        override.action === 'autoset' &&
        override.tier !== null &&
        !isMaxBossTier(override.tier) &&
        sameRaidTier(override.tier, tier),
    );
    const saved = await store(interaction, ctx, chosen, {
      action: 'autoset',
      tier,
      shiny: null,
      expiresAt: expiryOf(days, DEFAULT_DAYS, Date.now()),
    });
    const hide = hiddenBy(ctx, chosen, tier);
    const moves = await moveLines(ctx, saved);
    const replaced = earlier
      .filter(({ override }) => override.id !== saved.id)
      .sort((a, b) => a.override.id - b.override.id)
      .map(
        ({ override, name }) =>
          `override #${String(override.id)} (${describeOverride(override, plain(name))})`,
      );
    await answer(interaction, [
      `Eggs of ${raidTierLabel(tier)} hatch as ${chosen.label} (${numbered(saved)}).`,
      ...(replaced.length > 0 ? [`It replaces ${replaced.join(', ')}.`] : []),
      ...(defaulted ? [DEFAULTED] : []),
      ...moves,
      ...(hide
        ? [
            `It is hidden by override #${String(hide.id)}, so this changes nothing until that ` +
              'is removed.',
          ]
        : []),
      tierNow(ctx, tier),
    ]);
  },
  autocomplete: respondWithPokemon,
};

/** `/admin boss shiny`. */
export const shinyBoss: SubcommandPart = {
  group: BOSS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('shiny')
    .setDescription('Say whether a boss can be shiny, whatever the feed says')
    .addStringOption(pokemonOption())
    .addBooleanOption((option) =>
      option.setName('can-be-shiny').setDescription('True: it can be shiny').setRequired(true),
    )
    .addStringOption(tierOption(false, 'Only in this tier (default: every raid tier)')),
  help: {
    details:
      'The feed says which bosses can be shiny; this overrides it until you remove it with ' +
      '`/admin boss remove`. One for a single tier beats one for every tier. Without a tier it ' +
      'covers the raid tiers; give a max battle tier for a max boss.',
    examples: [
      '/admin boss shiny pokemon:Yveltal can-be-shiny:True',
      '/admin boss shiny pokemon:Machamp can-be-shiny:True tier:Gigantamax',
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
    const value = interaction.options.getString('tier');
    const tier = value === null ? null : readTier(value);
    const shiny = interaction.options.getBoolean('can-be-shiny', true);
    const saved = await store(interaction, ctx, chosen, {
      action: 'shiny',
      tier,
      shiny,
      expiresAt: null,
    });
    const where = tier === null ? ', in any raid tier' : ` in ${bossTierLabel(tier)}`;
    const tiers =
      tier === null ? tiersOf(ctx, chosen, true) : isBoss(ctx, chosen, tier) ? [tier] : [];
    await answer(interaction, [
      `${chosen.label} ${shiny ? 'can be shiny' : 'is never shiny'}${where} (${numbered(saved)}).`,
      ...(tier === null ? [] : maxKindWarning(ctx, chosen, tier)),
      ...(tiers.length === 0
        ? [tier === null ? 'It is no boss now.' : `It is no boss of ${bossTierLabel(tier)} now.`]
        : tiers.map((one) => tierNow(ctx, one))),
    ]);
  },
  autocomplete: respondWithPokemon,
};

/** `/admin boss remove`. */
export const removeOverride: SubcommandPart = {
  group: BOSS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove one of your overrides of the boss lists')
    .addStringOption((option) =>
      option
        .setName('override')
        .setDescription('The override, by its number or from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'The list offers every override in force, of the raid and the max boss lists, with its ' +
      'number, what it does and when it lapses; `/admin boss list` shows them too. The boss ' +
      'list is then as the other overrides and the feed say.',
    examples: ['/admin boss remove override:3'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const typed = interaction.options.getString('override', true).trim();
    const id = OVERRIDE_CHOICE.exec(typed)?.[1];
    if (id === undefined) {
      throw new UserError('Pick an override from the list, or give its number (`3` or `#3`).');
    }
    const reported = reportedOverrides(ctx).get(Number(id));
    if (!reported) {
      throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
    }
    const { override } = reported;
    const max = override.tier !== null && isMaxBossTier(override.tier);
    const admin = max ? ctx.maxBossAdmin : ctx.raidBossAdmin;
    const removed = await admin.removeOverride(override.id);
    if (!removed) {
      throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
    }
    // An override for every raid tier (shiny) shows each raid tier its Pokémon is a boss of now.
    const tiers =
      override.tier === null
        ? tiersOf(ctx, { ids: override, entry: reported.entry, label: plain(reported.name) }, true)
        : [override.tier];
    await answer(interaction, [
      `Removed override #${id}: ${describeOverride(override, plain(reported.name))}.`,
      ...tiers.map((tier) => tierNow(ctx, tier)),
    ]);
  },
  async autocomplete(interaction, ctx) {
    const typed = interaction.options.getFocused().trim().toLowerCase();
    // A number is the override of that number; anything else is looked for in the text.
    const number = /^#?(\d{1,10})$/.exec(typed)?.[1];
    const zone = ctx.config.settings.timezone;
    const choices = [...reportedOverrides(ctx).values()]
      .sort((a, b) => a.override.id - b.override.id)
      .map(({ override, name }) => ({
        name:
          `#${String(override.id)} ${describeOverride(override, name)} · ` +
          (override.expiresAt === null ? 'for good' : `until ${isoDate(override.expiresAt, zone)}`),
        value: `id:${String(override.id)}`,
      }))
      .filter((choice) =>
        number === undefined
          ? choice.name.toLowerCase().includes(typed)
          : choice.value === `id:${number}`,
      )
      .slice(0, MAX_CHOICES)
      .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
    await interaction.respond(choices);
  },
};

/** The parts of `/admin boss` that change overrides, in the order Discord lists them. */
export const overrideParts: readonly SubcommandPart[] = [
  addBoss,
  hideBoss,
  autosetBossPart,
  shinyBoss,
  removeOverride,
];
