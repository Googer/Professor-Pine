const log = require('loglevel').getLogger('ImportRegionsCommand'),
  commando = require('discord.js-commando'),
  oneLine = require('common-tags').oneLine,
  GymCache = require('../../../app/gym'),
  PartyManager = require('../../../app/party-manager'),
  Region = require('../../../app/region'),
  Helper = require('../../../app/helper');

module.exports = class ImportRegions extends commando.Command {
  constructor(client) {
    super(client, {
      name: 'import',
      aliases: ['import-regions'],
      group: 'region',
      memberName: 'import',
      description: 'Imports multiple region area/bounds.',
      details: oneLine`
			This command accepts a kml file of polygons on a map that define regions.
			Channels/categories will be determined based on name of the polygons specified in the file
			and existing channels will have their regions updated based on polygon within this file.

			When creating new channels, the name of the feature/polygon will become the name of the channel. For the category,
			it will first try and use the description field if it exists. Otherwise it was use the feature name as well.
			`,
      examples: ['import']
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'import') {
        if (!Helper.isManagement(message)) {
          return ['unauthorized', message.reply('You are not authorized to use this command.')];
        }
        if (!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be ran in a bot channel.')]
        }
      }

      return false;
    });
  }

  async run(msg) {
    //get kml attachment url
    if (msg.attachments.first() !== undefined) {
      log.debug(msg.attachments.first().url);
      const file = msg.attachments.first().url;
      const data = await Region.parseRegionData(file)
        .catch(error => false);
      if (data) {
        const channelRegions = [];

        for (let i = 0; i < data.features.length; i++) {
          const feature = data.features[i];
          if (feature.geometry.type === "Polygon") {
            channelRegions.push(feature);
          }
        }

        const toAdd = [];
        const toUpdate = [];
        const ineligible = [];

        for (let i = 0; i < channelRegions.length; i++) {
          const feature = channelRegions[i];
          const channelName = Region.channelNameForFeature(feature);
          const guildId = msg.channel.guild.id;

          if (Helper.doesChannelExist(channelName, guildId)) {
            const channel = Helper.getChannelForName(channelName, guildId);
            if (Helper.isChannelChild(channel.id)) {
              const parent = Helper.getParentChannel(channel.id);
              if (PartyManager.categoryHasRegion(parent.id) && !Helper.isChannelBounded(channel.id, PartyManager.getRaidChannelCache())) {
                ineligible.push(feature);
              } else {
                toUpdate.push(feature);
              }
            } else {
              ineligible.push(feature);
            }
          } else {
            toAdd.push(feature);
          }
        }

        msg.say("Creating " + toAdd.length + " new regions. Updating " + toUpdate.length + " others. Found " + ineligible.length + " ineligible.")
          .catch(err => log.error(err));

        //Create new regions
        for (let i = 0; i < toAdd.length; i++) {
          const feature = toAdd[i];
          Region.createNewRegion(feature, msg, GymCache)
            .then(channelId => PartyManager.cacheRegionChannel(channelId))
            .catch(error => {
              log.error(error);
              msg.say("An error occurred")
                .catch(err => log.error(err));
            })
        }

        //Update regions
        for (let i = 0; i < toUpdate.length; i++) {
          const feature = toUpdate[i];
          const channelName = Region.channelNameForFeature(feature);
          const channel = Helper.getChannelForName(channelName, msg.channel.guild.id);
          const polydata = feature.geometry.coordinates[0];
          Region.storeRegion(polydata, channel.id, msg.channel.guild.id, GymCache)
            .then(() => PartyManager.cacheRegionChannel(channel.id))
            .catch(error => reject("An error occurred storing the region for " + channelName));
        }
        Helper.client.emit('regionsUpdated');
      } else {
        msg.say("An error occurred parsing your KML data.")
          .catch(err => log.error(err));
      }
    } else {
      msg.delete()
        .catch(err => log.error(err));
      msg.reply("Please add the `\timport-regions` command as a comment when uploading a KML file.")
        .catch(err => log.error(err));
    }
  }
};
