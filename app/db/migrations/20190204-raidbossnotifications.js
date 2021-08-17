exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.boolean('raidBoss')
        .defaultTo(false);
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('raidBoss');
    });
};
