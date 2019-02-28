"use strict";

const log = require('loglevel').getLogger('PokemonSearch'),
  lunr = require('lunr'),
  DB = require('./db'),
  GameMaster = require('pokemongo-game-master'),
  removeDiacritics = require('diacritics').remove,
  Search = require('./search'),
  privateSettings = require('../data/private-settings'),
  settings = require('../data/settings'),
  types = require('../data/types'),
  weather = require('../data/weather');

class Pokemon extends Search {
  constructor() {
    super();
  }

  async buildIndex() {
    log.info('Indexing pokemon...');

    const gameMaster = await GameMaster.getVersion('latest', 'json'),
      pokemonRegex = new RegExp('^V[0-9]+_POKEMON_(.*)'),
      formsRegex = new RegExp('^FORMS_V[0-9]+_POKEMON_(.*)'),
      pokemonMetadata = require('../data/pokemon'),
      alternateForms = [].concat(...gameMaster.itemTemplates
        .filter(item => formsRegex.test(item.templateId))
        .filter(form => !!form.formSettings.forms)
        .map(form => form.formSettings.forms))
        .map(form => Object.assign({},
          {
            formName: form.form.toLocaleLowerCase(),
            formId: !!form.assetBundleValue ?
              `${form.assetBundleValue}` :
              '00'
          })),
      pokemon = gameMaster.itemTemplates
        .filter(item => pokemonRegex.test(item.templateId))
        .map(item => Object.assign({},
          {
            name: item.pokemonSettings.form ?
              item.pokemonSettings.form.toLowerCase() :
              item.pokemonSettings.pokemonId.toLowerCase(),
            number: Number.parseInt(item.templateId.split('_')[0].slice(2)),
            stats: item.pokemonSettings.stats,
            quickMoves: item.pokemonSettings.quickMoves,
            cinematicMoves: item.pokemonSettings.cinematicMoves,
            type: [item.pokemonSettings.type.split('_')[2].toLowerCase(), item.pokemonSettings.type2 ?
              item.pokemonSettings.type2.split('_')[2].toLowerCase() :
              null]
              .filter(type => !!type),
            form: item.pokemonSettings.form ?
              item.pokemonSettings.form.split('_')[1].toLowerCase() :
              'normal'
          })),
      updatedPokemon = await DB.DB('Pokemon').select(),
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

          return Object.assign({}, poke, pokemon.find(p => p.name === poke.name))
        });

    updatedPokemon.forEach(poke => {
      let isTier = ['1', '2', '3', '4', '5', 'ex'].indexOf(poke.name) !== -1;

      let pokeDataIndex = mergedPokemon.findIndex(p => {
        let tierFound = isTier && p.name === undefined && p.backupTier === poke.tier && !p.backupExclusive;
        let exclusiveFound = isTier && p.name === undefined && p.backupTier === undefined && p.backupExclusive === !!poke.exclusive && !!poke.exclusive;

        return poke.name === p.name || tierFound || exclusiveFound;
      });

      if (pokeDataIndex !== -1) {
        if (!!poke.tier) {
          mergedPokemon[pokeDataIndex].tier = poke.tier;
        }

        if (!!poke.exclusive) {
          mergedPokemon[pokeDataIndex].exclusive = !!poke.exclusive;
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
        paddedNumber = '000' + poke.number,
        lastThree = paddedNumber.substr(paddedNumber.length - 3);

      poke.formName = poke.name;
      poke.name = poke.overrideName ?
        poke.overrideName :
        poke.name;
      poke.weakness = Pokemon.calculateWeaknesses(poke.type);
      poke.boostedConditions = Pokemon.calculateBoostConditions(poke.type);
      poke.url = `${privateSettings.pokemonUrlBase}pokemon_icon_${lastThree}_${formId}.png`;

      if (poke.number && poke.tier && poke.tier <= 5) {
        poke.bossCP = Pokemon.calculateBossCP(poke);
        poke.minBaseCP = Pokemon.calculateCP(poke, 20, 10, 10, 10);
        poke.maxBaseCP = Pokemon.calculateCP(poke, 20, 15, 15, 15);
        poke.minBoostedCP = Pokemon.calculateCP(poke, 25, 10, 10, 10);
        poke.maxBoostedCP = Pokemon.calculateCP(poke, 25, 15, 15, 15);
      }
    });

    this.pokemon = mergedPokemon;

    this.index = lunr(function () {
      this.ref('object');
      this.field('name');
      this.field('nickname');
      this.field('number');
      this.field('tier');
      this.field('bossCP');

      mergedPokemon.forEach(pokemon => {
        const pokemonDocument = Object.create(null);

        pokemonDocument['object'] = JSON.stringify(pokemon);
        pokemonDocument['number'] = pokemon.number;
        pokemonDocument['name'] = pokemon.name;
        pokemonDocument['nickname'] = (pokemon.nickname) ? pokemon.nickname.join(' ') : '';
        pokemonDocument['tier'] = pokemon.tier;
        pokemonDocument['bossCP'] = pokemon.bossCP;

        this.add(pokemonDocument);
      }, this);
    });

    log.info('Indexing pokemon complete');
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
      .map(term => term.toLowerCase())
      .filter(term => this.stopWordFilter(term));

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

    // Try based on name and nickname
    results = this.internalSearch(terms, ['name', 'nickname']);
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
    const updateObject = { shiny: shiny };

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

    console.log(nicknameString);

    return nicknameString[0];
  }

  convertNicknamesToArray(nicknames) {
    return nicknames.split(', ');
  }

  convertNicknamesToString(nicknames) {
    return nicknames.join(', ');
  }

  async addNickname(pokemon, nickname) {
    const nicknames = await this.getPokemonNicknames(pokemon),
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
        name: pokemon
      }))
      .then(pokemonId => DB.DB('Pokemon')
        .where('id', pokemonId)
        .update({
          nickname: newNicknames
        }))
      .catch(err => log.error(err));
  }

  addRaidBoss(pokemon, tier, shiny, nickname) {
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

    if (['0', '1', '2', '3', '4', '5', '7'].indexOf(tier) !== -1) {
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
    if (tier === 'ex') {
      tier = 6;
    }

    const result = await DB.DB('AutosetPokemon')
      .where('tier', tier)
      .pluck('name')
      .first();

      if (result) {
        const terms = result.name.split(/[\s-]/)
          .filter(term => term.length > 0)
          .map(term => term.match(/(?:<:)?([\w*]+)(?::[0-9]+>)?/)[1])
          .map(term => term.toLowerCase());

        return this.search(terms)
          .find(pokemon => pokemon.exclusive || pokemon.tier);
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

    let allConditions = ["sunny", "clear", "rain", "partlycloudy", "cloudy", "windy", "snow", "fog"],
      boostedConditions = [];

    types.forEach(type => {
      boostedConditions.push(...weather[type]);
    });

    boostedConditions = [...new Set(boostedConditions)];

    return {
      standard: allConditions.filter(condition => !boostedConditions.includes(condition)),
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

    return Math.floor(((pokemon.stats.baseAttack + 15) * Math.sqrt(pokemon.stats.baseDefense + 15) *
      Math.sqrt(stamina)) / 10);
  }

  static calculateCP(pokemon, level, attackIV, defenseIV, staminaIV) {
    if (!pokemon.stats) {
      return 0;
    }

    let cpMultiplier;

    switch (level) {
      case 1:
        cpMultiplier = 0.094;
        break;

      case 1.5:
        cpMultiplier = 0.135137432;
        break;

      case 2:
        cpMultiplier = 0.16639787;
        break;

      case 2.5:
        cpMultiplier = 0.192650919;
        break;

      case 3:
        cpMultiplier = 0.21573247;
        break;

      case 3.5:
        cpMultiplier = 0.236572661;
        break;

      case 4:
        cpMultiplier = 0.25572005;
        break;

      case 4.5:
        cpMultiplier = 0.273530381;
        break;

      case 5:
        cpMultiplier = 0.29024988;
        break;

      case 5.5:
        cpMultiplier = 0.306057377;
        break;

      case 6:
        cpMultiplier = 0.3210876;
        break;

      case 6.5:
        cpMultiplier = 0.335445036;
        break;

      case 7:
        cpMultiplier = 0.34921268;
        break;

      case 7.5:
        cpMultiplier = 0.362457751;
        break;

      case 8:
        cpMultiplier = 0.37523559;
        break;

      case 8.5:
        cpMultiplier = 0.387592406;
        break;

      case 9:
        cpMultiplier = 0.39956728;
        break;

      case 9.5:
        cpMultiplier = 0.411193551;
        break;

      case 10:
        cpMultiplier = 0.42250001;
        break;

      case 10.5:
        cpMultiplier = 0.432926419;
        break;

      case 11:
        cpMultiplier = 0.44310755;
        break;

      case 11.5:
        cpMultiplier = 0.4530599578;
        break;

      case 12:
        cpMultiplier = 0.46279839;
        break;

      case 12.5:
        cpMultiplier = 0.472336083;
        break;

      case 13:
        cpMultiplier = 0.48168495;
        break;

      case 13.5:
        cpMultiplier = 0.4908558;
        break;

      case 14:
        cpMultiplier = 0.49985844;
        break;

      case 14.5:
        cpMultiplier = 0.508701765;
        break;

      case 15:
        cpMultiplier = 0.51739395;
        break;

      case 15.5:
        cpMultiplier = 0.525942511;
        break;

      case 16:
        cpMultiplier = 0.53435433;
        break;

      case 16.5:
        cpMultiplier = 0.542635767;
        break;

      case 17:
        cpMultiplier = 0.55079269;
        break;

      case 17.5:
        cpMultiplier = 0.558830576;
        break;

      case 18:
        cpMultiplier = 0.56675452;
        break;

      case 18.5:
        cpMultiplier = 0.574569153;
        break;

      case 19:
        cpMultiplier = 0.58227891;
        break;

      case 19.5:
        cpMultiplier = 0.589887917;
        break;

      case 20:
        cpMultiplier = 0.59740001;
        break;

      case 20.5:
        cpMultiplier = 0.604818814;
        break;

      case 21:
        cpMultiplier = 0.61215729;
        break;

      case 21.5:
        cpMultiplier = 0.619399365;
        break;

      case 22:
        cpMultiplier = 0.62656713;
        break;

      case 22.5:
        cpMultiplier = 0.633644533;
        break;

      case 23:
        cpMultiplier = 0.64065295;
        break;

      case 23.5:
        cpMultiplier = 0.647576426;
        break;

      case 24:
        cpMultiplier = 0.65443563;
        break;

      case 24.5:
        cpMultiplier = 0.661214806;
        break;

      case 25:
        cpMultiplier = 0.667934;
        break;

      case 25.5:
        cpMultiplier = 0.674577537;
        break;

      case 26:
        cpMultiplier = 0.68116492;
        break;

      case 26.5:
        cpMultiplier = 0.687680648;
        break;

      case 27:
        cpMultiplier = 0.69414365;
        break;

      case 27.5:
        cpMultiplier = 0.700538673;
        break;

      case 28:
        cpMultiplier = 0.70688421;
        break;

      case 28.5:
        cpMultiplier = 0.713164996;
        break;

      case 29:
        cpMultiplier = 0.71939909;
        break;

      case 29.5:
        cpMultiplier = 0.725571552;
        break;

      case 30:
        cpMultiplier = 0.7317;
        break;

      case 30.5:
        cpMultiplier = 0.734741009;
        break;

      case 31:
        cpMultiplier = 0.73776948;
        break;

      case 31.5:
        cpMultiplier = 0.740785574;
        break;

      case 32:
        cpMultiplier = 0.74378943;
        break;

      case 32.5:
        cpMultiplier = 0.746781211;
        break;

      case 33:
        cpMultiplier = 0.74976104;
        break;

      case 33.5:
        cpMultiplier = 0.752729087;
        break;

      case 34:
        cpMultiplier = 0.75568551;
        break;

      case 34.5:
        cpMultiplier = 0.758630378;
        break;

      case 35:
        cpMultiplier = 0.76156384;
        break;

      case 35.5:
        cpMultiplier = 0.764486065;
        break;

      case 36:
        cpMultiplier = 0.76739717;
        break;

      case 36.5:
        cpMultiplier = 0.770297266;
        break;

      case 37:
        cpMultiplier = 0.7731865;
        break;

      case 37.5:
        cpMultiplier = 0.776064962;
        break;

      case 38:
        cpMultiplier = 0.77893275;
        break;

      case 38.5:
        cpMultiplier = 0.781790055;
        break;

      case 39:
        cpMultiplier = 0.78463697;
        break;

      case 39.5:
        cpMultiplier = 0.787473578;
        break;

      case 40:
        cpMultiplier = 0.79030001;
        break;
    }

    return Math.floor((pokemon.stats.baseAttack + attackIV) * Math.sqrt(pokemon.stats.baseDefense + defenseIV) *
      Math.sqrt(pokemon.stats.baseStamina + staminaIV) * Math.pow(cpMultiplier, 2) / 10);
  }
}

module.exports = new Pokemon();
