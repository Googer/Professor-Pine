'use strict';

const Commando = require('discord.js-commando'),
    CountersData = require('../../data/counters');

class CounterTierType extends Commando.ArgumentType {
    constructor(client) {
        super(client, 'countertiertype');
    }

    validate(value, message, arg) {
        let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
        let index = CountersData.tier.findIndex(x => x.aliases.includes(parm));
        if (index != -1) {
            return true
        } else {
            return 'that is an invalid raid tier.\n\n**Raid tier** is a number between 1 and 5 (6 is the special HP tier, only used for post-EX Mewtwo).\n'
        }
    }

    parse(value, message, arg) {
        let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
        let index = CountersData.tier.findIndex(x => x.aliases.includes(parm));
        return CountersData.tier[index]
    }
}

module.exports = CounterTierType;