const {PrivacyOpts} = require('../constants');

exports.up = function (knex) {
  return knex.schema
    .table('User', table => {
      table.integer('raidPrivacy')
        .notNullable()
        .defaultTo(PrivacyOpts.VISIBLE);
    });
};

exports.down = function (knex) {
  return knex.schema
    .table('User', table => {
      table.dropColumn('raidPrivacy');
    });
};
