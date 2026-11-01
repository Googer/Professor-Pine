import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { coveredCells, readWayspotExport, writeWayspotExport } from './export-file.js';

/**
 * Version 1 of the export, pinned: the file the Pine Wayspot export tool saves and `/gym import`
 * reads. Its private repository tests its exports against the same fixture
 * (`@pine/wayspot-core/fixtures/export-v1.json`). A change that breaks this test is a new
 * `version`, and the bot keeps reading this one.
 */

const fixture = (name: string): Buffer =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

const JSON_TEXT = fixture('export-v1.json').toString('utf8');

describe('the export format, version 1', () => {
  it('reads the fixture as exactly what it holds', () => {
    const reading = readWayspotExport(JSON_TEXT);
    expect(reading).toEqual({ ok: true, file: JSON.parse(JSON_TEXT) as unknown });
  });

  it('writes what it read as the same bytes', () => {
    const reading = readWayspotExport(JSON_TEXT);
    if (!reading.ok) throw new Error('the fixture does not read');
    expect(Buffer.from(writeWayspotExport(reading.file), 'utf8')).toEqual(
      fixture('export-v1.json'),
    );
  });

  it('reads the packed fixture as the same export', () => {
    const text = gunzipSync(fixture('export-v1.json.gz')).toString('utf8');
    expect(text).toBe(JSON_TEXT);
    expect(readWayspotExport(text)).toEqual(readWayspotExport(JSON_TEXT));
  });

  it('holds every part of the format', () => {
    const reading = readWayspotExport(JSON_TEXT);
    if (!reading.ok) throw new Error('the fixture does not read');
    const { file } = reading;
    expect(new Set(file.wayspots.map((wayspot) => wayspot.kind))).toEqual(
      new Set(['gym', 'stop', 'powerspot']),
    );
    expect(file.cells.length).toBeGreaterThan(0);
    expect(file.bareCells.length).toBeGreaterThan(0);
    expect(file.outlines).toHaveLength(file.regions.length);
    expect(file.margin).toBeGreaterThan(0);
    expect(file.part).toBeDefined();
    expect(file.wayspots.some((wayspot) => wayspot.address === '')).toBe(true);
    expect(file.wayspots.some((wayspot) => wayspot.image === '')).toBe(true);
    expect(file.wayspots.some((wayspot) => wayspot.description === '')).toBe(true);
    expect(coveredCells(file)).toEqual(new Set([...file.cells, ...file.bareCells]));
  });
});
