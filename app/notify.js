"use strict";

const r = require('rethinkdb'),
	DB = require('./db');

class Notify {
	constructor() {
		// shortcut in case DB Table changes names
		this.db_table = 'notifications';
	}

	getNotifications(member) {
		return new Promise((resolve, reject) => {
			r.db(member.guild.id)
				.table(this.db_table)
				.filter(r.row('member').eq(member.id))
				.getField('pokemon')
				.run(DB.connection, (err, cursor) => {
					if (err) {
						reject(err);
						return;
					}

					cursor.toArray((err, result) => {
						if (err) {
							reject(err);
							return;
						}

						this.count = result.length;

						resolve(result);
					});
				});
		});
	}

	getMembers(guild, pokemon) {
		return new Promise((resolve, reject) => {
			r.db(guild.id)
				.table(this.db_table)
				.filter(r.row('pokemon').eq(pokemon.name))
				.getField('member')
				.run(DB.connection, (err, cursor) => {
					if (err) {
						reject(err);
						return;
					}

					cursor.toArray((err, result) => {
						if (err) {
							reject(err);
							return;
						}

						this.count = result.length;

						resolve(result);
					});
				});
		});
	}

	// give pokemon notification to user
	assignNotification(member, pokemon) {
		return new Promise((resolve, reject) => {
			this.notificationExists(member, pokemon)
				.then(exists => {
					if (!exists) {
						// add pokemon notification for member to DB
						r.db(member.guild.id)
							.table(this.db_table)
							.insert({member: member.id, pokemon: pokemon.name})
							.run(DB.connection, (err, result) => {
								if (err && err.name !== 'ReqlOpFailedError') {
									reject(err);
									return;
								}

								resolve(result);
							});
					} else {
						resolve();
					}
				});
		});
	}

	// remove role from user if they have it
	removeNotification(member, pokemon) {
		return new Promise((resolve, reject) => {
			this.notificationExists(member, pokemon)
				.then(exists => {
					if (exists) {
						r.db(member.guild.id)
							.table(this.db_table)
							.filter({member: member.id, pokemon: pokemon.name})
							.delete()
							.run(DB.connection, (err, result) => {
								if (err) {
									reject(err);
									return;
								}

								this.count = result.length;

								resolve(result);
							});
					} else {
						resolve();
					}
				});
		});
	}

	notificationExists(member, pokemon) {
		return new Promise((resolve, reject) => {
			r.db(member.guild.id)
				.table(this.db_table)
				.filter({member: member.id, pokemon: pokemon.name})
				.run(DB.connection, (err, cursor) => {
					if (err) {
						reject(err);
						return;
					}

					cursor.toArray((err, result) => {
						if (err) {
							reject(err);
							return;
						}

						if (result.length) {
							resolve(true);
						} else {
							resolve(false);
						}
					});
				});
		});
	}
}


module.exports = new Notify();
