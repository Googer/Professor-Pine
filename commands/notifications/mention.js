"use strict";

const log = require('loglevel').getLogger('MentionCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  settings = require('../../data/settings');

class MentionCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'mentions',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'mentions',
      aliases: ['mention'],
      description: 'Enables or disables being mentioned in messages by Professor Pine.',
      details: 'Use this command to enable or disable being mentioned by Professor Pine in messages.',
      examples: ['\t!mentions off'],
      args: [
        {
          key: 'mention',
          label: 'boolean',
          prompt: 'Do you wish to be mentioned by Professor Pine in messages?\n',
          type: 'boolean'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'mentions' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('mentions.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const mention = args['mention'];

    Notify.setMention(message.member, mention)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = MentionCommand;
