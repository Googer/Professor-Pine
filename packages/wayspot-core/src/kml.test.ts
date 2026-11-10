import { describe, expect, it } from 'vitest';
import { kmlText, MAX_KML_AREAS, readKml, writeKml, type KmlArea } from './kml.js';
import type { LatLon } from './lat-lon.js';

const p = (lat: number, lon: number): LatLon => ({ lat, lon });
/** A square as KML writes it: longitude first, closed. */
const SQUARE = '-80.1,40.0,0 -80.1,40.1,0 -80.0,40.1,0 -80.0,40.0,0 -80.1,40.0,0';
const SQUARE_RING = [p(40, -80.1), p(40.1, -80.1), p(40.1, -80), p(40, -80), p(40, -80.1)];

const polygon = (coordinates: string, inner = '') =>
  `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates>` +
  `</LinearRing></outerBoundaryIs>${inner}</Polygon>`;
const placemark = (name: string, geometry: string) =>
  `<Placemark><name>${name}</name>${geometry}</Placemark>`;
const kml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">` +
  `<Document><name>Regions</name>${body}</Document></kml>`;

function read(text: string) {
  const reading = readKml(text);
  if (!reading.ok) throw new Error(`not read: ${reading.reason}`);
  return reading;
}

describe('readKml', () => {
  it('reads the areas of a file: the placemarks with a polygon, by name', () => {
    const reading = read(
      kml(placemark('West End', polygon(SQUARE)) + placemark(' East  Side\n', polygon(SQUARE))),
    );
    expect(reading.areas).toEqual([
      { name: 'West End', outline: SQUARE_RING, holes: false, description: null },
      { name: 'East Side', outline: SQUARE_RING, holes: false, description: null },
    ]);
    expect(reading.skipped).toEqual([]);
    expect(reading.others).toBe(0);
  });

  it('finds placemarks in nested folders and directly under the root', () => {
    const nested = read(
      kml(
        `<Folder><name>A</name><Folder>${placemark('Deep', polygon(SQUARE))}</Folder></Folder>` +
          placemark('Top', polygon(SQUARE)),
      ),
    );
    expect(nested.areas.map((area) => area.name)).toEqual(['Deep', 'Top']);
    const bare = read(`<kml>${placemark('Bare', polygon(SQUARE))}</kml>`);
    expect(bare.areas.map((area) => area.name)).toEqual(['Bare']);
  });

  it('reads tuples without an altitude and separated by any white space', () => {
    const reading = read(
      kml(placemark('A', polygon('\n  -80.1,40.0\n\t-80.1,40.1\r\n -80.0,40.1   -80.0,40.0\n'))),
    );
    expect(reading.areas[0]?.outline).toEqual(SQUARE_RING);
  });

  it('ignores inner rings and says that the area had some', () => {
    const hole =
      '<innerBoundaryIs><LinearRing><coordinates>-80.06,40.04 -80.06,40.06 -80.04,40.06 ' +
      '-80.06,40.04</coordinates></LinearRing></innerBoundaryIs>';
    const reading = read(kml(placemark('Ring', polygon(SQUARE, hole))));
    expect(reading.areas).toEqual([
      { name: 'Ring', outline: SQUARE_RING, holes: true, description: null },
    ]);
  });

  it('takes a MultiGeometry with one polygon as that polygon, and skips one with several', () => {
    const reading = read(
      kml(
        placemark(
          'One',
          `<MultiGeometry><Point><coordinates>-80,40</coordinates></Point>${polygon(SQUARE)}</MultiGeometry>`,
        ) +
          placemark(
            'Two',
            `<MultiGeometry>${polygon(SQUARE)}<MultiGeometry>${polygon(SQUARE)}</MultiGeometry></MultiGeometry>`,
          ),
      ),
    );
    expect(reading.areas.map((area) => area.name)).toEqual(['One']);
    expect(reading.skipped).toEqual([{ name: 'Two', reason: { kind: 'several-areas' } }]);
  });

  it('counts placemarks without a polygon and does not list them', () => {
    const reading = read(
      kml(
        placemark('Pin', '<Point><coordinates>-80,40,0</coordinates></Point>') +
          placemark('Path', '<LineString><coordinates>-80,40 -81,41</coordinates></LineString>') +
          placemark('Area', polygon(SQUARE)),
      ),
    );
    expect(reading.areas.map((area) => area.name)).toEqual(['Area']);
    expect(reading.skipped).toEqual([]);
    expect(reading.others).toBe(2);
  });

  it('skips an area whose outline cannot be one, with the reason', () => {
    const reading = read(
      kml(
        placemark('Bow', polygon('0,0 1,1 0,1 1,0')) +
          placemark('Line', polygon('0,0 1,1')) +
          placemark('Far', polygon('0,0 0,91 1,1')) +
          placemark('Words', polygon('0,0 north,east 1,1')) +
          placemark('Lonely', polygon('0,0 1 1,1')) +
          placemark('Empty', '<Polygon><outerBoundaryIs/></Polygon>') +
          placemark('Good', polygon(SQUARE)),
      ),
    );
    expect(reading.areas.map((area) => area.name)).toEqual(['Good']);
    expect(reading.skipped).toEqual([
      { name: 'Bow', reason: { kind: 'outline', problem: { kind: 'crosses-itself' } } },
      { name: 'Line', reason: { kind: 'outline', problem: { kind: 'too-few' } } },
      { name: 'Far', reason: { kind: 'outline', problem: { kind: 'out-of-range' } } },
      { name: 'Words', reason: { kind: 'outline', problem: { kind: 'not-a-number' } } },
      { name: 'Lonely', reason: { kind: 'outline', problem: { kind: 'not-a-number' } } },
      { name: 'Empty', reason: { kind: 'no-outline' } },
    ]);
  });

  it('reads a file whose areas are all skipped, so that the reasons can be told', () => {
    const reading = read(kml(placemark('Bow', polygon('0,0 1,1 0,1 1,0'))));
    expect(reading.areas).toEqual([]);
    expect(reading.skipped).toHaveLength(1);
  });

  it('gives a placemark without a name an empty one, and reads entities and CDATA in names', () => {
    const reading = read(
      kml(
        `<Placemark>${polygon(SQUARE)}</Placemark>` +
          placemark('Tom &amp; Jerry&apos;s', polygon(SQUARE)) +
          placemark('<![CDATA[<b>Bold</b>]]>', polygon(SQUARE)),
      ),
    );
    expect(reading.areas.map((area) => area.name)).toEqual(['', "Tom & Jerry's", '<b>Bold</b>']);
  });

  it('reads KML with namespace prefixes', () => {
    const text =
      '<kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Placemark><kml:name>P</kml:name>' +
      `<kml:Polygon><kml:outerBoundaryIs><kml:LinearRing><kml:coordinates>${SQUARE}` +
      '</kml:coordinates></kml:LinearRing></kml:outerBoundaryIs></kml:Polygon></kml:Placemark></kml:kml>';
    expect(read(text).areas).toEqual([
      { name: 'P', outline: SQUARE_RING, holes: false, description: null },
    ]);
  });

  it('says what a text is that is no KML with areas', () => {
    expect(readKml('PK\u0003\u0004 zipped')).toEqual({ ok: false, reason: 'kmz' });
    expect(readKml('hello')).toEqual({ ok: false, reason: 'not-xml' });
    expect(readKml('<kml><Document></kml>')).toEqual({ ok: false, reason: 'not-xml' });
    expect(readKml('<!DOCTYPE kml><kml/>')).toEqual({ ok: false, reason: 'doctype' });
    expect(readKml(`${'<a>'.repeat(100)}${'</a>'.repeat(100)}`)).toEqual({
      ok: false,
      reason: 'too-deep',
    });
    expect(readKml('<gpx><trk/></gpx>')).toEqual({ ok: false, reason: 'not-kml' });
    expect(readKml(kml(''))).toEqual({ ok: false, reason: 'no-areas' });
    expect(readKml(kml(placemark('Pin', '<Point><coordinates>1,2</coordinates></Point>')))).toEqual(
      { ok: false, reason: 'no-areas' },
    );
  });

  it('refuses a file with more areas than any server has regions', () => {
    const many = (n: number) =>
      kml(Array.from({ length: n }, (_unused, i) => placemark(`R${i}`, polygon(SQUARE))).join(''));
    expect(read(many(MAX_KML_AREAS)).areas).toHaveLength(MAX_KML_AREAS);
    expect(readKml(many(MAX_KML_AREAS + 1))).toEqual({ ok: false, reason: 'too-many-areas' });
  });
});

