"use strict";

const Commando = require('discord.js-commando'),
	settings = require('../data/settings.json');

class EndTimeType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'endtime');
	}

	validate(value, message, arg) {
		const matches = value.match(/\d+/g);

		if (!matches) {
			message.reply('Time entered is not valid.  Try something in h:mm format (such as `1:43`).');
			return false;
		}

		const minutes = matches.length === 1
			? Number.parseInt(matches[0])
			: Number.parseInt(matches[0]) * 60 + Number.parseInt(matches[1]);

		if (minutes > settings.max_end_time) {
			message.reply('Time entered is too far in the future.  Try something in h:mm format (such as `1:43`).');
			return false;
		}

		return true;
	}

	parse(value, message, arg) {
		const matches = value.match(/\d+/g);

		return matches.length === 1
			? Number.parseInt(matches[0])
			: Number.parseInt(matches[0]) * 60 + Number.parseInt(matches[1]);
	}
}

module.exports = EndTimeType;