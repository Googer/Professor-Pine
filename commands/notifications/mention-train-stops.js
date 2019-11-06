"use strict";

const log = require('loglevel').getLogger('MentionTrainStopsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  settings = require('../../data/settings');

class MentionTrainStopsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'mentions-train-stops',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'mentions-train-stops',
      aliases: ['mention-train-stops', 'mention-train-stop', 'mention-train-movement', 'mentions-train-movement'],
      description: 'Enables or disables being mentioned in train movement messages by Professor Pine.',
      details: 'Use this command to enable or disable being mentioned by Professor Pine in train movement messages.',
      examples: ['\t!mentions-train-stops off'],
      args: [
        {
          key: 'mention',
          label: 'boolean',
          prompt: 'Do you wish to be mentioned by Professor Pine in train movement messages?\n',
          type: 'boolean'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'mentions-train-stops' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('mentions.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const mention = args['mention'];

    Notify.setMentionTrainGroups(message.member, mention)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = MentionTrainStopsCommand;
