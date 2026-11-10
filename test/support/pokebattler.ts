import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readMaxTeam,
  type MaxTeamAnswer,
  type MaxTeamQuery,
} from '../../src/domain/counters/max-team.js';
import type { CounterQuery } from '../../src/domain/counters/options.js';
import type {
  CounterOutcome,
  CounterRequest,
  MaxTeamOutcome,
  MaxTeamRequest,
  PokebattlerGateway,
} from '../../src/services/pokebattler-gateway.js';
import {
  readCounterAnswer,
  type CounterAnswer,
} from '../../src/domain/counters/pokebattler-answer.js';

/**
 * Answers of Pokebattler's suggested max battle teams (`GET /max/parties/suggested/defenders/
 * <boss>/levels/<tier>?attack=a&heal=h&shield=s`), recorded on 2026-10-21 with Matt's go-ahead,
 * each kept whole as Pokebattler gave it, by `<boss>-<tier>-<attack>-<heal>-<shield>`: Uxie in
 * `RAID_LEVEL_5_MAX` with attack/heal/shield 3/0/0, 2/0/1, 1/0/2 and 1/2/0 (roles of before
 * plan 8X-I; none is one of Pokebattler's four, and the fake answers any role with any of them);
 * `uxie-d5-2-1-0-0` is two attackers and a charger (attack 2, meterCharge 1); Gigantamax Machamp
 * (`MACHAMP_GIGANTAMAX` in `RAID_LEVEL_6_MAX`) 2/0/1 and 1/1/1 (an attacker, a healer and a
 * shielder), and Duraludon in `RAID_LEVEL_4_MAX` 2/0/1, whose first attacker is
 * `MACHAMP_GIGANTAMAX`. Recorded on 2026-10-24 by the controller (plan 8X-I; level 40, no
 * weather, friendship 0), by all five counts `<boss>-<tier>-<attack>-<heal>-<shield>-<charge>-
 * <meterCharge>`: Azelf in `RAID_LEVEL_5_MAX` for each of Pokebattler's four roles, Attacker
 * 1-0-0-0-2 (Hydreigon; chargers Blissey and Metagross), Defensive 1-0-0-2-0 (Hydreigon;
 * defenders Gigalith and Zamazenta), Healer 0-1-0-2-0 (Blissey; defenders Gigalith and
 * Hydreigon), Shielder 0-0-3-0-0 (Blissey, Hydreigon, Lugia).
 */
export type RecordedMaxTeam =
  | 'uxie-d5-3-0-0'
  | 'uxie-d5-2-0-1'
  | 'uxie-d5-1-0-2'
  | 'uxie-d5-1-2-0'
  | 'gmax-machamp-2-0-1'
  | 'duraludon-d4-2-0-1'
  | 'uxie-d5-2-1-0-0'
  | 'gmax-machamp-1-1-1'
  | 'azelf-d5-1-0-0-0-2'
  | 'azelf-d5-1-0-0-2-0'
  | 'azelf-d5-0-1-0-2-0'
  | 'azelf-d5-0-0-3-0-0';

let maxTeams: Record<string, unknown> | undefined;

/** A recorded answer of Pokebattler's max battle teams (`RecordedMaxTeam`), as JSON read anew. */
export function recordedMaxTeam(name: RecordedMaxTeam): unknown {
  maxTeams ??= JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '../fixtures/pokebattler-max-teams.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
  // A copy, so that a test that changes it changes no other test's.
  return structuredClone(maxTeams[name]);
}

/** A moveset of a counter as Pokebattler writes it. */
export interface SampleResult {
  move1: string;
  move2: string;
  move3?: string;
  legacyDate?: string;
  /** Seconds the raid takes. */
  seconds: number;
  deaths?: number;
  estimator?: number;
}

/** A counter as Pokebattler writes it. */
export interface SampleCounter {
  pokemonId: string;
  cp?: number;
  name?: string;
  byMove: SampleResult[];
}

function rawCounter(counter: SampleCounter): unknown {
  return {
    pokemonId: counter.pokemonId,
    cp: counter.cp ?? 3000,
    ...(counter.name === undefined ? {} : { name: counter.name, userId: 777 }),
    byMove: counter.byMove.map((result) => ({
      move1: result.move1,
      move2: result.move2,
      ...(result.move3 === undefined ? {} : { move3: result.move3 }),
      ...(result.legacyDate === undefined ? {} : { legacyDate: result.legacyDate }),
      result: {
        effectiveCombatTime: result.seconds * 1000,
        effectiveDeaths: result.deaths ?? 5,
        tdo: 500,
        ...(result.estimator === undefined ? {} : { estimator: result.estimator }),
        win: true,
      },
    })),
  };
}

/**
 * An answer of Pokebattler's in its own shape (as checked live on 2026-10-14): the counters
 * against each moveset of the boss and against all of them averaged. Made by hand: no test
 * downloads one.
 */
