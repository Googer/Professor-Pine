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
      name: 'boss-set-notification',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'boss-set-notification',
      aliases: ['poke-set', 'boss-set', 'pokemon-set-notification', 'poke-set-notification'],
      description: 'Adds notifications to alert when a raid\'s pokémon has been determined and reported.',
      details: 'Use this command to request notifications when a raid\'s boss has been set.',
      examples: ['\t!boss-set-notification yes', '\t!boss-set-notification no', '\t!boss-set yes'],
      args: [
        {
          key: 'notification',
          label: 'notification',
          prompt: 'Would you like raid boss set notifications? yes / no',
          type: 'boolean'
        },

      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'boss-set-notification' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('bossset.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const onOff = args['notification'];

    User.setRaidBossNotification(message.member, onOff)
      .then(result => {
        message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍');
      })
      .catch(err => log.error(err))
  }
}

module.exports = BossSetCommand;
