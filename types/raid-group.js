"use strict";

const Commando = require('discord.js-commando'),
  PartyManager = require('../app/party-manager');

class RaidGroupType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'raid-group');
  }

  validate(value, message, arg) {
    const groupIds = PartyManager.getParty(message.channel.id).groups
        .map(group => group.id),
      groupId = value.trim().toUpperCase(),
      valid = groupIds.includes(groupId) || groupId === 'A';

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