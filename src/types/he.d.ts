// `he` 2 is an ES module with named exports only (no default export) and ships no types;
// `@types/he` still describes the CommonJS 1.x, whose default import type-checks but is
// undefined at run time. These declarations follow `node_modules/he/README.md` of 2.0.0.
declare module 'he' {
  export interface EncodeOptions {
    useNamedReferences?: boolean;
    decimal?: boolean;
    encodeEverything?: boolean;
    strict?: boolean;
    allowUnsafeSymbols?: boolean;
  }

  export interface DecodeOptions {
    isAttributeValue?: boolean;
    strict?: boolean;
  }

  export function encode(text: string, options?: EncodeOptions): string;
  export function decode(html: string, options?: DecodeOptions): string;
  export function escape(text: string): string;
  export function unescape(html: string, options?: DecodeOptions): string;
}
