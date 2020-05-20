"use strict";

const Commando = require('discord.js-commando'),
  moment = require('moment'),
  {PartyType} = require('../app/constants'),
  settings = require('../data/settings.json');

let PartyManager;

process.nextTick(() => PartyManager = require('../app/party-manager'));

class DurationType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'duration');
  }

  validate(value, message, arg) {
    const match = value.match(/(\d+)(\s+)?([a-z]+)?/i);

    if (match) {
      const [x, durationLength, y, durationUnit] = match,
        duration = !!durationUnit ?
          moment.duration(Number.parseInt(durationLength), durationUnit) :
          moment.duration(Number.parseInt(durationLength), 'minutes');

      if (duration.isValid() && duration.asMinutes() > 0 && duration.asMinutes() <= settings.maxRaidHatchedDuration) {
        return true;
      }
    }

    const partyExists = PartyManager.validParty(message.channel.id),
      party = PartyManager.getParty(message.channel.id),
      partyType = partyExists ?
        party.type :
        PartyType.RAID;

    return `"${value}" is not a valid duration for this ${partyType}!\n\n${arg.prompt}`;
  }

  parse(value, message, arg) {
    const [x, durationLength, y, durationUnit] = value.match(/(\d+)(\s+)?([a-z]+)?/i),
      duration = !!durationUnit ?
        moment.duration(Number.parseInt(durationLength), durationUnit) :
        moment.duration(Number.parseInt(durationLength), 'minutes');

    return duration.asMinutes();
  }
}

module.exports = DurationType;
