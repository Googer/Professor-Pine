"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid'),
	Utility = require('../app/utility'),
	Gym = require('../app/gym');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	async validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message) ?
			'  Do **not** re-enter the `' + arg.command.name + '` command.' :
			'';

		try {
			const gyms = await Gym.search(message.channel.id, value.split(' '));

			if (!gyms || gyms.length === 0) {
				return '\'' + value + '\' returned no gyms.' + extra_error_message;
			}

			const gym_id = gyms[0].gymId;

			if (Raid.raidExistsForGym(gym_id)) {
				return 'Gym already has an active raid.' + extra_error_message;
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