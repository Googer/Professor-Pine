"use strict";

const log = require('loglevel').getLogger('Utility'),
	settings = require('../data/settings');

class Utility {
	constructor() {
	}

	static async cleanCollector(collection_result) {
		const delay = settings.message_cleanup_delay_success,
			messages_to_delete = [...collection_result.prompts, ...collection_result.answers],
			channel = messages_to_delete[0].channel;

		channel.client.setTimeout(
			() => channel.bulkDelete(messages_to_delete)
				.catch(err => log.error(err)),
			delay);
	}

	static async cleanConversation(initial_message, command_successful, delete_original = false) {
		const channel = initial_message.channel,
			author = initial_message.author,
			bot = initial_message.client.user,
			start_time = initial_message.createdTimestamp,
			delay = command_successful ?
				settings.message_cleanup_delay_success :
				settings.message_cleanup_delay_error,
			messages_to_delete = [];

		if (channel.type === 'dm') {
			return;
		}

		if (delete_original) {
			messages_to_delete.push(initial_message);
		}

		messages_to_delete.push(...channel.messages.array() // cache of recent messages, should be sufficient
			.filter(message => (message.createdTimestamp > start_time) &&
				(message.author === author ||
					(message.author === bot && message.mentions.members.has(author.id)))));

		channel.client.setTimeout(
			() => channel.bulkDelete(messages_to_delete)
				.catch(err => log.error(err)),
			delay);
	}

	static sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

module.exports = Utility;