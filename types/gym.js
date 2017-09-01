"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid'),
	GymSearch = require('../app/gym-search');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	validate(value, message, arg) {
		try {
			const gyms = GymSearch.search(message.channel, value.split(' '));

			if (!gyms || gyms.length === 0) {
				message.reply('No gyms found with entered search terms.');
				return false;
			}

			const gym = gyms[0];

			if (Raid.raidExistsForGym(gym)) {
				message.reply('Gym already has an active raid.');
				return false;
			}

			return true;
		} catch (err) {
			message.reply('Invalid search terms entered.');
			return false;
		}
	}

	parse(value, message, arg) {
		const gyms = GymSearch.search(message.channel, value.split(' '));

		return gyms[0];
	}
}

module.exports = GymType;