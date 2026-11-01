import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import {
  notARaidOrTrain,
  partyOf,
  raidOf,
  requireRaid,
  requireRaidOrTrain,
} from '../../discord/guards.js';
import {
  isMax,
  isRaid,
  isTrain,
  type RaidBossRef,
  type TrainParty,
} from '../../domain/party/party.js';
import { changeMaxBoss } from '../max/max-changes.js';
import { maxBossOptions, TIER_CHOICES } from '../max/max-input.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { battleKindOf } from '../../domain/pogo/max-tier.js';
import { problemText } from '../../render/activity.js';
import { truncate } from '../../render/text.js';
import { MAX_CHOICES } from '../choices.js';
import { commandParty, commandRaid, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE, changingMember, IN_A_RAID_POST, replyRaidChange } from './change.js';
import { changeRaidBoss, changeRaidMoves, movesOf } from './raid-changes.js';
import { bossChoices, trainBoss, trainBossChoices } from './raid-input.js';

/** What a member is told who gives a train the tier of an egg. */
const NO_TIER =
  'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.';

/** What a member is told who gives `tier:` in the post of a raid or a train (plan 8X-F). */
const TIER_FOR_MAX_ONLY =
  '`tier:` is for a max battle whose boss is on no list. Leave it out here.';

/** The words that take the boss off a train again. */
const NO_BOSS = new Set(['none', 'cancel', 'unset', 'clear']);

/**
 * `/boss` in the post of a train: which Pokémon the train is after, for the picture and what
 * the post says about that boss. A train has no tier (it goes from raid to raid): a tier before
 * a name is ignored and the tier of an egg is refused, and the Pokémon need not be a boss right
 * now (`trainBoss`). `none` takes the boss off again.
 */
async function setTrainBoss(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TrainParty,
  text: string,
): Promise<void> {
  const member = changingMember(interaction);
  let change: { boss: RaidBossRef | null; label: string };
  if (NO_BOSS.has(text.trim().toLowerCase())) {
    change = { boss: null, label: '' };
  } else {
    change = trainBoss(ctx, text, NO_TIER);
  }
  const outcome = await ctx.trains.setBoss(party.id, member, change);
  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
  if (outcome.kind === 'refused') {
    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
  }
  const said =
    change.boss === null
      ? outcome.changed
        ? 'This train is after no boss any more.'
        : 'This train was after no boss.'
      : outcome.changed
        ? `This train is now after ${change.label}.`
        : `This train is after ${change.label} already.`;
  await interaction.reply({ content: said, flags: MessageFlags.Ephemeral });
}

export const boss: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('boss')
    .setDescription(
      'Set the boss of this raid or max battle, the tier of an egg, or the boss a train is after',
    )
    .addStringOption((option) =>
      option
        .setName('pokemon')
        .setDescription("The boss, or the tier of a raid's egg: pick from the list")
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('tier')
        .setDescription('Max battles only: the tier of a boss on no list')
        .addChoices(...TIER_CHOICES),
    ),
  help: {
    category: 'raid-crud',
    details:
      'For an egg whose boss is known now, or a raid that was reported wrongly. The times stay ' +
      'as they are: naming the boss does not hatch the egg.\n\nA boss that has only one fast or ' +
      `one charged move gets it set. ${IN_A_RAID_POST}\n\nIn the post of a train: says which ` +
      'Pokémon the train is after, which the post then shows with its weaknesses and catch ' +
      'CP. It may be any Pokémon, also one that is no boss right now; a train has no tier, ' +
      'and `none` takes the boss off again.\n\nIn the post of a max battle: the boss of the ' +
      'rotation, picked from the max bosses (its tier follows it); a Dynamax boss on no list ' +
      'needs `tier:`, as with `/max`. A Dynamax battle cannot become a Gigantamax one, nor ' +
      'the other way round.',
    examples: ['/boss pokemon:yveltal', '/boss pokemon:t3', '/boss pokemon:alakazam tier:D4'],
  },
  guards: [requireRaidOrTrain],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const here = commandParty(interaction, ctx);
    const text = interaction.options.getString('pokemon', true);
    const tier = interaction.options.getString('tier');
    if (isMax(here)) {
      await changeMaxBoss(interaction, ctx, here, text, tier);
      return;
    }
    // Nothing was changed: the use is given back (final review of 8X-F, F6).
    if (tier !== null) throw new UserError(TIER_FOR_MAX_ONLY, { givesBack: true });
    if (isTrain(here)) {
      await setTrainBoss(interaction, ctx, here, text);
      return;
    }
    if (!isRaid(here)) throw new UserError(notARaidOrTrain(here));
    await replyRaidChange(
      interaction,
      await changeRaidBoss(ctx, here, changingMember(interaction), text),
    );
  },
  async autocomplete(interaction, ctx) {
    const typed = interaction.options.getFocused();
    // A train has no tier: its list has no eggs, and any Pokémon after the current bosses.
    const here = partyOf(interaction, ctx);
    await interaction.respond(
      here && isTrain(here)
        ? trainBossChoices(ctx, typed)
        : here && isMax(here)
          ? maxBossOptions(ctx, typed, Date.now(), battleKindOf(here.max.tier))
          : bossChoices(ctx, typed),
    );
  },
};

/** The boss of the raid an interaction is in, when the game master knows its moves. */
function bossEntry(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): PokemonEntry | undefined {
  const party = raidOf(interaction, ctx);
  return party ? ctx.partyService.view(party).boss?.entry : undefined;
}

export const moveset: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('moveset')
    .setDescription('Set the moves of the boss of this raid')
    .addStringOption((option) =>
      option
        .setName('quick')
        .setDescription('The fast move: pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('charge')
        .setDescription('The charged move: pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'Give one move or both; what you leave out stays as it is. The lists show the moves the ' +
      `boss can have. ${IN_A_RAID_POST}`,
    examples: ['/moveset quick:snarl charge:dark pulse', '/moveset charge:hurricane'],
  },
  guards: [requireRaid],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandRaid(interaction, ctx);
    await replyRaidChange(
      interaction,
      await changeRaidMoves(
        ctx,
        party,
        changingMember(interaction),
        interaction.options.getString('quick'),
        interaction.options.getString('charge'),
      ),
    );
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    const entry = bossEntry(interaction, ctx);
    if (!entry || (focused.name !== 'quick' && focused.name !== 'charge')) {
      await interaction.respond([]);
      return;
    }
    const typed = focused.value.trim().toLowerCase();
    const choices = movesOf(entry, focused.name)
      .map((id) => ({ name: ctx.gameData.catalogue.move(id)?.name ?? id, value: id }))
      .filter((choice) => choice.name.toLowerCase().includes(typed) && choice.value.length <= 100)
      .slice(0, MAX_CHOICES)
      .map((choice) => ({ ...choice, name: truncate(choice.name, 100) }));
    await interaction.respond(choices);
  },
};
