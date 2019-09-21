"use strict";

const log = require('loglevel').getLogger('DirectionsCommand'),
  Commando = require('discord.js-commando'),
  {CommandGroup, PartyType} = require('../../app/constants'),
  {MessageAttachment, MessageEmbed} = require('discord.js'),
  Gym = require('../../app/gym'),
  ImageCacher = require('../../app/imagecacher'),
  PartyManager = require('../../app/party-manager'),
  RegionHelper = require('../../app/region');

class DirectionsCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'where',
      group: CommandGroup.BASIC_RAID,
      memberName: 'where',
      aliases: ['directions'],
      description: 'Requests an image of the gym\'s location and a link for directions to get there.',
      details: 'Use this command get directions to the raid\'s location.',
      examples: ['\t!where', '\t!directions'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'where' &&
        !PartyManager.validParty(message.channel.id, [PartyType.RAID, PartyType.RAID_TRAIN])) {
        return ['invalid-channel', message.reply('Ask for directions to a raid from its raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    const party = PartyManager.getParty(message.channel.id),
      gymId = party.type === PartyType.RAID ? party.gymId : party.route[party.currentGym];

    if (!gymId) {
      message.channel.send(`No location is set for this ${party.type}.`)
        .catch(err => log.error(err));
      return;
    }

    const gym = await Gym.getGym(gymId),
      embed = new MessageEmbed();

    embed.setColor('GREEN');

    let path = `images/gyms/${gym.id}.png`;
    let url = RegionHelper.getGymMapLink(gym);
    let imagePath = await ImageCacher.fetchAndCache(url, path)
      .catch(error => {
        log.error(error);
        return false;
      });

    const attachments = [];
    if (imagePath) {
      let parts = imagePath.split("/");
      let imageName = parts[parts.length - 1];
      const attachment = new MessageAttachment(imagePath);
      attachments.push(attachment);
      embed.setImage(`attachment://${imageName}`);
    }

    embed.attachFiles(attachments);

    message.channel
      .send(`https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`, {
        embed
      })
      .catch(err => log.error(err));
  }
}

module.exports = DirectionsCommand;
