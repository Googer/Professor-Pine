"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class AsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'asar',
			group: 'admin',
			memberName: 'asar',
			description: 'Add new self assignable role.',
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `asar` from a public channel.');
			return;
		}

		Role.addNewRoles(message.channel, message.member, args);
	}
}

module.exports = AsarCommand;
