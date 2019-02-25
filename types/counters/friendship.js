'use strict';

const Commando = require('discord.js-commando'),
  CountersData = require('../../data/counters');

class CounterFriendshipType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'counterfriendshiptype');
  }

  validate(value, message, arg) {
    let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
    let index = CountersData.friendship.findIndex(x => x.aliases.includes(parm));
    if (index !== -1) {
      return true;
    } else {
      return 'invalid friendship.\n\n**Friendship level** is your maximum friendship with any trainer in a raid, which provides a variable boost based on earned level.\n';
    }
  }

  parse(value, message, arg) {
    let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
    let index = CountersData.friendship.findIndex(x => x.aliases.includes(parm));
    return CountersData.friendship[index];
  }
}

module.exports = CounterFriendshipType;