"use strict";

const log = require('loglevel').getLogger('PokemonSearch'),
  DB = require('./db'),
  {downloadGameMaster} = require('./pogo-data'),
  Helper = require('./helper'),
  lunr = require('lunr'),
  privateSettings = require('../data/private-settings'),
  removeDiacritics = require('diacritics').remove,
  Search = require('./search'),
  settings = require('../data/settings'),
  types = require('../data/types'),
  Utility = require('./utility'),
  weather = require('../data/weather');

class Pokemon extends Search {
  constructor() {
    super();
  }

  async buildIndex() {
    // wait for main initialization to be complete to be sure DB is set up
    while (!Helper.isInitialized()) {
      await Utility.sleep(1000);
    }

    log.info('Indexing pokemon...');

    const gameMaster = (await downloadGameMaster())
        .map(item => item.data),
      pokemonRegex = new RegExp('^V[0-9]+_POKEMON_(.*)'),
      formsRegex = new RegExp('^FORMS_V[0-9]+_POKEMON_(.*)'),
      temporaryRegex = new RegExp('^TEMPORARY_EVOLUTION_V[0-9]+_POKEMON_(.*)'),
      // familyRegex = new RegExp('^FAMILY_(.*)$'),
      pokemonMetadata = require('../data/pokemon'),
      alternateForms = ([].concat(...gameMaster
        .filter(item => formsRegex.test(item.templateId))
        .filter(form => !!form.formSettings.forms)
        .map(form => form.formSettings.forms))
        .map(form => Object.assign({},
          {
            formName: form.form.toLocaleLowerCase(),
            formId: !!form.assetBundleValue ?
              `${form.assetBundleValue}` :
              '00',
            formSuffix: form.assetBundleSuffix
          })))
        .concat(gameMaster
          .filter(item => temporaryRegex.test(item.templateId))
          .map(temporaryForm => temporaryForm.temporaryEvolutionSettings.obTemporaryEvolutions
            .map(evolution => Object.assign({},
              {
                formName: (temporaryRegex.exec(temporaryForm.templateId)[1] + evolution.obTemporaryEvolution.substring(14)).toLocaleLowerCase(),
                formId: evolution.assetBundleValue
              })))
          .flat()),
      pokemon = [].concat(...gameMaster
        .filter(item => pokemonRegex.test(item.templateId))
        .map(pokemon => Object.assign({},
          {
            name: pokemon.pokemonSettings.form ?
              pokemon.pokemonSettings.form.toLowerCase() :
              pokemon.pokemonSettings.pokemonId.toLowerCase(),
            number: Number.parseInt(pokemon.templateId.split('_')[0].slice(2)),
            stats: pokemon.pokemonSettings.stats,
            quickMoves: pokemon.pokemonSettings.quickMoves,
            cinematicMoves: pokemon.pokemonSettings.cinematicMoves,
            // family: familyRegex.exec(pokemon.pokemonSettings.familyId)[1],
            type: [pokemon.pokemonSettings.type.split('_')[2].toLowerCase(), pokemon.pokemonSettings.type2 ?
              pokemon.pokemonSettings.type2.split('_')[2].toLowerCase() :
              null]
              .filter(type => !!type),
            form: pokemon.pokemonSettings.form ?
              pokemon.pokemonSettings.form.split('_')[1].toLowerCase() :
              'normal'
          }))),
      temporaryPokemon = [].concat(...gameMaster
        .filter(item => pokemonRegex.test(item.templateId))
        .filter(pokemon => !!pokemon.pokemonSettings.obTemporaryEvolutions)
        .map(pokemon => pokemon.pokemonSettings.obTemporaryEvolutions
          .map(evolution => Object.assign({}, {
            name: ((pokemon.pokemonSettings.form ?
              pokemon.pokemonSettings.form :
              pokemon.pokemonSettings.pokemonId) + evolution.obTemporaryEvolution.substring(14)).toLowerCase(),
            number: Number.parseInt(pokemon.templateId.split('_')[0].slice(2)),
            temporaryStats: evolution.stats,
            stats: pokemon.pokemonSettings.stats,
            quickMoves: pokemon.pokemonSettings.quickMoves,
            cinematicMoves: pokemon.pokemonSettings.cinematicMoves,
            temporaryType: [evolution.type.split('_')[2].toLowerCase(), evolution.type2 ?
              evolution.type2.split('_')[2].toLowerCase() :
              null]
              .filter(type => !!type),
            type: [pokemon.pokemonSettings.type.split('_')[2].toLowerCase(), pokemon.pokemonSettings.type2 ?
              pokemon.pokemonSettings.type2.split('_')[2].toLowerCase() :
              null]
              .filter(type => !!type),
            form: pokemon.pokemonSettings.form ?
              pokemon.pokemonSettings.form.split('_')[1].toLowerCase() :
              'normal'
          })))
        .flat()),
      databasePokemon = await DB.DB('Pokemon').select(),
      mergedPokemon = pokemonMetadata
        .map(poke => {
          if (settings.databaseRaids) {
            if (poke.tier) {
              poke.backupTier = poke.tier;
              delete poke.tier;
            }

            if (poke.exclusive) {
              poke.backupExclusive = poke.exclusive;
              delete poke.exclusive;
            }

            if (poke.mega) {
              poke.backupMega = poke.mega;
              delete poke.mega;
            }

            // store just in case we eventually need this for some reason. DB Raids are populated solely by DB fields.
            if (poke.shiny) {
              poke.backupShiny = poke.shiny;
              delete poke.shiny;
            }

            if (poke.nickname) {
              poke.backupNickname = poke.nickname;
              delete poke.nickname;
            }
          }

          const result = Object.assign({}, poke, pokemon.find(p => p.name === poke.name) ||
            temporaryPokemon.find(p => p.name === poke.name));
          // Don't let base form's name override this form's name
          result.name = poke.name;

          return result;
        });

    this.buildCPTable(gameMaster);

    databasePokemon.forEach(poke => {
      let isTier = ['1', '2', '3', '4', '5', 'ex', 'mega'].indexOf(poke.name) !== -1;

      let pokeDataIndex = mergedPokemon.findIndex(p => {
        let tierFound = isTier && p.name === undefined && p.backupTier === poke.tier && !p.backupExclusive && !p.backupMega;
        let exclusiveFound = isTier && p.name === undefined && p.backupTier === undefined && p.backupExclusive === !!poke.exclusive && !!poke.exclusive && !p.backupMega;
        let megaFound = isTier && p.name === undefined && p.backupTier === undefined && !p.backupExclusive && p.backupMega === !!poke.mega;

        return poke.name === p.name || tierFound || exclusiveFound || megaFound;
      });

      if (pokeDataIndex !== -1) {
        mergedPokemon[pokeDataIndex].inDB = true;

        if (!!poke.tier) {
          mergedPokemon[pokeDataIndex].tier = poke.tier;
        }

        if (!!poke.exclusive) {
          mergedPokemon[pokeDataIndex].exclusive = !!poke.exclusive;
        }

        if (!!poke.mega) {
          mergedPokemon[pokeDataIndex].mega = !!poke.mega;
        }

        if (!!poke.shiny) {
          mergedPokemon[pokeDataIndex].shiny = !!poke.shiny;
        }

        if (!!poke.nickname && settings.databaseRaids) {
          mergedPokemon[pokeDataIndex].nickname = this.convertNicknamesToArray(poke.nickname);
        } else if (!!poke.nickname && !settings.databaseRaids) {
          mergedPokemon[pokeDataIndex].nickname.concat(this.convertNicknamesToArray(poke.nickname));
        }
      }
    });

    mergedPokemon.forEach(poke => {
      const alternateForm = alternateForms
          .find(form => form.formName === poke.name),
        formId = alternateForm ?
          alternateForm.formId :
          '00',
        formSuffix = alternateForm ?
          alternateForm.formSuffix :
          undefined,
        paddedNumber = '000' + poke.number,
        lastThree = paddedNumber.substr(paddedNumber.length - 3);

      poke.formName = poke.name;
      poke.name = poke.overrideName ?
        poke.overrideName :
        poke.name;
      poke.weakness = Pokemon.calculateWeaknesses(poke.temporaryType || poke.type);
      poke.boostedConditions = Pokemon.calculateBoostConditions(poke.type);
      poke.url = `${privateSettings.pokemonUrlBase}pokemon_icon_${!!formSuffix ? formSuffix : lastThree + '_' + formId}.png`;

      if (!poke.inDB) {
        poke.tier = poke.backupTier;
        poke.mega = poke.backupMega;
        poke.exclusive = poke.backupExclusive;
        poke.shiny = poke.backupShiny;
      }

      if (poke.number && ((poke.tier && poke.tier <= 5)) || poke.mega || poke.exclusive) {
        poke.bossCP = Pokemon.calculateBossCP(poke);
        poke.minBaseCP = this.calculateCP(poke, 20, 10, 10, 10);
        poke.maxBaseCP = this.calculateCP(poke, 20, 15, 15, 15);
        poke.minBoostedCP = this.calculateCP(poke, 25, 10, 10, 10);
        poke.maxBoostedCP = this.calculateCP(poke, 25, 15, 15, 15);
      }
    });

    this.pokemon = mergedPokemon;

    this.index = lunr(function () {
      this.ref('object');
      this.field('name');
      this.field('nickname');
      this.field('formName');
      this.field('number');
      this.field('tier');
      this.field('bossCP');

      // remove stopword filter
      this.pipeline.remove(lunr.stopWordFilter);

      mergedPokemon.forEach(pokemon => {
        const pokemonDocument = Object.create(null);

        pokemonDocument['object'] = JSON.stringify(pokemon);
        pokemonDocument['number'] = pokemon.number;
        pokemonDocument['name'] = pokemon.name;
        pokemonDocument['nickname'] = (pokemon.nickname) ? pokemon.nickname.join(' ') : '';
        pokemonDocument['formName'] = (pokemon.formName) ? pokemon.formName.replace(/_/g, ' ') : '';
        pokemonDocument['tier'] = pokemon.tier;
        pokemonDocument['bossCP'] = pokemon.bossCP;

        this.add(pokemonDocument);
      }, this);
    });

    log.info('Indexing pokemon complete');
  }

