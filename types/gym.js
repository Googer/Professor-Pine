"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid'),
	Utility = require('../app/utility'),
	Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message, value) ?
			'  Do **not** re-enter the `' + arg.command.name + '` command.' :
			'';

		try {
			const gyms = Gym.search(message.channel.id, value.split(' '));

			if (!gyms || gyms.length === 0) {
				message.reply('\'' + value + '\' returned no gyms.' + extra_error_message);
				return false;
			}

			const gym_id = gyms[0].gymId;

			if (Raid.raidExistsForGym(gym_id)) {
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
		const gyms = Gym.search(message.channel.id, value.split(' '));

		return gyms[0].gymId;
	}
}

module.exports = GymType;