import sharp from 'sharp';
import { scaledBox, type RgbImage, type TextLine } from '../domain/ocr/image.js';
import {
  ctcDecode,
  detectorSize,
  groupLines,
  LINE_HEIGHT,
  lineWidth,
  modelInput,
  textBoxes,
} from '../domain/ocr/text-model.js';

/** One run of a model: an input tensor in, the first output out. */
export type ModelRun = (
  input: Float32Array,
  dims: readonly number[],
) => Promise<{ data: Float32Array; dims: readonly number[] }>;

/** The two models of the reader and the recogniser's dictionary (`dictionaryOf`). */
export interface TextModels {
  detect: ModelRun;
  recognise: ModelRun;
  dictionary: readonly string[];
}

/** Reads the lines of text of a picture, their boxes in its pixels. */
export type ReadText = (image: RgbImage) => Promise<TextLine[]>;

const raw = (image: RgbImage) => ({
  raw: { width: image.width, height: image.height, channels: 3 as const },
});

/**
 * The reader over the two models: the picture scaled to the detector's size, the boxes of text
 * in the detector's map, each box cut out and scaled to the recogniser's height and read alone
 * (lines read in padded batches were neither faster nor as good), the pieces of one row joined.
 */
export function textReader(models: TextModels): ReadText {
  return async (image) => {
    const size = detectorSize(image.width, image.height);
    const scaled = await sharp(image.data, raw(image))
      .resize(size.width, size.height, { fit: 'fill' })
      .raw()
      .toBuffer();
    const input: RgbImage = { ...size, data: scaled };
    const map = await models.detect(modelInput(input), [1, 3, size.height, size.width]);
    const pieces: TextLine[] = [];
    for (const box of textBoxes(map.data, size.width, size.height)) {
      const width = lineWidth(box);
      const crop = await sharp(scaled, raw(input))
        .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 })
        .resize(width, LINE_HEIGHT, { fit: 'fill' })
        .raw()
        .toBuffer();
      const output = await models.recognise(
        modelInput({ width, height: LINE_HEIGHT, data: crop }),
        [1, 3, LINE_HEIGHT, width],
      );
      const [, steps = 0, classes = 0] = output.dims;
      const read = ctcDecode(output.data, 0, steps, classes, models.dictionary);
      pieces.push({
        ...read,
        box: scaledBox(box, image.width / size.width, image.height / size.height),
      });
    }
    return groupLines(pieces);
  };
}
