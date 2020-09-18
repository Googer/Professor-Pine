"use strict";

const log = require('loglevel').getLogger('MovesSearch'),
  lunr = require('lunr'),
  main = require('../index'),
  {downloadGameMaster, downloadText} = require('./pogo-data'),
  removeDiacritics = require('diacritics').remove,
  Search = require('./search'),
  Utility = require('./utility');

class Moves extends Search {
  constructor() {
    super();
  }

  async buildIndex() {
    while (!main.isInitialized) {
      await Utility.sleep(1000);
    }

    log.info('Indexing moves...');

    const gameMaster = await downloadGameMaster(),
      text = await downloadText(),
      moveRegex = new RegExp('^move_name_([0-9]+)$'),
      moveNames = Object.create(null);

    for (let i = 0; i < text.data.length; ++i) {
      const match = moveRegex.exec(text.data[i]);

      if (!!match) {
        const internalNameRegex = new RegExp(`^V${match[1]}_MOVE_(.*)$`),
          internalName = gameMaster
            .map(item => item.templateId)
            .map(templateId => internalNameRegex.exec(templateId))
            .find(item => !!item);

        if (internalName) {
          moveNames[internalName[1]] = text.data[i + 1];
        }
      }
    }

    this.index = lunr(function () {
      this.ref('move');
      this.field('name');

      // remove stop word filter
      this.pipeline.remove(lunr.stopWordFilter);

      Object.entries(moveNames)
        .forEach(([move, name]) => {
          const moveDocument = Object.create(null);

          moveDocument['move'] = move;
          moveDocument['name'] = removeDiacritics(name.toLowerCase() + ' ' + name.toLowerCase().replace(/\s/g, ''));

          this.add(moveDocument);
        }, this);
    });

    this.moveNames = moveNames;

    log.info('Indexing moves complete');
  }

  getFriendlyName(internalName) {
    return this.moveNames[internalName];
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
      .filter(term => Search.stopWordFilter(term));

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

    return results;
  }

  search(terms) {
    return this.internalSearch(terms, ['name'])
      .map(result => result.ref);
  }
}

module.exports = new Moves();