export function pokebattlerAnswer(sample: {
  byMove?: { move1: string; move2: string; defenders: SampleCounter[] }[];
  average: SampleCounter[];
}): unknown {
  return {
    attackers: [
      {
        pokemonId: 'MEWTWO',
        byMove: (sample.byMove ?? []).map((moveset) => ({
          move1: moveset.move1,
          move2: moveset.move2,
          defenders: moveset.defenders.map(rawCounter),
          total: { win: true },
        })),
        randomMove: {
          move1: 'RANDOM',
          move2: 'RANDOM',
          defenders: sample.average.map(rawCounter),
        },
      },
    ],
    sort: 'TIME',
  };
}

/** A small answer for Mewtwo in a T5 raid: three counters, a shadow and a mega among them. */
export function mewtwoAnswer(): CounterAnswer {
  const counters: SampleCounter[] = [
    {
      pokemonId: 'TYRANITAR_SHADOW_FORM',
      byMove: [{ move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 100, estimator: 2.2 }],
    },
    {
      pokemonId: 'GENGAR_MEGA',
      byMove: [{ move1: 'LICK_FAST', move2: 'SHADOW_BALL', seconds: 110, estimator: 2.4 }],
    },
    {
      pokemonId: 'TYRANITAR',
      byMove: [
        { move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 120, estimator: 2.62 },
        { move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 125, estimator: 2.8 },
      ],
    },
    {
      pokemonId: 'DARKRAI',
      byMove: [
        {
          move1: 'SNARL_FAST',
          move2: 'SHADOW_BALL',
          legacyDate: '2023-01-01',
          seconds: 122,
          estimator: 2.7,
        },
      ],
    },
  ];
  const answer = readCounterAnswer(
    pokebattlerAnswer({
      byMove: [{ move1: 'CONFUSION_FAST', move2: 'PSYSTRIKE', defenders: counters.slice(2, 3) }],
      average: counters,
    }),
  );
  if (!answer) throw new Error('the sample answer could not be read');
  return answer;
}

/**
 * An answer that simulates these boss movesets, in this order (plan 8X-H: Pokebattler simulates
 * some 100 of Mew's 350), each with the same one counter, and their average.
 */
export function answerSimulating(
  movesets: readonly { fast: string; charged: string }[],
): CounterAnswer {
  const counter: SampleCounter = {
    pokemonId: 'TYRANITAR',
    byMove: [{ move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 120, estimator: 2.6 }],
  };
  const answer = readCounterAnswer(
    pokebattlerAnswer({
      byMove: movesets.map((moveset) => ({
        move1: moveset.fast,
        move2: moveset.charged,
        defenders: [counter],
      })),
      average: [counter],
    }),
  );
  if (!answer) throw new Error('the sample answer could not be read');
  return answer;
}

/**
 * Pokebattler as a test wants it: nothing leaves the process. Every request is recorded in
 * `asked`; it is answered with `answer` (by default `mewtwoAnswer()`) for any boss name of
 * `known` (every name when `known` is undefined), `unknown` for the others, or with `failing`.
 * Like the real one it tries the boss's names in turn, never throws and never answers in the
 * same turn of the event loop.
 */
export class FakePokebattler implements PokebattlerGateway {
  readonly asked: CounterQuery[] = [];
  answer: CounterAnswer = mewtwoAnswer();
  known: ReadonlySet<string> | undefined;
  failing: Extract<CounterOutcome, { ok: false }> | undefined;

  counters(request: CounterRequest): Promise<CounterOutcome> {
    let outcome: CounterOutcome = { ok: false, reason: 'unknown' };
    const { bosses, ...rest } = request;
    for (const boss of bosses) {
      const query: CounterQuery = { ...rest, boss };
      this.asked.push(query);
      if (this.failing) {
        outcome = this.failing;
        break;
      }
      if (this.known === undefined || this.known.has(boss)) {
        outcome = { ok: true, answer: this.answer, query };
        break;
      }
    }
    return later(outcome);
  }

  /** Max battle teams asked for (plan 8X-6), as `asked` for counters. */
  readonly maxAsked: MaxTeamQuery[] = [];
  /**
   * The team every known boss gets, whatever the role; by default the recorded Uxie of two
   * attackers and a charger (a test of one of Pokebattler's four roles sets its Azelf team).
   */
  maxAnswer: MaxTeamAnswer = recordedTeam('uxie-d5-2-1-0-0');

  /** Answered as `counters` is, with `maxAnswer`, `known` and `failing`. */
  maxTeam(request: MaxTeamRequest): Promise<MaxTeamOutcome> {
    let outcome: MaxTeamOutcome = { ok: false, reason: 'unknown' };
    const { bosses, ...rest } = request;
    for (const boss of bosses) {
      const query: MaxTeamQuery = { ...rest, boss };
      this.maxAsked.push(query);
      if (this.failing) {
        outcome = this.failing;
        break;
      }
      if (this.known === undefined || this.known.has(boss)) {
        outcome = { ok: true, answer: this.maxAnswer, query };
        break;
      }
    }
    return later(outcome);
  }
}

/** A recorded team as read by `readMaxTeam`. */
export function recordedTeam(name: RecordedMaxTeam): MaxTeamAnswer {
  const team = readMaxTeam(recordedMaxTeam(name));
  if (!team) throw new Error(`the recorded team ${name} could not be read`);
  return team;
}

/** Resolves in a later turn of the event loop, as an answer of the network would. */
function later<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve(value);
    });
  });
}
