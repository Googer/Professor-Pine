exports.up = function (knex) {
  return knex.schema
    .createTable('Guild', table => {
      table.increments('id')
        .primary();

      table.string('snowflake', 30)
        .unique();
    })
    .createTable('Role', table => {
      table.increments('id')
        .primary();
      table.string('roleName', 50);
      table.string('roleDescription', 150);

      table.integer('guildId')
        .unsigned()
        .references('id')
        .inTable('Guild')
        .onDelete('cascade');

      table.unique(['roleName', 'guildId']);
    })
    .createTable('Alias', table => {
      table.increments('id')
        .primary();

      table.string('aliasName', 50);

      table.integer('roleId')
        .unsigned()
        .references('id')
        .inTable('Role')
        .onDelete('cascade');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('Alias')
    .dropTable('Role')
    .dropTable('Guild');
};
