"use strict";

const Commando = require('discord.js-commando'),
  Moves = require('../app/moves'),
  PartyManager = require('../app/party-manager');

class MovesetType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'moveset');
  }

  validate(value, message, arg) {
    const raid = PartyManager.parties[message.channel.id];

    if (!!!raid) {
      return 'No raid found. Please set the moveset from a raid channel.';
    }

    const raidBoss = raid.pokemon;

    if (!!!raidBoss || raidBoss.egg) {
      return 'No raid boss set for the raid. Please set the raid boss prior to the moveset.';
    }

    if (typeof raidBoss.quickMoves === 'undefined' || typeof raidBoss.cinematicMoves === 'undefined') {
      return 'Unknown error occurred and the moveset cannot be set at this time.';
    }

    const moves = value.split('/', 2)
        .map(move => move.trim());

    let notValidatedMoves = moves;

    moves.forEach((move, index) => {
      const searchedMoves = Moves.search(move.split(/\s/g));

      raidBoss.quickMoves.forEach(validMove => {
        searchedMoves.forEach(searchedMove => {
          if (validMove.indexOf(searchedMove) !== -1) {
            notValidatedMoves = notValidatedMoves
              .filter(value => value !== move);
          }
        });
      });

      raidBoss.cinematicMoves.forEach(validMove => {
        searchedMoves.forEach(searchedMove => {
          if (validMove.indexOf(searchedMove) !== -1) {
            notValidatedMoves = notValidatedMoves
              .filter(value => value !== move);
          }
        });
      });
    });

    let errorMessage = '';

    if (notValidatedMoves.length > 0) {
      const raidBossName = raidBoss.name.charAt(0).toUpperCase() + raidBoss.name.substr(1);

      if (notValidatedMoves.length === 1) {
        errorMessage = this.capitalizeMoveset(notValidatedMoves[0]) + ' is not a valid move for ' + raidBossName;
      } else {
        errorMessage = this.capitalizeMoveset(notValidatedMoves[0]) + ' and ' + this.capitalizeMoveset(notValidatedMoves[1]) + ' are not valid moves for ' + raidBossName;
      }

      errorMessage += '.\n\n' + arg.prompt + '\n';
      return errorMessage;
    }

    return true;
  }

  capitalizeMoveset(move) {
    return move.split(' ')
      .map(m => m.charAt(0).toUpperCase() + m.substr(1))
      .join(' ');
  }

  parse(value, message, arg) {
    const raid = PartyManager.parties[message.channel.id],
      raidBoss = raid.pokemon;
    const moves = value.split('/', 2)
      .map(move => move.trim());
    let moveset = {
      'quick': null,
      'cinematic': null
    };

    moves.forEach((move, index) => {
      const searchedMoves = Moves.search(move.split(/\s/g));

      raidBoss.quickMoves.forEach(validMove => {
        searchedMoves.forEach(searchedMove => {
          if (validMove.indexOf(searchedMove) !== -1) {
            moveset.quick = searchedMove;
          }
        });
      });

      raidBoss.cinematicMoves.forEach(validMove => {
        searchedMoves.forEach(searchedMove => {
          if (validMove.indexOf(searchedMove) !== -1) {
            moveset.cinematic = searchedMove;
          }
        });
      });
    });

    return moveset;
  }
}

module.exports = MovesetType;
