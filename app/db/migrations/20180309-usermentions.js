exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.boolean('mentions')
        .notNullable()
        .defaultTo(true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('mentions');
    });
};
