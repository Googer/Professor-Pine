const commando = require('discord.js-commando'),
  Discord = require('discord.js');

class KeywordsType extends commando.ArgumentType {
	constructor(client) {
		super(client, 'keywords');
	}

	validate(value, message, arg) {
		const items = value.split(" ");
		if (items[0].toLowerCase() === "add" || items[0].toLowerCase() === "remove") {
			const action = (items[0].toLowerCase() === "add") ? "add" : "remove";
			if (items[1].length > 0) {

				this.keyword_info = {
					"action": action,
					"keywords": value.substring(action.length + 1, value.length)
				}

				return true;
			} else {
				return "You must provide keywords to " + action + ". Type `add` or `remove` followed by a list of keywords separated by commas. To remove all existing commas type `remove all`."
			}
		} else {
			return "Incorrect argument. Type `add` or `remove` followed by a list of keywords separated by commas. To remove all existing commas type `remove all`."
		}
	}

	parse(value, message, arg) {
		return (this.keyword_info != null) ? this.keyword_info : value;
	}
}

module.exports = KeywordsType;
