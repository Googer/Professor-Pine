/**
 * The files the screenshot reader needs, downloaded once into `var/ocr/` and checked by their
 * SHA-256: the PaddleOCR PP-OCRv4 models as ONNX (detection and recognition, Chinese and
 * English, Apache 2.0, the ONNX conversion of `@gutenye/ocr-models` 1.4.2 that the research
 * measured), the recogniser's dictionary, and the game's tier head (PokeMiners' `pogo_assets`).
 * A file that differs from its hash is refused: the reader was measured with these files and no
 * others, so a new version is a change of this list, checked with `npm run ocr:check`.
 */

export const OCR_DEVICES = ['cpu', 'cuda', 'directml'] as const;
export type OcrDevice = (typeof OCR_DEVICES)[number];

/**
 * Why this platform (`process.platform`, `process.arch`) cannot run the reader on the device, or
 * undefined: onnxruntime-node has DirectML on Windows only and CUDA on Linux x64 only.
 */
export function deviceProblem(device: OcrDevice, os: string, arch: string): string | undefined {
  if (device === 'directml' && os !== 'win32') return 'DirectML runs on Windows only';
  if (device === 'cuda' && (os !== 'linux' || arch !== 'x64')) return 'CUDA runs on Linux x64 only';
  return undefined;
}

/** Where `modelsUrl` points by default: a folder; the file names below are appended. */
export const OCR_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets/';

/** At a commit, not a branch: the file a hash names must not move (it last changed 2020-02-27). */
export const OCR_HEAD_ICON_URL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/ic_raid_small.png';

export type OcrAssetName = 'detector' | 'recogniser' | 'dictionary' | 'headIcon';

export interface OcrAsset {
  name: OcrAssetName;
  /** The file's name in `var/ocr/`, and in the models folder for those downloaded from there. */
  file: string;
  /** Downloaded from `modelsUrl` + `file`, or from `headIconUrl`. */
  source: 'models' | 'headIcon';
  bytes: number;
  sha256: string;
}

export const OCR_ASSETS: readonly OcrAsset[] = [
  {
    name: 'detector',
    file: 'ch_PP-OCRv4_det_infer.onnx',
    source: 'models',
    bytes: 4_745_517,
    sha256: '30a86f5731181461d08021402766601e4302a9b9b9666be8aff402696339cdff',
  },
  {
    name: 'recogniser',
    file: 'ch_PP-OCRv4_rec_infer.onnx',
    source: 'models',
    bytes: 10_822_323,
    sha256: '06b3e6af6c59a1ba5d53790ed8c2e4b2de389870b6cf5a97f349f3412cb269c0',
  },
  {
    name: 'dictionary',
    file: 'ppocr_keys_v1.txt',
    source: 'models',
    bytes: 26_249,
    sha256: '28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7',
  },
  {
    name: 'headIcon',
    file: 'ic_raid_small.png',
    source: 'headIcon',
    bytes: 4_265,
    sha256: '4ff184e4b112c381307de4726abab66e8a03e2260bba389288abdd135249a7cc',
  },
];

/** The local paths of the files, by name. */
export type OcrAssetPaths = Readonly<Record<OcrAssetName, string>>;