describe('the description of an area', () => {
  it('is the placemark’s description as plain text, tidied; null without one', () => {
    const reading = read(
      kml(
        `<Placemark><name>A</name><description>  North  side </description>${polygon(SQUARE)}</Placemark>` +
          `<Placemark><name>B</name><description> </description>${polygon(SQUARE)}</Placemark>` +
          `<Placemark><name>C</name><description><![CDATA[Tom & Jerry]]></description>${polygon(SQUARE)}</Placemark>`,
      ),
    );
    expect(reading.areas.map((area) => area.description)).toEqual([
      'North side',
      null,
      'Tom & Jerry',
    ]);
  });

  it('is the first line of a description written as HTML, without tags and entities', () => {
    const described = (text: string) =>
      `<Placemark><name>A</name><description>${text}</description>${polygon(SQUARE)}</Placemark>`;
    const reading = read(
      kml(
        [
          // Google My Maps writes the fields of a placemark as lines of HTML.
          '<![CDATA[<b>North</b> Hills<br>description: the old town<br/>]]>',
          'North &amp;lt;b&amp;gt;  Hills&amp;amp;Co &amp;#233;&amp;#x41; &amp;nbsp;x',
          'South\nsecond line',
          '<![CDATA[<br>after a break]]>',
          '<![CDATA[<i></i> &nbsp; ]]>',
        ]
          .map(described)
          .join(''),
      ),
    );
    expect(reading.areas.map((area) => area.description)).toEqual([
      'North Hills',
      'North <b> Hills&Co éA x',
      'South',
      null,
      null,
    ]);
  });

  it('leaves an entity of a description that it does not know as its text, a name every object has too', () => {
    const reading = read(
      kml(
        '<Placemark><name>A</name>' +
          '<description><![CDATA[x &toString; &valueOf; &bogus; y]]></description>' +
          `${polygon(SQUARE)}</Placemark>`,
      ),
    );
    expect(reading.areas[0]?.description).toBe('x &toString; &valueOf; &bogus; y');
  });
});

