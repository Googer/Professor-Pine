const Commando = require('discord.js-commando'),
  {CommandGroup} = require('../../app/constants'),
  {oneLine} = require('common-tags'),
  private_settings = require('../../data/private-settings'),
  Helper = require('../../app/helper'),
  Raid = require('../../app/raid');

class MapCommand extends Commando.Command  {
  constructor(client) {
    super(client, {
      name: 'maps',
      group: CommandGroup.UTIL,
      memberName: 'maps',
      aliases: ['map'],
      description: 'Displays the url to the map used for regions.',
      details: oneLine`
				This server uses a third party map to define what the various regions are.  This
				command will share the current url to the map for ease of use.
			`,
      examples: ['\t!maps'],
    });

    client.dispatcher.addInhibitor(message => {
      if (!!message.command && message.command.name === 'maps' &&
        Raid.validRaid(message.channel.id)) {
        return ['invalid-channel', message.reply('Ask for the complete region map from outside a raid channel!')];
      }
      return false;
    });
  }

  async run(message, args) {
    // We don't load this command unless the region_map_link is defined, so it's safe for
    // use to assume it exists
    const url = private_settings.region_map_link;

    const messages = [];
    try {
      messages.push(await message.direct(url));
      if (message.channel.type !== 'dm') messages.push(await message.reply(Helper.getText('region_map_dm.success', message)));
    } catch (err) {
      messages.push(await message.reply(Helper.getText('region_map_dm.warning', message)));
    }
  }
}

module.exports = MapCommand;
