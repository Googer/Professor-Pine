import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { MemoryGymTargets } from './gym-targets.js';
import { OTHER_GUILD_ID, OTHER_GUILD_ROW, TEST_GUILD_ROW } from './gyms.js';

const ALICE = '312345678901234567';

describe('MemoryGymTargets', () => {
  it('reads a gym’s targets of one server, or of every server when told so', async () => {
    const targets = new MemoryGymTargets();
    await targets.add(ALICE, FAKE_GUILD_ID, 17);
    await targets.add(ALICE, OTHER_GUILD_ID, 17);
    expect(await targets.membersTargeting(17, TEST_GUILD_ROW)).toBe(1);
    expect(await targets.membersTargeting(17, 'every')).toBe(1);
    expect(await targets.removeGym(17, OTHER_GUILD_ROW)).toBe(1);
    expect(await targets.removeGym(17, 'every')).toBe(1);
  });

  it('refuses a server row it does not know, rather than read it as every server', async () => {
    const targets = new MemoryGymTargets();
    await targets.add(ALICE, FAKE_GUILD_ID, 17);
    await expect(targets.membersTargeting(17, 9)).rejects.toThrow('no server of row 9');
    await expect(targets.removeGym(17, 9)).rejects.toThrow('no server of row 9');
    expect(await targets.membersTargeting(17, 'every')).toBe(1);
  });
});
