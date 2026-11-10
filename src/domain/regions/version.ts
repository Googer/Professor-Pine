import type { LatLon } from '@pine/wayspot-core/lat-lon';

/**
 * The version of a region (spec 4.6): what the region editor loaded a region as, so that a save
 * can refuse to overwrite what another editor (or `/region import`) changed meanwhile. Pure, so
 * that the server and the page compute it alike: SHA-256 is written out here, since the page
 * has no synchronous hash and the domain imports nothing of node.
 */

/** The round constants of SHA-256 (FIPS 180-4, 4.2.2). */
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotate = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** The SHA-256 of a text's UTF-8 bytes (FIPS 180-4). */
export function sha256(text: string): Uint8Array {
  const message = new TextEncoder().encode(text);
  // The message, a 1 bit, zeros, and its length in bits as 64 bits: a multiple of 64 bytes.
  const length = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(length);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = message.length * 8;
  view.setUint32(length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(length - 4, bits >>> 0);
  const hash = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let block = 0; block < length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i++) {
      const t1 =
        (h +
          (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
          ((e & f) ^ (~e & g)) +
          (K[i] ?? 0) +
          (w[i] ?? 0)) >>>
        0;
      const t2 =
        ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const sums = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i++) hash[i] = ((hash[i] ?? 0) + (sums[i] ?? 0)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, hash[i] ?? 0);
  return out;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Bytes as base64url, without padding (RFC 4648, 5). */
export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    text += ALPHABET[(n >> 18) & 63] ?? '';
    text += ALPHABET[(n >> 12) & 63] ?? '';
    if (b !== undefined) text += ALPHABET[(n >> 6) & 63] ?? '';
    if (c !== undefined) text += ALPHABET[n & 63] ?? '';
  }
  return text;
}

/** A coordinate at six decimals (about 10 cm), minus zero as zero. */
export function roundSix(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/** A coordinate as the version reads it: `roundSix`, written with its six decimals. */
const sixDecimals = (value: number): string => roundSix(value).toFixed(6);

/**
 * An outline as the region editor keeps and saves it, wherever it comes from (drawn, split, of a
 * file, sent to the server): each corner at six decimals (`roundSix`, as the editor's data gives
 * them), and a corner the rounding made equal to the one before it dropped. So the page and the
 * server see the same corners, and an outline saved has the version it was drawn with.
 */
export function normalisedOutline(outline: readonly LatLon[]): LatLon[] {
  const corners: LatLon[] = [];
  for (const { lat, lon } of outline) {
    const corner = { lat: roundSix(lat), lon: roundSix(lon) };
    const last = corners[corners.length - 1];
    if (!last || last.lat !== corner.lat || last.lon !== corner.lon) corners.push(corner);
  }
  return corners;
}

/**
 * What the version of a region is the hash of: its corners at six decimals (as the editor's data
 * gives them), the ring closed, then its description (none and empty alike). An outline read
 * back at six decimals has the version of the one it was read from.
 */
export function versionText(outline: readonly LatLon[] | null, description: string | null): string {
  const corners = (outline ?? []).map(({ lat, lon }) => `${sixDecimals(lat)},${sixDecimals(lon)}`);
  const [first] = corners;
  if (first !== undefined && corners[corners.length - 1] !== first) corners.push(first);
  return `${corners.join(';')}|${description ?? ''}`;
}

/**
 * The version of a region: base64url of the SHA-256 of `versionText`, cut to 16 characters
 * (96 bits: two versions of one region never meet by chance).
 */
export function regionVersion(
  outline: readonly LatLon[] | null,
  description: string | null,
): string {
  return base64url(sha256(versionText(outline, description))).slice(0, 16);
}
