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

		Helper.client.on('raidGymSet', (raid, member_id) =>
			this.notifyMembers(raid, member_id));
	}

	static getDbPokemonNumber(pokemon) {
		return pokemon.number || -pokemon.tier;
	}

	// get pokemon that member is interested in
	getPokemonNotifications(member) {
		return DB.DB('PokemonNotification')
			.innerJoin('User', {'PokemonNotification.userId': 'User.id'})
			.innerJoin('Guild', {'PokemonNotification.guildId': 'Guild.id'})
			.where('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.pluck('pokemon');
	}

	// get gyms that member is interested in
	getGymNotifications(member) {
		return DB.DB('GymNotification')
			.innerJoin('User', {'GymNotification.userId': 'User.id'})
			.innerJoin('Guild', {'GymNotification.guildId': 'Guild.id'})
			.where('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.pluck('gym');
	}

	// notify interested members for the raid associated with the given channel and pokemon (and / or or gym),
	// filtering out the reporting member
	async notifyMembers(raid, reporting_member_id) {
		const raid_channel = await Raid.getChannel(raid.channel_id),
			pokemon = raid.pokemon,
			gym_id = raid.gym_id,
			guild_id = raid_channel.guild.id,
			number = Notify.getDbPokemonNumber(pokemon),
			tier = pokemon.tier,
			db_pokemon_numbers = [...new Set([number, -tier])];

		// don't try to look up notifications from screenshot placeholders where
		// a valid pokemon wasn't determined
		let pokemon_members;

		if (pokemon.placeholder) {
			pokemon_members = [];
		} else {
			pokemon_members = await DB.DB('User')
				.innerJoin('PokemonNotification', {'User.id': 'PokemonNotification.userId'})
				.innerJoin('Guild', {'PokemonNotification.guildId': 'Guild.id'})
				.whereIn('PokemonNotification.pokemon', db_pokemon_numbers)
				.andWhere('Guild.snowflake', guild_id)
				.pluck('User.userSnowflake');
		}

		const gym_members = await  DB.DB('User')
			.innerJoin('GymNotification', {'User.id': 'GymNotification.userId'})
			.innerJoin('Guild', {'GymNotification.guildId': 'Guild.id'})
			.whereIn('GymNotification.gym', gym_id)
			.andWhere('Guild.snowflake', guild_id)
			.pluck('User.userSnowflake');

		[...new Set([...pokemon_members, ...gym_members])]
			.filter(member_id => member_id !== reporting_member_id)
			.filter(member_id => raid_channel.guild.members.has(member_id))
			.filter(member_id => raid_channel.permissionsFor(member_id).has('VIEW_CHANNEL'))
			.map(member_id => Helper.getMemberForNotification(guild_id, member_id))
			.forEach(async member => {
				const raid_notification_message = await Raid.getRaidNotificationMessage(raid),
					formatted_message = await Raid.getFormattedMessage(raid);

				member.send(raid_notification_message, formatted_message)
					.catch(err => log.error(err));
			});
	}

	// give pokemon notification to user
	assignPokemonNotification(member, pokemon) {
		return this.pokemonNotificationExists(member, pokemon)
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
							return DB.DB('PokemonNotification')
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
	removeAllPokemonNotifications(member) {
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
			.then(user_id => DB.DB('PokemonNotification')
				.where('userId', user_id.id)
				.andWhere('guildId', guild_db_id)
				.del())
	}

	// remove pokemon notification from user if they have it
	removePokemonNotification(member, pokemon) {
		return new Promise((resolve, reject) => {
			this.pokemonNotificationExists(member, pokemon)
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
							.then(user_id => DB.DB('PokemonNotification')
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
	async pokemonNotificationExists(member, pokemon) {
		const result = await DB.DB('PokemonNotification')
			.innerJoin('User', {'User.id': 'PokemonNotification.userId'})
			.innerJoin('Guild', {'Guild.id': 'PokemonNotification.guildId'})
			.where('PokemonNotification.pokemon', Notify.getDbPokemonNumber(pokemon))
			.andWhere('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.count('* as count')
			.first();

		return Promise.resolve(result.count > 0);
	}

	// give pokemon notification to user
	assignGymNotification(member, gym) {
		return this.gymNotificationExists(member, gym)
			.then(exists => {
				if (!exists) {
					let user_db_id;

					// add gym notification for member to DB
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
							return DB.DB('GymNotification')
								.insert({
									gym: gym,
									guildId: guild_id.id,
									userId: user_db_id
								})
						});
				} else {
					return exists;
				}
			});
	}

	// removes all gym notifications from user
	removeAllGymNotifications(member) {
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
			.then(user_id => DB.DB('GymNotification')
				.where('userId', user_id.id)
				.andWhere('guildId', guild_db_id)
				.del())
	}

	// remove gym notification from user if they have it
	removeGymNotification(member, gym) {
		return new Promise((resolve, reject) => {
			this.gymNotificationExists(member, gym)
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
							.then(user_id => DB.DB('GymNotification')
								.where('gym', gym)
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

	// check if notification exists for member and gym combination
	async gymNotificationExists(member, gym) {
		const result = await DB.DB('GymNotification')
			.innerJoin('User', {'User.id': 'GymNotification.userId'})
			.innerJoin('Guild', {'Guild.id': 'GymNotification.guildId'})
			.where('GymNotification.gym', gym)
			.andWhere('User.userSnowflake', member.user.id)
			.andWhere('Guild.snowflake', member.guild.id)
			.count('* as count')
			.first();

		return Promise.resolve(result.count > 0);
	}
}

module.exports = new Notify();