  buildCPTable(gamemaster) {
    const wholeLevelCPs = gamemaster
      .find(item => item.templateId === 'PLAYER_LEVEL_SETTINGS')
      .playerLevel.cpMultiplier
      .map(cp => Math.fround(cp));

    const cpTable = Object.create({});

    for (let i = 0; i < wholeLevelCPs.length; ++i) {
      cpTable[`${i + 1}`] = wholeLevelCPs[i];
    }

    for (let i = 0; i < wholeLevelCPs.length - 1; ++i) {
      cpTable[`${i + 1}.5`] = Math.sqrt((wholeLevelCPs[i] * wholeLevelCPs[i]) - (wholeLevelCPs[i] * wholeLevelCPs[i] / 2.0) + (wholeLevelCPs[i + 1] * wholeLevelCPs[i + 1] / 2.0));
    }

    this.cpTable = cpTable;
  }

  getCPTable(maxLevel = 40) {
    return Object.entries(this.cpTable)
      .map(([level, cpMultiplier]) => Object.assign({}, {
        level,
        cpmMultiplier: cpMultiplier
      }))
      .filter(({level}) => parseFloat(level) <= maxLevel)
      .sort((a, b) => parseFloat(b.level) - parseFloat(a.level));
  }

  getFamily(pokemon) {
    return this.pokemon
      .filter(poke => poke.family === pokemon.family);
  }