describe('kmlText', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it('decodes UTF-8, with or without a byte order mark', () => {
    expect(kmlText(bytes('<kml>é</kml>'))).toEqual({ ok: true, text: '<kml>é</kml>' });
    expect(kmlText(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('<kml/>')]))).toEqual({
      ok: true,
      text: '<kml/>',
    });
  });

  it('knows a zip by its first bytes: that is a KMZ', () => {
    expect(kmlText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe]))).toEqual({
      ok: false,
      reason: 'kmz',
    });
  });

  it('refuses bytes that are no UTF-8 text', () => {
    expect(kmlText(new Uint8Array([0x3c, 0xff, 0xfe, 0x3e]))).toEqual({
      ok: false,
      reason: 'not-text',
    });
    // UTF-16, as some editors save XML.
    expect(kmlText(new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x6b, 0x00]))).toEqual({
      ok: false,
      reason: 'not-text',
    });
    expect(kmlText(new Uint8Array([]))).toEqual({ ok: true, text: '' });
  });
});

describe('writeKml', () => {
  it('writes named polygons that readKml reads back to the same outlines', () => {
    const areas: KmlArea[] = [
      { name: 'West End', outline: SQUARE_RING, holes: false, description: null },
      {
        name: 'Tom & Jerry\'s <"best"> ]]> region',
        outline: [
          p(40.123456789012, -79.987654321098),
          p(-33.8568, 151.2153),
          p(1e-7, -1e-7),
          p(40.123456789012, -79.987654321098),
        ],
        holes: false,
        description: 'North & <east> of the river',
      },
    ];
    const text = writeKml(areas);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(read(text).areas).toEqual(areas);
    expect(read(text).skipped).toEqual([]);
  });

  it('writes longitude first, as KML has it', () => {
    expect(writeKml([{ name: 'A', outline: SQUARE_RING, description: null }])).toContain(
      '<coordinates>-80.1,40,0 -80.1,40.1,0 -80,40.1,0 -80,40,0 -80.1,40,0</coordinates>',
    );
  });

  it('leaves out what XML cannot hold in a name', () => {
    const text = writeKml([{ name: 'A\u0000B\u0008C', outline: SQUARE_RING, description: null }]);
    expect(read(text).areas[0]?.name).toBe('ABC');
  });
});
