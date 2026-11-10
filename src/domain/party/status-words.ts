import { matchNamed, type Named } from '../search/word-match.js';
import { PartyStatus, RaidPrivacy } from './status.js';

/** What members call the statuses they can set for themselves (the legacy bot's words). */
const STATUS_WORDS: readonly Named<PartyStatus>[] = [
  {
    value: PartyStatus.NotInterested,
    names: ['leave', 'part', 'not-interested', 'uninterested', 'meh', 'bye', 'none', 'off'],
  },
  {
    value: PartyStatus.Interested,
    names: ['maybe', 'interested', 'interest', 'hmm', 'on'],
  },
  {
    value: PartyStatus.Coming,
    names: ['join', 'attend', 'omw', 'coming', 'going'],
  },
];

const PRIVACY_WORDS: readonly Named<RaidPrivacy>[] = [
  {
    value: RaidPrivacy.Anonymous,
    names: ['hidden', 'invisible', 'anonymous', 'private', 'yes'],
  },
  {
    value: RaidPrivacy.Visible,
    names: ['unhidden', 'shown', 'visible', 'nonanonymous', 'public', 'no'],
  },
];

/** The status a word means ("maybe", "omw", "leave"); undefined when it means none. */
export function parseStatusWord(text: string): PartyStatus | undefined {
  return matchNamed(STATUS_WORDS, text)[0];
}

/** Whether a word asks for anonymous ("hidden", "yes") or named ("public", "no") raid reports. */
export function parsePrivacyWord(text: string): RaidPrivacy | undefined {
  return matchNamed(PRIVACY_WORDS, text)[0];
}
