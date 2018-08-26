"use strict";

const log = require('loglevel').getLogger('TrainCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  RaidTrain = require('../../app/train');

class TrainCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'train',
      group: CommandGroup.RAID_CRUD,
      memberName: 'train',
      aliases: ['raid-train', 'new-train'],
      description: 'Announces a new raid train.\n',
      details: 'Use this command to start organizing a new raid train.',
      examples: ['\t!raid-train'],
      throttling: {
        usages: 2,
        duration: 900
      },
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'train' &&
        (PartyManager.validParty(message.channel.id) || !Gym.isValidChannel(message.channel.name))) {
        return ['invalid-channel', message.reply('Create raid trains from region channels!')];
      }
      return false;
    });
  }

  async run(message, args) {
    let sourceChannel = message.channel;

    let train;

    RaidTrain.createRaidTrain(sourceChannel.id, message.member.id)
    // create and send announcement message to region channel
      .then(async info => {
        train = info.party;
        const trainChannelMessage = await train.getChannelMessageHeader(),
          formattedMessage = await train.getFullStatusMessage();

        return sourceChannel.send(trainChannelMessage, formattedMessage);
      })
      .then(announcementMessage => PartyManager.addMessage(train.channelId, announcementMessage))
      // create and send initial status message to raid train channel
      .then(async botMessage => {
        const trainSourceChannelMessage = await train.getSourceChannelMessageHeader(),
          formattedMessage = await train.getFullStatusMessage();
        return PartyManager.getChannel(train.channelId)
          .then(channelResult => {
            if (channelResult.ok) {
              return channelResult.channel.send(trainSourceChannelMessage, formattedMessage);
            }
          })
          .catch(err => log.error(err));
      })
      .then(channelTrainMessage => PartyManager.addMessage(train.channelId, channelTrainMessage, true))
      .then(async result => {
        Helper.client.emit('trainCreated', train, message.member.id);

        return true;
      })
      .catch(err => log.error(err));
  }
}

module.exports = TrainCommand;
