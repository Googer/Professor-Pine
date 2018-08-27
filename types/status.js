"use strict";

const Commando = require('discord.js-commando'),
  Status = require('../app/status');

class StatusArgumentType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'status');
  }

  validate(value, message, arg) {
    const status = Status.search(value);

    if (status.length === 0) {
      return `\`${value}\` is an invalid status!\n\n${arg.prompt}`;
    }

    return true;
  }

  parse(value, message, arg) {
    return Status.search(value)[0].ref;
  }
}

module.exports = StatusArgumentType;
