"use strict";

const log = require('loglevel').getLogger('DeleteCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid');

class DeleteCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'delete',
			group: 'raid-crud',
			memberName: 'delete',
			aliases: ['nuke', 'erase'],
			description: 'Deletes an existing raid.',
			details: 'Use this command to delete a raid (usable only by admins and moderators).',
			examples: ['\t!delete', '\t!nuke'],
			guildOnly: true
		});

		client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'delete' &&
				!Raid.validRaid(message.channel.id)) {
				return ['invalid-channel', message.reply('Delete a raid from its raid channel!')];
			}
			return false;
		});
	}

	hasPermission(message) {
		const has_permission = Helper.isManagement(message);

		if (!has_permission) {
			const admin_role = Helper.getRole(message.guild, 'admin'),
				moderator_role = Helper.getRole(message.guild, 'moderator');

			return `Only a user with ${admin_role} or ${moderator_role} role can run this command!`;
		}

		return has_permission;
	}

	async run(message, args) {
		Raid.deleteRaid(message.channel.id);
	}
}

module.exports = DeleteCommand;
