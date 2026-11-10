import type { LocatedInteraction } from './command.js';

/** Where an interaction happened, seen the same way from a channel and from a thread in it. */
export interface ChannelContext {
  /** The channel itself; for a thread or forum post, the thread. Null only in odd DM cases. */
  channelId: string | null;
  /**
   * The channel a thread or forum post belongs to; for any other channel, the channel itself.
   * Undefined when the channel is not in the interaction at all. discord.js normally builds the
   * channel from the interaction's own data (with `Partials.Channel`), so even an archived post is
   * usually a thread with its parent; this is the fallback for the rare case it is not. Go by
   * `channelId` then.
   */
  baseChannelId: string | undefined;
  /** Name of the base channel. */
  name: string | undefined;
  /** Name of the category the base channel is under. */
  categoryName: string | undefined;
  isThread: boolean;
  isDm: boolean;
}

/** A channel's name; a DM channel has none. */
const nameOf = (channel: object | null | undefined): string | undefined =>
  channel && 'name' in channel && typeof channel.name === 'string' ? channel.name : undefined;

/**
 * A party post is a thread: its own name is the post's title and its parent is the forum, not
 * the category. Guards and commands ask this instead of reading `interaction.channel`, so that
 * "in the bot channel" and "under the PvP category" also hold inside threads of those.
 */
export function channelContext(interaction: LocatedInteraction): ChannelContext {
  const channel = interaction.channel;
  const isDm = !interaction.inGuild();
  if (!channel) {
    return {
      channelId: interaction.channelId,
      baseChannelId: undefined,
      name: undefined,
      categoryName: undefined,
      isThread: false,
      isDm,
    };
  }
  if (channel.isThread()) {
    const parent = channel.parent;
    return {
      channelId: channel.id,
      baseChannelId: channel.parentId ?? undefined,
      name: nameOf(parent),
      categoryName: parent?.parent?.name,
      isThread: true,
      isDm,
    };
  }
  return {
    channelId: channel.id,
    baseChannelId: channel.id,
    name: nameOf(channel),
    categoryName: 'parent' in channel ? channel.parent?.name : undefined,
    isThread: false,
    isDm,
  };
}
