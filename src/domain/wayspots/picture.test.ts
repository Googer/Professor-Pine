import { describe, expect, it } from 'vitest';
import { WAYSPOT_PICTURE_SIZE, wayspotPicture } from './picture.js';

describe('wayspotPicture', () => {
  it("asks Google's image CDN for a small picture: the longest side 400 pixels", () => {
    expect(WAYSPOT_PICTURE_SIZE).toBe(400);
    expect(wayspotPicture('https://lh3.googleusercontent.com/abc-DEF_123')).toBe(
      'https://lh3.googleusercontent.com/abc-DEF_123=s400',
    );
  });

  it('replaces the size an address asks for already, and keeps its query', () => {
    expect(wayspotPicture('https://lh3.googleusercontent.com/abc-DEF_123=s1600')).toBe(
      'https://lh3.googleusercontent.com/abc-DEF_123=s400',
    );
    expect(wayspotPicture('https://lh3.googleusercontent.com/abc=w800-h600-k-no')).toBe(
      'https://lh3.googleusercontent.com/abc=s400',
    );
    expect(wayspotPicture('https://lh3.googleusercontent.com/p/abc=s0?authuser=0')).toBe(
      'https://lh3.googleusercontent.com/p/abc=s400?authuser=0',
    );
  });

  it('shows a picture on the same host by plain http as https: Google serves both', () => {
    expect(wayspotPicture('http://lh3.googleusercontent.com/abc-DEF_123=s1600')).toBe(
      'https://lh3.googleusercontent.com/abc-DEF_123=s400',
    );
    expect(wayspotPicture('http://lh3.googleusercontent.com:8080/abc')).toBeUndefined();
    expect(wayspotPicture('http://lh3.googleusercontent.com.example.com/abc')).toBeUndefined();
  });

  it('shows nothing else: no picture, another host, a look-alike, a broken address', () => {
    for (const url of [
      null,
      undefined,
      '',
      'ftp://lh3.googleusercontent.com/abc',
      'https://lh3.googleusercontent.com.example.com/abc',
      'https://evil.example/lh3.googleusercontent.com/abc',
      'https://user@lh3.googleusercontent.com/abc',
      'http://user@lh3.googleusercontent.com/abc',
      'https://lh3.googleusercontent.com:8443/abc',
      'not an address',
      'javascript:alert(1)',
    ]) {
      expect([url, wayspotPicture(url)]).toEqual([url, undefined]);
    }
  });
});
