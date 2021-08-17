exports.up = function (knex) {
  return knex.schema
    .table('Pokemon', table => {
      table.string('nickname')
        .defaultTo('');
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('Pokemon', table => {
      table.dropColumn('nickname');
    });
};