  internalSearch(terms, fields) {
    // lunr does an OR of its search terms and we really want AND, so we'll get there by doing individual searches
    // on everything and getting the intersection of the hits

    // first filter out stop words from the search terms; lunr does this itself so our hacky way of AND'ing will
    // return nothing if they have any in their search terms list since they'll never match anything

    const splitTerms = [].concat(...terms
      .map(term => term.split('-')));

    const filteredTerms = splitTerms
      .map(term => removeDiacritics(term))
      .map(term => term.replace(/[^\w\s*]+/g, ''))
      .map(term => term.toLowerCase());

    if (filteredTerms.length === 0) {
      return [];
    }

    let results = Search.singleTermSearch(filteredTerms[0], this.index, fields);

    for (let i = 1; i < filteredTerms.length; i++) {
      const termResults = Search.singleTermSearch(filteredTerms[i], this.index, fields);

      results = results
        .map(result => {
          const matchingResult = termResults.find(termResult => termResult.ref === result.ref);

          if (matchingResult) {
            // Multiply scores together for reordering later
            result.score *= matchingResult.score;
          } else {
            // No match, so set score to -1 so this result gets filtered out
            result.score = -1;
          }

          return result;
        })
        .filter(result => result.score !== -1);

      if (results.length === 0) {
        // already no results, may as well stop
        break;
      }
    }

    // Reorder results by composite score
    results.sort((resultA, resultB) => resultB.score - resultA.score);

    return results
      .map(result => JSON.parse(result.ref));
  }

