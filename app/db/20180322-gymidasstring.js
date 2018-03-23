exports.up = function (knex, Promise) {
	return Promise.all([
		knex.schema.table('GymNotification', table => {
			table.string('gym')
				.alter();
		}),
	])
};

exports.down = function (knex, Promise) {
	return Promise.all([
		knex.schema.table('GymNotification', table => {
			table.integer('gym')
				.alter();
		})
	])
};
