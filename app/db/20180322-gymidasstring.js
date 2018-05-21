exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('GymNotification', table => {
      table.string('gym', 50)
        .alter();
    }),
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('GymNotification', table => {
      table.integer('gym')
        .alter();
    })
  ])
};
