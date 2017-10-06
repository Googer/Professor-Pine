"use strict";

const Commando = require('discord.js-commando'),
	Helper = require('../app/helper'),
	Raid = require('../app/raid'),
	Utility = require('../app/utility'),
	Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	async validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message) ?
			'  Do **not** re-enter the `' + message.command.name + '` command.' :
			'';

		try {
			const gyms = await Gym.search(message.channel.id, value.split(' '));

			if (!gyms || gyms.length === 0) {
				const adjacent_gyms = await Gym.adjacentSearch(message.channel.id, value.split(' '));

				if (!adjacent_gyms) {
					return '\'' + value + '\' returned no gyms.' + extra_error_message;
				}

				const adjacent_gym_name = adjacent_gyms.gyms[0].nickname ?
					adjacent_gyms.gyms[0].nickname :
					adjacent_gyms.gyms[0].gymName,
					adjacent_channel = message.channel.guild.channels
						.find(channel => channel.name === adjacent_gyms.channel);

				return `'${value}' returned no gyms here but *did* find '${adjacent_gym_name}' in ${adjacent_channel.toString()}.${extra_error_message}`;
			}

			const gym_id = gyms[0].gymId;

			if (Raid.raidExistsForGym(gym_id)) {
				const raid = Raid.findRaid(gym_id),
					channel = await Raid.getChannel(raid.channel_id);
				return `Gym already has an active raid - ${channel.toString()}.` + extra_error_message;
			}

			return true;
		} catch (err) {
			return 'Invalid search terms entered.' + extra_error_message;
		}
	}

	async parse(value, message, arg) {
		const gyms = await Gym.search(message.channel.id, value.split(' '));

		return gyms[0].gymId;
	}
}

module.exports = GymType;