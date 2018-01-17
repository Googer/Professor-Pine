"use strict";

const log = require('loglevel').getLogger('Role'),
	DB = require('./../app/db'),
	Helper = require('./../app/helper');

class Role {
	constructor() {
	}

	initialize() {
		Helper.client.on('guildMemberAdd', member => {
			this.autoAssignRole(member);
		});
	}

	// update or insert roles
	upsertRoles(guild, roles) {
		return DB.DB('Guild')
			.where('snowflake', guild.id)
			.pluck('id')
			.first()
			.then(guild_db_id => new Promise((resolve, reject) => {
				const promises = [];

				// create role objects for each role given
				for (let i = 0; i < roles.length; i++) {
					const role_name = roles[i].name,
						role_description = roles[i].description || '',
						aliases = roles[i].aliases.map(val => val.toLowerCase()) || [],
						role = Helper.guild.get(guild.id).roles.get(role_name.toLowerCase());

					if (!role_name) {
						reject({error: `Please enter a role when using this command.`});
						return;
					}

					if (!role) {
						reject({error: `Role "**${role_name}**" was not found.`});
						return;
					}

					promises.push(this.roleExists(guild, role_name)
						.then(existing_roles => {
							return new Promise((resolve, reject) => {
								if (!existing_roles.length) {
									promises.push(DB.DB.transaction(transaction => {
										// insert new role
										DB.DB('Role').transacting(transaction)
											.returning('id')
											.insert(Object.assign({}, {
												roleName: roles[i].name,
												roleDescription: roles[i].description,
												guildId: guild_db_id.id
											}))
											.then(role_id =>
												DB.DB('Alias').transacting(transaction)
													.insert(aliases.map(alias => Object.assign({}, {
														aliasName: alias,
														roleId: role_id
													})))
											)
											.then(transaction.commit)
											.catch(err => {
												transaction.rollback();
												reject(err);
											});
									}));
								} else {
									promises.push(DB.DB.transaction(transaction => {
										// update role since it already exists
										let role_db_id;

										DB.DB('Role').transacting(transaction)
											.pluck('id')
											.where('guildId', guild_db_id.id)
											.andWhere('roleName', role_name)
											.first()
											.then(role_id => {
												role_db_id = role_id.id;

												return DB.DB('Role').transacting(transaction)
													.where('guildId', guild_db_id.id)
													.andWhere('Role.roleName', role_name)
													.update(Object.assign({}, {
														roleDescription: role_description
													}));
											})
											.then(result => {
												// Replace any existing aliases for this role with new ones
												return DB.DB('Alias').transacting(transaction)
													.where('roleId', role_db_id)
													.del();
											})
											.then(result =>
												DB.DB('Alias').transacting(transaction)
													.insert(aliases.map(alias => Object.assign({}, {
														aliasName: alias,
														roleId: role_db_id
													}))))
											.then(transaction.commit)
											.catch(err => {
												transaction.rollback();
												reject(err);
											});
									}));
								}

								resolve();
							});
						}));
				}

				// once all roles have been proven that they exist, attempt to add them to DB
				Promise.all(promises)
					.then(info => resolve())
					.catch(err => reject(err));
			}));
	}

	removeOldRoles(guild, roles) {
		// remove all matching role objects for each role given
		return new Promise((resolve, reject) => {
			DB.DB('Guild')
				.where('snowflake', guild.id)
				.pluck('id')
				.first()
				.then(guild_id => {
					DB.DB('Role')
						.whereIn('roleName', roles)
						.andWhere('guildId', guild_id.id)
						.del()
						.then(result => resolve(result))
						.catch(err => reject(err));
				});
		});
	}

	getRoles(guild) {
		return new Promise((resolve, reject) => {
			DB.DB('Role')
				.leftJoin('Alias', {'Alias.roleId': 'Role.id'})
				.innerJoin('Guild', {'Role.guildId': 'Guild.id'})
				.where('Guild.snowflake', guild.id)
				.then(roles => resolve(roles))
				.catch(err => reject(err));
		});
	}

	// give role to user if it exists
	assignRole(member, role) {
		return this.adjustUserRole(member.guild, member, role);
	}

	// remove role from user if they have it
	removeRole(member, role) {
		return this.adjustUserRole(member.guild, member, role, true);
	}

