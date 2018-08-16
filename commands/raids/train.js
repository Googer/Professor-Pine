"use strict";

const log = require('loglevel').getLogger('TrainCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, TimeParameter} = require('../../app/constants'),
  Gym = require('../../app/gym'),
  Helper = require('../../app/helper'),
  PartyManager = require('../../app/party-manager'),
  Train = require('../../app/train');

class TrainCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'train',
      group: CommandGroup.RAID_CRUD,
      memberName: 'train',
      aliases: ['new-train'],
      description: 'Creates a new raid train.',
      details: 'Use this command to start organizing a new raid train.  For your convenience, this command combines several options such that you can set the pokémon and the location of the raid all at once.  ' +
        'Once created, it will further prompt you for the raid\'s hatch or end time.',
      examples: ['\t!train', '\t!train 7/21 2p'],
      throttling: {
        usages: 2,
        duration: 600
      },
      args: [
        {
          key: 'time',
          label: 'time',
          prompt: 'What time is does this raid train begin?\nExample: `7/21 2:00p`\n',
          type: 'time'
        },
        {
          key: 'duration',
          label: 'duration',
          prompt: 'How long does this raid train intend to run (in hours)?\nExample: `3`\n',
          type: 'natural'
        },
        {
          key: 'label',
          label: 'label',
          prompt: 'What do you wish to label your raid group with?',
          type: 'string'
        }
      ],
      argsPromptLimit: 3,
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
    const time = args['time'],
      duration = args['duration'],
      label = args['label'];

    let train;

    PartyManager.createParty(message.channel.id, message.member.id, time, duration, label)
    // create and send announcement message to region channel
      .then(async info => {
        train = info.train;
        const trainChannelMessage = await Train.getTrainChannelMessage(train),
          formattedMessage = await Train.getFormattedMessage(train);

        return message.channel.send(trainChannelMessage, formattedMessage);
      })
      .then(announcementMessage => train.addMessage(announcementMessage))
      // create and send initial status message to raid train channel
      .then(async botMessage => {
        const trainSourceChannelMessage = await Train.getTrainSourceChannelMessage(train),
          formattedMessage = await Train.getFormattedMessage(train);
        return PartyManager.getChannel(train.channelId)
          .then(channelResult => {
            if (channelResult.ok) {
              return channelResult.channel.send(trainSourceChannelMessage, formattedMessage);
            }
          })
          .catch(err => log.error(err));
      })
      .then(channelTrainMessage => train.addMessage(channelTrainMessage, true))
      .then(result => {
        Helper.client.emit('trainCreated', train, message.member.id);

        return true;
      })
      .catch(err => log.error(err));
  }
}

module.exports = TrainCommand;
