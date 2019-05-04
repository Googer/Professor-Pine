exports.up = function (knex, Promise) {
	return Promise.all([
		knex.schema.createTable('Region', table => {
			table.increments('id')
				.primary();

      table.specificType('bounds', 'polygon')
        .notNullable();

      table.bigInteger('channel_id')
  			.unsigned();

      table.text('description')
        .nullable();
		}),

		knex.schema.createTable('Gym', table => {
			table.increments('id')
				.primary();

      table.string('pogo_id')
        .nullable();

      table.specificType('lat', 'real(20,10)');
      table.specificType('lon', 'real(20,10)');

      table.string('name')
        .notNullable();
		}),

		knex.schema.createTable('GymMeta', table => {

			table.integer('gym_id')
				.unsigned()
        .primary()
				.references('id')
				.inTable('Gym')
				.onDelete('cascade');

			table.string('nickname')
        .nullable();

      table.text('description','mediumtext')
        .nullable();

      table.text('keywords','mediumtext')
        .nullable();

      table.text('notice','mediumtext')
        .nullable();

			table.boolean('ex_raid');

			table.boolean('ex_tagged');

      table.string('image_url')
        .nullable();

      table.integer('sponsor')
        .nullable();

	  table.text('geodata','mediumtext')
        .nullable();

		table.text('places','mediumtext')
        .nullable();

	  table.integer('nearestGym')
        .nullable();

		}),
	])
};

exports.down = function (knex, Promise) {
	return Promise.all([
		knex.schema.dropTable('Region'),
		knex.schema.dropTable('Gym'),
		knex.schema.dropTable('GymMeta')
	])
};
