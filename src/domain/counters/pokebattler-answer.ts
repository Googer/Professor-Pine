import { z } from 'zod';

/**
 * What is used of Pokebattler's answer to a raid simulation (its shape checked live on
 * 2026-10-14: 1.75 MB for Mewtwo in a T5 raid at level 40). `attackers[0]` holds `byMove`, one
 * entry per moveset of the boss, and `randomMove`, the same averaged over the boss's movesets.
 * Each lists `defenders` (the Pokémon that fight the boss, Pokebattler's word), each with its
 * own movesets and their results.
 */

/** One moveset of a counter, and how it fares. */
export interface CounterResult {
  /** Move ids as the game master writes them (`CONFUSION_FAST`, `PSYSTRIKE`). */
  fast: string;
  charged: string;
  /** A second charged move (a Pokébox's Pokémon can have one); null otherwise. */
  third: string | null;
  /** A move the Pokémon can no longer learn (Pokebattler's `legacyDate`). */
  legacy: boolean;
  /** How long the raid takes, in milliseconds (`effectiveCombatTime`). */
  timeMs: number;
  /** How often a counter faints on average (`effectiveDeaths`). */
  deaths: number;
  /** How many trainers it takes with this counter (`estimator`); null when not given. */
  estimator: number | null;
}

/** A Pokémon that fights the boss (Pokebattler's "defender"). */
export interface Counter {
  /** Pokebattler's name of the Pokémon (`MEWTWO`, `MACHAMP_SHADOW_FORM`, `RAYQUAZA_MEGA`). */
  pokemonId: string;
  cp: number | null;
  /** The name a trainer gave it, for a Pokémon of a Pokébox; null otherwise. */
  nickname: string | null;
  results: CounterResult[];
}

/** The counters against one moveset of the boss, or against all of them averaged. */
export interface BossMovesetCounters {
  /** The boss's moves; null for the average. */
  fast: string | null;
  charged: string | null;
  counters: Counter[];
}

export interface CounterAnswer {
  /** One per moveset of the boss Pokebattler knows. */
  byMoveset: BossMovesetCounters[];
  /** Averaged over the boss's movesets; undefined when the answer has none. */
  average: BossMovesetCounters | undefined;
}

const resultSchema = z.object({
  move1: z.string().min(1),
  move2: z.string().min(1),
  move3: z.string().min(1).nullish(),
  legacyDate: z.unknown().optional(),
  result: z.object({
    effectiveCombatTime: z.number().finite().nonnegative(),
    effectiveDeaths: z.number().finite().nonnegative(),
    estimator: z.number().finite().positive().nullish(),
  }),
});

const counterSchema = z.object({
  pokemonId: z.string().min(1).max(100),
  cp: z.number().finite().nullish(),
  name: z.string().nullish(),
  byMove: z.array(z.unknown()),
});

const bossMovesetSchema = z.object({
  move1: z.string().min(1).nullish(),
  move2: z.string().min(1).nullish(),
  defenders: z.array(z.unknown()),
});

const answerSchema = z.object({
  attackers: z
    .array(
      z.object({
        byMove: z.array(z.unknown()).nullish(),
        randomMove: z.unknown().optional(),
      }),
    )
    .min(1),
});

/** A value of a list that does not fit is left out; the rest of the list is read. */
function each<T>(values: readonly unknown[], schema: z.ZodType<T>): T[] {
  const read: T[] = [];
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (parsed.success) read.push(parsed.data);
  }
  return read;
}

function counterOf(raw: z.infer<typeof counterSchema>): Counter | undefined {
  const results = each(raw.byMove, resultSchema).map((moveset): CounterResult => ({
    fast: moveset.move1,
    charged: moveset.move2,
    third: moveset.move3 ?? null,
    legacy:
      moveset.legacyDate !== undefined &&
      moveset.legacyDate !== null &&
      moveset.legacyDate !== '' &&
      moveset.legacyDate !== 0,
    timeMs: moveset.result.effectiveCombatTime,
    deaths: moveset.result.effectiveDeaths,
    estimator: moveset.result.estimator ?? null,
  }));
  if (results.length === 0) return undefined;
  const nickname = raw.name?.trim() ?? '';
  return {
    pokemonId: raw.pokemonId,
    cp: raw.cp ?? null,
    nickname: nickname === '' ? null : nickname,
    results,
  };
}

function bossMovesetOf(value: unknown): BossMovesetCounters | undefined {
  const parsed = bossMovesetSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const counters = each(parsed.data.defenders, counterSchema)
    .map(counterOf)
    .filter((counter): counter is Counter => counter !== undefined);
  return {
    fast: parsed.data.move1 ?? null,
    charged: parsed.data.move2 ?? null,
    counters,
  };
}

/**
 * Reads Pokebattler's answer, checked for the fields used. A moveset or counter that does not
 * fit is left out and the rest is read; undefined for an answer not of this shape. An answer
 * may have no counter at all (`hasCounters`): a Pokébox with nothing that can fight, or a name
 * Pokebattler answers for without knowing it.
 */
export function readCounterAnswer(body: unknown): CounterAnswer | undefined {
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const [attackers] = parsed.data.attackers;
  if (!attackers) return undefined;
  const byMoveset = (attackers.byMove ?? [])
    .map(bossMovesetOf)
    .filter(
      (moveset): moveset is BossMovesetCounters =>
        moveset !== undefined && moveset.fast !== null && moveset.charged !== null,
    );
  const average =
    attackers.randomMove === undefined ? undefined : bossMovesetOf(attackers.randomMove);
  return {
    byMoveset,
    average: average ? { ...average, fast: null, charged: null } : undefined,
  };
}

/** Whether an answer lists any counter at all. */
export function hasCounters(answer: CounterAnswer): boolean {
  return [...answer.byMoveset, ...(answer.average ? [answer.average] : [])].some(
    (moveset) => moveset.counters.length > 0,
  );
}
