"use strict";

const log = require('loglevel').getLogger('Notify'),
	DB = require('./db'),
	Helper = require('./helper'),
	Raid = require('./raid');

class Notify {
	constructor() {
	}

	initialize() {
		Helper.client.on('raidCreated', (raid, member_id) =>
			this.notifyMembers(raid, member_id));

		Helper.client.on('raidPokemonSet', (raid, member_id) =>
			this.notifyMembers(raid, member_id));
	}

	static getDbPokemonNumber(pokemon) {
		return pokemon.number || -pokemon.tier;
	}

	// get pokemon that member is interested in
	getNotifications(member) {
		return DB.DB('Notification')
			.innerJoin('User', {'Notification.userId': 'User.id'})
			.innerJoin('Guild', {'Notification.guildId': 'Guild.id'})
			.where('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.pluck('pokemon');
	}

	// notify interested members for the raid associated with the given channel and pokemon,
	// filtering out the reporting member
	async notifyMembers(raid, reporting_member_id) {
		const raid_channel = await Raid.getChannel(raid.channel_id),
			pokemon = raid.pokemon,
			guild_id = raid_channel.guild.id,
			number = Notify.getDbPokemonNumber(pokemon),
			tier = pokemon.tier,
			db_pokemon_numbers = [...new Set([number, -tier])];

		// don't try to look up notifications from screenshot placeholders where
		// a valid pokemon wasn't determined
		if (pokemon.placeholder) {
			return;
		}

		DB.DB('User')
			.innerJoin('Notification', {'User.id': 'Notification.userId'})
			.innerJoin('Guild', {'Notification.guildId': 'Guild.id'})
			.whereIn('Notification.pokemon', db_pokemon_numbers)
			.andWhere('Guild.snowflake', guild_id)
			.pluck('User.userSnowflake')
			.then(members => {
				[...new Set(members)]
					.filter(member_id => member_id !== reporting_member_id)
					.filter(member_id => raid_channel.permissionsFor(member_id).has('VIEW_CHANNEL'))
					.map(member_id => Helper.getMemberForNotification(guild_id, member_id))
					.forEach(async member => {
						const raid_notification_message = await Raid.getRaidNotificationMessage(raid),
							formatted_message = await Raid.getFormattedMessage(raid);

						member.send(raid_notification_message, formatted_message)
							.catch(err => log.error(err));
					});
			})
			.catch(err => log.error(err));
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
									pokemon: Notify.getDbPokemonNumber(pokemon),
									guildId: guild_id.id,
									userId: user_db_id
								})
						});
				} else {
					return exists;
				}
			});
	}

	// removes all pokemon notifications from user
	removeAllNotifications(member) {
		let guild_db_id;

		return DB.DB('Guild')
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
				.where('userId', user_id.id)
				.andWhere('guildId', guild_db_id)
				.del())
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
								.where('pokemon', Notify.getDbPokemonNumber(pokemon))
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

	// check if notification exists for member and pokemon combination
	async notificationExists(member, pokemon) {
		const result = await DB.DB('Notification')
			.innerJoin('User', {'User.id': 'Notification.userId'})
			.innerJoin('Guild', {'Guild.id': 'Notification.guildId'})
			.where('Notification.pokemon', Notify.getDbPokemonNumber(pokemon))
			.andWhere('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.count('* as count')
			.first();

		return Promise.resolve(result.count > 0);
	}
}

module.exports = new Notify();
