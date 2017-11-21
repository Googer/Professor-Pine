"use strict";

const log = require('loglevel').getLogger('LsarCommand'),
	Commando = require('discord.js-commando'),
	{CommandGroup} = require('../../app/constants'),
	Helper = require('../../app/helper'),
	Role = require('../../app/role');

class LsarCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'lsar',
			group: CommandGroup.ADMIN,
			memberName: 'lsar',
			aliases: ['roles'],
			description: 'List self assignable roles.',
			argsType: 'multiple',
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'lsar') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}

				if (message.channel.type !== 'text') {
					return ['invalid-channel', message.reply('Please use `!lsar` from a public channel.')];
				}
			}

			return false;
		});
	}

	run(message, args) {
		Role.getRoles(message.channel, message.member).then((roles) => {
			const count = roles.length;

			let string = '';
			for (let i = 0; i < roles.length; i++) {
				let aliases = '';

				if (roles[i].aliases) {
					for (let j = 0; j < roles[i].aliases.length; j++) {
						aliases += `${roles[i].aliases[j]}`;

						if (j !== roles[i].aliases.length - 1) {
							aliases += ', ';
						}
					}
				}

				string += `${roles[i].value}`;

				if (aliases.length) {
					string += ` [${aliases}]`;
				}

				string += '\n';
			}

			return message.channel.send({
				'embed': {
					'title': `There are ${count} self-assignable roles`,
					'description':
						`${string}`,
					'color': 4437377
				}
			});
		}).catch((err) => {
			if (err && err.error) {
				message.reply(err.error)
					.catch(err => log.error(err));
			} else {
				log.error(err);
			}
		});
	}
}

module.exports = LsarCommand;
