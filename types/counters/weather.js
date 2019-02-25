'use strict';

const Commando = require('discord.js-commando'),
    CountersData = require('../../data/counters');

class CounterWeatherType extends Commando.ArgumentType {
    constructor(client) {
        super(client, 'counterweathertype');
    }

    validate(value, message, arg) {
        let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
        let index = CountersData.weather.findIndex(x => x.aliases.includes(parm));
        if (index != -1) {
            return true
        } else {
            return 'that is an invalid weather condition.\n\n**Weather condition** is the current weather in-game, which provides a 20% damage boost to certain move types.\n'
        }
    }

    parse(value, message, arg) {
        let parm = value.replace(/[^\w\s]/gi, '').toUpperCase();
        let index = CountersData.weather.findIndex(x => x.aliases.includes(parm));
        return CountersData.weather[index]
    }
}

module.exports = CounterWeatherType;