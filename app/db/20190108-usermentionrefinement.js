exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.boolean('shouts')
        .notNullable()
        .defaultTo(true);

      table.boolean('groups')
        .notNullable()
        .defaultTo(true);
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.dropColumn('shouts');
      table.dropColumn('groups');
    })
  ])
};
