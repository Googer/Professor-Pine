import { gzipSync } from 'node:zlib';
import { ComponentType, MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import { loadSettings } from '../../config/settings.js';
import {
  fakeButton,
  fakeMessage,
  sent,
  type FakeOptions,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import { OTHER_STAFF, STAFF, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  gymCommandsWith,
  MEMBER,
  MODERATOR,
  said,
} from '../../../test/support/gym-commands.js';
import { allComponents, buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import {
  EAST_CHANNEL,
  northRegion,
  testOutlines,
  WEST_CHANNEL,
} from '../../../test/support/gyms.js';
import { attachedText } from '../../../test/support/region-commands.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import { missingCells } from '@pine/wayspot-core/scan-area';
import {
  exportParts,
  writeWayspotExport,
  type ExportedWayspot,
  type WayspotExport,
  type WayspotKind,
} from '@pine/wayspot-core/export-file';
import type { V2Message } from '../../discord/party-gateway.js';
import { REPORT_HEADER } from '../../render/wayfarer-report.js';
import {
  IMPORT_PENDING_MINUTES,
  MAX_EXPORT_BYTES,
  MAX_PENDING_IMPORTS,
  outsideOutcomeLines,
  pendingImports,
  REPORT_FILE,
  sentencesText,
  unpackExport,
} from './import.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/** A point `north` metres from `from`. */
const at = (from: LatLon, north: number): LatLon => ({
  lat: from.lat + north / METRES_PER_DEGREE,
  lon: from.lon,
});

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

function wayspot(
  n: number,
  title: string,
  place: LatLon,
  more: { kind?: WayspotKind; image?: string; status?: string } = {},
): ExportedWayspot {
  return {
    id: idOf(n),
    kind: more.kind ?? 'gym',
    status: more.status ?? 'ACTIVE',
    lat: place.lat,
    lon: place.lon,
    title,
    address: '',
    description: '',
    image: more.image ?? '',
  };
}

function gymOf(made: Made, id: number): Gym {
  const gym = made.directory.get(id);
  if (!gym) throw new Error(`no gym ${id}`);
  return gym;
}

/**
 * The file of the service's tests, over the invented gyms: the library (1) renamed and moved
 * with a picture, the fountain (2) found by its name, the church (3) by its place, the mosaic
 * (6) with a stop and a Wayfarer gym of other titles near (a question), the post office (12) in a covered cell with nothing near
 * (unknown), two new Wayfarer gyms, every other gym not covered. The scan also went over an area
 * that is no region of the server.
 */
function cityFile(made: Made): WayspotExport {
  const wayspots = [
    wayspot(1, 'The Pinewood Public Library', at(gymOf(made, 1), 30), {
      image: 'https://lh3.googleusercontent.com/library',
    }),
    wayspot(2, 'Old Stone Fountain', at(gymOf(made, 2), 2)),
    wayspot(3, 'Saint Mary Parish', at(gymOf(made, 3), 4)),
    wayspot(4, 'Bench', at(gymOf(made, 6), 40), { kind: 'stop' }),
    wayspot(5, 'Mosaic Wall', at(gymOf(made, 6), -60)),
    wayspot(6, 'Clock Tower', { lat: 40.015, lon: -80.015 }),
    wayspot(7, 'Bell Tower', { lat: 40.015, lon: -80.095 }),
  ];
  return {
    format: 'pine-wayspots',
    version: 1,
    script: '1.0.0',
    startedAt: '2026-10-15T08:00:00.000Z',
    finishedAt: '2026-10-15T09:30:00.000Z',
    regions: ['West', 'east', 'Far Hills'],
    outlines: [...testOutlines(), northRegion().bounds ?? []],
    margin: 0,
    cells: [...new Set([...wayspots, gymOf(made, 12)].map(wayfarerCellAt))],
    bareCells: [],
    wayspots,
  };
}

/** A file as the export tool saves it: the export as JSON, packed with gzip. */
const packed = (file: WayspotExport): Uint8Array => gzipSync(writeWayspotExport(file));

/** The names of the server's region channels, as the cache has them. */
const CHANNELS = { [WEST_CHANNEL]: 'west', [EAST_CHANNEL]: 'east' };

/** A file attached to `/gym import`: its name and content, and the size Discord says it has. */
interface Attached {
  name: string;
  content: Uint8Array | string;
  size?: number;
}

/** The options of `/gym import`, in order. */
const FILE_OPTIONS = ['file', 'file2', 'file3', 'file4', 'file5'];

/** Uses `/gym import` with these files (`file`, `file2`, …), and gives the answer. */
async function importingFiles(made: Made, files: readonly Attached[]) {
  const resolved: Record<string, unknown> = {};
  files.forEach((one, index) => {
    resolved[FILE_OPTIONS[index]!] = made.file(one.name, one.content, one.size);
  });
  const used = await made.use('import', {}, { resolved, guildChannelNames: CHANNELS });
  return { used, answer: answerOf(used) };
}

/** The parts an export of this run is saved in, as the export tool names and packs them. */
const partFiles = (file: WayspotExport, count: number, runId = 'run-1'): Attached[] =>
  exportParts(file, count, runId).map((part, index) => ({
    name: `pine-wayspots-2026-10-15-part${index + 1}of${count}.json.gz`,
    content: packed(part),
  }));

/** Uses `/gym import` with this file, and gives the answer. */
async function importing(
  made: Made,
  content: Uint8Array | string,
  more: { name?: string; size?: number; userId?: string; roleNames?: string[] } = {},
) {
  const used = await made.use(
    'import',
    {},
    {
      resolved: {
        file: made.file(more.name ?? 'pine-wayspots-2026-10-15.json.gz', content, more.size),
      },
      guildChannelNames: CHANNELS,
      ...(more.userId === undefined ? {} : { userId: more.userId }),
      ...(more.roleNames === undefined ? {} : { roleNames: more.roleNames }),
    },
  );
  return { used, answer: answerOf(used) };
}

/** A press on a button under a preview that shows its report, as Discord sends it. */
/** A press on the preview, which is a components-v2 message. */
const pressV2 = (made: Made, id: string, extra: FakeOptions = {}) =>
  made.press(id, { v2Message: true, ...extra });

const pressing = (made: Made, id: string, answer: SentPayload, userId?: string) =>
  pressV2(made, id, {
    message: fakeMessage([], undefined, '', answer.files ?? []),
    ...(userId === undefined ? {} : { userId }),
  });

/** An answer as the components-v2 message it is: with the flag, without content or embeds. */
function v2Of(payload: SentPayload): V2Message {
  expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
  expect(payload).not.toHaveProperty('content');
  expect(payload).not.toHaveProperty('embeds');
  return { v2: true, components: payload.components } as V2Message;
}

/** The text of an answer, line by line. */
const linesOf = (payload: SentPayload): string[] =>
  textDisplays(v2Of(payload)).join('\n').split('\n');

/** The labels of the buttons of an answer. */
const labelsOf = (payload: SentPayload): string[] =>
  buttonsOf(v2Of(payload)).map((button) => button.label ?? '');

/** The custom id of the button with this label. */
function buttonId(payload: SentPayload, label: string): string {
  const found = buttonsOf(v2Of(payload)).find((button) => button.label === label);
  if (!found?.customId) throw new Error(`no button "${label}"`);
  return found.customId;
}

/** The files the message shows by a file component. */
const filesShown = (payload: SentPayload): string[] =>
  allComponents(v2Of(payload)).flatMap((component) => {
    const { type, file } = component as { type?: number; file?: { url?: string } };
    return type === ComponentType.File && file?.url !== undefined ? [file.url] : [];
  });

/** What takes the place of the preview: one text, no report. */
const replacedBy = (payload: SentPayload): { lines: string[]; attachments: unknown } => ({
  lines: linesOf(payload),
  attachments: payload.attachments,
});

describe('/gym import: its help', () => {
  it('says where the export tool is asked for, from the settings, and nothing of how it scans', async () => {
    const { gym } = await import('./index.js');
    const details = gym.subcommands.get('import')?.help?.details;
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const text = (wayspotTool: string): string =>
      typeof details === 'function' ? details({ ...settings, wayspotTool }) : '';
    expect(text('https://pine.example.test/userscript')).toContain(
      'The export is made by the Pine Wayfarer export tool: ask for it at ' +
        'https://pine.example.test/userscript.',
    );
    expect(text(settings.wayspotTool)).toContain('ask for it at https://profpine.com/userscript.');
    expect(text(settings.wayspotTool)).not.toMatch(
      /npm run|dist\/|\.user\.js|Tampermonkey|zoom|drag|\bpans?\b|the map\b/i,
    );
    // Only a change of gyms is posted (8W-3).
    expect(text(settings.wayspotTool)).toContain(
      'When gyms changed, the channel for bot updates gets one summary of what changed.',
    );
  });
});

describe('unpackExport', () => {
  it('unpacks gzip by its first bytes, and takes plain text as it is', () => {
    const text = '{"format":"pine-wayspots","wayspots":["é"]}';
    expect(unpackExport(gzipSync(text))).toEqual({ ok: true, text });
    expect(unpackExport(new TextEncoder().encode(text))).toEqual({ ok: true, text });
    // A byte order mark is no part of the text.
    expect(unpackExport(new TextEncoder().encode(`\uFEFF${text}`))).toEqual({ ok: true, text });
  });

  it('refuses what is too large unpacked, damaged, or no UTF-8', () => {
    const big = 'x'.repeat(2_000);
    expect(unpackExport(gzipSync(big), 1_000)).toEqual({ ok: false, reason: 'too-large' });
    expect(unpackExport(new TextEncoder().encode(big), 1_000)).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(unpackExport(gzipSync(big), 2_000)).toEqual({ ok: true, text: big });
    const damaged = gzipSync(big).subarray(0, 20);
    expect(unpackExport(damaged)).toEqual({ ok: false, reason: 'damaged' });
    expect(unpackExport(Uint8Array.from([0x1f, 0x8b, 1, 2, 3]))).toEqual({
      ok: false,
      reason: 'damaged',
    });
    expect(unpackExport(Uint8Array.from([0xff, 0xfe, 0x00, 0x41]))).toEqual({
      ok: false,
      reason: 'not-text',
    });
  });
});

describe('/gym import: the preview', () => {
  it('says what the import would do, attaches every gym, and writes nothing', async () => {
    const made = await gymCommandsWith();
    await made.wayfarerStore.markNotInWayfarer(5, STAFF, 1);
    const { used, answer } = await importing(made, packed(cityFile(made)));

    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.attachments.asked).toEqual([
      {
        url: expect.any(String) as string,
        limits: { maxBytes: 10 * 1024 * 1024, timeoutMs: 30_000 },
      },
    ]);
    expect(linesOf(answer)).toEqual([
      'Importing this export of 7 Wayspots would do this. Nothing changes until you press Import.',
      '3 gyms were found in Wayfarer:',
      '- 2 get the name Wayfarer gives them',
      '- 2 move to where Wayfarer has them',
      '- 1 gets its picture from Wayfarer',
      '2 new gyms would be added: Wayfarer has them, this server does not.',
      '2 gyms would go to the review queue for you to decide (1 to match, 1 never found in ' +
        'Wayfarer). `/gym review` shows them one at a time.',
      '1 gym marked "not in Wayfarer" is left alone.',
      '5 gyms lie where the scan did not reach, so they are left alone.',
      'PokéStops and Power Spots for `/wild` and the map: 1 new.',
      "1 of the scan's areas is no region of this server as it is now.",
      '1 gym lies in no region and outside the area this scan covered (in the report as ' +
        '`beyond`). This scan went no margin beyond its areas, so it cannot be deleted from it.',
      'This is the first import of this server.',
      'The attached `wayfarer-import.csv` lists every gym. An import never deletes a gym.',
      '**By region**',
      `- <#${WEST_CHANNEL}>: 3 found, 2 renamed, 2 moved, 2 added, 2 to review, 1 not in ` +
        'Wayfarer, 2 not reached',
      `- <#${EAST_CHANNEL}>: 3 not reached`,
    ]);
    expect(filesShown(answer)).toEqual([`attachment://${REPORT_FILE}`]);
    const report = attachedText(answer, REPORT_FILE).split('\r\n');
    expect(report[0]).toBe(`\uFEFF${REPORT_HEADER}`);
    // The header, a line per gym, the two added, the gym beyond the area, and the last CR LF.
    expect(report).toHaveLength(1 + 11 + 2 + 1 + 1);
    expect(report.filter((line) => line.split(',')[2] === 'beyond')).toHaveLength(1);
    expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);
    expect(buttonId(answer, 'Import')).toMatch(/^gym:[0-9a-f]{16}:wayfarer-import$/);
    expect(buttonId(answer, 'Cancel')).toMatch(/^gym:[0-9a-f]{16}:wayfarer-cancel$/);

    await made.settle();
    expect(made.gymStore.writes).toEqual([]);
    expect(made.wayfarerStore.imports).toEqual([]);
    expect(made.wayfarerStore.reviews).toEqual([]);
  });

  it('names the Wayfarer gyms just outside the regions, in its words and the report', async () => {
    const made = await gymCommandsWith();
    const city = cityFile(made);
    // About 334 metres north of West's northern edge, far from every gym.
    const mural = wayspot(9, 'Hill Mural', { lat: 40.103, lon: -80.06 });
    const file = { ...city, margin: 500, wayspots: [...city.wayspots, mural] };
    const { answer } = await importing(made, packed(file));
    expect(linesOf(answer)).toContain(
      '1 Wayfarer gym lies just outside every region of this server: your outlines may leave ' +
        'it out. It is in the report as `outside`.',
    );
    const report = attachedText(answer, REPORT_FILE).split('\r\n');
    expect(report.filter((line) => line.includes(',outside,'))).toEqual([
      `,,outside,${idOf(9)},Hill Mural,gym,333.6,,west`,
    ]);

    const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect(linesOf(sentLast(pressed))).toContain(
      '1 Wayfarer gym just outside every region of this server was not added: your outlines ' +
        'may leave it out.',
    );
    expect(made.directory.all().some((gym) => gym.pogoId === mural.id)).toBe(false);
  });

  it('names the Wayfarer gyms held for a question about a gym nearby, and their gym', async () => {
    const made = await gymCommandsWith();
    const city = cityFile(made);
    // Six Wayfarer gyms north of the post office: it is offered five, the farthest waits.
    const murals = [10, 20, 30, 40, 50, 60].map((metres, i) =>
      wayspot(20 + i, `Mural ${i + 1}`, at(gymOf(made, 12), metres)),
    );
    const { answer } = await importing(
      made,
      packed({ ...city, wayspots: [...city.wayspots, ...murals] }),
    );
    expect(linesOf(answer)).toContain(
      '1 Wayfarer gym waits for a question about a gym nearby, so it is not added yet. It is in ' +
        'the report as `held`.',
    );
    const report = attachedText(answer, REPORT_FILE).split('\r\n');
    expect(report.filter((line) => line.includes(',held,'))).toEqual([
      `12,${gymOf(made, 12).name},held,${idOf(25)},Mural 6,gym,,,`,
    ]);

    const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect(linesOf(sentLast(pressed))).toContain(
      '1 Wayfarer gym was not added: a gym nearby may be one (a later import asks), or another ' +
        'gym or a region of another server is in the way.',
    );
    expect(made.directory.all().some((gym) => gym.pogoId === idOf(25))).toBe(false);
  });

  it('reads an export that is not packed, whatever the file is called', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, writeWayspotExport(cityFile(made)), {
      name: 'export.txt',
    });
    expect(linesOf(answer)[0]).toMatch(/^Importing this export of 7 Wayspots would do this/);
    expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);
  });

  it('says when the file would change nothing, and offers no Import', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const { answer: first } = await importing(made, packed(file));
    await pressV2(made, buttonId(first, 'Import'));
    await made.settle();
    // Imported once, the same file finds every gym by its id and asks what is asked already.
    const { answer } = await importing(made, packed(file));
    const seconds = Math.floor((made.wayfarerStore.imports[0]?.importedAt ?? 0) / 1000);
    expect(linesOf(answer).slice(0, 8)).toEqual([
      'Importing this export of 7 Wayspots would change nothing.',
      '5 gyms were found in Wayfarer, and all of them are up to date.',
      '2 gyms are in the review queue already (1 to match, 1 never found in Wayfarer). ' +
        '`/gym review` shows them one at a time.',
      '6 gyms lie where the scan did not reach, so they are left alone.',
      "1 of the scan's areas is no region of this server as it is now.",
      '1 gym lies in no region and outside the area this scan covered (in the report as ' +
        '`beyond`). This scan went no margin beyond its areas, so it cannot be deleted from it.',
      `The last import was <t:${seconds}:R> (<t:${seconds}:f>).`,
      'The attached `wayfarer-import.csv` lists every gym. An import never deletes a gym.',
    ]);
    expect(labelsOf(answer)).toEqual([]);
    expect(attachedText(answer, REPORT_FILE)).toContain('matched-id');
  });

  it('names the stops of Pine’s own within 30 meters of a PokéStop of the export', async () => {
    const made = await gymCommandsWith();
    const bench = at(gymOf(made, 6), 40);
    const stop = (name: string, place: LatLon) =>
      made.pineStops.add({
        serverId: made.gateway.guildId,
        name,
        lat: place.lat,
        lon: place.lon,
        address: null,
        createdBy: STAFF,
        createdAt: 1,
      });
    await stop('Bench Café', at(bench, 12));
    await stop('Far Café', at(bench, 300));
    const { answer } = await importing(made, packed(cityFile(made)));
    expect(linesOf(answer)).toContain(
      'A PokéStop of Pine’s own lies within 30 m of a PokéStop of this export: ' +
        '**Bench Café** (`pine-1`). Wayfarer may list it now: `/pokestop remove` takes it off.',
    );
  });

  it('offers an import that changes only PokéStops and Power Spots, and says what it did', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const { answer: first } = await importing(made, packed(file));
    await pressV2(made, buttonId(first, 'Import'));
    await made.settle();
    const bench = file.wayspots[3]!;
    const changed = {
      ...file,
      wayspots: [
        ...file.wayspots.filter((one) => one !== bench),
        { ...bench, title: 'Bench by the Mosaic' },
        wayspot(8, 'Little Free Library', at(gymOf(made, 6), 20), { kind: 'stop' }),
        wayspot(9, 'Water Tower', at(gymOf(made, 6), -20), { kind: 'powerspot' }),
      ],
    };

    const { answer } = await importing(made, packed(changed));
    expect(linesOf(answer)[0]).toBe(
      'Importing this export of 9 Wayspots would do this. Nothing changes until you press Import.',
    );
    expect(linesOf(answer)).toContain(
      'PokéStops and Power Spots for `/wild` and the map: 2 new, 1 changed.',
    );
    expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);

    const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect(linesOf(sentLast(pressed))).toContain(
      'PokéStops and Power Spots for `/wild` and the map: 2 new, 1 changed.',
    );
    expect((await made.wayspotStore.all()).map((row) => row.title)).toEqual([
      'Bench by the Mosaic',
      'Mosaic Wall',
      'Little Free Library',
      'Water Tower',
    ]);
  });

  it('keeps a stop Wayfarer has as inactive as a Power Spot', async () => {
    const made = await gymCommandsWith();
    const city = cityFile(made);
    const file = {
      ...city,
      wayspots: [
        ...city.wayspots,
        wayspot(8, 'Rammummy', at(gymOf(made, 6), 20), { kind: 'stop', status: 'INACTIVE' }),
      ],
    };
    const { answer } = await importing(made, packed(file));
    await pressV2(made, buttonId(answer, 'Import'));
    await made.settle();
    const kept = (await made.wayspotStore.all()).find((row) => row.title === 'Rammummy');
    expect(kept?.kind).toBe('powerspot');
  });

  it('offers an import when the kept PokéStops cannot be read, and says why it cannot tell', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const { answer: first } = await importing(made, packed(file));
    await pressV2(made, buttonId(first, 'Import'));
    await made.settle();
    const bench = file.wayspots[3]!;
    const changed = {
      ...file,
      wayspots: [
        ...file.wayspots.filter((one) => one !== bench),
        { ...bench, title: 'Bench by the Mosaic' },
      ],
    };
    const all = made.wayspotStore.all.bind(made.wayspotStore);
    made.wayspotStore.all = () => Promise.reject(new Error('database is down'));
    const { answer } = await importing(made, packed(changed));
    expect(linesOf(answer)[0]).toBe(
      'Importing this export of 7 Wayspots would do this. Nothing changes until you press Import.',
    );
    expect(linesOf(answer)).toContain(
      'I could not read the PokéStops and Power Spots kept for `/wild` and the map, so I ' +
        'cannot say what this export changes of them. Import tries again.',
    );
    expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);
    made.wayspotStore.all = all;
    await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect((await made.wayspotStore.all()).map((row) => row.title)).toContain(
      'Bench by the Mosaic',
    );
  });

  it('offers no import that would change only the Wayfarer gyms kept beside the stops', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const { answer: first } = await importing(made, packed(file));
    await pressV2(made, buttonId(first, 'Import'));
    await made.settle();
    // A Wayfarer gym far from every region: kept, but no gym, PokéStop or power spot changes.
    const tower = wayspot(9, 'Far Tower', { lat: 41, lon: -81 });
    const farther = {
      ...file,
      cells: [...file.cells, wayfarerCellAt(tower)],
      wayspots: [...file.wayspots, tower],
    };

    const { answer } = await importing(made, packed(farther));
    expect(linesOf(answer)[0]).toBe('Importing this export of 8 Wayspots would change nothing.');
    expect(labelsOf(answer)).toEqual([]);
  });

  it('says so where the server has no region with an outline', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    for (const region of made.regions.all()) (region as { bounds: unknown }).bounds = null;
    const { answer } = await importing(made, packed(file));
    expect(said(answer)).toBe(
      'This server has no region with an outline, so an import has nothing to compare: give ' +
        'the regions their outlines with `/region import` first.',
    );
    expect(answer.components ?? []).toEqual([]);
    expect(answer.files ?? []).toEqual([]);
  });
});

