exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.boolean('mentions')
        .notNullable()
        .defaultTo(true);
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.dropColumn('mentions');
    })
  ])
};
