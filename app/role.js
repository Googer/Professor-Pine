"use strict";

const DB = require('./../app/db');
const r = require('rethinkdb');
const moment = require('moment');
const settings = require('./../data/settings');

class Role {
	constructor() {
		// shortcut incase DB Table changes names
		this.db_table = 'roles';
	}

	// update or insert roles
	upsertRoles(channel, member, roles) {
		return new Promise((resolve, reject) => {
			let data = [];
			let promises = [];

			// create role objects for each role given
			for (let i=0; i<roles.length; i++) {
				const value = roles[i][0];
				const description = roles[i][1] || '';
				const id = member.guild.roles.find(val => val.name.toLowerCase() == value.toLowerCase());

				if (!value) {
					reject({ error: `Please enter a role when using this command.` });
					return;
				}

				if (!id) {
					reject({ error: `Role **${value}** was not found.` });
					return;
				}

				promises.push(this.roleExists(channel, member, value).then((exists) => {
					return new Promise((resolve, reject) => {
						if (!exists) {
							data.push({ name: value.toLowerCase(), value, description, date: Date.now() });
							resolve();
						} else {
							// update role if it already exists
							r.db(channel.guild.id)
								.table(this.db_table)
								.filter({ name: value.toLowerCase() })
								.update({ value, description })
								.run(DB.connection, (err, result) => {
									if (err && err.name !== 'ReqlOpFailedError') {
										reject(err);
										return;
									}

									// console.log(JSON.stringify(result, null, 2));
									resolve(result);
								});
							}
					});
				}));
			}

			// once all roles have been proven that the exist, attempt to add them to DB
			Promise.all(promises).then((info) => {
				// if no roles exist that aren't already in the DB, do nothing
				if (!data.length) {
					resolve();
					return;
				}

				// add roles to DB
				r.db(channel.guild.id)
					.table(this.db_table)
					.insert(data)
					.run(DB.connection, (err, result) => {
						if (err && err.name !== 'ReqlOpFailedError') {
							reject(err);
							return;
						}

						// console.log(JSON.stringify(result, null, 2));
						resolve(result);
					});
			}).catch((err) => {
				reject(err);
			});
		});
	}

	removeOldRoles(channel, member, roles) {
		return new Promise((resolve, reject) => {
			let promises = [];

			// create role objects for each role given
			for (let i=0; i<roles.length; i++) {
				promises.push(new Promise((resolve, reject) => {
					r.db(channel.guild.id)
						.table(this.db_table)
						.filter({ name: roles[i].toLowerCase() })
						.delete()
						.run(DB.connection, function(err, result) {
							if (err) {
								reject(err);
								return;
							}

							// console.log(JSON.stringify(result, null, 2));
							resolve(result);
						});
				}));
			}

			Promise.all(promises).then((data) => {
				resolve(data);
			}).catch((err) => {
				reject(err);
			});
		});
	}

	getRoles(channel, member) {
		return new Promise((resolve, reject) => {
			r.db(channel.guild.id)
				.table(this.db_table)
				.orderBy(r.asc('date'))
				.run(DB.connection, function(err, cursor) {
					if (err) {
						reject(err);
						return;
					}

					cursor.toArray(function(err, result) {
						if (err) {
							reject(err);
							return;
						}

						// console.log(JSON.stringify(result, null, 2));
						resolve(result);
					});
				});
		});
	}

	assignRole(channel, member, role) {
		return new Promise((resolve, reject) => {
			const id = member.guild.roles.find(val => val.name.toLowerCase() == role.toLowerCase());

			if (!id) {
				reject({ error: `Role **${role}** was not found.  Use \`!iam\` to see a list of self assignable roles.` });
				return;
			}

			this.roleExists(channel, member, role).then((exists) => {
				if (exists) {
					member.addRole(id);

					// console.log(JSON.stringify(result, null, 2));
					resolve();
				} else {
					reject({ error: `Role **${role}** was not found.  Use \`!iam\` to see a list of self assignable roles.` });
				}
			});
		});
	}

	removeRole(channel, member, role) {
		return new Promise((resolve, reject) => {
			const id = member.guild.roles.find(val => val.name.toLowerCase() == role.toLowerCase());

			member.removeRole(id);

			resolve();
		});
	}

	roleExists(channel, member, role) {
		return new Promise((resolve, reject) => {
			r.db(channel.guild.id)
				.table(this.db_table)
				.filter(r.row('name').eq(role.toLowerCase()))
				.run(DB.connection, function(err, cursor) {
					if (err) {
						reject(err);
						return;
					}

					cursor.toArray(function(err, result) {
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


module.exports = new Role();
