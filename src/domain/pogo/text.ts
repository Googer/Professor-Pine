/** Parses the game's text file: blocks of `RESOURCE ID: <key>` followed by `TEXT: <value>`. */
export function parseTextFile(content: string): Map<string, string> {
  const texts = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const key = /^RESOURCE ID: (.+)$/.exec(lines[i] ?? '')?.[1]?.trim();
    const next = lines[i + 1] ?? '';
    if (key && next.startsWith('TEXT: ')) texts.set(key, next.slice('TEXT: '.length));
  }
  return texts;
}
