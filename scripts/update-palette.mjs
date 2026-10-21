// Explicit maintainer operation: adopt data from a committed local core revision. Never run during install/build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { root, sha256, validatePalette } from "./palette.mjs";

export async function updatePalette(coreDirectory, { directory = fileURLToPath(root) } = {}) {
  assert.ok(coreDirectory, "Usage: pnpm palette:update /path/to/core");
  const core = await realpath(coreDirectory);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/.test(key)));
  const revision = execFileSync("git", ["-C", core, "rev-parse", "HEAD"], { env, encoding: "utf8" }).trim();
  const path = join(core, "exports/ports/palette.json");
  const bytes = await readFile(path);
  assert.ok(bytes.length <= 1024 * 1024, "Oversized palette snapshot");
  const snapshot = JSON.parse(bytes);
  assert.deepEqual(Object.keys(snapshot.source.inputs).sort(), ["palette/flavors.mjs", "src/color.mjs", "src/resolve.mjs"]);
  for (const [input, hash] of Object.entries(snapshot.source.inputs)) {
    const committed = execFileSync("git", ["-C", core, "show", `${revision}:${input}`], { env });
    assert.equal(sha256(committed), hash, `Core export does not match committed ${input}; run pnpm build in a clean core checkout`);
    assert.equal(sha256(await readFile(join(core, input))), hash, `Core ${input} has uncommitted palette changes`);
  }
  snapshot.source.revision = revision;
  validatePalette(snapshot);
  const destination = await realpath(directory);
  assert.equal(sha256(await readFile(join(destination, "scripts/color.mjs"))), snapshot.source.inputs["src/color.mjs"], "Core color math changed: review and copy its committed src/color.mjs to scripts/color.mjs before adopting this palette");
  const target = join(destination, "palette/theme.json");
  assert.equal(await realpath(target), target, "Pinned palette must not be a symlink");
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, target);
  return revision;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, "Usage: pnpm palette:update /path/to/core");
  console.log(`Adopted core ${await updatePalette(process.argv[2])}. Run pnpm build, pnpm test and review this port's diff.`);
}
