import type { RgbImage } from './image.js';

/**
 * How much of the middle of a raid screen (x 10–90%, y 35–85%, where the egg or the boss
 * stands) is the saturated purple of shadow smoke: hue 255–300°, saturation at least 0.45,
 * value at least 0.25. On the research's samples a shadow raid had 4.3–15.6% and every other
 * at most 0.05%, at dawn too. A hint only: a hatched raid's boss decides.
 */
export function purpleShare(image: RgbImage): number {
  const x0 = Math.round(image.width * 0.1);
  const x1 = x0 + Math.round(image.width * 0.8);
  const y0 = Math.round(image.height * 0.35);
  const y1 = y0 + Math.round(image.height * 0.5);
  let purple = 0;
  let all = 0;
  for (let y = y0; y < Math.min(y1, image.height); y++) {
    for (let x = x0; x < Math.min(x1, image.width); x++) {
      all++;
      const k = (y * image.width + x) * 3;
      const r = (image.data[k] ?? 0) / 255;
      const g = (image.data[k + 1] ?? 0) / 255;
      const b = (image.data[k + 2] ?? 0) / 255;
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (max < 0.25 || d / max < 0.45) continue;
      let hue: number;
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue = (hue * 60 + 360) % 360;
      if (hue >= 255 && hue <= 300) purple++;
    }
  }
  return all === 0 ? 0 : purple / all;
}

/** A raid whose screen has more purple than this looks like a shadow raid. */
export const SHADOW_SHARE = 0.01;
