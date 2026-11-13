import { describe, expect, it } from 'vitest';
import { OTHER_GUILD_ID, OTHER_GUILD_ROW } from '../../../test/support/gyms.js';
import { nicknameSearchWith } from '../../../test/support/nicknames.js';
import { ALICE, at, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { UserError } from '../../discord/errors.js';
import { isRaid } from '../../domain/party/party.js';
import type { RaidReport } from '../../services/party-service.js';
import {
  bossMoves,
  changeRaidBoss,
  changeRaidMoves,
  changeRaidTime,
  raidChangeAnswer,
} from './raid-changes.js';

const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');
const stamp = (time: number) => `<t:${time / 1000}:t>`;
const ALICE_MEMBER = { id: ALICE, name: 'Alice' };
/** A raid of the second server (`OTHER_GUILD_ROW`). */
const THEIR_RAID = '00000000-0000-4000-8000-000000000002';

/**
 * The changes of a raid as `/hatch`, `/end`, `/boss` and `/moveset` and the live map share them:
 * one function each over a context, which answers the command's words and throws what the
 * command's readers refuse.
 */
async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  return { ...made, ctx };
}

describe('the shared changes of a raid', () => {
  it("sets a typed time as /hatch does, answering the command's words with the raid as it is now", async () => {
    const made = await setup();
    const answer = await changeRaidTime(
      made.ctx,
      made.current(),
      ALICE_MEMBER,
      'hatch',
      '30',
      PARTY_NOW,
    );
    expect(answer).toMatchObject({
      kind: 'ok',
      text: `Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
    });
    expect(answer.kind === 'ok' && answer.party.hatchTime).toBe(HATCH);
    const same = await changeRaidTime(
      made.ctx,
      made.current(),
      ALICE_MEMBER,
      'end',
      '3:15pm',
      PARTY_NOW,
    );
    expect(same).toMatchObject({
      kind: 'ok',
      text: `Nothing changed. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
    });
  });

  it("throws what the command's reader refuses, and changes nothing", async () => {
    const made = await setup();
    const typed = (text: string) =>
      changeRaidTime(made.ctx, made.current(), ALICE_MEMBER, 'hatch', text, PARTY_NOW);
    await expect(typed('5pm')).rejects.toThrow(UserError);
    await expect(typed('cancel')).rejects.toThrow(
      'A raid keeps its times once it has them. Give the right time instead.',
    );
    expect(made.current().hatchTime).toBeNull();
  });

  it('sets the boss and the moves as /boss and /moveset do', async () => {
    const made = await setup();
    expect(
      await changeRaidBoss(made.ctx, made.current(), ALICE_MEMBER, 'b:yveltal:T5:0'),
    ).toMatchObject({ kind: 'ok', text: 'The boss is now Yveltal (T5).' });
    expect(await changeRaidBoss(made.ctx, made.current(), ALICE_MEMBER, 't3')).toMatchObject({
      kind: 'ok',
      text: 'This is now: T3 egg.',
    });
    await changeRaidBoss(made.ctx, made.current(), ALICE_MEMBER, 'yveltal');
    expect(
      await changeRaidMoves(made.ctx, made.current(), ALICE_MEMBER, 'snarl', 'DARK_PULSE'),
    ).toMatchObject({ kind: 'ok', text: 'The moves are now Snarl / Dark Pulse.' });
    await expect(
      changeRaidMoves(made.ctx, made.current(), ALICE_MEMBER, null, null),
    ).rejects.toThrow('Give the fast move, the charged move, or both.');
    await expect(
      changeRaidMoves(made.ctx, made.current(), ALICE_MEMBER, 'waterfall', null),
    ).rejects.toThrow(/is not one fast move of Yveltal/);
  });

  // Plan 19B-4: a typed boss is read with the nicknames of the raid's server, wherever asked.
  it('reads a typed boss with the nicknames of the raid’s server', async () => {
    const ours = testRaid();
    const theirs = testRaid({ id: THEIR_RAID, guildId: OTHER_GUILD_ROW, gymId: 2 });
    const made = await partyServiceWith([ours, theirs]);
    const { search } = await nicknameSearchWith(
      { yveltal: ['birdy'] },
      { [OTHER_GUILD_ID]: { mewtwo: ['birdy'] } },
    );
    const { ctx } = createTestContext({
      partyService: made.service,
      attendance: made.attendance,
      raids: made.raids,
      parties: made.store,
      regions: made.regions,
      pokemon: search,
    });
    const typed = (id: string) => {
      const party = made.store.get(id);
      if (!party || !isRaid(party)) throw new Error(`no raid ${id}`);
      // At its tier: Mewtwo is not on the boss list.
      return changeRaidBoss(ctx, party, ALICE_MEMBER, 't5 birdy');
    };
    expect(await typed(ours.id)).toMatchObject({ text: 'The boss is now Yveltal (T5).' });
    expect(await typed(THEIR_RAID)).toMatchObject({ text: 'The boss is now Mewtwo (T5).' });
  });

  it('answers a raid that ended meanwhile as over', async () => {
    const made = await setup();
    const party = made.current();
    await made.service.end(party.id);
    expect(await changeRaidBoss(made.ctx, party, ALICE_MEMBER, 't3')).toEqual({
      kind: 'gone',
      text: 'This raid is over.',
    });
  });

  it('names the post of the raid that holds a gym only where the surface can link it', async () => {
    const limits = { maxNumber: 20 };
    const other = (await setup()).current();
    const refused = { kind: 'refused', reason: 'gym-taken', other } as const;
    const discord = raidChangeAnswer(limits, refused, () => '', '');
    expect(discord).toMatchObject({ kind: 'refused' });
    expect(discord.text).toBe(
      `That gym already has a raid. Its post is <#${String(other.forumPostId)}>.`,
    );
    const page = raidChangeAnswer(
      limits,
      refused,
      () => '',
      '',
      () => undefined,
    );
    expect(page.text).not.toMatch(/Its post/);
  });

  it("gives the moves the raid's boss can have, by id and name; none for an egg", async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(bossMoves(made.ctx, made.current())).toEqual({
      boss: 'Yveltal',
      fast: [
        { id: 'SUCKER_PUNCH_FAST', name: 'Sucker Punch' },
        { id: 'SNARL_FAST', name: 'Snarl' },
        { id: 'GUST_FAST', name: 'Gust' },
      ],
      charged: expect.arrayContaining([{ id: 'DARK_PULSE', name: 'Dark Pulse' }]) as unknown,
    });
    const egg = await setup();
    expect(bossMoves(egg.ctx, egg.current())).toBeUndefined();
  });
});
