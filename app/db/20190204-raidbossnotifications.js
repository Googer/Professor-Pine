exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.boolean('raidBoss')
        .defaultTo(false);
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.dropColumn('raidBoss');
    })
  ])
};
