"use strict";

const log = require('loglevel').getLogger('Utility'),
  settings = require('../data/settings');

class Utility {
  constructor() {
  }

  static async cleanCollector(collectionResult) {
    const delay = settings.messageCleanupDelaySuccess,
      messagesToDelete = [...collectionResult.prompts, ...collectionResult.answers];

    if (messagesToDelete.length === 0) {
      return;
    }

    const channel = messagesToDelete[0].channel;

    log.debug(`Deleting messages [${messagesToDelete.map(message => message.id).join(', ')}]`);
    channel.client.setTimeout(
      () => {
        if (messagesToDelete.length > 1) {
          channel.bulkDelete(messagesToDelete)
            .catch(err => log.error(err))
        } else {
          messagesToDelete[0].delete()
            .catch(err => log.error(err));
        }
      },
      delay);
  }

  static async cleanConversation(initialMessage, commandSuccessful, deleteOriginal = false) {
    const channel = initialMessage.channel,
      author = initialMessage.author,
      bot = initialMessage.client.user,
      startTime = initialMessage.createdTimestamp,
      delay = commandSuccessful ?
        settings.messageCleanupDelaySuccess :
        settings.messageCleanupDelayError,
      messagesToDelete = [];

    if (channel.type === 'dm') {
      return;
    }

    if (deleteOriginal) {
      messagesToDelete.push(initialMessage);
    }

    messagesToDelete.push(...channel.messages.array() // cache of recent messages, should be sufficient
      .filter(message => (message.createdTimestamp > startTime) &&
        (message.author === author ||
					(message.author === bot && message.mentions.members.has(author.id))) &&
						!message.preserve));  // commandFinalize was deleting our results which happen to mention the user

    if (messagesToDelete.length === 0) {
      return;
    }

    log.debug(`Deleting messages [${messagesToDelete.map(message => message.id).join(', ')}]`);
    channel.client.setTimeout(
      () => {
        if (messagesToDelete.length > 1) {
          channel.bulkDelete(messagesToDelete)
            .catch(err => log.error(err))
        } else {
          messagesToDelete[0].delete()
            .catch(err => log.error(err));
        }
      },
      delay);
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Utility;
