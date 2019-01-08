"use strict";

const log = require('loglevel').getLogger('MentionGroupsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  Notify = require('../../app/notify'),
  settings = require('../../data/settings');

class MentionGroupsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'mentions-groups',
      group: CommandGroup.NOTIFICATIONS,
      memberName: 'mentions-groups',
      aliases: ['mention-group', 'mention-groups'],
      description: 'Enables or disables being mentioned in messages by Professor Pine when a new group is created.',
      details: 'Use this command to enable or disable being mentioned by Professor Pine in messages after a new group is created.',
      examples: ['\t!mentions-groups off'],
      args: [
        {
          key: 'mention',
          label: 'boolean',
          prompt: 'Do you wish to be mentioned by Professor Pine in messages about a new group?\n',
          type: 'boolean'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'mentions-groups' && !Helper.isBotChannel(message)) {
        return ['invalid-channel', message.reply(Helper.getText('mentions.warning', message))];
      }
      return false;
    });
  }

  async run(message, args) {
    const mention = args['mention'];

    Notify.setMentionGroups(message.member, mention)
      .then(result => message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍'))
      .catch(err => log.error(err));
  }
}

module.exports = MentionGroupsCommand;
