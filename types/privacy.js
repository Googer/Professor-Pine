"use strict";

const Commando = require('discord.js-commando'),
  Privacy = require('../app/privacy');

class PrivacyArgumentType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'privacy');
  }

  validate(value, message, arg) {
    const privacy = Privacy.search(value);

    if (privacy.length === 0) {
      return `\`${value}\` is an invalid privacy!\n\n${arg.prompt}`;
    }

    return true;
  }

  parse(value, message, arg) {
    return Privacy.search(value)[0].ref;
  }
}

module.exports = PrivacyArgumentType;
