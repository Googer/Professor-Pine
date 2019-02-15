exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.string('silph');
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('User', table => {
      table.dropColumn('silph');
    })
  ])
};
