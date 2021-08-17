const DB = require('../../db');

exports.up = function (knex) {
  return knex.schema
    .createTable('CompletedRaid', table => {
      table.increments('id')
        .primary();

      // don't reference gym id in Gym table so migration / seeding
      // with deleted gyms don't fail
      table.integer('gymId')
        .unsigned();

      table.integer('pokemonId')
        .unsigned()
        .references('id')
        .inTable('Pokemon')
        .onDelete('cascade');

      table.string('channelSnowflake', 30);

      table.bigInteger('creationTime');

      table.string('reportedBySnowflake', 30);

      table.index('gymId');
      table.index('pokemonId');
      table.index('channelSnowflake');
      table.index('creationTime');
      table.index('reportedBySnowflake');
    })
    .createTable('CompletedRaidAttendee', table => {
      table.increments('id')
        .primary();

      table.integer('raidId')
        .unsigned()
        .references('id')
        .inTable('CompletedRaid')
        .onDelete('cascade');

      table.string('userSnowflake', 30);

      table.integer('number')
        .unsigned();

      table.string('groupId', 1);

      table.enum('status', ['interested', 'coming', 'present', 'complete']);

      table.index('raidId');
      table.index('userSnowflake');
    })
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('CompletedRaidAttendee')
    .dropTable('CompletedRaid');
};
