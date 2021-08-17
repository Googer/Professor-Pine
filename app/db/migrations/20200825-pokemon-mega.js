exports.up = function (knex) {
  return knex.schema
    .table('Pokemon', table => {
      table.boolean('mega')
        .defaultTo(false);
    })
    .table('AutosetPokemon', table => {
      table.string('tier', 10)
        .alter();
    })
    .then(() => knex('AutosetPokemon')
      .where('tier', '7')
      .update({
        'tier': 'ex'
      }))
    .then(() => knex('AutosetPokemon')
      .where('tier', '2')
      .update({
        'tier': '1'
      }))
    .then(() => knex('AutosetPokemon')
      .where('tier', '4')
      .update({
        'tier': '3'
      }))
    .then(() => knex('Pokemon')
      .where('tier', '2')
      .update({
        'tier': '1'
      }))
    .then(() => knex('Pokemon')
      .where('tier', '4')
      .update({
        'tier': '3'
      }))
    .then(() => knex('PokemonNotification')
      .where('pokemon', -2)
      .orWhere('pokemon', -4)
      .delete());
};

exports.down = async function (knex) {
  knex('AutosetPokemon')
    .where('tier', 'ex')
    .update({
      tier: 7
    })
    .then(() => knex('AutosetPokemon')
      .where('tier', 'mega')
      .delete())
    .then(() => knex.schema
      .table('AutosetPokemon', table => {
        table.integer('tier')
          .unsigned()
          .alter();
      })
      .table('Pokemon', table => {
        table.dropColumn('mega');
      }));
};
