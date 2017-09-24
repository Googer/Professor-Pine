"use strict";

const Commando = require('discord.js-commando');
const Role = require('../../app/role');

class IAmCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'iam',
			group: 'roles',
			memberName: 'iam',
			aliases: ['assign'],
			description: 'Assign available roles to yourself.',
			details: '?????',
			examples: ['\t!iam Mystic', '\t!role Valor', '\t!assign Instinct']
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please use `!iam` from a public channel.');
			return;
		}

		if (!args.length) {
			// if no arguments were given, send the user a list of roles w/ optional descriptions
			Role.getRoles(message.channel, message.member).then((roles) => {
				const count = roles.length;

				let string = '';
				for (let i=0; i<roles.length; i++) {
					string += `**${roles[i].value}**\n${(roles[i].description) ? roles[i].description + '\n\n': ''}`;
				}

				message.channel.send('Type `!iam <name>` to add one of the following roles to your account.', {
					'embed': {
						'title': `There are ${count} self assignable roles`,
						'description':
							`${string}`,
						'color': 4437377
					}
				}).then((bot_message) => {
					// bot_message.react('⬅');
					// bot_message.react('➡');
				});
			}).catch((err) => {
				if (err && err.error) {
					message.reply(err.error);
				} else {
					console.log(err);
				}
			});
		} else {
			Role.assignRole(message.channel, message.member, args).then(() => {
				message.react('👍');
			}).catch((err) => {
				if (err && err.error) {
					message.reply(err.error);
				} else {
					console.log(err);
				}
			});
		}
	}
}

module.exports = IAmCommand;
