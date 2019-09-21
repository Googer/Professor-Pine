"use strict";

const log = require('loglevel').getLogger('TrainNameCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  Helper = require('../../app/helper'),
  settings = require('../../data/settings'),
  PartyManager = require('../../app/party-manager');

class TrainNameCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'train-name',
      group: CommandGroup.TRAIN,
      memberName: 'train-name',
      aliases: ['name'],
      description: 'Modify and set the train\'s name.\n',
      details: 'Use this command to update a train\'s name and update the channel name.',
      examples: ['\t!train-name Raid Hour is happening!'],
      args: [
        {
          key: 'name',
          label: 'name',
          prompt: 'What do you wish to name this raid train?',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'train-name' &&
        !PartyManager.validParty(message.channel.id, PartyType.RAID_TRAIN)) {
        return ['invalid-channel', message.reply('You can only set a train\'s name from the train\'s channel!')];
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

module.exports = TrainNameCommand;
