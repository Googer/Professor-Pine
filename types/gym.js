"use strict";

const Commando = require('discord.js-commando'),
	LocationSearch = require('../app/gym-search');

class GymType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'gym');
	}

	validate(value, message, arg) {
		try {
			return LocationSearch.search(message.channel.name, value.split(' ')).length > 0;
		} catch (err) {
			return false;
		}
	}

	parse(value, message, arg) {
		const gyms = LocationSearch.search(message.channel.name, value.split(' '));

		return gyms[0];
	}
}

module.exports = GymType;