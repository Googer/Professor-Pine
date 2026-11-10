import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { accentOf, buttonsOf, componentCount, textDisplays } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { LIST_COLOUR } from './v2.js';
import { LIST_PAGE, pageCount, renderMemberList, shownPage, type ListView } from './member-list.js';

const item = (n: number, text = `Item ${String(n)}`) => ({
  line: (room: number) => text.slice(0, room),
  removeArgs: ['g', String(n)],
});

const view = (n: number, more: Partial<ListView> = {}): ListView => ({
  kind: 'targetlist',
  heading: '### Gyms you want raids of',
  noun: ['gym', 'gyms'],
  items: Array.from({ length: n }, (_, i) => item(i + 1)),
  page: 0,
  footer: '`/target` adds one.',
  empty: 'You want raids of no gym yet. `/target` adds one.',
  removeCommand: '/untarget',
  removable: n > 0,
  ...more,
});

describe('renderMemberList', () => {
  it('shows a list of one page: heading, count, an entry a section with Remove, Remove all…', () => {
    const message = renderMemberList(view(3));
    expect(accentOf(message)).toBe(LIST_COLOUR);
    expect(textDisplays(message)).toEqual([
      '### Gyms you want raids of\n3 gyms',
      'Item 1',
      'Item 2',
      'Item 3',
      '-# `/target` adds one.',
    ]);
    expect(
      buttonsOf(message).map((button) => [button.label, button.customId, button.style]),
    ).toEqual([
      ['Remove', 'targetlist:0:remove:g:1', ButtonStyle.Danger],
      ['Remove', 'targetlist:0:remove:g:2', ButtonStyle.Danger],
      ['Remove', 'targetlist:0:remove:g:3', ButtonStyle.Danger],
      ['Remove all…', 'targetlist:0:all', ButtonStyle.Danger],
    ]);
    expectV2Sendable(message);
  });

  it('shows pages of ten with Previous and Next, disabled at the ends', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(LIST_PAGE)).toBe(1);
    expect(pageCount(LIST_PAGE + 1)).toBe(2);
    const first = renderMemberList(view(14));
    expect(textDisplays(first)[0]).toBe('### Gyms you want raids of\n14 gyms · page 1 of 2');
    expect(textDisplays(first)).toHaveLength(1 + LIST_PAGE + 1);
    const controls = (message: ReturnType<typeof renderMemberList>) =>
      JSON.parse(JSON.stringify(buttonsOf(message).slice(-3))) as unknown;
    expect(controls(first)).toEqual([
      { label: '◀ Previous', style: ButtonStyle.Secondary, customId: 'targetlist:0:prev' },
      { label: 'Next ▶', style: ButtonStyle.Secondary, customId: 'targetlist:0:next' },
      { label: 'Remove all…', style: ButtonStyle.Danger, customId: 'targetlist:0:all' },
    ]);
    const disabled = (message: ReturnType<typeof renderMemberList>) =>
      (JSON.stringify(message).match(/"disabled":true/g) ?? []).length;
    expect(disabled(first)).toBe(1);
    expect(JSON.stringify(first)).toMatch(
      /"custom_id":"targetlist:0:prev","label":"◀ Previous","disabled":true/,
    );
    const second = renderMemberList(view(14, { page: 1 }));
    expect(textDisplays(second).slice(1, -1)).toEqual(['Item 11', 'Item 12', 'Item 13', 'Item 14']);
    expect(JSON.stringify(second)).toMatch(
      /"custom_id":"targetlist:1:next","label":"Next ▶","disabled":true/,
    );
    expect(customIds(second)).toContain('targetlist:1:remove:g:11');
    // A page past the end shows the last.
    expect(shownPage(5, 14)).toBe(1);
    expect(textDisplays(renderMemberList(view(14, { page: 5 })))[0]).toContain('page 2 of 2');
  });

  it('says only the heading and how to add one for an empty list, without buttons', () => {
    const message = renderMemberList(view(0));
    expect(textDisplays(message)).toEqual([
      '### Gyms you want raids of\nYou want raids of no gym yet. `/target` adds one.',
    ]);
    expect(buttonsOf(message)).toEqual([]);
  });

  it('keeps the notes about the whole list under the count, and Remove all for what it cannot read', () => {
    const message = renderMemberList(
      view(0, { removable: true, notes: ['…and 2 entries this version cannot read.'] }),
    );
    expect(textDisplays(message)[0]).toBe(
      '### Gyms you want raids of\n0 gyms\n…and 2 entries this version cannot read.',
    );
    expect(customIds(message)).toEqual(['targetlist:0:all']);
    expectV2Sendable(message);
  });

  it('names the command for an entry whose Remove would not fit into a custom id', () => {
    const long = { line: () => 'Shadow Longname', removeArgs: ['pokemon', '9', 'x'.repeat(90)] };
    const message = renderMemberList(view(1, { items: [long], removeCommand: '/unwant' }));
    expect(textDisplays(message)[1]).toBe('Shadow Longname · `/unwant` removes it');
    expect(customIds(message)).toEqual(['targetlist:0:all']);
  });

  it('keeps a full page of the longest entries within what Discord takes', () => {
    // As an entry does it: the name is cut before it is escaped, so no backslash is left alone.
    const long = (n: number) => ({
      line: (room: number) => {
        const raw = `${'['.repeat(600)}${String(n)}`;
        const escaped = (keep: number) => raw.slice(0, keep).replace(/\[/g, '\\[');
        let keep = raw.length;
        while (escaped(keep).length > room) keep -= 1;
        return escaped(keep);
      },
      removeArgs: ['g', String(n)],
    });
    const message = renderMemberList(
      view(25, {
        items: Array.from({ length: 25 }, (_, n) => long(n)),
        page: 1,
        notes: ['…and 3 entries this version cannot read; `/untarget-all` removes those too.'],
      }),
    );
    expect(componentCount(message)).toBeLessThanOrEqual(40);
    expectV2Sendable(message);
    expect(buttonsOf(message)).toHaveLength(LIST_PAGE + 3);
    for (const line of textDisplays(message).slice(1, -1)) {
      expect(line).not.toMatch(/(^|[^\\])(\\\\)*\\$/);
    }
  });
});

function customIds(message: ReturnType<typeof renderMemberList>): string[] {
  return buttonsOf(message).flatMap((button) => (button.customId ? [button.customId] : []));
}
