import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { ASH, WANT_SERVER, WANTED_AT } from '../../../test/support/target-want-cases.js';
import { boxAnswer, wantBoxCases } from '../../../test/support/want-box-cases.js';
import { boxesOf } from '../../domain/pogo/species-answer.js';
import { fixtureForms } from '../../../test/support/wants.js';
import type { DB } from '../types.js';
import { PokemonNotificationRepository } from './pokemon-notification-repository.js';
import { TargetWantRepository } from './target-want-repository.js';
import { WantBoxRepository } from './want-box-repository.js';

describe('WantBoxRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
  });
  afterAll(async () => {
    await stop();
  });

  const fresh = async () => {
    await db.deleteFrom('TargetWant').execute();
    await db.deleteFrom('PokemonNotification').execute();
    const forms = fixtureForms();
    return {
      boxes: new WantBoxRepository(db, forms),
      wants: new PokemonNotificationRepository(db, forms),
      targets: new TargetWantRepository(db),
    };
  };

  wantBoxCases(fresh);

  it('runs two Submits of one member one after the other, under the member’s lock', async () => {
    const { boxes, wants, targets } = await fresh();
    const dratini = { subject: { kind: 'pokemon', dex: 147 }, wide: true } as const;
    const shown = ['raids', 'research', 'shadow'] as const;
    await Promise.all([
      boxes.set(ASH, WANT_SERVER, boxAnswer(dratini, ['raids', 'research'], { shown }), WANTED_AT),
      boxes.set(ASH, WANT_SERVER, boxAnswer(dratini, ['shadow', 'research'], { shown }), WANTED_AT),
    ]);
    // Whichever came last, each table holds what one Submit made: never a mix of rows doubled.
    const held = await boxes.held(ASH, WANT_SERVER, dratini);
    expect([
      ['raids', 'research'],
      ['research', 'shadow'],
    ]).toContainEqual([...boxesOf(held)].sort());
    expect((await targets.list(ASH, WANT_SERVER)).wants).toHaveLength(1);
    expect((await wants.list(ASH, WANT_SERVER)).wants).toHaveLength(1);
  });
});
