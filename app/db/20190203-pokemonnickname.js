exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('Pokemon', table => {
      table.string('nickname')
        .defaultTo('');
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('Pokemon', table => {
      table.dropColumn('nickname');
    })
  ])
};