  search(terms, byNumber = false) {
    if (byNumber) {
      return this.internalSearch(terms, ['number']);
    }

    // First try searching just on name
    let results = this.internalSearch(terms, ['name']);
    if (results !== undefined && results.length > 0) {
      return results;
    }

    // Try based on name, nickname, and formName
    results = this.internalSearch(terms, ['name', 'nickname', 'formName']);
    if (results !== undefined && results.length > 0) {
      return results;
    }

    // Try CP
    results = this.internalSearch(terms, ['bossCP']);
    if (results !== undefined && results.length > 0) {
      return results;
    }

    // Try tier
    results = this.internalSearch(terms
      .map(term => term.match(/(\d+)$/))
      .filter(match => !!match)
      .map(match => match[1]), ['tier']);

    if (results !== undefined && results.length > 0) {
      results = results
        .filter(pokemon => pokemon.name === undefined);
    }

    return results;
  }

  markShiny(pokemon, shiny) {
    const updateObject = {shiny: shiny};

    return DB.insertIfAbsent('Pokemon', Object.assign({},
      {
        name: pokemon
      }))
      .then(pokemonId => DB.DB('Pokemon')
        .where('id', pokemonId)
        .update(updateObject))
      .catch(err => log.error(err));
  }

  async getPokemonNicknames(pokemon) {
    const nicknameString = await DB.DB('Pokemon')
      .where('name', pokemon)
      .first()
      .pluck('nickname');

    return nicknameString[0];
  }

  convertNicknamesToArray(nicknames) {
    return !!nicknames ?
      nicknames.split(', ') :
      [];
  }

  convertNicknamesToString(nicknames) {
    return nicknames.join(', ');
  }

  async addNickname(pokemon, nickname) {
    const nicknames = await this.getPokemonNicknames(pokemon.formName),
      nicknameArray = this.convertNicknamesToArray(nicknames);

    if (nicknameArray[0] === '') {
      nicknameArray.shift();
    }

    if (nicknameArray.indexOf(nickname) === -1) {
      nicknameArray.push(nickname);
    }

    const newNicknames = nicknameArray.join(', ');

    return DB.insertIfAbsent('Pokemon', Object.assign({},
      {
        name: pokemon.formName,
        tier: (!!pokemon.tier ? pokemon.tier : 0),
        exclusive: (!!pokemon.exclusive ? pokemon.exclusive : false),
        mega: (!!pokemon.mega ? pokemon.mega : false)
      }))
      .then(pokemonId => DB.DB('Pokemon')
        .where('id', pokemonId)
        .update({
          nickname: newNicknames
        }))
      .catch(err => log.error(err));
  }

  setRaidBoss(pokemon, tier, shiny, nickname) {
    let updateObject = {};

    if (tier === 'ex') {
      if (pokemon !== 'ex') {
        updateObject.tier = 5;
      }
      updateObject.exclusive = true;
    }

    if (tier === 'unset-ex') {
      updateObject.exclusive = false;
    }

    if (tier === 'mega') {
      if (pokemon !== 'mega') {
        updateObject.tier = 5;
      }
      updateObject.mega = true;
    }

    if (tier === 'unset-mega') {
      updateObject.mega = false;
    }

    if (['0', '1', '3', '5', '7'].indexOf(tier) !== -1) {
      updateObject.tier = tier;
    }

    if (shiny) {
      updateObject.shiny = shiny;
    }

    if (nickname) {
      updateObject.nickname = this.convertNicknamesToString(nickname);
    }

    return DB.insertIfAbsent('Pokemon', Object.assign({},
      {
        name: pokemon
      }))
      .then(pokemonId => DB.DB('Pokemon')
        .where('id', pokemonId)
        .update(updateObject))
      .catch(err => log.error(err));
  }

