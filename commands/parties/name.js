"use strict";

const log = require('loglevel').getLogger('NameCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings.json'),
  PartyManager = require('../../app/party-manager');

class NameCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'name',
      group: CommandGroup.TRAIN,
      memberName: 'name',
      description: 'Modify and set a raid train\'s or meetup\'s name.\n',
      details: 'Use this command to update the name for a raid train or meetup and update the channel name.',
      examples: ['\t!name Raid Hour is happening!'],
      args: [
        {
          key: 'name',
          label: 'name',
          prompt: 'What do you wish to set the name to?',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'name' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID_TRAIN, PartyType.MEETUP])) {
        return {
          reason: 'invalid-channel',
          response: message.reply('You can only set a raid train\'s or meetup\'s name from the its channel!')
        };
      }
      return false;
    });
  }

  async run(message, args) {
    const trainName = args['name'],
          party = PartyManager.getParty(message.channel.id);

    await party.setTrainName(trainName);

    message.react(Helper.getEmoji(settings.emoji.thumbsUp) || '👍')
      .catch(err => log.error(err));

    party.refreshStatusMessages()
      .catch(err => log.error(err));
  }
}

module.exports = NameCommand;
