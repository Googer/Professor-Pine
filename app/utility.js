"use strict";

class Utility {
	constructor() {
	}

	static isOneLiner(message) {
		return message.message.content.startsWith(message.client.options.commandPrefix);
	}

	static async cleanConversation(initial_message, delete_original = false) {
		const channel = initial_message.channel,
			author = initial_message.author,
			bot = initial_message.client.user,
			start_time = initial_message.createdTimestamp;

		if (delete_original) {
			initial_message.delete()
				.catch(err => console.error(err));
		}

		channel.messages.array() // cache of recent messages, should be sufficient
			.filter(message => {
				return (message.createdTimestamp > start_time) &&
					(message.author === author ||
						(message.author === bot && message.isMemberMentioned(author)));
			})
			.forEach(message => message.delete()
				.catch(err => console.error(err)));
	}
}

module.exports = Utility;