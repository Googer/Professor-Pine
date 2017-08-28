"use strict";

const Commando = require('discord.js-commando');

class TimeType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'time');
	}

	validate(value, message, arg) {
        const hour_minute_format = value.match(/^(?:(?:([01])?[:\s])?([0-5]\d))$/);

		if (hour_minute_format) {
			return true;
		}

		const minute_format = value.match(/^\d{1,3}$/);

		if (!minute_format) {
			return false;
		}

		const minutes = Number.parseInt(value);

		return (minutes >= 0 && minutes < 120);
	}

	parse(value, message, arg) {
        const hour_minute_format = value.match(/^(?:(?:([01])?[:\s])?([0-5]\d))$/);

		if (hour_minute_format) {
            const hours = hour_minute_format[1],
                minutes = Number.parseInt(hour_minute_format[2]);

			return (hours
				? Number.parseInt(hours) * 60 + minutes
				: minutes);
		}

		return Number.parseInt(value);
	}
}

module.exports = TimeType;