exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('Pokemon', table => {
      table.increments('id')
        .primary();

      table.string('name', 100)
        .unique();

      table.integer('tier')
        .unsigned()
        .defaultTo(0);

      table.boolean('exclusive')
        .defaultTo(false);
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('Pokemon')
  ])
};
