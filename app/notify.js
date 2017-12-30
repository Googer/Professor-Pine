"use strict";

const log = require('loglevel').getLogger('Notify'),
	DB = require('./db');

class Notify {
	constructor() {
	}

	getNotifications(member) {
		return DB.DB('Notification')
			.innerJoin('User', {'Notification.userId': 'User.id'})
			.innerJoin('Guild', {'Notification.guildId': 'Guild.id'})
			.where('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.pluck('pokemon');
	}

	getMembers(guild, pokemon) {
		return DB.DB('User')
			.innerJoin('Notification', {'User.id': 'Notification.userId'})
			.innerJoin('Guild', {'Notification.guildId': 'Guild.id'})
			.where('Guild.snowflake', guild.id)
			.andWhere('Notification.pokemon', pokemon.number)
			.pluck('User.userSnowflake');
	}

	// give pokemon notification to user
	assignNotification(member, pokemon) {
		return this.notificationExists(member, pokemon)
			.then(exists => {
				if (!exists) {
					let user_db_id;

					// add pokemon notification for member to DB
					return DB.insertIfAbsent('User', Object.assign({},
						{
							userSnowflake: member.user.id
						}))
						.then(user_id => {
							user_db_id = user_id[0];

							return DB.DB('Guild')
								.where('snowflake', member.guild.id)
								.pluck('id')
								.first();
						})
						.then(guild_id => {
							return DB.DB('Notification')
								.insert({
									pokemon: pokemon.number,
									guildId: guild_id.id,
									userId: user_db_id
								})
						});
				} else {
					return exists;
				}
			});
	}

	// remove pokemon notification from user if they have it
	removeNotification(member, pokemon) {
		return new Promise((resolve, reject) => {
			this.notificationExists(member, pokemon)
				.then(exists => {
					if (exists) {
						let guild_db_id;

						DB.DB('Guild')
							.where('snowflake', member.guild.id)
							.pluck('id')
							.first()
							.then(guild_id => {
								guild_db_id = guild_id.id;

								return DB.DB('User')
									.where('userSnowflake', member.user.id)
									.pluck('id')
									.first();
							})
							.then(user_id => DB.DB('Notification')
								.where('pokemon', pokemon.number)
								.andWhere('userId', user_id.id)
								.andWhere('guildId', guild_db_id)
								.del())
							.then(result => resolve(result))
							.catch(err => reject(err));
					} else {
						resolve();
					}
				});
		});
	}

	async notificationExists(member, pokemon) {
		const result = await DB.DB('Notification')
			.innerJoin('User', {'User.id': 'Notification.userId'})
			.innerJoin('Guild', {'Guild.id': 'Notification.guildId'})
			.where('Notification.pokemon', pokemon.number)
			.andWhere('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.count('* as count')
			.first();

		return Promise.resolve(result.count > 0);
	}
}

module.exports = new Notify();
