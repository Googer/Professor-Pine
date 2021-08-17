exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.string('silph');
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('silph');
    });
};