describe('/gym import: sentences too long for their room', () => {
  it('cuts them never inside a channel, a code span or bold', () => {
    const channels = Array.from({ length: 200 }, (_, n) => `<#${String(1e17 + n)}>`).join(', ');
    for (const lines of [
      [`${'x'.repeat(2_390)} ${channels}`],
      [`**${'y'.repeat(3_000)}** could not be written`],
      [`Attach \`${'z'.repeat(3_000)}\``],
    ]) {
      const text = sentencesText(lines);
      expect(text.length).toBeLessThanOrEqual(2_400);
      expect(text.endsWith('…')).toBe(true);
      expect(text).not.toMatch(/<#\d*…$/u);
      expect((text.match(/\*\*/gu) ?? []).length % 2).toBe(0);
      expect((text.match(/`/gu) ?? []).length % 2).toBe(0);
    }
  });
});

describe('/gym import: an export in parts', () => {
  it('merges the parts of one export, attached in any order, and previews the whole', async () => {
    const made = await gymCommandsWith();
    await made.wayfarerStore.markNotInWayfarer(5, STAFF, 1);
    const [one, two, three] = partFiles(cityFile(made), 3);
    const { answer } = await importingFiles(made, [three!, one!, two!]);
    expect(made.attachments.asked).toHaveLength(3);
    const { answer: whole } = await importing(made, packed(cityFile(made)));
    expect(linesOf(answer)).toEqual(linesOf(whole));
    expect(labelsOf(answer)).toEqual(['Import', 'Cancel']);

    const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect(linesOf(sentLast(pressed))[0]).toBe('Imported.');
    expect(made.directory.get(1)?.pogoId).toBe(idOf(1));
  });

  it('refuses parts of different exports, a part twice, or a missing part', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const parts = partFiles(file, 3);
    const other = partFiles(file, 3, 'run-2');
    // Each try on a bot of its own: a member has three uses in ten minutes.
    const refusal = async (files: Attached[]): Promise<string> => {
      const { answer } = await importingFiles(await gymCommandsWith(), files);
      expect(answer.components ?? []).toEqual([]);
      return said(answer) ?? '';
    };
    expect(await refusal([parts[0]!, other[1]!, parts[2]!])).toBe(
      'Those files are parts of different exports. Attach every part of one Save export ' +
        '(`pine-wayspots-<date>-part1of3.json.gz` and so on), and nothing else.',
    );
    expect(await refusal([parts[0]!, parts[0]!, parts[2]!])).toBe(
      'Part 1 of 3 of the export is attached twice. Attach each part once.',
    );
    expect(await refusal([parts[2]!])).toBe(
      'That is not the whole export: parts 1 and 2 of 3 are missing. Attach all 3 parts at once.',
    );
    expect(await refusal([parts[0]!, parts[2]!])).toBe(
      'That is not the whole export: part 2 of 3 is missing. Attach all 3 parts at once.',
    );
    expect(await refusal([parts[0]!, { name: 'whole.json.gz', content: packed(file) }])).toBe(
      'A whole export cannot be imported together with other files. Attach one export, or ' +
        'every part of one.',
    );
  });

  it('checks the size of every file before it downloads any, and names the file', async () => {
    const made = await gymCommandsWith();
    const parts = partFiles(cityFile(made), 2);
    const { answer } = await importingFiles(made, [
      parts[0]!,
      { ...parts[1]!, size: MAX_EXPORT_BYTES + 1 },
    ]);
    expect(said(answer)).toBe(
      '`pine-wayspots-2026-10-15-part2of2.json.gz`: that file is larger than 10 MB, more ' +
        'than any packed part of an export. Attach the files the export tool saves, as they are.',
    );
    expect(made.attachments.asked).toEqual([]);
  });

  it('refuses parts that hold more together than one export, before it downloads the next', async () => {
    const made = await gymCommandsWith();
    // Five parts of 63,000 Wayspots each: the fourth passes the 250,000 an export may have. Not
    // packed (under 10 MB each), and written once (a Wayspot is read faster than a cell's token
    // is checked): about a second, for the quarter of a million Wayspots read to get there.
    const text = writeWayspotExport({
      ...cityFile(made),
      cells: [],
      wayspots: Array.from({ length: 63_000 }, (_, n) =>
        wayspot(n, '', { lat: 40, lon: -80 }, { kind: 'stop' }),
      ),
      part: { index: 1, count: 5, runId: 'run-1' },
    });
    const files = [1, 2, 3, 4, 5].map((index) => ({
      name: `pine-wayspots-2026-10-15-part${index}of5.json`,
      content: text.replace('"part":{"index":1,', `"part":{"index":${index},`),
    }));
    const { answer } = await importingFiles(made, files);
    expect(said(answer)).toBe(
      'Together, those files hold more than one export can. If they are the parts of a real ' +
        'export, scan fewer regions in one run; otherwise save the export again.',
    );
    expect(made.attachments.asked).toHaveLength(4);
  });

  it('names the file that cannot be read', async () => {
    const made = await gymCommandsWith();
    const parts = partFiles(cityFile(made), 2);
    const { answer } = await importingFiles(made, [
      parts[0]!,
      { name: 'notes.txt', content: 'hello' },
    ]);
    expect(said(answer)).toMatch(
      /^`notes\.txt`: that file is no export: it is neither gzip nor JSON\. /,
    );
  });
});

describe('/gym import: files it refuses', () => {
  const refused = async (
    content: Uint8Array | string,
    more: { size?: number } = {},
  ): Promise<{ text: string; made: Made }> => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, content, more);
    expect(answer.components ?? []).toEqual([]);
    return { text: said(answer) ?? '', made };
  };
  const HOW =
    'Attach the file the Pine Wayfarer export tool saves (`pine-wayspots-<date>.json.gz`): ' +
    '`/help command:gym import` says where to ask for the tool.';

  it('refuses a file larger than Discord takes without downloading it', async () => {
    const { text, made } = await refused('{}', { size: MAX_EXPORT_BYTES + 1 });
    expect(text).toBe(
      'That file is larger than 10 MB, more than any packed export of Wayspots. Attach the ' +
        '`pine-wayspots-<date>.json.gz` the export tool saves, as it is.',
    );
    expect(made.attachments.asked).toEqual([]);
  });

  it('refuses what is neither gzip nor JSON, or damaged, or no text', async () => {
    expect((await refused('hello')).text).toBe(
      `That file is no export: it is neither gzip nor JSON. ${HOW}`,
    );
    expect((await refused(Uint8Array.from([0x1f, 0x8b, 9, 9, 9]))).text).toBe(
      'That file is packed (gzip), but damaged: I could not unpack it. Save the export again.',
    );
    expect((await refused(Uint8Array.from([0xff, 0xfe, 0x00]))).text).toBe(
      `That file is no export: it is neither gzip nor text. ${HOW}`,
    );
  });

  it('refuses JSON that is no export, and an export of a newer version', async () => {
    expect((await refused(gzipSync('{"format":"kml"}'))).text).toBe(
      `That file is JSON, but no export of Wayspots. ${HOW}`,
    );
    const made = await gymCommandsWith();
    const newer = writeWayspotExport(cityFile(made)).replace('"version":1', '"version":2');
    expect((await refused(gzipSync(newer))).text).toBe(
      'That export was saved by a newer version of the Pine Wayfarer export tool (file ' +
        'version 2) than this bot reads (version 1). The bot has to be updated first, or the ' +
        'export saved again with the version handed out at https://profpine.com/userscript.',
    );
  });

  it('refuses an export of an older version of the tool, which has no outlines', async () => {
    const made = await gymCommandsWith();
    const { outlines: _outlines, ...older } = JSON.parse(
      writeWayspotExport(cityFile(made)),
    ) as Record<string, unknown>;
    expect((await refused(gzipSync(JSON.stringify(older)))).text).toBe(
      'That export was saved by an older version of the Pine Wayfarer export tool, without the ' +
        'outlines of its areas. Install the current version (ask for it at ' +
        'https://profpine.com/userscript), then save the export again.',
    );
  });

  it('refuses an export with a broken Wayspot, and says which', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const broken = {
      ...file,
      wayspots: file.wayspots.map((one, i) => (i === 2 ? { ...one, lat: 123 } : one)),
    };
    expect((await refused(gzipSync(JSON.stringify(broken)))).text).toBe(
      'Wayspot 3 of that export lies at no place on earth, so I read nothing of it. Was the ' +
        'file changed by hand? Save the export again.',
    );
  });

  it('says so when Discord does not give the file', async () => {
    const made = await gymCommandsWith();
    made.attachments.failing = true;
    const { answer } = await importing(made, packed(cityFile(made)));
    expect(said(answer)).toBe(
      'I could not download that file from Discord. Try again in a moment.',
    );
  });

  it('refuses a small file that unpacks to more objects than any export has', async () => {
    // A few kilobytes packed: a million empty objects (plan 8Z-2).
    const bomb = gzipSync(`[${'{},'.repeat(1_000_000)}{}]`);
    expect(bomb.byteLength).toBeLessThan(20_000);
    expect((await refused(bomb)).text).toBe(
      'That export holds more than 250,000 Wayspots or 250,000 cells. Scan fewer regions in ' +
        'one run.',
    );
  });
});

describe('/gym import: how often', () => {
  it('lets a member use it three times in ten minutes, whatever came of each', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await gymCommandsWith();
      const file = packed(cityFile(made));
      expect(said((await importing(made, 'hello')).answer)).toMatch(/^That file is no export/);
      for (let i = 0; i < 2; i++) {
        expect(labelsOf((await importing(made, file)).answer)).toEqual(['Import', 'Cancel']);
      }
      const asked = made.attachments.asked.length;
      const fourth = await importing(made, file);
      expect(said(fourth.answer)).toBe('You can use /gym import again in 10 minutes.');
      expect(made.attachments.asked).toHaveLength(asked);
      // Another member of staff has uses of their own.
      const other = await importing(made, file, { userId: OTHER_STAFF });
      expect(labelsOf(other.answer)).toEqual(['Import', 'Cancel']);
      vi.setSystemTime(Date.now() + 10 * 60_000);
      expect(labelsOf((await importing(made, file)).answer)).toEqual(['Import', 'Cancel']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so in its help', async () => {
    const { gym } = await import('./index.js');
    const details = gym.subcommands.get('import')?.help?.details;
    const settings = loadSettings(TEST_SETTINGS_PATH);
    expect(typeof details === 'function' ? details(settings) : '').toContain(
      'Each member may use this three times in ten minutes.',
    );
  });
});

describe('/gym import: the buttons', () => {
  it('offers to delete the gyms beyond the area of a finished scan, asks, and deletes them', async () => {
    const made = await gymCommandsWith();
    const city = cityFile(made);
    const outlines = testOutlines();
    const file = {
      ...city,
      regions: ['West', 'east'],
      outlines,
      margin: 500,
      bareCells: missingCells(outlines, new Set(city.cells), 500),
    };
    const beyond = made.directory.all().filter((gym) => !made.admin.inAnyRegion(gym.id));
    expect(beyond.length).toBeGreaterThan(0);
    const { answer } = await importing(made, packed(file));
    const imported = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    const outcome = sentLast(imported);
    const label = `Delete ${beyond.length} ${beyond.length === 1 ? 'gym' : 'gyms'} outside the area…`;
    expect(labelsOf(outcome)).toEqual([label]);

    const asked = await made.press(buttonId(outcome, label));
    const question = answerOf(asked);
    expect(linesOf(question)[0]).toMatch(
      /^Delete \d+ gyms? of this server that lies? in no region/,
    );
    // Only a change of gyms is posted (8W-3): kept for their raids, none would go.
    expect(linesOf(question).at(-1)).toBe(
      'When gyms go, the channel for bot updates is told how many went, in one post.',
    );
    expect(labelsOf(question)).toEqual([
      `Delete ${beyond.length} ${beyond.length === 1 ? 'gym' : 'gyms'}`,
      'Keep them',
    ]);
    // Nothing is deleted by the question.
    for (const gym of beyond) expect(made.directory.get(gym.id)).toBeDefined();

    const deleting = await made.press(buttonId(question, labelsOf(question)[0]!));
    await made.settle();
    expect(linesOf(answerOf(deleting))).toEqual([
      `Deleted ${beyond.length} ${beyond.length === 1 ? 'gym' : 'gyms'} outside the scanned area.`,
    ]);
    for (const gym of beyond) expect(made.directory.get(gym.id)).toBeUndefined();
    const posts = made.gateway
      .messagesIn(UPDATES_CHANNEL)
      .map((message) => textOf(message.message));
    expect(posts.at(-1)).toBe(
      '### The gym list changed\nProfessor Pine has deleted ' +
        `${beyond.length} ${beyond.length === 1 ? 'gym' : 'gyms'}.`,
    );
  });

  it('offers no deletion while a region of the server lies outside the scanned area', async () => {
    const made = await gymCommandsWith();
    const west = [testOutlines()[0]!];
    const file = {
      ...cityFile(made),
      regions: ['West'],
      outlines: west,
      margin: 500,
      bareCells: missingCells(west, new Set(cityFile(made).cells), 500),
    };
    const { answer } = await importing(made, packed(file));
    expect(linesOf(answer)).toContain(
      `1 region is not as the scan's areas were (changed since, or not scanned): ` +
        `<#${EAST_CHANNEL}>. No gym beyond the area can be deleted until a finished scan ` +
        'covers every region as it is now.',
    );
    const imported = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect(labelsOf(sentLast(imported))).toEqual([]);
  });

  it('deletes nothing when a region was added after the question was asked', async () => {
    const made = await gymCommandsWith();
    const city = cityFile(made);
    const outlines = testOutlines();
    const file = {
      ...city,
      regions: ['West', 'east'],
      outlines,
      margin: 500,
      bareCells: missingCells(outlines, new Set(city.cells), 500),
    };
    const { answer } = await importing(made, packed(file));
    const imported = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    const outcome = sentLast(imported);
    const ask = buttonId(outcome, labelsOf(outcome)[0]!);
    const question = answerOf(await made.press(ask));
    made.regions.rows.push({
      ...northRegion(),
      id: 9,
      guildId: 1,
      channelId: '100000000000000009',
    });
    await made.directory.load();

    const deleting = await made.press(buttonId(question, labelsOf(question)[0]!));
    await made.settle();
    expect(linesOf(answerOf(deleting))).toEqual([
      'No gym was deleted: 1 region of this server is not as the scan found it (added or ' +
        'changed since). Scan every region and import again.',
    ]);
    // Asked again, it says so at once.
    const again = answerOf(await made.press(ask));
    expect(linesOf(again)).toEqual([
      'No gym can be deleted: 1 region of this server is not as the scan found it (added or ' +
        'changed since). Scan every region and import again.',
    ]);
    expect(labelsOf(again)).toEqual([]);
  });

  it('asks again as often as the button is pressed without forgetting the outcome', async () => {
    const made = await gymCommandsWith();
    const city = cityFile(made);
    const outlines = testOutlines();
    const file = {
      ...city,
      regions: ['West', 'east'],
      outlines,
      margin: 500,
      bareCells: missingCells(outlines, new Set(city.cells), 500),
    };
    const { answer } = await importing(made, packed(file));
    const imported = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    const outcome = sentLast(imported);
    const ask = buttonId(outcome, labelsOf(outcome)[0]!);
    let question = answerOf(await made.press(ask));
    expect(linesOf(question)[1]).toMatch(/, [\d.,]+ k?m from the nearest region's outline$/);
    for (let press = 0; press < 25; press++) question = answerOf(await made.press(ask));
    const deleting = await made.press(buttonId(question, labelsOf(question)[0]!));
    await made.settle();
    expect(linesOf(answerOf(deleting))[0]).toMatch(
      /^Deleted \d+ gyms? outside the scanned area\.$/,
    );
  });

  it('says how many gyms of the question were gone already', () => {
    expect(
      outsideOutcomeLines({
        deleted: 2,
        raidThere: [],
        notBeyond: 0,
        gone: 1,
        failed: 0,
        regionsNotScanned: 0,
      }),
    ).toEqual(['Deleted 2 gyms outside the scanned area.', '1 gym was gone already.']);
  });

  it('offers no deletion after a scan without a margin', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    const imported = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();
    expect(labelsOf(sentLast(imported))).toEqual([]);
  });

  it('imports through the service and shows what was done in the place of the preview', async () => {
    const made = await gymCommandsWith();
    await made.wayfarerStore.markNotInWayfarer(5, STAFF, 1);
    const { answer } = await importing(made, packed(cityFile(made)));
    const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
    await made.settle();

    expect(replacedBy(sent(pressed.update, 0))).toEqual({
      lines: ['Importing 7 Wayspots… this message changes when it is done.'],
      attachments: [],
    });
    const done = sentLast(pressed);
    expect(linesOf(done)).toEqual([
      'Imported.',
      '3 gyms were found in Wayfarer:',
      '- 2 took the name Wayfarer gives them',
      '- 2 moved to where Wayfarer has them',
      '- 1 got its picture from Wayfarer',
      'Added 2 new gyms. Since gyms changed, the channel for bot updates is told what the ' +
        'import changed, in one post.',
      '2 gyms are in the review queue (1 to match, 1 never found in Wayfarer). `/gym review` ' +
        'shows them one at a time.',
      '5 gyms where the scan did not reach were left alone.',
      'PokéStops and Power Spots for `/wild` and the map: 1 new.',
    ]);
    expect(done.attachments).toEqual([]);
    expect(labelsOf(done)).toEqual([]);
    expect((await pressed.fetchReply()).attachments).toEqual([]);
    expect(made.wayfarerStore.imports).toHaveLength(1);
    expect(made.wayfarerStore.imports[0]).toMatchObject({ staffId: MODERATOR });
    expect(made.directory.get(1)?.pogoId).toBe(idOf(1));
    expect(made.directory.get(1)?.name).toBe('The Pinewood Public Library');
  });

  it('answers once: a second press is only acknowledged', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    const id = buttonId(answer, 'Import');
    await pressV2(made, id);
    const again = await pressV2(made, id);
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(again.update).not.toHaveBeenCalled();
    expect(again.editReply).not.toHaveBeenCalled();
    expect(made.wayfarerStore.imports).toHaveLength(1);
  });

  it('cancels, taking the report away, and writes nothing', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    const pressed = await pressing(made, buttonId(answer, 'Cancel'), answer);
    expect(replacedBy(sent(pressed.update, 0))).toEqual({
      lines: ['Nothing was imported.'],
      attachments: [],
    });
    expect((await pressed.fetchReply()).attachments).toEqual([]);
    // Import after Cancel is only acknowledged.
    const late = await pressV2(made, buttonId(answer, 'Import'));
    expect(late.deferUpdate).toHaveBeenCalled();
    await made.settle();
    expect(made.gymStore.writes).toEqual([]);
    expect(made.wayfarerStore.imports).toEqual([]);
  });

  it('lets only the staff member who asked press, and only staff', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    const id = buttonId(answer, 'Import');
    const other = await pressV2(made, id, { userId: '200000000000000007' });
    expect(other.reply).toHaveBeenCalledWith({
      content: 'That is somebody else’s question.',
      flags: MessageFlags.Ephemeral,
    });
    const member = await pressV2(made, id, { userId: MEMBER, roleNames: [] });
    expect(member.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.wayfarerStore.imports).toEqual([]);
    await pressV2(made, id);
    expect(made.wayfarerStore.imports).toHaveLength(1);
  });

  it('refuses a member who is not staff, before anything is downloaded', async () => {
    const made = await gymCommandsWith();
    const { used } = await importing(made, packed(cityFile(made)), {
      userId: MEMBER,
      roleNames: [],
    });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.attachments.asked).toEqual([]);
  });

  it('says that a preview has expired, taking the report away', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    const pressed = await pressing(made, 'gym:0123456789abcdef:wayfarer-import', answer);
    expect(replacedBy(sent(pressed.update, 0))).toEqual({
      lines: ['That has expired. Use the command again.'],
      attachments: [],
    });
    expect((await pressed.fetchReply()).attachments).toEqual([]);
  });

  it('forgets a preview after half an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await gymCommandsWith();
      const { answer } = await importing(made, packed(cityFile(made)));
      vi.setSystemTime(Date.now() + (IMPORT_PENDING_MINUTES + 1) * 60_000);
      const pressed = await pressV2(made, buttonId(answer, 'Import'));
      expect(replacedBy(sent(pressed.update, 0)).lines).toEqual([
        'That has expired. Use the command again.',
      ]);
      expect(made.wayfarerStore.imports).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps at most three exports waiting, forgetting the oldest', async () => {
    const made = await gymCommandsWith();
    // The first is another staff member's: one member has three uses in ten minutes.
    const first = await importing(made, packed(cityFile(made)), { userId: OTHER_STAFF });
    for (let i = 0; i < MAX_PENDING_IMPORTS; i++) await importing(made, packed(cityFile(made)));
    expect(pendingImports.size).toBeLessThanOrEqual(MAX_PENDING_IMPORTS);
    const pressed = await pressV2(made, buttonId(first.answer, 'Import'), { userId: OTHER_STAFF });
    expect(replacedBy(sent(pressed.update, 0)).lines).toEqual([
      'That has expired. Use the command again.',
    ]);
  });

  it('keeps of a waiting export only what Import reads: no descriptions', async () => {
    const made = await gymCommandsWith();
    const file = cityFile(made);
    const described = {
      ...file,
      wayspots: file.wayspots.map((one) => ({
        ...one,
        description: 'A long story about this place. '.repeat(100),
        address: `${one.title} Street, Pinewood`,
      })),
    };
    const { used, answer } = await importing(made, packed(described));
    const token = buttonId(answer, 'Import').split(':')[1]!;
    const waiting = pendingImports.peek(token, used.user.id);
    if (typeof waiting === 'string') throw new Error(`no waiting export: ${waiting}`);
    expect(waiting.value.file.wayspots.map((one) => one.description)).toEqual(
      file.wayspots.map(() => ''),
    );
    // What Import writes is kept: places, titles, addresses, pictures and the cells.
    expect(waiting.value.file.wayspots.map((one) => one.address)).toEqual(
      described.wayspots.map((one) => one.address),
    );
    expect(waiting.value.file.cells).toEqual(file.cells);
    expect(waiting.value.file.outlines).toEqual(file.outlines);
  });

  it('logs what was done when the outcome can no longer be shown', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    const press = fakeButton({
      customId: buttonId(answer, 'Import'),
      userId: MODERATOR,
      roleNames: ['Moderator'],
      channelId: WEST_CHANNEL,
      guildId: made.gateway.guildId,
      v2Message: true,
    });
    press.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
    await made.router.handle(press as never);
    expect(made.wayfarerStore.imports).toHaveLength(1);
    const logged = made.logged.find(
      (entry) => entry.msg === 'could not show the outcome of a Wayfarer import',
    );
    expect(logged).toMatchObject({ staff: MODERATOR, import: 1, matched: 3, added: 2 });
  });

  it('says so in the place of the preview when the import fails, and logs it', async () => {
    const made = await gymCommandsWith();
    const { answer } = await importing(made, packed(cityFile(made)));
    made.wayfarerStore.records = () => Promise.reject(new Error('database is down'));
    const pressed = await pressing(made, buttonId(answer, 'Import'), answer);
    expect(linesOf(sentLast(pressed))).toEqual([
      'The import failed. What was written before that stands: import the same file again in ' +
        'a moment.',
    ]);
    expect(made.logged.find((entry) => entry.msg === 'a Wayfarer import failed')).toMatchObject({
      staff: MODERATOR,
    });
  });
});

/** The last edit of a pressed button's reply. */
function sentLast(pressed: Awaited<ReturnType<Made['press']>>): SentPayload {
  return answerOf(pressed);
}
