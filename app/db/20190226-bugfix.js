const DB = require('../db');

exports.up = async function (knex) {
  let promises = [],
    users = await DB.DB('PokemonNotification')
      .where('pokemon', -7);

  users.forEach(notification => {
    let newNotification = {
      pokemon: -6,
      guildId: notification.guildId,
      userId: notification.userId,
      type: notification.type
    };

    promises.push(DB.DB('PokemonNotification')
      .insert(newNotification));

    promises.push(DB.DB('PokemonNotification')
      .where('id', notification.id)
      .update({
        pokemon: -8
      }));
  });

  return Promise.all(promises);
};

exports.down = function (knex) {
  return Promise.resolve([]);
};