  setDefaultTierBoss(pokemon, tier) {
    let updateObject = {
      tier: tier,
      name: pokemon
    };

    return DB.insertIfAbsent('AutosetPokemon', Object.assign({},
      {
        tier: tier
      }))
      .then(pokemonId => DB.DB('AutosetPokemon')
        .where('id', pokemonId)
        .update(updateObject))
      .catch(err => log.error(err));
  }

  async getDefaultTierBoss(tier) {
    const result = await DB.DB('AutosetPokemon')
      .where('tier', tier)
      .pluck('name')
      .first();

    if (result) {
      const terms = result.name.split(/[\s-_]/)
        .filter(term => term.length > 0)
        .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/)[1])
        .map(term => term.toLowerCase());

      return this.search(terms)
        .find(pokemon => pokemon.exclusive || pokemon.mega || pokemon.tier);
    }

    return null;
  }

  static calculateWeaknesses(pokemonTypes) {
    if (!pokemonTypes) {
      return [];
    }

    return Object.entries(types)
      .map(([type, chart]) => {
        let multiplier = 1.0;

        pokemonTypes.forEach(pokemonType => {
          if (chart.se.includes(pokemonType)) {
            multiplier *= 1.600;
          } else if (chart.ne.includes(pokemonType)) {
            multiplier *= 0.625;
          } else if (chart.im.includes(pokemonType)) {
            multiplier *= 0.390625;
          }
        });

        return {
          type: type,
          multiplier: multiplier
        }
      })
      .sort((typeA, typeB) => {
        const multiplierDifference = typeB.multiplier - typeA.multiplier;

        if (multiplierDifference === 0) {
          return typeA.type > typeB.type;
        }

        return multiplierDifference;
      })
      .filter(type => type.multiplier > 1.0);
  }

  static calculateBoostConditions(types) {
    if (!types) {
      return;
    }

    const boostedConditions = [...new Set(types
      .map(type => weather[type])
      .flat())];

    return {
      standard: [...new Set(Object.values(weather)
        .flat())]
        .filter(condition => !boostedConditions.includes(condition)),
      boosted: boostedConditions
    };
  }

  static calculateBossCP(pokemon) {
    if (!pokemon.stats) {
      return 0;
    }

    let stamina = 0;

    switch (pokemon.tier) {
      case 1:
        stamina = 600;
        break;

      case 2:
        stamina = 1800;
        break;

      case 3:
        stamina = 3600;
        break;

      case 4:
        stamina = 9000;
        break;

      case 5:
        stamina = 15000;
        break;
    }

    if (pokemon.exclusive) {
      stamina = 15000;
    }

    if (pokemon.mega) {
      stamina = 15000;
    }

    const stats = !!pokemon.temporaryStats ?
      pokemon.temporaryStats :
      pokemon.stats;

    return Math.floor(((stats.baseAttack + 15) * Math.sqrt(stats.baseDefense + 15) *
      Math.sqrt(stamina)) / 10);
  }

  calculateCP(pokemon, level, attackIV, defenseIV, staminaIV, useTemporaryStats = false) {
    if (!pokemon.stats) {
      return 0;
    }

    const cpMultiplier = this.cpTable[`${level}`],
      stats = (useTemporaryStats && !!pokemon.temporaryStats ?
        pokemon.temporaryStats :
        pokemon.stats);

    return Math.max(
      Math.floor((stats.baseAttack + attackIV) * Math.sqrt(stats.baseDefense + defenseIV) *
        Math.sqrt(stats.baseStamina + staminaIV) * Math.pow(cpMultiplier, 2) / 10),
      10);
  }
}

module.exports = new Pokemon();
