exports.up = function (knex) {
  return knex.schema
    .table('Pokemon', table => {
      table.boolean('shiny')
        .defaultTo(false);
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('Pokemon', table => {
      table.dropColumn('shiny');
    });
};
