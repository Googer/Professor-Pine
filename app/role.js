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
				const value = roles[i].name;
				const description = roles[i].description || '';
				const aliases = roles[i].aliases || [];
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
					.then(roles => {
						return new Promise((resolve, reject) => {
							if (!roles.length) {
								data.push({name: value.toLowerCase(), value, description, aliases, date: Date.now()});
								resolve();
							} else {
								// update role if it already exists
								r.db(channel.guild.id)
									.table(this.db_table)
									.filter({name: value.toLowerCase()})
									.update({value, description, aliases})
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
		return this.adjustUserRole(channel, member, role);
	}

	// remove role from user if they have it
	removeRole(channel, member, role) {
		return this.adjustUserRole(channel, member, role, true);
	}

	// add or remove roles from user
	adjustUserRole(channel, member, role, remove=false) {
		return new Promise(async (resolve, reject) => {
			let roles = await this.roleExists(channel, member, role);
			let matching_role_found = true;

			// first look for a matching name in DB, then check for aliases if a match was not found
			if (roles.length) {
				// loop through matched roles adding them to user
				for (let i=0; i<roles.length; i++) {
					const id = Helper.guild.get(member.guild.id).roles.get(roles[i].value).id;

					if (!id) {
						matching_role_found = false;
						log.warn(`Role ${roles[i].value}, may not longer be available in the guild.`);
						return;
					}

					if (remove) {
						member.removeRole(id);
					} else {
						member.addRole(id);
					}
				}

				if (matching_role_found) {
					resolve();
				} else {
					reject({error: `Role "**${role}**" was not found.  Use \`!iam\` to see a list of self-assignable roles.`});
				}
			} else {
				roles = await this.roleExists(channel, member, role, true);

				if (roles.length) {
					// loop through matched roles adding them to user
					for (let i=0; i<roles.length; i++) {
						const id = Helper.guild.get(member.guild.id).roles.get(roles[i].value).id;

						if (!id) {
							matching_role_found = false;
							log.warn(`Role ${roles[i].value}, may not longer be available in the guild.`);
							return;
						}

						if (remove) {
							member.removeRole(id);
						} else {
							member.addRole(id);
						}
					}

					resolve();
				} else {
					reject({error: `Role or alias "**${role}**" was not found.  Use \`!iam\` to see a list of self-assignable roles.`});
				}
			}
		});
	}

	roleExists(channel, member, role, is_alias=false) {
		role = role.toLowerCase();

		return new Promise((resolve, reject) => {
			r.db(channel.guild.id)
				.table(this.db_table)
				.filter(function (db_role) {
					if (!is_alias) {
						return db_role('name').eq(role);
					} else {
						return db_role('aliases').contains(role);
					}
				})
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

						resolve(result);
					});
				});
		});
	}
}


module.exports = new Role();
