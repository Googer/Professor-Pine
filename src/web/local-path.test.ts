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
});
