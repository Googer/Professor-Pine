"use strict";

const log = require('loglevel').getLogger('DescriptionCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings.json');

class SetDescriptionCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'info',
      group: CommandGroup.MEETUP,
      memberName: 'info',
      aliases: ['set-info', 'description', 'set-description'],
      description: 'Sets the information for a meetup.\n',
      details: 'Use this command to set the information for a meetup.',
      examples: ['\t!info Trade meetup at the library'],
      args: [
        {
          key: 'description',
          label: 'description',
          prompt: 'What information do you wish to set for this meetup?\n',
          type: 'string',
          wait: 120
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'info' &&
        !PartyManager.validParty(message.channel.id, [PartyType.MEETUP])) {
        return {
          reason: 'invalid-channel',
          response: message.reply('Set the information for a meetup from its channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const description = args['description'],
      meetup = PartyManager.getParty(message.channel.id),
      info = await meetup.setDescription(description);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .then(result => {
        Helper.client.emit('meetupDescriptionSet', meetup, message.member.id);

        return true;
      })
      .catch(err => log.error(err));


    meetup.refreshStatusMessages();
  }
}

module.exports = SetDescriptionCommand;
