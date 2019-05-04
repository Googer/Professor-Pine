const commando = require('discord.js-commando'),
	https = require('https'),
	oneLine = require('common-tags').oneLine,
	Region = require('../../../app/region'),
	GymCache = require('../../../app/gym'),
	PartyManager = require('../../../app/party-manager'),
	Helper = require('../../../app/helper'),
	private_settings = require('../../../data/private-settings');

module.exports = class ImportRegions extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'import',
			aliases: ['importregions', 'import-regions'],
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
        if(!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be ran in a bot channel.')]
        }
			}

			return false;
		});
	}


	async run(msg) {

		//get kml attachment url
		if(msg.attachments.first() != undefined) {

			console.log(msg.attachments.first().url);
			const file = msg.attachments.first().url;
			var data = await Region.parseRegionData(file).catch(error => false);
			if(data) {
				var channel_regions = []

				for(var i=0; i<data.features.length;i++) {
					const feature = data.features[i]
					if(feature.geometry.type === "Polygon") {
						channel_regions.push(feature)
					}
				}

				var toAdd = []
				var toUpdate = []
				var ineligible = []

				for(var i=0; i<channel_regions.length; i++) {
					const feature = channel_regions[i]
					const name = feature.properties.name
					const channel_name = Region.channelNameForFeature(feature)

					if(Helper.doesChannelExist(channel_name)) {
						const channel = Helper.getChannelForName(channel_name)
						if(Helper.isChannelChild(channel.id)) {
							const parent = Helper.getParentChannel(channel.id)
							if(PartyManager.categoryHasRegion(parent.id) && !Helper.isChannelBounded(channel.id,PartyManager.getRaidChannelCache())) {
								ineligible.push(feature)
							} else {
								toUpdate.push(feature)
							}
						} else {
							ineligible.push(feature)
						}
					} else {
						toAdd.push(feature)
					}
				}

				msg.say("Creating " + toAdd.length + " new regions. Updating " + toUpdate.length + " others. Found " + ineligible.length + " ineligible.")

				//Create new regions
				for(var i=0;i<toAdd.length;i++) {
					const feature = toAdd[i]
					Region.createNewRegion(feature,msg,GymCache).then(channel => {
						PartyManager.cacheRegionChannel(channel)
					}).catch(error => {
						console.log(error)
						msg.say("An error occurred")
					})
				}

				//Update regions
				for(var i=0;i<toUpdate.length;i++) {
					const feature = toUpdate[i];
					const channel_name = Region.channelNameForFeature(feature);
					const channel = Helper.getChannelForName(channel_name);
					const polydata = feature.geometry.coordinates[0];
					Region.storeRegion(polydata,channel.id,GymCache).catch(error => reject("An error occurred storing the region for " + channel_name)).then(result => {
					});
				}

			} else {
				msg.say("An error occurred parsing your KML data.")
			}

		} else {

			msg.delete()
			msg.reply("Please add the `\timport-region` command as a comment when uploading a KML file.");
		}

	}
};
