import { describe, expect, it } from 'vitest';
import { textDisplays, textOf } from '../../test/support/messages.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { createdTrain, reportedRaid } from '../../test/support/party-service.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from '../config/settings.js';
import { PartyStatus } from '../domain/party/status.js';

/** Parties whose groups hold four trainers, as a Dynamax battle's will (plan 8X-3). */
const inLobbiesOf4 = { lobbySize: () => 4 };

describe('PartyService: the lobby of a group in the post', () => {
  it('counts a raid’s lobby in its post where the raid has a size', async () => {
    const made = await reportedRaid({}, inLobbiesOf4);
    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
      number: 3,
    });
    await made.service.flush();
    const message = made.gateway.posts.get(made.postId)?.message;
    expect(textOf(message)).toContain('3/4 coming · 1 interested\n');
    // Bob does not fit in A: Join opens B for him.
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming, {
      number: 2,
    });
    await made.service.flush();
    const groups = textDisplays(made.gateway.posts.get(made.postId)?.message)
      .filter((text) => text.startsWith('**Group'))
      .map((text) => text.split('\n')[0]);
    expect(groups).toEqual(['**Group A** · 3/4 coming · 1 interested', '**Group B** · 2/4 coming']);
  });

  it('counts a train’s lobby in its post where the train has a size', async () => {
    const made = await createdTrain({}, inLobbiesOf4);
    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
    await made.service.flush();
    const postId = made.party.forumPostId ?? '';
    expect(textOf(made.gateway.posts.get(postId)?.message)).toContain(
      '1/4 coming · 1 interested\n',
    );
  });

  it('tells a raid’s group to split up by the raid lobby of the settings', async () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const made = await reportedRaid(
      {},
      { settings: { ...settings, lobbies: { ...settings.lobbies, raid: 3 } } },
    );
    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
      number: 3,
    });
    await made.service.flush();
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
      'More than 3 trainers: a lobby holds 3, so split up.',
    );
  });

  it('gives a party of today no size by default: its post is the one without a size', async () => {
    /** The post after Alice and Bob signed up, with the party's id made one for both raids. */
    const shownWith = async (overrides: object) => {
      const made = await reportedRaid({}, overrides);
      await made.attendance.signUp(
        made.party.id,
        { id: ALICE, name: 'Alice' },
        PartyStatus.Coming,
        {
          number: 3,
        },
      );
      await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Present);
      await made.service.flush();
      const message = JSON.stringify(made.gateway.posts.get(made.postId)?.message);
      return message.replaceAll(made.party.id, '<party>');
    };
    const unsized = await shownWith({ lobbySize: () => undefined });
    expect(await shownWith({})).toBe(unsized);
    // And the hook is what makes it differ.
    expect(await shownWith(inLobbiesOf4)).not.toBe(unsized);
  });
});
