"use strict";

const log = require('loglevel').getLogger('Utility');

class Utility {
	constructor() {
	}

	static async cleanConversation(initial_message, delete_original = false) {
		const channel = initial_message.channel,
			author = initial_message.author,
			bot = initial_message.client.user,
			start_time = initial_message.createdTimestamp;

		const messages_to_delete = [];

		if (delete_original) {
			messages_to_delete.push(initial_message);
		}

		messages_to_delete.push(...channel.messages.array() // cache of recent messages, should be sufficient
			.filter(message => {
				return (message.createdTimestamp > start_time) &&
					(message.author === author ||
						(message.author === bot && message.mentions.members.has(author.id)));
			}));

		channel.bulkDelete(messages_to_delete)
			.catch(err => log.error(err));
	}
}

module.exports = Utility;