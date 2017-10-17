"use strict";

const log = require('loglevel').getLogger('DeleteCommand'),
	Commando = require('discord.js-commando'),
	Helper = require('../../app/helper'),
	Raid = require('../../app/raid'),
	Utility = require('../../app/utility');

class DeleteCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'delete',
			group: 'raid-crud',
			memberName: 'delete',
			aliases: ['nuke', 'erase'],
			description: 'Deletes an existing raid (usable only by admins and moderators).\n',
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

		this.deletionReasonCollector = new Commando.ArgumentCollector(client, [
			{
				key: 'reason',
				label: 'reason',
				prompt: 'Only moderators or administrators can actually delete a raid.\n\n' +

				'If this raid only needs correction such as correcting an incorrect raid boss or location, cancel this command ' +
				'(or wait for it to timeout) and make the change(s) using the appropriate command(s).  Lack of interest in a raid ' +
				'is *not* a valid reason for deleting one!\n\n' +

				'If you are sure you wish for this raid to be deleted, enter a reason and a moderator will be called upon.\n',
				type: 'string'
			}
		]);
	}

	async run(message, args) {
		const has_permission = Helper.isManagement(message);

		if (has_permission) {
			message.channel.send('Deleting this raid in 15 seconds!')
				.then(message => Utility.sleep(15000))
				.then(resolve => Raid.deleteRaid(message.channel.id))
				.catch(err => log.error(err));
		} else {
			this.deletionReasonCollector.obtain(message)
				.then(collection_result => {
					if (!collection_result.cancelled) {
						const reason = collection_result.values['reason'].trim();

						if (reason.length > 0) {
							const admin_role = Helper.getRole(message.guild, 'admin'),
								moderator_role = Helper.getRole(message.guild, 'moderator');

							return message.channel.send(`${admin_role} / ${moderator_role}:  Raid deletion requested!`);
						}
					} else {
						Utility.cleanCollector(collection_result);
					}
				})
				.catch(err => log.error(err));
		}
	}
}

module.exports = DeleteCommand;
