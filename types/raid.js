"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid');

class RaidType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'raid');
	}

	validate(value, message, arg) {
		const valid = !!Raid.getRaid(message.channel, message.member, value);

		if (!valid) {
			message.reply(Raid.getShortFormattedMessage(Raid.getAllRaids(message.channel, message.member)));
		}

		return valid;
	}

	parse(value, message, arg) {
		return Raid.getRaid(message.channel, message.member, value);
	}
}

module.exports = RaidType;