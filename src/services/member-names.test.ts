import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../test/support/members.js';
import { MEMBER_NAMES_FRESH_MS, MemberNames } from './member-names.js';

const ASH = '312345678901234567';
const BROCK = '312345678901234568';
const MISTY = '312345678901234569';
const GARY = '312345678901234570';

function namesWith() {
  const members = new FakeMemberDirectory().add(ASH, 'Ash').add(BROCK, 'Brock').add(GARY, ' ');
  const clock = { now: 1_000 };
  const names = new MemberNames({ members, now: () => clock.now });
  return { members, clock, names };
}

describe('MemberNames: the names of the members a board shows', () => {
  it('names the members of the server in one ask, leaving out who is not or has no name', async () => {
    const { members, names } = namesWith();
    const named = await names.names(FAKE_GUILD_ID, [ASH, BROCK, MISTY, GARY]);
    expect([...named]).toEqual([
      [ASH, 'Ash'],
      [BROCK, 'Brock'],
    ]);
    expect(members.namedAsks).toEqual([[ASH, BROCK, MISTY, GARY]]);
  });

  it('keeps every answer a minute, "not in the server" too, and asks only for the rest', async () => {
    const { members, clock, names } = namesWith();
    await names.names(FAKE_GUILD_ID, [ASH, MISTY]);
    members.add(MISTY, 'Misty');
    expect([...(await names.names(FAKE_GUILD_ID, [ASH, MISTY, BROCK]))]).toEqual([
      [ASH, 'Ash'],
      [BROCK, 'Brock'],
    ]);
    expect(members.namedAsks).toEqual([[ASH, MISTY], [BROCK]]);
    clock.now += MEMBER_NAMES_FRESH_MS;
    expect((await names.names(FAKE_GUILD_ID, [MISTY])).get(MISTY)).toBe('Misty');
    // Nothing is asked for nobody.
    await names.names(FAKE_GUILD_ID, []);
    expect(members.namedAsks).toHaveLength(3);
  });

  it('keeps nothing of an ask that failed, and rejects', async () => {
    const { members, names } = namesWith();
    members.failing = new Error('Discord is away');
    await expect(names.names(FAKE_GUILD_ID, [ASH])).rejects.toThrow('Discord is away');
    members.failing = undefined;
    expect((await names.names(FAKE_GUILD_ID, [ASH])).get(ASH)).toBe('Ash');
  });

  it('asks once for a member two callers want at the same moment (B4)', async () => {
    const { members, names } = namesWith();
    const [first, second] = await Promise.all([
      names.names(FAKE_GUILD_ID, [ASH, BROCK]),
      names.names(FAKE_GUILD_ID, [BROCK, MISTY]),
    ]);
    expect(first.get(BROCK)).toBe('Brock');
    expect(second.get(BROCK)).toBe('Brock');
    expect(members.namedAsks).toEqual([[ASH, BROCK], [MISTY]]);
  });

  it('keeps nothing of a member whose ask failed for the other caller waiting on it', async () => {
    const { members, names } = namesWith();
    members.failing = new Error('Discord is away');
    const asked = Promise.allSettled([
      names.names(FAKE_GUILD_ID, [ASH]),
      names.names(FAKE_GUILD_ID, [ASH]),
    ]);
    expect((await asked).map((one) => one.status)).toEqual(['rejected', 'rejected']);
    members.failing = undefined;
    expect((await names.names(FAKE_GUILD_ID, [ASH])).get(ASH)).toBe('Ash');
  });

  it('leaves out a name that shows as nothing, which a line would show as a mention (W4)', async () => {
    const { members, names } = namesWith();
    members.add(MISTY, '\\');
    expect([...(await names.names(FAKE_GUILD_ID, [ASH, MISTY]))]).toEqual([[ASH, 'Ash']]);
  });

  it('takes the names a caller knows already without asking', async () => {
    const { members, names } = namesWith();
    const named = await names.names(FAKE_GUILD_ID, [ASH, MISTY], new Map([[MISTY, 'Misty']]));
    expect(named.get(MISTY)).toBe('Misty');
    expect(members.namedAsks).toEqual([[ASH]]);
  });
});
