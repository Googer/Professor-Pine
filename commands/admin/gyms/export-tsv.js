"use strict";

const log = require('loglevel').getLogger('ExportTsvCommand'),
  Commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  he = require('he'),
  Helper = require('../../../app/helper'),
  {MessageAttachment} = require('discord.js'),
  Region = require('../../../app/region'),
  turf = require('@turf/turf'),
  {CommandGroup} = require('../../../app/constants');

module.exports = class ExportTsvCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'export-tsvs',
      aliases: ['export-tsv', 'tsv-files'],
      group: CommandGroup.REGION,
      memberName: 'export-tsvs',
      description: 'Generates tsv files of gyms to import as layers on a map.',
      details: oneLine`
				This command will generate tsv files of gyms for use as layers on a Google Map, etc.
			`,
      examples: ['\texporttsvs'],
      guildOnly: true
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'export-tsvs') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
        if (!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be run in a bot channel.')]
        }
      }

      return false;
    });
  }

  async run(msg) {
    const regions = await Region.getAllRegions(msg.guild.id)
        .catch(err => log.error(err)),
      polygons = [];

    for (const region of regions) {
      const regionRaw = await Region.getRegionsRaw(region.channelId)
          .catch(error => null),
        regionObject = !!regionRaw ?
          Region.getCoordRegionFromText(regionRaw) :
          null,
        expanded = region ?
          Region.enlargePolygonFromRegion(regionObject) :
          null;

      if (expanded) {
        polygons.push(Region.getPolygonFromRegion(expanded));
      }
    }

    if (polygons.length > 0) {
      const mergedRegion = Region.regionFromGeoJSON(turf.union(...polygons)),
        gyms = await Region.getGyms(Region.polygonStringFromRegion(mergedRegion))
          .catch(err => log.error(err));

      let gymsList = 'Gym Name\tLongitude\tLatitude\n',
        exTagsList = 'Gym Name\tLongitude\tLatitude\n',
        confirmedExList = 'Gym Name\tLongitude\tLatitude\n';

      gyms.forEach(gym => {
        const gymLine = `${he.decode(gym.name.trim()).replace(/"/g, '\'')}\t${gym.lon}\t${gym.lat}\n`;

        if (gym.confirmedEx) {
          confirmedExList += gymLine;
        } else if (gym.taggedEx) {
          exTagsList += gymLine;
        } else {
          gymsList += gymLine;
        }
      });

      const attachments = [];
      attachments.push(new MessageAttachment(Buffer.from(confirmedExList, 'utf8'), 'Confirmed-EX-Gyms.tsv'));
      attachments.push(new MessageAttachment(Buffer.from(exTagsList, 'utf8'), 'EX-Tagged-Gyms.tsv'));
      attachments.push(new MessageAttachment(Buffer.from(gymsList, 'utf8'), 'Standard-Gyms.tsv'));

      msg.channel.send('**TSV files**', attachments)
        .catch(err => log.error(err));
    } else {
      msg.say('No regions defined on this server!')
        .catch(err => log.error(err));
    }
  }
};
