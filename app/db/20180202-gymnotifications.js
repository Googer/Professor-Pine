exports.up = function (knex, Promise) {
	return Promise.all([
		knex.schema.renameTable('Notification', 'PokemonNotification'),

		knex.schema.createTable('GymNotification', table => {
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
		}),
	])
};

exports.down = function (knex, Promise) {
	return Promise.all([
		knex.schema.renameTable('PokemonNotification', 'Notification'),
		knex.schema.dropTable('GymNotification')
	])
};