	// add or remove roles from user
	adjustUserRole(guild, member, role, remove = false) {
		return new Promise(async (resolve, reject) => {
			let roles = await this.roleExists(member.guild, role);
			let matching_role_found = true;

			// first look for a matching name in DB, then check for aliases if a match was not found
			if (roles.length) {
				// loop through matched roles adding them to user
				for (let i = 0; i < roles.length; i++) {
					const id = Helper.guild.get(guild.id).roles.get(roles[i].roleName.toLowerCase()).id;

					if (!id) {
						matching_role_found = false;
						log.warn(`Role ${roles[i].roleName}, may not longer be available in the guild.`);
						return;
					}

					if (remove) {
						member.removeRole(id)
							.catch(err => log.error(err));
					} else {
						member.addRole(id)
							.catch(err => log.error(err));
					}
				}

				if (matching_role_found) {
					resolve();
				} else {
					reject({error: `Role "**${role}**" was not found.  Use \`${guild.client.commandPrefix}iam\` to see a list of self-assignable roles.`});
				}
			} else {
				roles = await this.roleExists(guild, role, true);

				if (roles.length) {
					// loop through matched roles adding them to user
					for (let i = 0; i < roles.length; i++) {
						const id = Helper.guild.get(guild.id).roles.get(roles[i].roleName.toLowerCase()).id;

						if (!id) {
							matching_role_found = false;
							log.warn(`Role '${roles[i].roleName}' may not longer be available in the guild.`);
							return;
						}

						if (remove) {
							member.removeRole(id)
								.catch(err => log.error(err));
						} else {
							member.addRole(id)
								.catch(err => log.error(err));
						}
					}

					resolve();
				} else {
					reject({error: `Role or alias "**${role}**" was not found.  Use \`!iam\` to see a list of self-assignable roles.`});
				}
			}
		});
	}

	roleExists(guild, role, is_alias = false) {
		role = role.toLowerCase();

		return new Promise((resolve, reject) => {
			let query;

			if (is_alias) {
				query = DB.DB('Alias')
					.select(['Alias.id', 'Role.roleName', 'Role.guildId'])
					.innerJoin('Role', {'Alias.roleId': 'Role.id'})
					.innerJoin('Guild', {'Guild.id': 'Role.guildId'})
					.where('aliasName', role)
					.andWhere('Guild.snowflake', guild.id);
			} else {
				query = DB.DB('Role')
					.select(['Role.id', 'Role.roleName', 'Role.guildId'])
					.innerJoin('Guild', {'Role.guildId': 'Guild.id'})
					.where('roleName', role)
					.andWhere('Guild.snowflake', guild.id);
			}

			query
				.then(results => resolve(results))
				.catch(err => reject(err));
		});
	}

	async setAutoAssignRole(guild, role) {
		role = role.toLowerCase();

		let roles = await this.roleExists(guild, role);

		if (roles.length > 0) {
			return DB.DB.transaction(transaction =>
				DB.DB('AutoAssignRole').transacting(transaction)
					.where('guildId', roles[0].guildId)
					.del()
					.then(result => DB.DB('AutoAssignRole').transacting(transaction)
						.returning('id')
						.insert(Object.assign({}, {
							guildId: roles[0].guildId,
							roleId: roles[0].id
						})))
					.then(transaction.commit)
					.catch(err => {
						transaction.rollback();
						log.error(err);
					}));
		} else {
			roles = await this.roleExists(guild, role, true);

			if (roles.length > 0) {
				return DB.DB.transaction(transaction =>
					DB.DB('AutoAssignRole').transacting(transaction)
						.where('guildId', roles[0].guildId)
						.del()
						.then(result => DB.DB('AutoAssignRole').transacting(transaction)
							.returning('id')
							.insert(Object.assign({}, {
								guildId: roles[0].guildId,
								aliasId: roles[0].id
							})))
						.then(transaction.commit)
						.catch(err => {
							transaction.rollback();
							log.error(err);
						}));
			}
		}

		return Promise.reject({error: 'No self-assignable role or alias found!'});
	}

	autoAssignRole(member) {
		DB.DB('Guild')
			.where('snowflake', member.guild.id)
			.pluck('id')
			.first()
			.then(guild_db_id => DB.DB('AutoAssignRole')
				.where('guildId', guild_db_id.id)
				.first())
			.then(auto_assign_role_or_alias =>
				auto_assign_role_or_alias ?
					DB.DB(auto_assign_role_or_alias.roleId ?
						'Role' :
						'Alias')
						.where('id', auto_assign_role_or_alias.roleId ?
							auto_assign_role_or_alias.roleId :
							auto_assign_role_or_alias.aliasId)
						.first() :
					undefined)
			.then(role_or_alias => {
				if (role_or_alias) {
					const role_name = role_or_alias.aliasName || role_or_alias.roleName;

					this.adjustUserRole(member.guild, member, role_name);
				}
			})
			.catch(err => log.error(err));
	}
}

module.exports = new Role();
