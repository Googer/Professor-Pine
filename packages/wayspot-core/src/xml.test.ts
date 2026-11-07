import { describe, expect, it } from 'vitest';
import { childrenNamed, MAX_XML_DEPTH, readXml, type XmlElement } from './xml.js';

/**
 * The same text, counting the characters read of it: one for each character looked at, those an
 * `indexOf` passes over, those `startsWith` compares, and the length of every piece cut out (a
 * piece is then read as a whole). The work, by count rather than by the clock (a clock fails on
 * a loaded machine). Past `budget` a read throws, so that a slow way fails at once.
 */
function countingText(text: string, budget: number): { text: string; count: () => number } {
  let read = 0;
  const add = (characters: number): void => {
    read += characters;
    if (read > budget) throw new Error('too many characters read');
  };
  const cost = (method: string, args: unknown[], result: unknown): number => {
    if (method === 'indexOf') {
      const [needle, from] = args as [string, number | undefined];
      const start = Math.max(0, from ?? 0);
      return (
        (typeof result === 'number' && result >= 0 ? result + needle.length : text.length) - start
      );
    }
    if (method === 'startsWith') return String(args[0]).length;
    if (typeof result === 'string') return result.length;
    return text.length;
  };
  const counted = new Proxy(new String(text), {
    get(_target, key) {
      if (key === 'length') return text.length;
      if (typeof key === 'string' && /^\d+$/u.test(key)) {
        add(1);
        return text[Number(key)];
      }
      const value: unknown = Reflect.get(String.prototype, key);
      if (typeof value !== 'function' || typeof key !== 'string') return value;
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, text, args);
        add(cost(key, args, result));
        return result;
      };
    },
  });
  return { text: counted as unknown as string, count: () => read };
}

function root(text: string): XmlElement {
  const read = readXml(text);
  if (!read.ok) throw new Error(`not read: ${read.reason}`);
  return read.root;
}

describe('readXml', () => {
  it('reads elements, their text and their children in order', () => {
    const doc = root('<a><b>one</b><c/><b>two</b>tail</a>');
    expect(doc.name).toBe('a');
    expect(doc.children.map((child) => child.name)).toEqual(['b', 'c', 'b']);
    expect(childrenNamed(doc, 'b').map((child) => child.text)).toEqual(['one', 'two']);
    // The text of an element is its own, not that of its children.
    expect(doc.text).toBe('tail');
    expect(doc.children[1]).toEqual({ name: 'c', text: '', children: [] });
  });

  it('skips the declaration, comments and processing instructions', () => {
    const doc = root(
      '\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<!-- a > comment -->\n' +
        '<a><!-- <b>not an element</b> -->x<?pi <c/> ?>y</a>\n<!-- after -->\n',
    );
    expect(doc).toEqual({ name: 'a', text: 'xy', children: [] });
  });

  it('reads CDATA as text, as it stands', () => {
    expect(root('<a>1 <![CDATA[<b> & ]] > ]]> 2</a>').text).toBe('1 <b> & ]] >  2');
  });

  it('reads the five entities and numeric character references', () => {
    expect(root('<a>&lt;&gt;&amp;&quot;&apos; &#65;&#x42;&#x1F600;</a>').text).toBe(
      '<>&"\' AB\u{1F600}',
    );
  });

  it('parses attributes and drops them, whatever their quotes hold', () => {
    const doc = root(`<a x="1" y='>' z = "a/>b"><b k="v"/><c q='"'>t</c></a>`);
    expect(doc.children.map((child) => child.name)).toEqual(['b', 'c']);
    expect(doc.children[1]?.text).toBe('t');
  });

  it('strips namespace prefixes from element names', () => {
    const doc = root('<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Doc/></kml:kml>');
    expect(doc.name).toBe('kml');
    expect(doc.children[0]?.name).toBe('Doc');
  });

  it('refuses a DOCTYPE outright: no entity is ever expanded', () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>' +
      '<lolz>&lol2;</lolz>';
    expect(readXml(bomb)).toEqual({ ok: false, reason: 'doctype' });
    expect(readXml('<!doctype html><html></html>')).toEqual({ ok: false, reason: 'doctype' });
  });

  it('refuses an entity it does not know, and a reference to no character', () => {
    expect(readXml('<a>&nbsp;</a>')).toEqual({ ok: false, reason: 'malformed' });
    expect(readXml('<a>&#0;</a>')).toEqual({ ok: false, reason: 'malformed' });
    expect(readXml('<a>&#x110000;</a>')).toEqual({ ok: false, reason: 'malformed' });
    expect(readXml('<a>&#xD800;</a>')).toEqual({ ok: false, reason: 'malformed' });
    expect(readXml('<a>& b</a>')).toEqual({ ok: false, reason: 'malformed' });
    expect(readXml('<a>&amp</a>')).toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    ['nothing', ''],
    ['only white space', '  \n'],
    ['text without an element', 'hello'],
    ['an element that is not closed', '<a><b></b>'],
    ['a closing tag that does not match', '<a><b></a></b>'],
    ['a closing tag without an opening one', '</a>'],
    ['a second root', '<a/><b/>'],
    ['text after the root', '<a/>tail'],
    ['a tag that never ends', '<a><b'],
    ['a comment that never ends', '<a><!-- x</a>'],
    ['CDATA that never ends', '<a><![CDATA[x</a>'],
    ['an instruction that never ends', '<?xml version="1.0"<a/>'],
    ['an attribute without a value', '<a x></a>'],
    ['an attribute without quotes', '<a x=1></a>'],
    ['an attribute whose quote never ends', '<a x="1></a>'],
    ['a tag without a name', '<><a/>'],
    ['a name that is only a prefix', '<kml:/>'],
    ['CDATA outside the root', '<![CDATA[x]]><a/>'],
    ['a stray declaration inside', '<a><!ELEMENT b></a>'],
  ])('answers malformed for %s', (_what, text) => {
    expect(readXml(text)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reads as deep as the limit and refuses anything deeper', () => {
    const nested = (depth: number) => `${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}`;
    expect(readXml(nested(MAX_XML_DEPTH)).ok).toBe(true);
    expect(readXml(nested(MAX_XML_DEPTH + 1))).toEqual({ ok: false, reason: 'too-deep' });
    // Far beyond any stack: it never throws.
    expect(readXml('<a>'.repeat(200_000))).toEqual({ ok: false, reason: 'too-deep' });
  });

  it.each([
    // A megabyte each of: opening angle brackets, ampersands, unfinished comments, white
    // space inside a tag, one long attribute, many small elements, many entities.
    ['opening angle brackets', '<'.repeat(1_000_000), false],
    ['ampersands', `<a>${'&'.repeat(1_000_000)}</a>`, false],
    ['unfinished comments', `<a>${'<!--'.repeat(250_000)}</a>`, false],
    ['white space inside a tag', `<a${' '.repeat(1_000_000)}`, false],
    ['one long attribute', `<a x="${'y'.repeat(1_000_000)}"/>`, true],
    ['many small elements', `<a>${'<b/>'.repeat(250_000)}</a>`, true],
    ['many entities', `<a>${'x &amp; '.repeat(125_000)}</a>`, true],
  ])('reads a megabyte of %s looking at each character a few times', (_what, text, ok) => {
    // Counted, not timed (a clock fails on a loaded machine): a careless reader that looks
    // again from the start, or cuts the rest of the text out, at each step reads billions; this
    // reader reads each character one to six times. (A piece cut out is counted by its length:
    // what is read in it, an entity among them, is not counted again.)
    const counting = countingText(text, 10 * text.length);
    expect(readXml(counting.text).ok).toBe(ok);
  });
});
