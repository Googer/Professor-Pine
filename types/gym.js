"use strict";

const Commando = require('discord.js-commando'),
	GymSearch = require('../app/gym-search');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	validate(value, message, arg) {
		try {
			return GymSearch.search(message.channel.name, value.split(' ')).length > 0;
		} catch (err) {
			return false;
		}
	}

	parse(value, message, arg) {
		const gyms = GymSearch.search(message.channel.name, value.split(' '));

		return gyms[0];
	}
}

module.exports = GymType;