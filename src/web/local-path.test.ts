import { describe, expect, it } from 'vitest';
import { localPath } from './local-path.js';

describe('localPath', () => {
  it("takes a path of a server's pages, the tool's page and the top page exactly", () => {
    for (const path of [
      '/',
      '/s/412345678901234567/map',
      '/s/412345678901234567/regions/edit',
      '/s/412345678901234567/',
      '/userscript',
    ]) {
      expect(localPath(path), path).toBe(path);
    }
  });

  it('refuses anything that could lead elsewhere, or nowhere of ours', () => {
    for (const path of [
      undefined,
      '',
      '//',
      '//x',
      '/\\x',
      '/?x',
      '/#x',
      ' /',
      'https://evil.example.test/s/412345678901234567/map',
      '//evil.example.test/s/412345678901234567/map',
      '/\\evil.example.test',
      '/s//evil.example.test',
      '/s/412345678901234567//evil.example.test',
      '/s/412345678901234567/map\\..\\x',
      '/s/412345678901234567/map?next=//evil',
      '/s/412345678901234567/map#x',
      '/s/abc/map',
      '/auth/login',
      '/s/412345678901234567/../../auth/logout',
      '/s/412345678901234567/%2F%2Fevil',
      '/s/412345678901234567/map\nSet-Cookie: x',
      `/s/412345678901234567/${'a'.repeat(300)}`,
      ['/s/412345678901234567/map'],
      '/userscript/',
      '/userscriptx',
      '/userscript?x',
      '/userscript#x',
      '//userscript',
      '/USERSCRIPT',
      '/userscript/abc/pine-wayfarer-export.user.js',
      ['/userscript'],
    ]) {
      expect(localPath(path), JSON.stringify(path)).toBeUndefined();
    }
  });

  it('takes the map of a server at an ended train, `?train=<digits>`, exactly (plan 8H-7B)', () => {
    for (const path of [
      '/s/412345678901234567/map?train=1',
      '/s/412345678901234567/map?train=123456789012345',
    ]) {
      expect(localPath(path), path).toBe(path);
    }
  });

  it('refuses any other query, on the map or elsewhere, and every way round it (G4)', () => {
    for (const path of [
      '/s/412345678901234567/map?train=',
      '/s/412345678901234567/map?train=0',
      '/s/412345678901234567/map?train=01',
      '/s/412345678901234567/map?train=1234567890123456',
      '/s/412345678901234567/map?train=-1',
      '/s/412345678901234567/map?train=1e3',
      '/s/412345678901234567/map?train=12&x=1',
      '/s/412345678901234567/map?x=1&train=12',
      '/s/412345678901234567/map?train=12#x',
      '/s/412345678901234567/map?train=12?login=failed',
      '/s/412345678901234567/map?train=1%32',
      '/s/412345678901234567/map?Train=12',
      '/s/412345678901234567/map?train=12\n',
      '/s/412345678901234567/map/?train=12',
      '/s/412345678901234567/history?train=12',
      '/s/412345678901234567/regions/edit?train=12',
      '/s/412345678901234567?train=12',
      '//evil.example.test/s/412345678901234567/map?train=12',
      '/\\evil.example.test/s/412345678901234567/map?train=12',
      '/s/412345678901234567//evil.example.test/map?train=12',
      '/s/412345678901234567/map?train=//evil.example.test',
      '/s/412345678901234567/map?train=\\\\evil.example.test',
      '/s/412345678901234567/map%3Ftrain=12',
      '/s/412345678901234567/map?train=%2F%2Fevil',
      '/?train=12',
      '/userscript?train=12',
    ]) {
      expect(localPath(path), JSON.stringify(path)).toBeUndefined();
    }
  });
});
