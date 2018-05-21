exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('User', table => {
      table.increments('id')
        .primary();

      table.string('userSnowflake', 30)
        .unique();
    }),

    knex.schema.createTable('Notification', table => {
      table.increments('id')
        .primary();
      table.integer('pokemon');

      table.integer('guildId')
        .unsigned()
        .references('id')
        .inTable('Guild')
        .onDelete('cascade');

      table.integer('userId')
        .unsigned()
        .references('id')
        .inTable('User')
        .onDelete('cascade');

      table.index(['pokemon', 'guildId']);
      table.index(['userId', 'guildId']);
    }),
  ])
};

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('Notification'),
    knex.schema.dropTable('User')
  ])
};
