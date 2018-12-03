const commando = require('discord.js-commando'),
  Region = require('../app/region');

class CoordsType extends commando.ArgumentType {
	constructor(client) {
		super(client, 'coords');
	}

	async validate(value, message, arg) {
    return new Promise(async function (resolve, reject) {
      Region.coordStringFromText(value).then(coords => {
          if(coords != null) {
            //This would validate if the coords are in a regions channel
            //Commented because not necessary if being run from an admin channel
            //Region.checkCoordForChannel(message.channel.id,coords,resolve,reject);

            resolve(true)
          } else {
            resolve("Invalid latitude and longitude. Provide comma separated values or valid pin URL.");
          }

      }).catch(error => resolve("An error occurred"));
    });
	}

	parse(value, message, arg) {
		return value;
	}
}

module.exports = CoordsType;
