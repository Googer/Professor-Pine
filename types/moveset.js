"use strict";

const Commando = require('discord.js-commando'),
  PartyManager = require('../app/party-manager');

class MovesetType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'moveset');
  }

  validate(value, message, arg) {
    let raid = PartyManager.parties[message.channel.id];

    if (!!!raid) {
      return 'No raid found. Please set the moveset from a raid channel.';
    }

    let raidBoss = raid.pokemon;

    if (!!!raidBoss) {
      return 'No raid boss set for the raid. Please set the raid boss prior to the moveset.';
    }

    let moves = value.split('/');
    let quickFound = false;
    let quickFoundMove = '';
    let cinematicFound = false;
    let cinematicFoundMove = '';

    moves.forEach((move, index) => {
      let name = move.toUpperCase().replace(/\s/g, '_');
      raidBoss.quickMoves.forEach(validMove => {
        if (validMove.indexOf(name) !== -1) {
          quickFound = true;
          quickFoundMove = name;
        }
      });

      raidBoss.cinematicMoves.forEach(validMove => {
        if (validMove.indexOf(name) !== -1) {
          cinematicFound = true;
          cinematicFoundMove = name;
        }
      });
    });

    let raidBossName = raidBoss.name.charAt(0).toUpperCase() + raidBoss.name.substr(1);

    if (moves.length === 1 && !quickFound && !cinematicFound) {
      return moves[0] + ' is not a valid move for ' + raidBossName;
    }

    if (moves.length === 2 && !quickFound && !cinematicFound) {
      return moves[0] + ' and ' + moves[1] + ' are not valid moves for ' + raidBossName;
    }

    if (moves.length === 2 && !quickFound) {
      if (moves[0] === cinematicFoundMove) {
        return moves[1] + ' is not a valid move for ' + raidBossName;
      } else {
        return moves[0] + ' is not a valid move for ' + raidBossName;
      }
    }

    if (moves.length === 2 && !cinematicFound) {
      if (moves[0] === quickFoundMove) {
        return moves[1] + ' is not a valid move for ' + raidBossName;
      } else {
        return moves[0] + ' is not a valid move for ' + raidBossName;
      }
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

module.exports = MovesetType;