exports.up = function (knex, Promise) {
	return Promise.all([
		knex.schema.createTable('Guild', table => {
			table.increments('id')
				.primary();

			table.string('snowflake')
				.unique();
		}),

		knex.schema.createTable('Role', table => {
			table.increments('id')
				.primary();
			table.string('roleName');
			table.string('roleDescription');

			table.integer('guildId')
				.unsigned()
				.references('id')
				.inTable('Guild')
				.onDelete('cascade');

			table.unique(['roleName', 'guildId']);
		}),

		knex.schema.createTable('Alias', table => {
			table.increments('id')
				.primary();

			table.string('aliasName');

			table.integer('roleId')
				.unsigned()
				.references('id')
				.inTable('Role')
				.onDelete('cascade');
		})
	])
};

exports.down = function (knex, Promise) {
	return Promise.all([
		knex.schema.dropTable('Alias'),
		knex.schema.dropTable('Role'),
		knex.schema.dropTable('Guild')
	])
};
