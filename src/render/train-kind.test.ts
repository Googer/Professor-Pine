import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import { textDisplays } from '../../test/support/messages.js';
import { PARTY_NOW, PARTY_ZONE, stops, testTrain } from '../../test/support/parties.js';
import { stopsFrom } from './train-stops.js';
import type { TrainKind, TrainParty } from '../domain/party/party.js';
import type { PostGym } from './raid-post.js';
import { renderTrainPost, trainTags, type TrainPostView } from './train-post.js';
import { TRAIN_KIND_WORDS } from './train-words.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const catalogue = catalogueFixture();
const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
const gym = (id: number): PostGym | undefined => gyms.get(id);

function ofKind(kind: TrainKind, route: number[] = []): TrainParty {
  const train = testTrain({ kind });
  return { ...train, train: { ...train.train, route: stops(...route) } };
}

function view(party: TrainParty): TrainPostView {
  return {
    party,
    now: PARTY_NOW,
    zone: PARTY_ZONE,
    archiving: { graceMinutes: 5, warningMinutes: 60 },
    emoji,
    stop: stopsFrom({ stored: gym }),
    boss: undefined,
    catalogue,
  };
}

describe('the kind of a train in its post (plan 8X-4)', () => {
  it('heads the post and the brief by the kind, in one set of words', () => {
    expect(TRAIN_KIND_WORDS).toEqual({
      raid: 'Raid Train',
      dynamax: 'Max Battle Train',
      gigantamax: 'Gigantamax Train',
    });
    for (const kind of ['raid', 'dynamax', 'gigantamax'] as const) {
      const post = renderTrainPost(view(ofKind(kind)));
      expect(textDisplays(post.message)[0]?.split('\n')[0]).toBe(
        `### ${TRAIN_KIND_WORDS[kind]}: Saturday legendaries`,
      );
      expect(post.brief.lines[0]).toBe(`**${TRAIN_KIND_WORDS[kind]}: Saturday legendaries**`);
      // The title says what a post is as before: a train.
      expect(post.title).toBe('Train · Saturday legendaries');
    }
  });

  it('tags a Dynamax or Gigantamax train as a max battle too', () => {
    expect(trainTags(ofKind('raid'), PARTY_NOW)).toEqual(['Train']);
    expect(trainTags(ofKind('dynamax'), PARTY_NOW)).toEqual(['Train', 'Max battle']);
    expect(trainTags(ofKind('gigantamax'), PARTY_NOW)).toEqual(['Train', 'Max battle']);
  });
});
