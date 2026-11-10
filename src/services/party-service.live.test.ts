import { describe, expect, it } from 'vitest';
import { reportedRaid } from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';

const ALICE = { id: '200000000000000071', name: 'Alice' };

/** The draws of the raid's post the service tells of from now on. */
function shownOf(made: Awaited<ReturnType<typeof reportedRaid>>) {
  const shown: { partyId: string; row: number; changed: boolean }[] = [];
  made.service.onPostShown((partyId, row, changed) => {
    shown.push({ partyId, row, changed });
  });
  return shown;
}

describe('PartyService tells of the posts it draws (onPostShown)', () => {
  it('says the post did not change for a draw that sends nothing new', async () => {
    const made = await reportedRaid();
    const shown = shownOf(made);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(shown).toEqual([{ partyId: made.party.id, row: made.party.guildId, changed: false }]);
  });

  it('says the post changed when its layout has another key', async () => {
    const made = await reportedRaid();
    const shown = shownOf(made);
    await made.attendance.signUp(made.party.id, ALICE, PartyStatus.Coming);
    await made.service.flush();
    expect(shown.at(-1)).toEqual({
      partyId: made.party.id,
      row: made.party.guildId,
      changed: true,
    });
  });

  it('tells of nothing for an edit that keeps nothing', async () => {
    const made = await reportedRaid();
    const shown = shownOf(made);
    made.gateway.failing.set('editPost', new Error('Discord is away'));
    await made.attendance.signUp(made.party.id, ALICE, PartyStatus.Coming);
    await made.service.flush();
    expect(shown).toEqual([]);
  });

  it('goes on past a listener that throws', async () => {
    const made = await reportedRaid();
    made.service.onPostShown(() => {
      throw new Error('a listener failed');
    });
    const shown = shownOf(made);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(shown).toHaveLength(1);
  });
});
