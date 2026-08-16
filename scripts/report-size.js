import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const DIST_DIRECTORY = new URL('../dist/', import.meta.url);
const COMPRESSIBLE_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg']);

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

function kilobytes(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

const directoryPath = fileURLToPath(DIST_DIRECTORY);
const files = await filesWithin(directoryPath);
const rows = [];
let totalBytes = 0;

for (const path of files.sort()) {
  const contents = await readFile(path);
  totalBytes += contents.byteLength;
  const compressible = COMPRESSIBLE_EXTENSIONS.has(extname(path));
  rows.push({
    file: relative(directoryPath, path),
    rawKB: kilobytes(contents.byteLength),
    gzipKB: compressible ? kilobytes(gzipSync(contents, { level: 9 }).byteLength) : '—',
    brotliKB: compressible
      ? kilobytes(
          brotliCompressSync(contents, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }).byteLength,
        )
      : '—',
  });
}

console.table(rows);
console.log(`Total emitted: ${kilobytes(totalBytes)} KB`);
