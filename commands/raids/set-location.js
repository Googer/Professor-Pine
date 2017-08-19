"use strict";

const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');
const LocationSearch = require('../../app/location-search');

class SetLocationCommand extends Commando.Command {
  constructor(client) {
    super(client, {
      name: 'set-location',
      group: 'raids',
      memberName: 'set-location',
      aliases: ['setlocation', 'location'],
      description: 'Set the location of the raid.',
      details: '?????',
      examples: ['\t!set-location lugia-0 https://www.google.com/maps/dir/Current+Location/40.53028537,-80.01068783'],
      argsType: 'multiple'
    });
  }

  run(message, args) {
    if (message.channel.type !== 'text') {
      message.reply('Please set location for a raid from a public channel.');
      return;
    }

    const raid = Raid.findRaid(message.channel, message.member, args);

    if (!raid.raid) {
      message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
      return;
    }

    const location = raid.args;

    if (!location) {
      message.reply('Please enter some search terms to look for a valid gym.');
      return;
    }

    let gyms;
    let top_gym;
    try {
      gyms = LocationSearch.search(location);
      top_gym = gyms[0];
    } catch (err) {
      message.reply('Search terms entered yielded no valid gyms.  Please try again.');
    }

    // TODO: Make this list something like the top 5-10 gyms to the user and let them pick the best match
    const info = Raid.setRaidLocation(message.channel, message.member, raid.raid.id, top_gym);
    message.channel.send(Raid.getFormattedMessage(info.raid));
  }
}

module.exports = SetLocationCommand;
