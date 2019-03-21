"use strict";

const log = require('loglevel').getLogger('DescriptionCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  settings = require('../../data/settings');

class SetDescriptionCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'info',
      group: CommandGroup.RAID_CRUD,
      memberName: 'info',
      aliases: ['set-info', 'description', 'set-description'],
      description: 'Sets the information for a meetup.\n',
      details: 'Use this command to set the information for a meetup.',
      examples: ['\t!gym Unicorn', '\t!location \'Bellevue Park\'', '\t!location squirrel'],
      args: [
        {
          key: 'description',
          label: 'description',
          prompt: 'What information do you wish to set for this meetup?\n',
          type: 'string',
          wait: 120,
          infinite: true
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'gym' &&
        !PartyManager.validParty(message.channel.id, [PartyType.MEETUP])) {
        return ['invalid-channel', message.reply('Set the information for a meetup from its channel!')];
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
