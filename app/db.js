"use strict";

const log = require('loglevel').getLogger('DB'),
	knex = require('knex'),
	private_settings = require('../data/private-settings');

class DBManager {
	constructor() {
		this.connection = null;

		this.guilds = new Map();

		this.knex = knex({
			client: 'mysql',
			connection: {
				host: private_settings.db.host,
				user: private_settings.db.user,
				password: private_settings.db.password,
				database: private_settings.db.schema
			},
			migrations: {
				directory: './app/db'
			},
			debug: true
		});
	}

	initialize(client) {
		this.knex.migrate.latest()
			.then(() => client.guilds.forEach(guild =>
				this.insertOrUpdate('Guild', Object.assign({},
					{
						snowflake: guild.id
					}))
					.catch(err => log.error(err))));

		client.on('guildCreate', guild => {
			this.insertOrUpdate('Guild', Object.assign({},
				{
					snowflake: guild.id
				}))
				.catch(err => log.error(err))
		});

		client.on('guildDelete', guild => {
			this.DB('Guild')
				.where('snowflake', guild.id)
				.del()
				.catch(err => log.error(err));
		});
	}
	}

	get DB() {
		return this.knex;

	insertOrUpdate(table_name, data, transaction = undefined) {
		const first_data = data[0] ?
			data[0] :
			data;
		return transaction ?
			this.knex.raw(this.knex(table_name).transacting(transaction).insert(data).toQuery() + " ON DUPLICATE KEY UPDATE " +
				Object.getOwnPropertyNames(first_data)
					.map(field => `${field}=VALUES(${field})`)
					.join(", ")) :
			this.knex.raw(this.knex(table_name).insert(data).toQuery() + " ON DUPLICATE KEY UPDATE " +
				Object.getOwnPropertyNames(first_data)
					.map(field => `${field}=VALUES(${field})`)
					.join(", "));
	}
}

module.exports = new DBManager();
