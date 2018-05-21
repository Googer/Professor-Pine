"use strict";

const Commando = require('discord.js-commando');

class RaidGroupType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'raid-group');
  }

  validate(value, message, arg) {
    const Raid = require('../app/raid'),
      group_ids = Raid.getRaid(message.channel.id).groups
        .map(group => group.id),
      group_id = value.trim().toUpperCase(),
      valid = group_ids.includes(group_id) || group_id === 'A';

    if (!valid) {
      return `\`${value}\` is not a valid group for this raid!\n\n${arg.prompt}`;
    }

    return true;
  }

  parse(value, message, arg) {
    return value.trim().toUpperCase();
  }
}

module.exports = RaidGroupType;