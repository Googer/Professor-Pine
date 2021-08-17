exports.up = function (knex) {
  return knex.schema
    .createTable('Region', table => {
      table.increments('id')
        .primary();

      table.specificType('bounds', 'polygon')
        .notNullable();

      table.integer('guildId')
        .unsigned()
        .references('id')
        .inTable('Guild')
        .onDelete('cascade');

      table.bigInteger('channelId')
        .unsigned();

      table.text('description')
        .nullable();
    })
    .createTable('Gym', table => {
      table.increments('id')
        .primary();

      table.string('pogoId')
        .nullable();

      table.specificType('lat', 'real(20,10)');
      table.specificType('lon', 'real(20,10)');

      table.string('name')
        .notNullable();
    })
    .createTable('GymMeta', table => {
      table.integer('gymId')
        .unsigned()
        .primary()
        .references('id')
        .inTable('Gym')
        .onDelete('cascade');

      table.string('nickname')
        .nullable();

      table.text('description', 'mediumtext')
        .nullable();

      table.text('keywords', 'mediumtext')
        .nullable();

      table.text('notice', 'mediumtext')
        .nullable();

      table.boolean('confirmedEx');

      table.boolean('taggedEx');

      table.string('imageUrl')
        .nullable();

      table.integer('sponsor')
        .nullable();

      table.text('geodata', 'mediumtext')
        .nullable();

      table.text('places', 'mediumtext')
        .nullable();

      table.integer('nearestGym')
        .nullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('Region')
    .dropTable('Gym')
    .dropTable('GymMeta');
};
