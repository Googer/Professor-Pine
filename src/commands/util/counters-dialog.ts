import {
  ComponentType,
  MessageFlags,
  type APIModalInteractionResponseCallbackData,
  type APISelectMenuOption,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard } from '../../discord/command.js';
import { decodeCustomId, encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { answerPress, deferPress, pressAnswer } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
import {
  ATTACKER_LEVEL_NAMES,
  ATTACKER_LEVELS,
  FRIENDSHIP_NAMES,
  FRIENDSHIPS,
  isCounterWeather,
  isFriendship,
  WEATHER_NAMES,
  WEATHERS,
} from '../../domain/counters/options.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import { cutText } from '../../render/party-post.js';
import {
  answeredMessage,
  askPokebattler,
  attackersOf,
  AVERAGE_MOVESET,
  bossMovesets,
  bossNamed,
  COUNTERS_ACTIONS,
  COUNTERS_KIND,
  COUNTERS_THROTTLE,
  keptCounters,
  movesetName,
  movesetValue,
  POKEBOX,
  pokebattlerTarget,
  serverOf,
  isKeptMax,
  isMaxPlan,
  type AnyCounterPlan,
  type CounterPlan,
  type KeptAnswer,
  type KeptCounters,
} from './counters.js';
import { maxCountersDialog, maxDialogPlan } from './max-counters.js';
import { NOT_YOURS } from '../../services/pending-requests.js';

/** What a press is told when the options of an answer are no longer kept. */
export const NOT_KEPT = 'These options are no longer kept. Use `/counters` again.';

/** The custom ids of the inputs of the dialog. */
const INPUTS = {
  attackers: 'attackers',
  weather: 'weather',
  friendship: 'friendship',
  moveset: 'moveset',
  also: 'also',
} as const;

/** The values of the checkboxes of "Also list". */
const ALSO = { shadow: 'shadow', mega: 'mega', single: 'single' } as const;

/** What a modal's title, a select menu and an option hold. */
const TITLE_ROOM = 45;
const MAX_OPTIONS = 25;
const OPTION_TEXT = 100;

const choice = (label: string, value: string, selected: boolean): APISelectMenuOption => ({
  label: cutText(label, OPTION_TEXT),
  value,
  ...(selected ? { default: true } : {}),
});

/**
 * The options of "Boss moves": the average, then the boss's movesets, at most 25 in all; the
 * current one is always among them (in the place of the last that fits when it is further down).
 * A kept moveset the boss no longer has (the game data changed) leaves the average selected.
 */
function movesetOptions(
  ctx: AppContext,
  entry: PokemonEntry,
  current: KeptCounters['moveset'],
): APISelectMenuOption[] {
  const all = bossMovesets(ctx.gameData.catalogue, entry);
  const kept = current ? `${current.fast}/${current.charged}` : AVERAGE_MOVESET;
  const currentValue = all.some((moveset) => movesetValue(moveset) === kept)
    ? kept
    : AVERAGE_MOVESET;
  let shown = all.slice(0, MAX_OPTIONS - 1);
  const missing = all.find(
    (moveset) =>
      movesetValue(moveset) === currentValue &&
      !shown.some((other) => movesetValue(other) === currentValue),
  );
  if (missing) shown = [...shown.slice(0, MAX_OPTIONS - 2), missing];
  return [
    choice('The average of all its movesets', AVERAGE_MOVESET, currentValue === AVERAGE_MOVESET),
    ...shown.map((moveset) =>
      choice(movesetName(moveset), movesetValue(moveset), movesetValue(moveset) === currentValue),
    ),
  ];
}

function selectLabel(
  label: string,
  customId: string,
  options: APISelectMenuOption[],
): APIModalInteractionResponseCallbackData['components'][number] {
  return {
    type: ComponentType.Label,
    label,
    component: { type: ComponentType.StringSelect, custom_id: customId, options },
  };
}

/**
 * The dialog of "Change options…" (plan 8B-2): five labels, the most a modal holds, each with
 * what the answer had chosen: the attackers (the levels, and the presser's Pokébox when their
 * settings have a Pokebattler id), the weather, the friendship, the boss's moves, and "Also
 * list" (shadow Pokémon, megas, every moveset of a counter) as checkboxes.
 */
export function countersDialog(
  ctx: AppContext,
  dialogId: string,
  kept: KeptCounters,
  entry: PokemonEntry,
  hasBox: boolean,
): APIModalInteractionResponseCallbackData {
  const box = kept.attackers.kind === 'box' && hasBox;
  const level = kept.attackers.kind === 'level' ? kept.attackers.level : undefined;
  return {
    custom_id: dialogId,
    title: cutText(`Counters for ${entry.name}`, TITLE_ROOM),
    components: [
      selectLabel('Attackers', INPUTS.attackers, [
        ...ATTACKER_LEVELS.map((each) =>
          // A Pokébox answer opened by a member without a Pokébox: the usual level.
          choice(
            ATTACKER_LEVEL_NAMES[each],
            each,
            each === level || (level === undefined && !box && each === '40'),
          ),
        ),
        ...(hasBox ? [choice('My Pokébox on Pokebattler', POKEBOX, box)] : []),
      ]),
      selectLabel(
        'Weather',
        INPUTS.weather,
        WEATHERS.map((each) => choice(WEATHER_NAMES[each], each, each === kept.weather)),
      ),
      selectLabel(
        'Friendship',
        INPUTS.friendship,
        FRIENDSHIPS.map((each) => choice(FRIENDSHIP_NAMES[each], each, each === kept.friendship)),
      ),
      selectLabel('Boss moves', INPUTS.moveset, movesetOptions(ctx, entry, kept.moveset)),
      {
        type: ComponentType.Label,
        label: 'Also list',
        component: {
          type: ComponentType.CheckboxGroup,
          custom_id: INPUTS.also,
          required: false,
          min_values: 0,
          max_values: 3,
          options: [
            { label: 'Shadow Pokémon', value: ALSO.shadow, default: kept.shadow },
            { label: 'Megas', value: ALSO.mega, default: kept.mega },
            { label: 'Every moveset of a counter', value: ALSO.single, default: kept.single },
          ],
        },
      },
    ],
  };
}

/** The boss of kept options, as the game data and the server's search have it now. */
function keptBoss(ctx: AppContext, serverId: string | null, kept: KeptAnswer): PokemonEntry {
  const entry =
    ctx.gameData.catalogue.byKey(kept.bossKey) ??
    (isKeptMax(kept) ? undefined : bossNamed(ctx, serverId, kept.bossName));
  if (!entry) throw new UserError(NOT_KEPT);
  return entry;
}

/** The one value of a select menu of the dialog. */
function picked(interaction: ModalSubmitInteraction, id: string): string | undefined {
  const [value] = interaction.fields.getStringSelectValues(id);
  return value;
}

/** The boxes of "Also list" a submit ticked; a form without the group counts as none ticked. */
function tickedBoxes(interaction: ModalSubmitInteraction): readonly string[] {
  try {
    return interaction.fields.getCheckboxGroup(INPUTS.also);
  } catch {
    return [];
  }
}

/**
 * The plan a submitted dialog asks for: the boss and the tier of the answer, everything else as
 * the dialog says. Refuses what does not fit as the command does (a Pokébox for a member who has
 * saved no Pokebattler id: the same sentence).
 */
async function dialogPlan(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  kept: KeptCounters,
): Promise<CounterPlan> {
  const entry = keptBoss(ctx, interaction.guildId, kept);
  const { raidLevel, bosses } = pokebattlerTarget(entry, kept.tier);
  const weather = picked(interaction, INPUTS.weather) ?? '';
  const friendship = picked(interaction, INPUTS.friendship) ?? '';
  if (!isCounterWeather(weather) || !isFriendship(friendship)) {
    throw new UserError('Pick the weather and the friendship from their lists.');
  }
  const movesetText = picked(interaction, INPUTS.moveset) ?? AVERAGE_MOVESET;
  const moveset =
    movesetText === AVERAGE_MOVESET
      ? undefined
      : bossMovesets(ctx.gameData.catalogue, entry).find(
          (each) => movesetValue(each) === movesetText,
        );
  if (movesetText !== AVERAGE_MOVESET && !moveset) {
    throw new UserError('Pick the boss moves from their list.');
  }
  const attackers = await attackersOf(
    picked(interaction, INPUTS.attackers) ?? null,
    interaction.user.id,
    ctx,
  );
  const also = new Set(tickedBoxes(interaction));
  return {
    kind: 'raid',
    entry,
    tier: kept.tier,
    raidLevel,
    bosses,
    attackers,
    weather,
    friendship,
    moveset,
    shadow: also.has(ALSO.shadow),
    mega: also.has(ALSO.mega),
    single: also.has(ALSO.single),
  };
}

/**
 * What a submitted dialog asks for is refused here when it does not fit (options no longer kept,
 * a Pokébox without a saved id, a boss moveset or a weather not of the lists), before the submit
 * counts against the three of a minute: a refusal is no simulation.
 */
const requireDialogPlan: Guard = async (interaction, ctx) => {
  if (!interaction.isModalSubmit()) return;
  const id = decodeCustomId(interaction.customId);
  if (id?.action !== COUNTERS_ACTIONS.dialog) return;
  await anyDialogPlan(interaction, ctx, dialogKept(interaction, id));
};

/**
 * The options kept under an answer's token, asked from where the interaction came from (plan
 * 19B-4): those of another server are no longer kept there.
 */
function keptFor(interaction: { guildId: string | null }, token: string): KeptAnswer {
  const kept = keptCounters.of(token, interaction);
  if (!kept) throw new UserError(NOT_KEPT);
  return kept;
}

/**
 * The id of the dialog of Change options… (plan 19B-4): the answer's token, and the member who
 * opened it, whose Submit alone it takes (`dialogKept`). Nothing is kept per press.
 */
function dialogIdOf(token: string, openerId: string): string {
  return encodeCustomId({
    kind: COUNTERS_KIND,
    id: token,
    action: COUNTERS_ACTIONS.dialog,
    args: [openerId],
  });
}

/** The options of a submitted dialog: of its answer, in its server, submitted by its opener. */
function dialogKept(interaction: ModalSubmitInteraction, id: CustomId): KeptAnswer {
  const kept = keptFor(interaction, id.id);
  if (id.args[0] !== interaction.user.id) throw new UserError(NOT_YOURS);
  return kept;
}

/** The plan of a submitted dialog: of a max battle answer's (plan 8X-6), or of a raid answer's. */
async function anyDialogPlan(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  kept: KeptAnswer,
): Promise<AnyCounterPlan> {
  if (isKeptMax(kept)) {
    return maxDialogPlan(
      interaction,
      keptBoss(ctx, interaction.guildId, kept),
      kept,
      ctx.gameData.catalogue,
    );
  }
  return dialogPlan(interaction, ctx, kept);
}

/**
 * "Change options…" under an answer of `/counters` and its dialog (plan 8B-2; custom ids
 * `counters:<token>:options` and `counters:<token>:dialog:<opener id>`, the token that of the
 * answer's kept options, `keptCounters`, of the answer's server only: plan 19B-4). Anybody who
 * sees an answer may open its dialog, which is theirs: its custom id names the member who opened
 * it, whose Submit alone it takes (`NOT_YOURS`), and nothing is kept per press. A
 * submitted dialog runs a new simulation (counted with the command's uses in `COUNTERS_THROTTLE`; opening the
 * dialog is not counted, nor is a submit the guard refuses) and answers
 * as `pressAnswer` says: the member who asked changes their public answer, anybody else gets a
 * private copy; a Pokébox is shown privately only, and a public answer whose party has ended is
 * never edited (its post is archived). The new answer keeps its own options under a new token;
 * the old token stays good for its message. A failure is a private sentence.
 */
export const countersControls: ComponentHandler = {
  kind: COUNTERS_KIND,
  guards: [requireDialogPlan],
  // A submit runs `/counters` again: it counts in the command's own window (Pokebattler's three
  // a minute, command and submits together). Opening the dialog only reads: it counts in a window
  // of its own, as the controls of `/rank` do.
  throttle: (_interaction, id) =>
    id.action === COUNTERS_ACTIONS.dialog
      ? { ...COUNTERS_THROTTLE, as: 'counters' }
      : id.action === COUNTERS_ACTIONS.options
        ? MEMBER_READ_THROTTLE
        : undefined,
  async button(interaction, id, ctx) {
    if (id.action !== COUNTERS_ACTIONS.options) throw new UserError(STALE_COMPONENT);
    const kept = keptFor(interaction, id.id);
    const entry = keptBoss(ctx, interaction.guildId, kept);
    // The dialog is the presser's: it names them beside the answer's token.
    const dialogId = dialogIdOf(id.id, interaction.user.id);
    if (isKeptMax(kept)) {
      await interaction.showModal(maxCountersDialog(dialogId, kept, entry));
      return;
    }
    const hasBox = (await ctx.users.get(interaction.user.id)).pokebattlerId !== null;
    await interaction.showModal(countersDialog(ctx, dialogId, kept, entry, hasBox));
  },
  async modal(interaction, id, ctx) {
    if (id.action !== COUNTERS_ACTIONS.dialog) throw new UserError(STALE_COMPONENT);
    const kept = dialogKept(interaction, id);
    // Read again after the guard, which refused what does not fit before the use was counted.
    const plan = await anyDialogPlan(interaction, ctx, kept);
    const postGone = (): boolean =>
      kept.partyId !== null && ctx.parties.get(kept.partyId) === undefined;
    let how = pressAnswer(interaction, {
      onlyPrivate: !isMaxPlan(plan) && plan.attackers.kind === 'box',
    });
    if (how === 'update' && postGone()) how = 'copy';
    await deferPress(interaction, how);
    const answered = await askPokebattler(ctx, plan);
    // The party may have ended while Pokebattler was asked: its archived post is left alone, and
    // the answer is the member's.
    const gone = how === 'update' && postGone();
    const changed = how === 'update' && !gone;
    const message = answeredMessage(ctx, answered, {
      guildId: serverOf(interaction),
      askerId: changed ? kept.askerId : interaction.user.id,
      partyId: changed ? kept.partyId : null,
    });
    if (gone) {
      await interaction.followUp({
        components: message.components,
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
      return;
    }
    await answerPress(interaction, how, message);
  },
};
