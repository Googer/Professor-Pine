exports.up = function (knex, Promise) {
	return knex.schema.alterTable('User', table => {
		table.integer('pokebattler_id');
	})
};

exports.down = function (knex, Promise) {
	return knex.schema.alterTable('User', table => {
        table.dropColumn('pokebattler_id');
    })
};
