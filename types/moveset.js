"use strict";

const Commando = require('discord.js-commando'),
  Pokemon = require('../app/pokemon'),
  PartyManager = require('../app/party-manager');

class PokemonType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'pokemon');
  }

  validate(value, message, arg) {
    let raid = PartyManager.parties[message.channel.id];

    if (!!raid) {
      return 'No raid found. Please set the moveset from a raid channel.';
    }

    let raidBoss = raid.pokemon;

    if (!!raidBoss) {
      return 'No raid boss set for the raid. Please set the raid boss prior to the moveset.';
    }

    return true;
  }

  parse(value, message, arg) {
    let raid = PartyManager.parties[message.channel.id];
    let raidBoss = raid.pokemon;
    let moves = value.split('/');
    let moveset = {
      'quick': null,
      'cinematic': null
    };

    moves.forEach((move, index) => {
      let name = move.toUpperCase().replace(/\s/g, '_');
      raidBoss.quickMoves.forEach(validMove => {
        if (validMove.indexOf(name) !== -1) {
          moveset.quick = validMove;
        }
      });

      raidBoss.cinematicMoves.forEach(validMove => {
        if (validMove.indexOf(name) !== -1) {
          moveset.cinematic = validMove;
        }
      });
    });

    return moveset;
  }
}

module.exports = PokemonType;