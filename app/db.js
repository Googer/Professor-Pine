"use strict";

const r = require('rethinkdb');
const moment = require('moment');
const settings = require('./../data/settings');

class RethinkDBManager {
	constructor() {
		this.connection = null;

		this.guilds = new Map();

		r.connect({ host: 'localhost', port: 28015 }, (err, conn) => {
			if (err) throw err;
			this.connection = conn;
			// this.initialize();
		});
	}

	initialize(guilds) {
		guilds.forEach((key, value, map) => {
			console.log(key.id);
			this.guilds.set(key.id, map);
			// r.db(key.id).run();
		});

		// set up users table if it doesn't already exist
		r.db('test').tableCreate('users').run(this.connection, (err, result) => {
			if (err && err.name !== 'ReqlOpFailedError') {
				if (err) throw err;
			}
		});

		// set up roles table if it doesn't already exist
		r.db('test').tableCreate('roles').run(this.connection, (err, result) => {
			if (err && err.name !== 'ReqlOpFailedError') {
				if (err) throw err;
			}
		});
	}

	insertData(channel, table, data, callback) {
		if (!this.guilds.get(channel.guild.id)) {
			throw 'Guild ID does not exist';
		}

		r.table(channel.guild.id).insert(data).run(this.connection, callback);
	}

	getData(channel, table, callback) {
		r.table(table).run(this.connection, callback);
	}
}

module.exports = new RethinkDBManager();
