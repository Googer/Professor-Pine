exports.up = function (knex) {
  return knex.schema
    .createTable('SavedRoutes', table => {
      table.increments('id')
        .primary();

      table.integer('userId')
        .unsigned()
        .references('id')
        .inTable('User')
        .onDelete('cascade');

      table.string('name', 100);

      table.integer('region')
        .unsigned()
        .references('id')
        .inTable('Region')
        .onDelete('cascade');

      table.text('gyms');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('SavedRoutes');
};
