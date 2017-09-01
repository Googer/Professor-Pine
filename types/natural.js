"use strict";

const Commando = require('discord.js-commando');

class NaturalArgumentType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'natural');
	}

	validate(value, message, arg) {
		const int = Number.parseInt(value);
		return !Number.isNaN(int) && int >= 0;
	}

	parse(value, message, arg) {
		return Number.parseInt(value);
	}
}

module.exports = NaturalArgumentType;
