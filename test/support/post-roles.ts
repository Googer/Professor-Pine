import type { PostBlock, PostLayout } from '../../src/render/party-post.js';

/**
 * The blocks of a post's layout that have a role (plan 8M-8A: what the map's phone card picks
 * out), each as its role and the first line of its text, in order.
 */
export function roleLines(layout: PostLayout): Array<[string, string]> {
  return layout.blocks.flatMap((block) =>
    (block.type === 'text' || block.type === 'section') && block.role !== undefined
      ? [[block.role, block.content.split('\n')[0] ?? ''] as [string, string]]
      : [],
  );
}

/** The layout as it would be without any role: what Discord's message must not tell apart. */
export function withoutRoles(layout: PostLayout): PostLayout {
  return {
    ...layout,
    blocks: layout.blocks.map((block): PostBlock => {
      if (block.type !== 'text' && block.type !== 'section') return block;
      const { role: _role, ...rest } = block;
      return rest;
    }),
  };
}
