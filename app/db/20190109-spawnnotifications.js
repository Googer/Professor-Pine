exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('PokemonNotification', table => {
      table.string('type')
        .notNullable()
        .defaultTo('both');
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('PokemonNotification', table => {
      table.dropColumn('type');
    })
  ])
};
