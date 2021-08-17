exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.boolean('shouts')
        .notNullable()
        .defaultTo(true);

      table.boolean('groups')
        .notNullable()
        .defaultTo(true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('shouts');
      table.dropColumn('groups');
    });
};
