/**
 * A small reader for well-formed XML: enough for KML and nothing more. It knows elements, text,
 * CDATA, the five predefined entities and numeric character references; it skips comments and
 * processing instructions (the XML declaration is one), and it parses attributes only to step
 * over them. A DOCTYPE is refused outright, so no entity is ever defined or expanded. It reads
 * in one pass with `indexOf` and never with a regular expression over the text, so its time is
 * linear in the length of the text; nesting is bounded (`MAX_XML_DEPTH`) and kept on a list,
 * not on the call stack. It answers a reason for anything it cannot read and never throws.
 */

/** How deep elements may be nested. KML of a map editor is five or six deep. */
export const MAX_XML_DEPTH = 64;

/** An element: its name without a namespace prefix, its own text, and its child elements. */
export interface XmlElement {
  name: string;
  /** The text directly inside the element (not that of its children), entities resolved. */
  text: string;
  children: XmlElement[];
}

/**
 * Why a text was not read. `doctype`: it declares a document type, which is never read;
 * `too-deep`: elements nested deeper than `MAX_XML_DEPTH`; `malformed`: anything else that is
 * not well-formed XML as this reader knows it.
 */
export type XmlProblem = 'doctype' | 'too-deep' | 'malformed';

export type XmlReading = { ok: true; root: XmlElement } | { ok: false; reason: XmlProblem };

/** The child elements of an element that have this name, in order. */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/** The first child element with this name. */
export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

const ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** The longest reference there is: `&#x10FFFF;`. */
const MAX_REFERENCE = 10;

function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\n' || char === '\t' || char === '\r';
}

/** Whether a number is a character XML allows, as a code point. */
function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** The character a reference names (what stands between `&` and `;`); undefined for none. */
function referenced(name: string): string | undefined {
  if (!name.startsWith('#')) return ENTITIES[name];
  const hex = name.startsWith('#x');
  const digits = name.slice(hex ? 2 : 1);
  if (digits === '') return undefined;
  for (const digit of digits) {
    const known = hex ? '0123456789abcdefABCDEF' : '0123456789';
    if (!known.includes(digit)) return undefined;
  }
  const code = Number.parseInt(digits, hex ? 16 : 10);
  return isXmlChar(code) ? String.fromCodePoint(code) : undefined;
}

/** Text with its references resolved; undefined when one of them is none. */
function decoded(raw: string): string | undefined {
  let at = raw.indexOf('&');
  if (at < 0) return raw;
  const parts: string[] = [];
  let from = 0;
  while (at >= 0) {
    // A reference is short: the `;` is looked for only that far, so a text full of `&`
    // costs no more than its length.
    const end = raw.indexOf(';', at + 1);
    if (end < 0 || end - at - 1 > MAX_REFERENCE) return undefined;
    const char = referenced(raw.slice(at + 1, end));
    if (char === undefined) return undefined;
    parts.push(raw.slice(from, at), char);
    from = end + 1;
    at = raw.indexOf('&', from);
  }
  parts.push(raw.slice(from));
  return parts.join('');
}

/** An element name without its namespace prefix; undefined for what is no name. */
function localName(raw: string): string | undefined {
  const name = raw.slice(raw.lastIndexOf(':') + 1);
  if (name === '') return undefined;
  for (const char of name) {
    if (char === '<' || char === '&' || char === '=' || char === '"' || char === "'") {
      return undefined;
    }
  }
  return name;
}

/** An element that is being read: the raw name of its tag, and its text in pieces. */
interface Open {
  raw: string;
  element: XmlElement;
  text: string[];
}

/**
 * Steps over the attributes of a start tag, from `at` (just after its name). Gives where the
 * tag ends (the index after its `>`) and whether it closed itself (`/>`); undefined for a tag
 * that is not well formed. Every character is looked at once.
 */
function endOfTag(text: string, start: number): { next: number; empty: boolean } | undefined {
  let at = start;
  for (;;) {
    while (isSpace(text[at])) at++;
    const char = text[at];
    if (char === undefined) return undefined;
    if (char === '>') return { next: at + 1, empty: false };
    if (char === '/') return text[at + 1] === '>' ? { next: at + 2, empty: true } : undefined;
    // An attribute: a name, `=`, and a value in quotes.
    const nameStart = at;
    while (at < text.length) {
      const now = text[at];
      if (now === '=' || now === '>' || now === '/' || now === '<' || isSpace(now)) break;
      if (now === '"' || now === "'") return undefined;
      at++;
    }
    if (at === nameStart) return undefined;
    while (isSpace(text[at])) at++;
    if (text[at] !== '=') return undefined;
    at++;
    while (isSpace(text[at])) at++;
    const quote = text[at];
    if (quote !== '"' && quote !== "'") return undefined;
    const close = text.indexOf(quote, at + 1);
    if (close < 0) return undefined;
    at = close + 1;
  }
}

/** Reads a text as XML. See the head of this file for what it knows and what it refuses. */
export function readXml(input: string): XmlReading {
  const malformed: XmlReading = { ok: false, reason: 'malformed' };
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input;
  const stack: Open[] = [];
  let root: XmlElement | undefined;
  let at = 0;

  while (at < text.length) {
    const top = stack[stack.length - 1];
    if (text[at] !== '<') {
      const next = text.indexOf('<', at);
      const end = next < 0 ? text.length : next;
      const raw = text.slice(at, end);
      if (top) {
        const value = decoded(raw);
        if (value === undefined) return malformed;
        top.text.push(value);
      } else if (raw.trim() !== '') {
        return malformed;
      }
      at = end;
      continue;
    }
    if (text.startsWith('<?', at)) {
      const end = text.indexOf('?>', at + 2);
      if (end < 0) return malformed;
      at = end + 2;
      continue;
    }
    if (text.startsWith('<!--', at)) {
      const end = text.indexOf('-->', at + 4);
      if (end < 0) return malformed;
      at = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', at)) {
      const end = text.indexOf(']]>', at + 9);
      if (end < 0 || !top) return malformed;
      top.text.push(text.slice(at + 9, end));
      at = end + 3;
      continue;
    }
    if (text[at + 1] === '!') {
      const declared = text.slice(at + 2, at + 9).toUpperCase();
      return declared === 'DOCTYPE' ? { ok: false, reason: 'doctype' } : malformed;
    }
    if (text[at + 1] === '/') {
      const end = text.indexOf('>', at + 2);
      if (end < 0 || !top) return malformed;
      if (text.slice(at + 2, end).trimEnd() !== top.raw) return malformed;
      top.element.text = top.text.join('');
      stack.pop();
      at = end + 1;
      continue;
    }
    // A start tag: its name runs to the first white space, `/` or `>`.
    let nameEnd = at + 1;
    while (nameEnd < text.length) {
      const char = text[nameEnd];
      if (char === '>' || char === '/' || isSpace(char)) break;
      nameEnd++;
    }
    const raw = text.slice(at + 1, nameEnd);
    const name = localName(raw);
    if (name === undefined) return malformed;
    const tag = endOfTag(text, nameEnd);
    if (!tag) return malformed;
    const element: XmlElement = { name, text: '', children: [] };
    if (top) top.element.children.push(element);
    else if (root) return malformed;
    else root = element;
    if (!tag.empty) {
      if (stack.length >= MAX_XML_DEPTH) return { ok: false, reason: 'too-deep' };
      stack.push({ raw, element, text: [] });
    }
    at = tag.next;
  }
  if (stack.length > 0 || !root) return malformed;
  return { ok: true, root };
}
