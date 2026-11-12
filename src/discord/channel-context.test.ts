import { describe, expect, it } from 'vitest';
import {
  FAKE_CHANNEL_ID,
  FAKE_PARENT_ID,
  fakeButton,
  fakeAutocomplete,
  fakeChatInput,
} from '../../test/support/fake-interactions.js';
import { channelContext } from './channel-context.js';
import type { GuardableInteraction, LocatedInteraction } from './command.js';

const as = (fake: unknown) => fake as GuardableInteraction;
const RAIDS = '600000000000000009';

describe('channelContext', () => {
  it('describes a text channel by itself and its category', () => {
    const context = channelContext(
      as(fakeChatInput({ channelName: 'downtown', parentName: 'RAIDS', parentId: RAIDS })),
    );
    expect(context).toEqual({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: FAKE_CHANNEL_ID,
      name: 'downtown',
      categoryName: 'RAIDS',
      categoryId: RAIDS,
      isThread: false,
      isDm: false,
    });
  });

  it('describes a forum post by the forum it is in and the category of that forum', () => {
    const context = channelContext(
      as(
        fakeButton({
          customId: 'p:1:join',
          channelName: 'Mewtwo · Big Fountain',
          thread: { parentName: 'downtown-raids', categoryName: 'RAIDS', categoryId: RAIDS },
        }),
      ),
    );
    expect(context).toEqual({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: FAKE_PARENT_ID,
      name: 'downtown-raids',
      categoryName: 'RAIDS',
      categoryId: RAIDS,
      isThread: true,
      isDm: false,
    });
  });

  it('describes where an autocomplete happened, as for any other interaction', () => {
    const context = channelContext(
      fakeAutocomplete({
        thread: { parentName: 'downtown-raids', categoryName: 'RAIDS' },
      }) as unknown as LocatedInteraction,
    );
    expect(context).toMatchObject({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: FAKE_PARENT_ID,
      name: 'downtown-raids',
      categoryName: 'RAIDS',
      isThread: true,
    });
  });

  it('has no category for a channel outside one', () => {
    expect(channelContext(as(fakeChatInput())).categoryName).toBeUndefined();
    expect(
      channelContext(as(fakeChatInput({ thread: { parentName: 'the-bot-lab' } }))).categoryName,
    ).toBeUndefined();
  });

  it('knows only the id of a channel that is not cached (an archived post)', () => {
    expect(channelContext(as(fakeChatInput({ uncachedChannel: true })))).toEqual({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: undefined,
      name: undefined,
      categoryName: undefined,
      isThread: false,
      isDm: false,
    });
  });

  it('recognises a DM by the missing server, cached or not', () => {
    expect(channelContext(as(fakeChatInput({ isDm: true }))).isDm).toBe(true);
    expect(channelContext(as(fakeChatInput({ isDm: true, uncachedChannel: true }))).isDm).toBe(
      true,
    );
  });
});
