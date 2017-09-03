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

	addNewRoles(channel, member, roles) {
		return new Promise((resolve, reject) => {
			let data = [];

			// create role objects for each role given
			for (let i=0; i<roles.length; i++) {
				const id = member.guild.roles.find(val => val.name.toLowerCase() == roles[i].toLowerCase());

				if (!id) {
					reject({ error: `Role **${roles[i]}** was not found.` });
					return;
				}

				// TODO:  Check role with DB to see if it already exists, and if it does, do not readd it
				data.push({ name: roles[i].toLowerCase(), value: roles[i] });
			}

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
				reject({ error: `Role **${role}** was not found.  Use \`!lsar\` to see a list of self assignable roles.` });
				return;
			}

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
							member.addRole(id);

							// console.log(JSON.stringify(result, null, 2));
							resolve(result);
						} else {
							reject({ error: `Role **${role}** was not found.  Use \`!lsar\` to see a list of self assignable roles.` });
						}
					});
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
}


module.exports = new Role();
