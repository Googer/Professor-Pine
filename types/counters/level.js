'use strict';

const Commando = require('discord.js-commando'),
  CountersData = require('../../data/counters'),
  db = require('../../app/db');

class CounterLevelType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'counterleveltype');

    this.savedPokebattlerAnswers = ['Y', 'YES', 'POKEBATTLER', 'ME', 'MINE', 'BOX', 'MYBOX', 'MY BOX', 'POKEBOX', 'POKÉBOX', 'MYPOKEBOX', 'MY POKEBOX', 'MYPOKÉBOX', 'MY POKÉBOX']
  }

  async validate(value, message, arg) {
    let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
    let index = CountersData.level.findIndex(x => x.aliases.includes(parm));
    if (index !== -1) {
      return true;
    } else if (this.savedPokebattlerAnswers.includes(parm)) {
      // check for existence of saved ID
      let pokebattlerId = await db.DB('User')
        .where('userSnowflake', message.author.id)
        .pluck('pokebattlerId')
        .first()
        .then(res => {
          if (!!res) {
            return res.pokebattlerId;
          } else {
            return false;
          }
        });
      if (!!pokebattlerId) {
        return true;
      } else {
        return 'you do not have a registered Pokebattler ID. Please enter your Pokebattler ID, which is located on the upper right once you log in.\n';
      }
    } else if (Number.isInteger(+parm)) {
      // new Pokebattler ID
      return true;
    } else {
      return 'that is an invalid attacker level.\n\n**Attacker level** is a number between 20 and 40, in multiples of 5 (20, 25, 30, 35, or 40). Alternatively you may provide your Pokebattler ID, which is located on the upper right once you log in.\n';
    }
  }

  async parse(value, message, arg) {
    let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
    let index = CountersData.level.findIndex(x => x.aliases.includes(parm));
    if (index !== -1) {
      return CountersData.level[index];
    } else if (this.savedPokebattlerAnswers.includes(parm)) {
      // retrieve saved ID
      let pokebattlerId = await db.DB('User')
        .where('userSnowflake', message.author.id)
        .pluck('pokebattlerId')
        .first()
        .then(res => res.pokebattlerId);
      return {pbName: pokebattlerId, type: 'userId', name: `Pokébox (#${pokebattlerId})`}
    } else {
      return {pbName: parm, type: 'userId', name: `Pokébox (#${parm})`};
    }
  }
}

module.exports = CounterLevelType;