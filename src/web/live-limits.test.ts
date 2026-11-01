import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { webServerWith, type TestWeb } from '../../test/support/web.js';

const API = `/s/${FAKE_GUILD_ID}/api`;

describe('the limits of a live page, 12 asks of each list a minute behind a shared address', () => {
  let web: TestWeb;
  afterEach(async () => {
    await web.app.close();
  });

  /** How many requests one address got through in a minute. */
  async function allowed(url: string, upTo: number): Promise<number> {
    web = webServerWith();
    for (let n = 0; n < upTo; n++) {
      const answer = await web.app.inject({ method: 'GET', url });
      if (answer.statusCode === 429) return n;
    }
    return upTo;
  }

  it('lets an address ask for the parties 120 times', async () => {
    expect(await allowed(`${API}/parties`, 200)).toBe(120);
  });

  it('lets an address ask for the reports at stops 120 times', async () => {
    expect(await allowed(`${API}/stop-reports`, 200)).toBe(120);
  });

  it('lets an address ask for the posts 480 times', async () => {
    expect(await allowed(`${API}/parties/some-party/post`, 600)).toBe(480);
  });

  it('lets an address open the stream 30 times', async () => {
    expect(await allowed(`${API}/live`, 60)).toBe(30);
  });
});
