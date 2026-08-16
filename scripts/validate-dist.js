import { Buffer } from 'node:buffer';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIRECTORY = new URL('../dist/', import.meta.url);
const MAX_JAVASCRIPT_BYTES = 2 * 1024 * 1024;
const IMPORT_PATTERNS = [
  /\bimport\s*(?:[^"'();]*?\s+from\s*)?(["'])([^"']+)\1/g,
  /\bexport\s+[^"'();]*?\s+from\s*(["'])([^"']+)\1/g,
];

async function filesWithin(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesWithin(path)));
    else files.push(path);
  }
  return files;
}

function isBareSpecifier(specifier) {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !/^[a-z][a-z\d+.-]*:/i.test(specifier)
  );
}

const directoryPath = fileURLToPath(DIST_DIRECTORY);
const files = (await filesWithin(directoryPath)).filter((path) =>
  ['.js', '.mjs'].includes(extname(path)),
);
const failures = [];

for (const path of files) {
  const contents = await readFile(path, 'utf8');
  const name = relative(directoryPath, path);

  if (Buffer.byteLength(contents) > MAX_JAVASCRIPT_BYTES) {
    failures.push(`${name}: exceeds the 2 MB built-JavaScript limit`);
  }
  if (contents.includes('data:application/wasm')) {
    failures.push(`${name}: contains an inline WebAssembly binary`);
  }
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of contents.matchAll(pattern)) {
      if (isBareSpecifier(match[2])) {
        failures.push(`${name}: contains unresolved import ${JSON.stringify(match[2])}`);
      }
    }
  }
}

if (failures.length) {
  throw new Error(`Invalid distribution:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log(`Validated ${files.length} built JavaScript files for portable imports and assets.`);
