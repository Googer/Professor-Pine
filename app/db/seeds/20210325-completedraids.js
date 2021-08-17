const {PartyStatus, PartyType} = require('../../constants'),
  fs = require('fs'),
  storage = require('node-persist');

exports.seed = async function (knex) {
  const completedStorage = storage.create({
    dir: 'parties/complete',
    forgiveParseErrors: true
  });
  await completedStorage.init();

  const completedRaids = (await completedStorage.values())
    .flatMap(parties => parties)
    .filter(party => party.type === PartyType.RAID),
    completedGymIds = [...new Set(completedRaids
      .map(completedRaid => completedRaid.gymId))];

  return knex.transaction(transaction => {
    let promiseNext = Promise.resolve();

    completedRaids.forEach(completedRaid => {
      promiseNext = promiseNext
        .then(() => knex.table('Pokemon')
          .where('name', !!completedRaid.pokemon.name ?
            completedRaid.pokemon.name :
            ''))
        .then(pokemon => {
          const pokemonId = pokemon.length > 0 ?
            pokemon[0].id :
            null;

          return knex.table('CompletedRaid').transacting(transaction)
            .returning('id')
            .insert(Object.assign({}, {
              gymId: completedRaid.gymId,
              pokemonId,
              channelSnowflake: completedRaid.sourceChannelId,
              creationTime: completedRaid.creationTime,
              reportedBySnowflake: completedRaid.originallyCreatedBy
            }));
        })
        .then(completedRaidId => {
          const attendees = Object.entries(completedRaid.attendees)
            .map(([userSnowflake, userStatus]) => {
              let status;

              switch (userStatus.status) {
                case PartyStatus.INTERESTED:
                  status = 'interested';
                  break;
                case PartyStatus.COMING:
                  status = 'coming';
                  break;
                case PartyStatus.PRESENT:
                  status = 'present';
                  break;
                case PartyStatus.COMPLETE_PENDING:
                case PartyStatus.COMPLETE:
                  status = 'complete';
                  break;
                default:
                  status = null;
                  break;
              }
              return Object.assign({}, {
                raidId: completedRaidId,
                userSnowflake,
                number: parseInt(userStatus.number) > 20 ?
                  20 :
                  parseInt(userStatus.number),
                groupId: userStatus.group,
                status
              });
            });

          return knex.table('CompletedRaidAttendee').transacting(transaction)
            .insert(attendees);
        });
    });

    promiseNext
      .then(transaction.commit)
      .then(() => completedGymIds
        .forEach(async completedGymId => {
          await completedStorage.removeItem(`${completedGymId}`);
        }))
      .catch(err => {
        transaction.rollback();
        reject(err);
      });
  });
}

