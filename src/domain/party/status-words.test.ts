import { describe, expect, it } from 'vitest';
import { PartyStatus, RaidPrivacy } from './status.js';
import { parsePrivacyWord, parseStatusWord } from './status-words.js';

describe('parseStatusWord', () => {
  it.each([
    ['maybe', PartyStatus.Interested],
    ['interested', PartyStatus.Interested],
    ['interest', PartyStatus.Interested],
    ['hmm', PartyStatus.Interested],
    ['on', PartyStatus.Interested],
    ['join', PartyStatus.Coming],
    ['attend', PartyStatus.Coming],
    ['omw', PartyStatus.Coming],
    ['coming', PartyStatus.Coming],
    ['going', PartyStatus.Coming],
    ['leave', PartyStatus.NotInterested],
    ['part', PartyStatus.NotInterested],
    ['not-interested', PartyStatus.NotInterested],
    ['not interested', PartyStatus.NotInterested],
    ['uninterested', PartyStatus.NotInterested],
    ['meh', PartyStatus.NotInterested],
    ['bye', PartyStatus.NotInterested],
    ['none', PartyStatus.NotInterested],
    ['off', PartyStatus.NotInterested],
  ])('reads %s', (word, status) => {
    expect(parseStatusWord(word)).toBe(status);
    expect(parseStatusWord(` ${word.toUpperCase()} `)).toBe(status);
  });

  it('forgives a misspelling and an unfinished word', () => {
    expect(parseStatusWord('intrested')).toBe(PartyStatus.Interested);
    expect(parseStatusWord('comming')).toBe(PartyStatus.Coming);
    expect(parseStatusWord('int')).toBe(PartyStatus.Interested);
  });

  it('does not read a negated word as the word', () => {
    for (const word of ['no coming', 'no attend', 'uncoming', 'not coming', 'doing']) {
      expect(parseStatusWord(word), word).toBeUndefined();
    }
    for (const word of [
      'no public',
      'unprivate',
      'no private',
      'no hidden',
      'no visible',
      'not hidden',
    ]) {
      expect(parsePrivacyWord(word), word).toBeUndefined();
    }
    expect(parseStatusWord('comming')).toBe(PartyStatus.Coming);
    expect(parsePrivacyWord('publc')).toBe(RaidPrivacy.Visible);
  });

  it('does not guess from one or two letters, or from other words', () => {
    for (const word of ['', 'o', 'in', 'un', 'no', 'xyz', 'present', 'here', 'done']) {
      expect(parseStatusWord(word), word).toBeUndefined();
    }
  });
});

describe('parsePrivacyWord', () => {
  it.each([
    ['hidden', RaidPrivacy.Anonymous],
    ['invisible', RaidPrivacy.Anonymous],
    ['anonymous', RaidPrivacy.Anonymous],
    ['private', RaidPrivacy.Anonymous],
    ['yes', RaidPrivacy.Anonymous],
    ['unhidden', RaidPrivacy.Visible],
    ['shown', RaidPrivacy.Visible],
    ['visible', RaidPrivacy.Visible],
    ['nonanonymous', RaidPrivacy.Visible],
    ['public', RaidPrivacy.Visible],
    ['no', RaidPrivacy.Visible],
  ])('reads %s', (word, privacy) => {
    expect(parsePrivacyWord(word)).toBe(privacy);
  });

  it('forgives an unfinished word and refuses other words', () => {
    expect(parsePrivacyWord('anon')).toBe(RaidPrivacy.Anonymous);
    expect(parsePrivacyWord('pub')).toBe(RaidPrivacy.Visible);
    for (const word of ['', 'y', 'n', 'maybe']) expect(parsePrivacyWord(word)).toBeUndefined();
  });
});
