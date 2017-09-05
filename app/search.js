"use strict";

class Search {
	constructor() {
		if (new.target === Search) {
			throw new TypeError("Cannot construct Search instances directly");
		}

		this.buildIndex();
	}

	search(terms) {
		const query = terms
			.map(Search.makeFuzzy)
			.join(' ');

		return this.index.search(query);
	}

	static makeFuzzy(term) {
		// Let's arbitrarily decide that every ~4.5 characters of length increases the amount
		// of fuzziness by 1; in practice this seems about right to account for typos, etc.

		term = term.substring(0, 15);

		const fuzzyAmount = Math.floor(term.length / 4.5);

		return fuzzyAmount > 0 ?
			term + '~' + fuzzyAmount :
			term;
	}
}

module.exports = Search;
