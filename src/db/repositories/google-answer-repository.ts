import { sql, type Kysely } from 'kysely';
import type {
  AnswerKind,
  GoogleAnswer,
  GoogleAnswerStorage,
} from '../../services/google-answers.js';
import type { DB } from '../types.js';

/** As many answers as one statement writes. */
const CHUNK = 500;

/**
 * As many answers as one statement deletes: an `or` of keys, which MySQL turns into ranges of
 * the primary key up to `range_optimizer_max_mem_size` (8 MB by default, far above this).
 */
const REMOVE_CHUNK = 200;

function answerKind(kind: string): AnswerKind {
  return kind === 'places' ? 'places' : 'address';
}

/**
 * Google's answers by the point and the kind of question (`GoogleAnswer`, migration 059; plan
 * 19B-3). Its twin is `MemoryGoogleAnswerStorage`; both run `googleAnswerCases`.
 */
export class GoogleAnswerRepository implements GoogleAnswerStorage {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Every answer, read once at start (`GoogleAnswers.load`), as the gyms and Wayspots are read
   * whole: a table bounded by the places of the instance's gyms and Wayspots (what none of them
   * shows any more is dropped daily, `GoogleAnswers.sweep`, through `remove`).
   */
  async all(): Promise<GoogleAnswer[]> {
    const rows = await this.db
      .selectFrom('GoogleAnswer')
      .select(['kind', 'lat', 'lon', 'answer', 'askedAt'])
      .execute();
    return rows.map((row) => ({
      kind: answerKind(row.kind),
      lat: row.lat,
      lon: row.lon,
      answer: row.answer,
      askedAt: Number(row.askedAt),
    }));
  }

  /** Each answer over the one at its kind and point (the primary key). */
  async save(answers: readonly GoogleAnswer[]): Promise<void> {
    for (let start = 0; start < answers.length; start += CHUNK) {
      await this.db
        .insertInto('GoogleAnswer')
        .values(
          answers.slice(start, start + CHUNK).map((answer) => ({
            kind: answer.kind,
            lat: answer.lat,
            lon: answer.lon,
            answer: answer.answer,
            askedAt: String(answer.askedAt),
          })),
        )
        .modifyEnd(sql`as new on duplicate key update answer = new.answer, askedAt = new.askedAt`)
        .execute();
    }
  }

  /**
   * Each answer by the primary key (`kind`, `lat`, `lon`: one row each, an equality on the whole
   * key per answer, `or`-ed: a range of the primary key, explain test), and only while its
   * `askedAt` is the one given.
   */
  async remove(answers: readonly GoogleAnswer[]): Promise<void> {
    for (let start = 0; start < answers.length; start += REMOVE_CHUNK) {
      const chunk = answers.slice(start, start + REMOVE_CHUNK);
      await this.db
        .deleteFrom('GoogleAnswer')
        .where((eb) =>
          eb.or(
            chunk.map((answer) =>
              eb.and([
                eb('kind', '=', answer.kind),
                eb('lat', '=', answer.lat),
                eb('lon', '=', answer.lon),
                eb('askedAt', '=', String(answer.askedAt)),
              ]),
            ),
          ),
        )
        .execute();
    }
  }
}
