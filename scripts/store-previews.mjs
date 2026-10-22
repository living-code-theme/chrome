#!/usr/bin/env node
// Export verified native port images byte-for-byte. Never resize, recolor or reconstruct them.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync("python3", [join(root, "scripts/capture.py"), "--check"]);
const destination = join(root, "dist/store");
await mkdir(destination, { recursive: true });
for (const flavor of ["night", "paper"]) {
  const source = join(root, `images/${flavor}.png`);
  const bytes = await readFile(source);
  assert.equal(bytes.readUInt32BE(16), 2560);
  assert.equal(bytes.readUInt32BE(20), 1600);
  const path = join(destination, `living-code-chrome-${flavor}.png`);
  await copyFile(source, path);
  assert.deepEqual(await readFile(path), bytes);
  console.log(path);
}
