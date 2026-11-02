# The contracts with the Wayfarer export tool

The Pine Wayfarer export tool, kept in a repository of its own, reads these files in its tests:

- `export-v1.json` and `export-v1.json.gz`: a version-1 export, as the tool saves it and `/gym import` reads it (`src/export-contract.test.ts`).
- `import-report.csv`: the report `/gym import` attaches; the tool's tests read this file (`src/render/wayfarer-report.contract.test.ts` in Pine).

They are pinned byte for byte (`.gitattributes`: never converted). A change to either one is a change of the contract: check it against the tool before the file is made anew.
