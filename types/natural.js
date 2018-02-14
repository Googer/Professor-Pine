"use strict";

const Commando = require('discord.js-commando');

class NaturalArgumentType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'natural');
	}

	validate(value, message, arg) {
		const Raid = require('../app/raid'),
			group_ids = Raid.getRaid(message.channel.id).groups
				.map(group => group.id),
			group_id = value.trim().toUpperCase(),
			valid_group = group_ids.includes(group_id) || group_id === 'A',
			int = Number.parseInt(value);

		if (valid_group) {
			return `Specify which group to join with the \`${message.client.commandPrefix}group\` command!`;
		}

		if (!Number.isNaN(int) && int > 0) {
			return true;
		}

		return `Please enter a number greater than zero!\n\n${arg.prompt}`;
	}

	parse(value, message, arg) {
		const int = Number.parseInt(value);

		return !!value.match(/^\+\d+/) ?
			int :
			int - 1;
	}

	static get UNDEFINED_NUMBER() {
		return "undefined";
	}
}

module.exports = NaturalArgumentType;
