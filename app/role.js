"use strict";

const r = require('rethinkdb'),
	settings = require('./../data/settings'),
	DB = require('./../app/db'),
	Helper = require('./../app/helper');

class Role {
	constructor() {
		// shortcut incase DB Table changes names
		this.db_table = 'roles';

		// number of roles in DB (useful for pagination w/o having to hit DB)
		this.count = 0;
	}

	isBotChannel(message) {
		const guild = Helper.guild.get(message.guild.id),
			bot_lab_channel_id = guild.channels.bot_lab ?
				guild.channels.bot_lab.id :
				-1,
			mod_bot_lab_channel_id = guild.channels.mod_bot_lab ?
				guild.channels.mod_bot_lab.id :
				-1;

		return message.channel.id === bot_lab_channel_id || message.channel.id === mod_bot_lab_channel_id;
	}

	// update or insert roles
	upsertRoles(channel, member, roles) {
		return new Promise((resolve, reject) => {
			let data = [];
			let promises = [];

			// create role objects for each role given
			for (let i = 0; i < roles.length; i++) {
				const value = roles[i][0];
				const description = roles[i][1] || '';
				const id = member.guild.roles.find(val => val.name.toLowerCase() === value.toLowerCase());

				if (!value) {
					reject({error: `Please enter a role when using this command.`});
					return;
				}

				if (!id) {
					reject({error: `Role "**${value}**" was not found.`});
					return;
				}

				promises.push(this.roleExists(channel, member, value)
					.then(exists => {
						return new Promise((resolve, reject) => {
							if (!exists) {
								data.push({name: value.toLowerCase(), value, description, date: Date.now()});
								resolve();
							} else {
								// update role if it already exists
								r.db(channel.guild.id)
									.table(this.db_table)
									.filter({name: value.toLowerCase()})
									.update({value, description})
									.run(DB.connection, (err, result) => {
										if (err && err.name !== 'ReqlOpFailedError') {
											reject(err);
											return;
										}

										this.count = result.length;

										resolve(result);
									});
							}
						});
					}));
			}

			// once all roles have been proven that the exist, attempt to add them to DB
			Promise.all(promises)
				.then(info => {
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
			for (let i = 0; i < roles.length; i++) {
				promises.push(new Promise((resolve, reject) => {
					r.db(channel.guild.id)
						.table(this.db_table)
						.filter({name: roles[i].toLowerCase()})
						.delete()
						.run(DB.connection, (err, result) => {
							if (err) {
								reject(err);
								return;
							}

							this.count = result.length;

							resolve(result);
						});
				}));
			}

			Promise.all(promises)
				.then(data => {
					resolve(data);
				}).catch(err => {
				reject(err);
			});
		});
	}

	getRoles(channel, member) {
		return new Promise((resolve, reject) => {
			r.db(channel.guild.id)
				.table(this.db_table)
				.orderBy(r.asc('date'))
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

	// give role to user if it exists
	assignRole(channel, member, role) {
		return new Promise((resolve, reject) => {
			const id = member.guild.roles
				.find(val => val.name.toLowerCase() === role.toLowerCase());

			if (!id) {
				reject({error: `Role "**${role}**" was not found.  Use \`!iam\` to see a list of self-assignable roles.`});
				return;
			}

			this.roleExists(channel, member, role)
				.then(exists => {
					if (exists) {
						member.addRole(id);

						// console.log(JSON.stringify(result, null, 2));
						resolve();
					} else {
						reject({error: `Role "**${role}**" was not found.  Use \`!iam\` to see a list of self-assignable roles.`});
					}
				});
		});
	}

	// remove role from user if they have it
	removeRole(channel, member, role) {
		return new Promise((resolve, reject) => {
			const id = member.guild.roles.find(val => val.name.toLowerCase() === role.toLowerCase());

			if (!id) {
				reject({error: `Please enter a role when using this command.`});
				return;
			}

			member.removeRole(id);

			resolve();
		});
	}

	roleExists(channel, member, role) {
		return new Promise((resolve, reject) => {
			r.db(channel.guild.id)
				.table(this.db_table)
				.filter(r.row('name').eq(role.toLowerCase()))
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


module.exports = new Role();
