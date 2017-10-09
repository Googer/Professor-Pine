"use strict";

const lunr = require('lunr');

class Search {
	constructor() {
		if (new.target === Search) {
			throw new TypeError("Cannot construct Search instances directly");
		}

		this.buildIndex();
	}

	static singleTermSearch(term, index) {
		if (term.length > 15) {
			term = term.substring(0, 14) + '*';
		}

		return index.query(query => {
			query.term(term,
				{
					usePipeline: true,
					boost: 100
				});

			if (term.includes(lunr.Query.wildcard)) {
				// wildcard in term, disable stemming
				query.term(term,
					{
						usePipeline: false,
						boost: 10
					});
			}
			query.term(term,
				{
					usePipeline: false,
					boost: 1,
					editDistance: Math.floor(term.length / 4.5)
				});
		});
	}
}

module.exports = Search;
