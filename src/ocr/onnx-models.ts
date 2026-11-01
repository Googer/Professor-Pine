import { readFile } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';
import type { OcrAssetPaths, OcrDevice } from '../domain/ocr/assets.js';
import { dictionaryOf } from '../domain/ocr/text-model.js';
import type { ModelRun, TextModels } from './text-reader.js';

/** onnxruntime's names of the devices of `settings.ocr.device`. */
const PROVIDERS: Readonly<Record<OcrDevice, string>> = {
  cpu: 'cpu',
  cuda: 'cuda',
  directml: 'dml',
};

export interface ModelOptions {
  device: OcrDevice;
  /** Threads of one run; 0 leaves it to onnxruntime. */
  threads: number;
}

/**
 * Loads the two models into onnxruntime on the device asked for. A device that cannot be had
 * (no CUDA, not Windows for DirectML) throws here, at the start of the reading process.
 */
export async function loadTextModels(
  paths: OcrAssetPaths,
  options: ModelOptions,
): Promise<TextModels> {
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: [PROVIDERS[options.device]],
    ...(options.threads > 0 ? { intraOpNumThreads: options.threads } : {}),
    // DirectML wants sequential execution and no memory pattern (onnxruntime's documentation).
    ...(options.device === 'directml'
      ? { enableMemPattern: false, executionMode: 'sequential' as const }
      : {}),
  };
  const detector = await ort.InferenceSession.create(paths.detector, sessionOptions);
  const recogniser = await ort.InferenceSession.create(paths.recogniser, sessionOptions);
  return {
    detect: runOf(detector),
    recognise: runOf(recogniser),
    dictionary: dictionaryOf(await readFile(paths.dictionary, 'utf8')),
  };
}

function runOf(session: ort.InferenceSession): ModelRun {
  const [inputName] = session.inputNames;
  const [outputName] = session.outputNames;
  if (inputName === undefined || outputName === undefined) {
    throw new Error('a model without an input or an output');
  }
  return async (input, dims) => {
    const outputs = await session.run({ [inputName]: new ort.Tensor('float32', input, dims) });
    const output = outputs[outputName];
    if (!output || !(output.data instanceof Float32Array)) {
      throw new Error('a model answered something other than float32');
    }
    return { data: output.data, dims: output.dims };
  };
}
