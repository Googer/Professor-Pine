const log = require('loglevel').getLogger('FindGymType'),
  commando = require('discord.js-commando'),
  Helper = require('../app/helper'),
  Region = require('../app/region');

class FindGymType extends commando.ArgumentType {
  constructor(client) {
    super(client, 'findgym');
  }

  validate(value, message, arg) {
    const that = this;
    return new Promise(
      async (resolve, reject) => {
        let gym,
          isBotChannel = Helper.isBotChannel(message);

        if (that.getValue(value) > -1) {
          gym = await Region.getGym(that.getValue(value))
            .catch(error => resolve(error));
        } else {
          gym = await Region.findGym(isBotChannel ? null : message.channel.id, value)
            .catch(error => resolve(error));
        }

        if (gym !== undefined && gym["name"]) {
          Region.showGymDetail(message, gym, `Gym found with term "${value}"`, null, false)
            .then((message) => {
              gym.message = message;
              that.gymInfo = gym;
              resolve(true);
            })
            .catch(err => log.error(err));
        } else {
          resolve("No gym found.");
        }
      });
  }

  parse(value, message, arg) {
    return (this.gymInfo != null) ?
      this.gymInfo :
      value;
  }

  getValue(value) {
    const first = value.substring(0, 1);
    if (first === "#") {
      log.debug("starts with pound");
      const integer = value.substring(1, value.length);
      log.debug(integer);
      log.debug(Number(integer));
      if (Number(integer)) {
        return Number(integer);
      }
    }

    return -1;
  }
}

module.exports = FindGymType;
