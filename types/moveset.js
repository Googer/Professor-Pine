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

    if (!!!raidBoss) {
      return 'No raid boss set for the raid. Please set the raid boss prior to the moveset.';
    }

    const moves = value.split('/')
      .map(move => move.trim());
    let quickFound = false;
    let quickFoundMove = '';
    let cinematicFound = false;
    let cinematicFoundMove = '';

    moves.forEach((move, index) => {
      const searchedMoves = Moves.search(move.split(/\s/g));

      raidBoss.quickMoves.forEach(validMove => {
        searchedMoves.forEach(searchedMove => {
          if (validMove.indexOf(searchedMove) !== -1) {
            quickFound = true;
            quickFoundMove = searchedMove;
          }
        });
      });

      raidBoss.cinematicMoves.forEach(validMove => {
        searchedMoves.forEach(searchedMove => {
          if (validMove.indexOf(searchedMove) !== -1) {
            cinematicFound = true;
            cinematicFoundMove = searchedMove;
          }
        });
      });
    });

    const raidBossName = raidBoss.name.charAt(0).toUpperCase() + raidBoss.name.substr(1);

    let errorMessage = '';
    if (moves.length === 1 && !quickFound && !cinematicFound) {
      errorMessage = this.capitalizeMoveset(moves[0]) + ' is not a valid move for ' + raidBossName;
    }

    if (moves.length === 2 && !quickFound && !cinematicFound) {
      errorMessage = this.capitalizeMoveset(moves[0]) + ' and ' + moves[1] + ' are not valid moves for ' + raidBossName;
    }

    if (moves.length === 2 && !quickFound) {
      if (moves[0] === cinematicFoundMove) {
        errorMessage = this.capitalizeMoveset(moves[1]) + ' is not a valid move for ' + raidBossName;
      } else {
        errorMessage = this.capitalizeMoveset(moves[0]) + ' is not a valid move for ' + raidBossName;
      }
    }

    if (moves.length === 2 && !cinematicFound) {
      if (moves[0] === quickFoundMove) {
        errorMessage = this.capitalizeMoveset(moves[1]) + ' is not a valid move for ' + raidBossName;
      } else {
        errorMessage = this.capitalizeMoveset(moves[0]) + ' is not a valid move for ' + raidBossName;
      }
    }

    if (errorMessage !== '') {
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
    const moves = value.split('/')
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
