"use strict";

const log = require('loglevel').getLogger('Utility'),
  settings = require('../data/settings');

class Utility {
  constructor() {
  }

  static async cleanCollector(collectionResult) {
    const delay = settings.messageCleanupDelaySuccess,
      messagesToDelete = [...collectionResult.prompts, ...collectionResult.answers];

    await Utility.deleteMessages(messagesToDelete, delay);
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

    messagesToDelete.push(...channel.messages.cache.array() // cache of recent messages, should be sufficient
      .filter(message => (message.createdTimestamp > startTime) &&
        (message.author === author ||
          (message.author === bot && message.mentions.members.has(author.id))) &&
        !message.preserve));  // commandFinalize was deleting our results which happen to mention the user

    await Utility.deleteMessages(messagesToDelete, delay);
  }

  static async deleteMessages(messages, delay = 0) {
    if (!messages || messages.length === 0) {
      return;
    }

    log.debug(`Deleting messages [${messages.map(message => message.id).join(', ')}]`);

    const channel = messages[0].channel;
    if (delay > 0) {
      channel.client.setTimeout(
        () => {
          if (messages.length > 1) {
            channel.bulkDelete(messages)
              .catch(err => log.error(err));
          } else {
            messages[0].delete()
              .catch(err => log.error(err));
          }
        }, delay);
    } else {
      if (messages.length > 1) {
        channel.bulkDelete(messages)
          .catch(err => log.error(err));
      } else {
        messages[0].delete()
          .catch(err => log.error(err));
      }
    }
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Utility;
