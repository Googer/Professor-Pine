"use strict";

const log = require('loglevel').getLogger('BossSetCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  User = require('../../app/user');

class BossSetCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'new-train-notification',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'new-train-notification',
      aliases: ['created-train-notification'],
      description: 'Adds notifications to alert when a new train has been created.',
      details: 'Use this command to request notifications when a new train has been created.',
      examples: ['\t!new-train-notification yes', '\t!new-train-notification no'],
      args: [
        {
          key: 'notification',
          label: 'notification',
          prompt: 'Would you like raid new train notifications? yes / no',
          type: 'boolean'
        },

      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'new-train-notification' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('newtrain.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const onOff = args['notification'];

    User.setNewTrainNotification(message.member, onOff)
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
      })
      .catch(err => log.error(err))
  }
}

module.exports = BossSetCommand;
