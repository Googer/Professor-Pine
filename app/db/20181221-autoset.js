exports.up = function (knex) {
  return knex.schema
    .createTable('AutosetPokemon', table => {
      table.increments('id')
        .primary();

      table.string('name', 100)
        .unique();

      table.integer('tier')
        .unsigned();
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('AutosetPokemon');
};
