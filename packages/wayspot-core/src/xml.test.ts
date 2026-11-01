import { describe, expect, it } from 'vitest';
import { childrenNamed, MAX_XML_DEPTH, readXml, type XmlElement } from './xml.js';

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

  it('stays quick on text made to make a careless reader slow', () => {
    const started = performance.now();
    // A megabyte each of: opening angle brackets, ampersands, unfinished comments, white
    // space inside a tag, and one long attribute.
    expect(readXml('<'.repeat(1_000_000)).ok).toBe(false);
    expect(readXml(`<a>${'&'.repeat(1_000_000)}</a>`).ok).toBe(false);
    expect(readXml(`<a>${'<!--'.repeat(250_000)}</a>`).ok).toBe(false);
    expect(readXml(`<a${' '.repeat(1_000_000)}`).ok).toBe(false);
    expect(readXml(`<a x="${'y'.repeat(1_000_000)}"/>`).ok).toBe(true);
    expect(readXml(`<a>${'<b/>'.repeat(250_000)}</a>`).ok).toBe(true);
    expect(readXml(`<a>${'x &amp; '.repeat(125_000)}</a>`).ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
