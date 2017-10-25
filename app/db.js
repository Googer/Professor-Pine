"use strict";

const r = require('rethinkdb');
const moment = require('moment');
const settings = require('./../data/settings');

class RethinkDBManager {
	constructor() {
		this.connection = null;

		this.guilds = new Map();

		r.connect({ host: 'localhost', port: 28015 }, (err, conn) => {
			if (err) { throw err; }
			this.connection = conn;
		});
	}

	initialize(guilds) {
		// for every guild/sever the bot is connected to, attempt to initialize DB's for each if they don't already exist
		guilds.forEach((key, value, map) => {
			this.guilds.set(key.id, map);

			r.dbCreate(key.id).run(this.connection, (err, result) => {
				if (err && err.name !== 'ReqlOpFailedError') {
					if (err) { throw err; }
				}
			});

			// set up users table if it doesn't already exist
			r.db(key.id).tableCreate('users').run(this.connection, (err, result) => {
				if (err && err.name !== 'ReqlOpFailedError') {
					if (err) { throw err; }
				}
			});

			// set up roles table if it doesn't already exist
			r.db(key.id).tableCreate('roles').run(this.connection, (err, result) => {
				if (err && err.name !== 'ReqlOpFailedError') {
					if (err) { throw err; }
				}
			});

			// set up notifications table if it doesn't already exist
			r.db(key.id).tableCreate('notifications').run(this.connection, (err, result) => {
				if (err && err.name !== 'ReqlOpFailedError') {
					if (err) { throw err; }
				}
			});
		});
	}
}

module.exports = new RethinkDBManager();
