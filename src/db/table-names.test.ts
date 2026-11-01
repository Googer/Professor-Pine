import { describe, expect, it } from 'vitest';
import { canonicalRenames } from './table-names.js';

// That PINE_TABLES knows every table the migrations make is checked by restore.db.test.ts.

describe('canonicalRenames', () => {
  it('renames the lower-case names of a dump from Windows to the names the bot uses', () => {
    expect(
      canonicalRenames(['guild', 'gymmeta', 'knex_migrations', 'pokemonnotification', 'user']),
    ).toEqual([
      { from: 'guild', to: 'Guild' },
      { from: 'gymmeta', to: 'GymMeta' },
      { from: 'pokemonnotification', to: 'PokemonNotification' },
      { from: 'user', to: 'User' },
    ]);
  });

  it('leaves the right names, and tables it does not know, alone', () => {
    expect(canonicalRenames(['Guild', 'GymMeta', 'kysely_migration', 'notes'])).toEqual([]);
  });

  it('leaves a lower-case table alone when the right name is there too', () => {
    expect(canonicalRenames(['Guild', 'guild', 'party'])).toEqual([{ from: 'party', to: 'Party' }]);
  });
});
