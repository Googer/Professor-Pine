"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class IAmNotCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'iamnot',
			group: 'roles',
			memberName: 'iamnot',
			aliases: ['unassign'],
			description: 'Unassign roles from yourself.',
			details: '?????',
			examples: ['\t!iamnot Mystic', '\t!unassign Valor'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `.iamnot` from a public channel.');
			return;
		}

		Role.assignRole(message.channel, message.member, args[0]);
	}
}

module.exports = IAmNotCommand;
