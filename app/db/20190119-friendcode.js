exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.string('nickname');
      table.string('friendcode');
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.dropColumn('nickname');
      table.dropColumn('friendcode');
    })
  ])
};
