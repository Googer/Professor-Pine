exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('Pokemon', table => {
      table.string('name', 100)
        .primary();

      table.integer('tier')
        .unsigned();
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('Pokemon')
  ])
};
