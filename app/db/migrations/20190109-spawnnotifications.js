exports.up = function (knex) {
  return knex.schema
    .table('PokemonNotification', table => {
      table.string('type')
        .notNullable()
        .defaultTo('both');
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('PokemonNotification', table => {
      table.dropColumn('type');
    });
};
