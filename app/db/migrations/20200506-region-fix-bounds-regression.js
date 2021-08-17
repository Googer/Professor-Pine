exports.up = function (knex) {
  return knex.schema
    .alterTable('Region', table => {
      table.specificType('bounds', 'polygon')
        .nullable().alter();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable('Region', table => {
      table.specificType('bounds', 'polygon')
        .notNullable().alter();
    });
};
