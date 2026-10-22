#!/usr/bin/env node
// Explicit maintenance step: resize verified real captures, never generate/recolor a browser UI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync("python3", [join(root, "scripts/capture.py"), "--check"]);
const destination = join(root, "dist/store");
await mkdir(destination, { recursive: true });
for (const flavor of ["night", "paper"]) {
  const path = join(destination, `living-code-chrome-${flavor}.png`);
  execFileSync("magick", [join(root, `images/${flavor}.png`), "-resize", "1280x800", "-strip", path]);
  const bytes = await readFile(path);
  assert.equal(bytes.readUInt32BE(16), 1280);
  assert.equal(bytes.readUInt32BE(20), 800);
  console.log(path);
}
