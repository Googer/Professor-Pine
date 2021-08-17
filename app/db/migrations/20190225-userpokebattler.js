exports.up = function (knex) {
  return knex.schema.alterTable('User', table => {
    table.integer('pokebattlerId');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('User', table => {
    table.dropColumn('pokebattlerId');
  });
};
