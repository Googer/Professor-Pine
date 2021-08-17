exports.up = function (knex) {
  return knex.schema
    .renameTable('Notification', 'PokemonNotification')
    .createTable('GymNotification', table => {
      table.increments('id')
        .primary();
      table.integer('gym');

      table.integer('userId')
        .unsigned()
        .references('id')
        .inTable('User')
        .onDelete('cascade');

      table.integer('guildId')
        .unsigned()
        .references('id')
        .inTable('Guild')
        .onDelete('cascade');

      table.index(['gym', 'guildId']);
      table.index(['userId', 'guildId']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .renameTable('PokemonNotification', 'Notification')
    .dropTable('GymNotification');
};
