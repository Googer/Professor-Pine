import { describe, expect, it } from 'vitest';
import { LIBRARY, MAKER, MODERATOR } from '../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { gymsFixture } from '../../test/support/providers.js';

const SERVER = '412345678901234567';
const mod = { id: MODERATOR, name: 'Mod' };

describe('MeetupSafety: Block member on a request decided before (8S-1 review W7)', () => {
  it('keeps Block member on a refused request while its maker is not blocked, and blocks', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    await made.safety.decide(request.id, 'refuse', mod, SERVER);
    expect(buttonsOf(made.postOf(request)?.message).map((button) => button.label)).toEqual([
      'Block member',
    ]);
    const outcome = await made.safety.decide(request.id, 'block', mod, SERVER, 'Pine Town');
    expect(outcome).toMatchObject({ kind: 'blocked-later', newBlock: true });
    expect(await made.storage.block(SERVER, MAKER)).toMatchObject({ blockedBy: MODERATOR });
    const post = made.postOf(request)?.message;
    expect(buttonsOf(post)).toEqual([]);
    expect(textOf(post)).toContain(`Its maker was blocked by **Mod** (<@${MODERATOR}>)`);
    expect(made.dms.to(MAKER).length).toBe(2);
    // Blocked already: nothing more.
    expect(await made.safety.decide(request.id, 'block', mod, SERVER)).toMatchObject({
      kind: 'blocked-later',
      newBlock: false,
    });
  });

  it('offers it on an expired request, and not once the maker is blocked otherwise', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    made.clock.now = request.expiresAt;
    await made.safety.expire();
    expect(buttonsOf(made.postOf(request)?.message).map((button) => button.label)).toEqual([
      'Block member',
    ]);
    const second = await made.held({ startTime: made.clock.now + 30 * 3_600_000 });
    await made.safety.decide(second.id, 'block', mod, SERVER);
    // The first request's post is shown anew only when it is decided again; a press says so.
    expect(await made.safety.decide(request.id, 'block', mod, SERVER)).toMatchObject({
      kind: 'blocked-later',
      newBlock: false,
    });
    expect(buttonsOf(made.postOf(request)?.message)).toEqual([]);
  });

  it('closes an appeal whose block was lifted otherwise, and tells nobody of a block kept', async () => {
    const made = await meetupSafetyWith();
    await made.storage.addBlock(SERVER, MAKER, { ...mod, at: 1 });
    const appealed = await made.safety.appeal({
      serverId: SERVER,
      nearChannelId: '100000000000000001',
      member: { id: MAKER, name: 'Alice' },
      text: 'Please.',
    });
    if (appealed.kind !== 'sent') throw new Error(appealed.kind);
    await made.storage.liftBlock(SERVER, MAKER, { ...mod, at: 2 });
    expect(await made.safety.decideAppeal(appealed.appeal.id, 'keep', mod, SERVER)).toMatchObject({
      kind: 'no-block',
    });
    expect(await made.storage.appeal(appealed.appeal.id)).toMatchObject({ status: 'lifted' });
    expect(made.dms.to(MAKER)).toEqual([]);
  });

  it('keeps the name of a maker blocked from a decided request', async () => {
    const made = await meetupSafetyWith();
    const request = await made.held();
    await made.safety.decide(request.id, 'refuse', mod, SERVER);
    await made.safety.decide(request.id, 'block', mod, SERVER);
    expect(await made.storage.block(SERVER, MAKER)).toMatchObject({ memberName: 'Alice' });
  });

  it('names a gym’s official name beside its nickname in the request’s post', async () => {
    const made = await meetupSafetyWith();
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym 1');
    const request = await made.held({
      place: { ...LIBRARY, kind: 'gym', id: '1', title: 'The Stacks Little Free Library' },
    });
    expect(textOf(made.postOf(request)?.message)).toContain(`(gym; officially **${gym.name}**)`);
  });
});
