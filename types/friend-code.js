"use strict";

const Commando = require('discord.js-commando');

class FriendCodeType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'friendcode');
  }

  validate(value, message, arg) {
    const code = (value || '').replace(/[^\d]/g, '');

    if (!code || code.length !== 12) {
      let errorMessage = 'Invalid Friend Code Provided. Please provide a 12 digit friend code.';
      if (!!arg) {
        errorMessage += `\n\n${arg.prompt}`;
      }

      return errorMessage;
    }

    return true;
  }

  parse(value, message, arg) {
    return (value || '').replace(/[^\d]/g, '');
  }
}

module.exports = FriendCodeType;
