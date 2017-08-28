"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class RsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'rsar',
			group: 'admin',
			memberName: 'rsar',
			description: 'Add new self assignable role.',
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `rsar` from a public channel.');
			return;
		}

		Role.removeOldRoles(message.channel, message.member, args);
	}
}

module.exports = RsarCommand;
