exports.up = function (knex) {
  return knex.schema
    .createTable('CommandRoleAuthorization', table => {
      table.increments('id')
        .primary();

      table.string('command', 100);
      table.integer('guildId')
        .unsigned()
        .references('id')
        .inTable('Guild')
        .onDelete('cascade');
      table.boolean('roleRequired');

      table.unique(['command', 'guildId']);
    })

    .createTable('CommandRoles', table => {
      table.increments('id')
        .primary();

      table.string('command', 100);
      table.integer('guildId')
        .unsigned()
        .references('id')
        .inTable('Guild')
        .onDelete('cascade');
      table.string('roleSnowflakeId', 30);

      table.unique(['command', 'guildId', 'roleSnowflakeId']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('CommandRoles')
    .dropTable('CommandRoleAuthorization');
};
