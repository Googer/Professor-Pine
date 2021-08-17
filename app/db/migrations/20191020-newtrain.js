exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.boolean('newTrain')
        .notNullable()
        .defaultTo(false);
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('newTrain');
    });
};
