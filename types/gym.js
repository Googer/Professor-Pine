"use strict";

const log = require('loglevel').getLogger('GymSearch'),
	Commando = require('discord.js-commando'),
	{GymParameter} = require('../app/constants'),
	Raid = require('../app/raid'),
	Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	async validate(value, message, arg) {
		try {
			const name_only = !!arg.is_screenshot,
				gyms = await Gym.search(message.channel.id, value.split(/\s/g), name_only);

			if (!gyms || gyms.length === 0) {
				const adjacent_gyms = await Gym.adjacentRegionsSearch(message.channel.id, value.split(/\s/g), name_only);

				if (!adjacent_gyms) {
					if (arg && !arg.is_screenshot) {
						return `"${value}" returned no gyms.\n\nPlease try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
					} else {
						return false;
					}
				}

				const adjacent_gym_name = adjacent_gyms.gyms[0].nickname ?
					adjacent_gyms.gyms[0].nickname :
					adjacent_gyms.gyms[0].gymName,
					adjacent_channel = message.channel.guild.channels
						.find(channel => channel.name === adjacent_gyms.channel);

				if (arg && !arg.is_screenshot) {
					return `"${value}" returned no gyms; did you mean "${adjacent_gym_name}" over in ${adjacent_channel.toString()}?  ` +
						`If so please cancel and use ${adjacent_channel.toString()} to try again.\n\n` +
						`Please try your search again, entering only the text you want to search for.\n\n${arg.prompt}`;
				} else {
					return `"${value}" returned no gyms; if the gym name was "${adjacent_gym_name}", try uploading your screenshot to the ${adjacent_channel.toString()} channel instead.`;
				}
			}

			const gym_id = gyms[0].gymId;

			if (arg.key !== GymParameter.FAVORITE && Raid.raidExistsForGym(gym_id)) {
				const raid = Raid.findRaid(gym_id),
					gym_name = gyms[0].nickname ?
						gyms[0].nickname :
						gyms[0].gymName,
					channel = await Raid.getChannel(raid.channel_id);

				if (arg && !arg.is_screenshot) {
					return `"${gym_name}" already has an active raid - ${channel.toString()}.\n\n` +
						`If this is the raid you are referring to please cancel and use ${channel.toString()}; ` +
						`otherwise try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
				} else {
					return `"${gym_name}" already has an active raid - ${channel.toString()}.`;
				}
			}

			return true;
		} catch (err) {
			log.error(err);
			if (arg && !arg.is_screenshot) {
				return `Invalid search terms entered.\n\nPlease try your search again, entering the text you want to search for.\n\n${arg.prompt}`;
			} else {
				return false;
			}
		}
	}

	async parse(value, message, arg) {
		const name_only = arg? arg.is_screenshot: false,
			gyms = await Gym.search(message.channel.id, value.split(/\s/g), name_only);

		return gyms[0].gymId;
	}
}

module.exports = GymType;
