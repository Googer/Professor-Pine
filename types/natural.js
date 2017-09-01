"use strict";

const Commando = require('discord.js-commando'),
	Utility = require('../app/utility');

class NaturalArgumentType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'natural');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message, value) ?
			'  Do **not** re-enter the `' + arg.command.name + '` command.' :
			'';

		const int = Number.parseInt(value);

		if (!Number.isNaN(int) && int >= 0) {
			return true;
		}

		message.reply('Please enter a number greater than zero!' + extra_error_message);
		return false;
	}

	parse(value, message, arg) {
		return Number.parseInt(value);
	}
}

module.exports = NaturalArgumentType;
