import { describe, expect, it } from 'vitest';
import { PartyStatus, RaidPrivacy, toPartyStatus, toRaidPrivacy } from './status.js';

describe('party status constants', () => {
  it('keeps the integers the legacy bot stores', () => {
    expect(PartyStatus).toEqual({
      NotInterested: -1,
      Interested: 0,
      Coming: 1,
      Present: 2,
      CompletePending: 3,
      Complete: 4,
    });
    expect(RaidPrivacy).toEqual({ Visible: 0, Anonymous: 1 });
  });

  it('accepts stored values and falls back for anything else', () => {
    expect(toPartyStatus(1)).toBe(PartyStatus.Coming);
    expect(toPartyStatus(-1)).toBe(PartyStatus.NotInterested);
    expect(toPartyStatus(17)).toBe(PartyStatus.Interested);
    expect(toRaidPrivacy(1)).toBe(RaidPrivacy.Anonymous);
    expect(toRaidPrivacy(9)).toBe(RaidPrivacy.Visible);
  });
});
