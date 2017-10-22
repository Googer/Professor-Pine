"use strict";

const log = require('loglevel').getLogger('Utility'),
	settings = require('../data/settings');

class Utility {
	constructor() {
	}

	static async cleanCollector(collection_result) {
		const delay = settings.message_cleanup_delay;

		collection_result.prompts
			.forEach(prompt => prompt.delete({timeout: delay})
				.catch(err => log.error(err)));

		collection_result.answers
			.forEach(answer => answer.delete({timeout: delay})
				.catch(err => log.error(err)));
	}

	static async cleanConversation(initial_message, delete_original = false) {
		const channel = initial_message.channel,
			author = initial_message.author,
			bot = initial_message.client.user,
			start_time = initial_message.createdTimestamp,
			delay = settings.message_cleanup_delay;

		const messages_to_delete = [];

		if (delete_original) {
			messages_to_delete.push(initial_message);
			initial_message.delete({timeout: delay})
				.catch(err => log.error(err));
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

	static sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

module.exports = Utility;