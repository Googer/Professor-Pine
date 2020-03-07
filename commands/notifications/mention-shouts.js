"use strict";

const log = require('loglevel').getLogger('MentionShoutsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  settings = require('../../data/settings');

class MentionShoutsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'mentions-shouts',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'mentions-shouts',
      aliases: ['mention-shouts', 'mention-shout'],
      description: 'Enables or disables being mentioned in !shout messages by Professor Pine.',
      details: 'Use this command to enable or disable being mentioned by Professor Pine in !shout messages.',
      examples: ['\t!mentions-shouts off'],
      args: [
        {
          key: 'mention',
          label: 'boolean',
          prompt: 'Do you wish to be mentioned by Professor Pine in !shout messages?\n',
          type: 'boolean'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'mentions-shouts' && !Helper.isBotChannel(message)) {
        return {
          reason: 'invalid-channel',
          response: message.reply(Helper.getText('mentions.warning', message))
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const mention = args['mention'];

    Notify.setMentionShouts(message.member, mention)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = MentionShoutsCommand;
