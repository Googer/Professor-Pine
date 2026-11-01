/** An attendee's status. The integers are what the legacy bot stores in User.status and party state. */
export const PartyStatus = {
  NotInterested: -1,
  Interested: 0,
  Coming: 1,
  Present: 2,
  CompletePending: 3,
  Complete: 4,
} as const;
export type PartyStatus = (typeof PartyStatus)[keyof typeof PartyStatus];

/** Whether a raid report names its reporter (User.raidPrivacy). */
export const RaidPrivacy = { Visible: 0, Anonymous: 1 } as const;
export type RaidPrivacy = (typeof RaidPrivacy)[keyof typeof RaidPrivacy];

const STATUSES: readonly number[] = Object.values(PartyStatus);
const PRIVACIES: readonly number[] = Object.values(RaidPrivacy);

/** Unknown stored values become Interested, the column default. */
export function toPartyStatus(value: number): PartyStatus {
  return STATUSES.includes(value) ? (value as PartyStatus) : PartyStatus.Interested;
}

/** Unknown stored values become Visible, the column default. */
export function toRaidPrivacy(value: number): RaidPrivacy {
  return PRIVACIES.includes(value) ? (value as RaidPrivacy) : RaidPrivacy.Visible;
}
