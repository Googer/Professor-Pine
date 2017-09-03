"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid'),
	Utility = require('../app/utility'),
	GymSearch = require('../app/gym-search');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message, value) ?
			'  Do **not** re-enter the `' + arg.command.name + '` command.' :
			'';

		try {
			const gyms = GymSearch.search(message.channel.id, value.split(' '));

			if (!gyms || gyms.length === 0) {
				message.reply('\'' + value + '\' returned no gyms.' + extra_error_message);
				return false;
			}

			const gym = gyms[0];

			if (Raid.raidExistsForGym(gym)) {
				message.reply('Gym already has an active raid.' + extra_error_message);
				return false;
			}

			return true;
		} catch (err) {
			message.reply('Invalid search terms entered.' + extra_error_message);
			return false;
		}
	}

	parse(value, message, arg) {
		const gyms = GymSearch.search(message.channel.id, value.split(' '));

		return gyms[0];
	}
}

module.exports = GymType;