import { describe, expect, it } from 'vitest';
import {
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { gymViewOf } from '../../../test/support/gym-commands.js';
import { testGyms, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { gymsOf } from '../../../test/support/providers.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { findGym } from './find-gym.js';

/** `/find-gym` over these gyms (the invented ones unless a test changes them), from West. */
function setup(change: (gyms: ReturnType<typeof testGyms>) => void = () => undefined) {
  const gyms = testGyms();
  change(gyms);
  const { ctx } = createTestContext({ gyms: gymsOf(gyms) });
  const router = new InteractionRouter(ctx, [findGym], []);
  return async (gym: string): Promise<FakeInteraction> => {
    const interaction = fakeChatInput({
      commandName: 'find-gym',
      channelId: WEST_CHANNEL,
      options: { gym },
    });
    await router.handle(interaction as never);
    return interaction;
  };
}

const refusal = (used: FakeInteraction) => sent(used.reply).content;
const title = (used: FakeInteraction) => gymViewOf(sent(used.editReply)).title;

describe('the gym option of the member commands', () => {
  it('offers the one gym a misspelt text may mean, without acting on it', async () => {
    const run = setup();
    expect(refusal(await run('fountian'))).toBe(
      'No gym has every word of "fountian"; did you mean **Old Stone Fountain** (#2)? Pick ' +
        'it from the list, or give its number (`#2`).',
    );
  });

  it('takes bare digits as the number of a gym of this server', async () => {
    const run = setup();
    expect(title(await run('2'))).toBe('Old Stone Fountain');
    expect(title(await run('#2'))).toBe('Old Stone Fountain');
    // Gym 10 lies in no region: it is no gym of this server.
    expect(refusal(await run('10'))).toBe('This server has no gym #10.');
  });

  it('never acts on a gym whose number only begins with the digits', async () => {
    const run = setup((gyms) => {
      const fountain = gyms.find((gym) => gym.id === 2);
      if (fountain) gyms.push({ ...fountain, id: 1050, name: 'Town Hall Steps', keywords: [] });
    });
    expect(refusal(await run('105'))).toBe('This server has no gym #105.');
    expect(title(await run('1050'))).toBe('Town Hall Steps');
  });

  it('acts on digits that are no number of a gym but the name of one', async () => {
    const run = setup((gyms) => {
      const pier = gyms.find((gym) => gym.id === 5);
      if (pier) pier.name = 'Pier 77 Starbucks';
    });
    expect(title(await run('77'))).toBe('Pier 77 Starbucks');
  });

  it('names both when the digits are the number of one gym and in the name of another', async () => {
    const run = setup((gyms) => {
      const pier = gyms.find((gym) => gym.id === 5);
      if (pier) pier.name = 'Pier 12 Starbucks';
    });
    expect(refusal(await run('12'))).toBe(
      '"12" is the number of one gym and in the name of another: **Pinewood Post Office Gym** ' +
        '(#12), **Pier 12 Starbucks** (#5). Pick one from the list, or write the number as `#12`.',
    );
    expect(title(await run('#12'))).toBe('Pinewood Post Office Gym');
  });
});
