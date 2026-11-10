import { stopsFrom } from './train-stops.js';
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import { buttonsOf, copiedPost, leadOf, textDisplays } from '../../test/support/messages.js';
import {
  ALICE,
  PARTY_NOW,
  PARTY_ZONE,
  testRaid,
  testTrain,
  withAttendees,
  stops,
} from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import type { TrainParty } from '../domain/party/party.js';
import { renderMirror } from './mirrors.js';
import { renderRaidPost } from './raid-post.js';
import { renderTrainPost } from './train-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const gyms = new Map(testGyms().map((gym) => [gym.id, gym]));
// Somebody in each group: a group can be split off.
const base = withAttendees(testTrain(), { [ALICE]: { group: 'B' } });
const train: TrainParty = {
  ...base,
  groups: [{ id: 'A' }, { id: 'B' }],
  train: { ...base.train, route: stops(4, 7) },
};
const rendered = renderTrainPost({
  party: train,
  now: PARTY_NOW,
  zone: PARTY_ZONE,
  archiving: { graceMinutes: 5, warningMinutes: 60 },
  emoji,
  stop: stopsFrom(gyms),
  boss: undefined,
  catalogue: catalogueFixture(),
});
const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };

/** The actions of the buttons of a message, in order. */
const actions = (message: OutgoingMessage): string[] =>
  buttonsOf(message).map((button) => decodeCustomId(button.customId ?? '')?.action ?? '');

describe('renderMirror for the channel of a region a train stops in', () => {
  it('copies the post under a line that invites to sign up, and promises neither the link nor access', () => {
    const copy = renderMirror('region', rendered, place);
    expect(leadOf(copy)).toBe(
      'A raid train that stops in this region. ' +
        'Sign up here to follow it in its post: <#900000000000000001>',
    );
    expect(copiedPost(copy)).toEqual(textDisplays(rendered.message));
    // Wherever the train was made: the line names no other channel.
    expect(renderMirror('region', rendered, { ...place, regionChannelId: undefined })).toEqual(
      copy,
    );
  });

  it('has the controls of the post without the buttons that move or split the train', () => {
    expect(actions(rendered.message)).toEqual([
      'maybe',
      'join',
      'here',
      'leave',
      'less',
      'more',
      'remote',
      'regroup',
      'move',
      'manage',
      'split',
    ]);
    const copy = renderMirror('region', rendered, place);
    // Group… stays: a member of that region joins and moves between groups from the copy.
    expect(actions(copy)).toEqual([
      'maybe',
      'join',
      'here',
      'leave',
      'less',
      'more',
      'remote',
      'regroup',
    ]);
    // Where the train is stays said, without its button.
    expect(textDisplays(copy)).toContain(textDisplays(rendered.message)[1]);
    // The copy in the post itself is the message as it is.
    expect(renderMirror('status', rendered, place)).toEqual(rendered.message);
  });

  it('leaves the copies of a raid with every control of the post', () => {
    const raid = renderRaidPost({
      party: testRaid(),
      now: PARTY_NOW,
      gym: testGyms()[0],
      boss: undefined,
      catalogue: catalogueFixture(),
      showUnknownMoves: true,
      zone: PARTY_ZONE,
      emoji,
    });
    expect(buttonsOf(renderMirror('remote', raid, place))).toEqual(buttonsOf(raid.message));
  });
});
