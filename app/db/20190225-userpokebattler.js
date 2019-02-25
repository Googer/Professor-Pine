exports.up = function (knex, Promise) {
  return knex.schema.alterTable('User', table => {
    table.integer('pokebattlerId');
  })
};

exports.down = function (knex, Promise) {
  return knex.schema.alterTable('User', table => {
    table.dropColumn('pokebattlerId');
  })
};
