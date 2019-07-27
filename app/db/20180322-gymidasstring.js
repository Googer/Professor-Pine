exports.up = function (knex) {
  return knex.schema
    .table('GymNotification', table => {
      table.string('gym', 50)
        .alter();
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('GymNotification', table => {
      table.integer('gym')
        .alter();
    });
};
