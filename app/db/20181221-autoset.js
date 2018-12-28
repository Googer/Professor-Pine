exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('AutosetPokemon', table => {
      table.increments('id')
        .primary();

      table.string('name', 100)
        .unique();

      table.integer('tier')
        .unsigned();
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('AutosetPokemon')
  ])
};
