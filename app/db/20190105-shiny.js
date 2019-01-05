const {PrivacyOpts} = require('../constants');

exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('Pokemon', table => {
      table.boolean('shiny')
        .defaultTo(false);
    })
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('Pokemon', table => {
      table.dropColumn('shiny');
    })
  ])
};
