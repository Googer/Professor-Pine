exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.string('nickname');
      table.string('friendcode');
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('nickname');
      table.dropColumn('friendcode');
    });
};
