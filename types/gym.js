"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid'),
	Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	async validate(value, message, arg) {
		try {
			const gyms = await Gym.search(message.channel.id, value.split(' '));

			if (!gyms || gyms.length === 0) {
				const adjacent_gyms = await Gym.adjacentSearch(message.channel.id, value.split(' '));

				if (!adjacent_gyms) {
					return `"${value}" returned no gyms.\n\nPlease try your search again, entering the text you want to search for.\n`;
				}

				const adjacent_gym_name = adjacent_gyms.gyms[0].nickname ?
					adjacent_gyms.gyms[0].nickname :
					adjacent_gyms.gyms[0].gymName,
					adjacent_channel = message.channel.guild.channels
						.find(channel => channel.name === adjacent_gyms.channel);

				return `"${value}" returned no gyms; did you mean "${adjacent_gym_name}" over in ${adjacent_channel.toString()}?  ` +
					`If so please cancel and use ${adjacent_channel.toString()} to try again.\n\n` +
					'Please try your search again, entering only the text you want to search for.\n';
			}

			const gym_id = gyms[0].gymId;

			if (Raid.raidExistsForGym(gym_id)) {
				const raid = Raid.findRaid(gym_id),
					gym_name = gyms[0].nickname ?
						gyms[0].nickname :
						gyms[0].gymName,
					channel = await Raid.getChannel(raid.channel_id);
				return `"${gym_name}" already has an active raid - ${channel.toString()}.\n\n` +
					`If this is the raid you are referring to please cancel and use ${channel.toString()}; ` +
					'otherwise try your search again, entering the text you want to search for.\n';
			}

			return true;
		} catch (err) {
			return 'Invalid search terms entered.\n\nPlease try your search again, entering the text you want to search for.\n';
		}
	}

	async parse(value, message, arg) {
		const gyms = await Gym.search(message.channel.id, value.split(' '));

		return gyms[0].gymId;
	}
}

module.exports = GymType;