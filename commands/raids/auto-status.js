"use strict";

const log = require('loglevel').getLogger('AutoCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  Status = require('../../app/status');

class AutoCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'auto',
      group: CommandGroup.RAID_CRUD,
      memberName: 'auto',
      aliases: ['auto-status'],
      description: 'Changes your automatically-set status when reporting a raid.',
      details: 'Use this command to change the status you are automatically set as when reporting a new raid.',
      examples: ['\t!auto none', '\t!auto join'],
      args: [
        {
          key: 'status',
          label: 'status',
          prompt: 'What status do you wish to be automatically set as when reporting raids (none, interested, or join)?\n',
          type: 'status'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'auto' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('auto-status.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const status = args['status'];

    Status.setAutoStatus(message.member, status)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = AutoCommand;
