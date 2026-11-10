import { describe, expect, it } from 'vitest';
import { jsonResponse } from '../../test/support/responses.js';
import { readLimitedJson } from './limited-json.js';

describe('readLimitedJson', () => {
  it('reads a body in pieces as JSON', async () => {
    const body = { attackers: [{ pokemonId: 'MEWTWO', text: 'é'.repeat(100) }] };
    expect(await readLimitedJson(jsonResponse(body, { pieceBytes: 7 }), 10_000)).toEqual({
      ok: true,
      value: body,
    });
  });

  it('gives up a body the moment it passes the limit, whatever its length said', async () => {
    const response = jsonResponse({ text: 'x'.repeat(5_000) }, { pieceBytes: 1_000 });
    expect(await readLimitedJson(response, 2_500)).toEqual({ ok: false, reason: 'too-large' });
    expect(response.readBytes()).toBe(3_000);
    expect(response.cancelled()).toBe(true);
  });

  it('does not read a body whose length says it is too large', async () => {
    const response = jsonResponse({}, { contentLength: 6_000_000 });
    expect(await readLimitedJson(response, 5_000_000)).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(response.readBytes()).toBe(0);
  });

  it('says so of a body that is no JSON, or no body', async () => {
    expect(await readLimitedJson(jsonResponse(null, { raw: '<html>' }), 100)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(
      await readLimitedJson({ status: 200, headers: { get: () => null }, body: null }, 100),
    ).toEqual({ ok: false, reason: 'unreadable' });
  });
});
