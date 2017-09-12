"use strict";

const Commando = require('discord.js-commando'),
	Utility = require('../app/utility');

class NaturalArgumentType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'natural');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message) ?
			'  Do **not** re-enter the `' + message.command.name + '` command.' :
			'';

		const int = Number.parseInt(value);

		if (!Number.isNaN(int) && int > 0) {
			return true;
		}

		message.reply('Please enter a number greater than zero!' + extra_error_message)
			.catch(err => console.log(err));
		return false;
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
