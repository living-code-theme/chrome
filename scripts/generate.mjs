// Generate only this port's explicitly managed files. Documentation, metadata, captures and releases stay owned.
import assert from "node:assert/strict";
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generate } from "../src/generate.mjs";
import { resolveAll } from "./palette.mjs";

export const root = fileURLToPath(new URL("../", import.meta.url));
export async function generatePort({ directory = root, check = false } = {}) {
  const base = await realpath(directory);
  const allowed = JSON.parse(await readFile(join(base, "scripts/generated.json"), "utf8"));
  assert.ok(Array.isArray(allowed) && allowed.length && allowed.every((p) => typeof p === "string"));
  assert.equal(new Set(allowed).size, allowed.length, "Duplicate managed file");
  const files = generate(resolveAll(JSON.parse(await readFile(join(base, "palette/theme.json"), "utf8"))));
  assert.deepEqual(files.map((f) => f.path).sort(), [...allowed].sort(), "Generated paths must match the port-owned allowlist in scripts/generated.json");
  const prepared = [];
  // Preflight every path and read all current bytes before writing anything.
  for (const { path, content } of files) {
    assert.ok(typeof path === "string" && !isAbsolute(path) && !path.includes("\\") && !path.split("/").some((p) => !p || [".", "..", ".git", "node_modules"].includes(p)), `Unsafe generated path: ${path}`);
    assert.ok(!["README.md", "LICENSE", "package.json", "port.json"].includes(path.split("/").at(-1)), `Documentation and package metadata are not generated: ${path}`);
    const target = join(base, path);
    const parent = relative(base, await realpath(dirname(target)));
    assert.ok(!isAbsolute(parent) && parent !== ".." && !parent.startsWith(`..${sep}`), `Generated path escapes port: ${path}`);
    const info = await lstat(target).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
    assert.ok(!info || info.isFile(), `Generated target must be a regular file, not a symlink: ${path}`);
    assert.equal(typeof content, "string");
    const bytes = await readFile(target).catch((e) => { if (e.code === "ENOENT") return null; throw e; });
    if (!bytes?.equals(Buffer.from(content))) prepared.push({ target, content, path });
  }
  if (check) assert.deepEqual(prepared.map((f) => f.path), [], "Stale generated files; run pnpm build and review the diff");
  else for (const { target, content } of prepared) {
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, target);
  }
  return { files: files.length, changed: prepared.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every((a) => a === "--check"), "Usage: node scripts/generate.mjs [--check]");
  const result = await generatePort({ check: process.argv.includes("--check") });
  console.log(`${process.argv.includes("--check") ? "checked" : "generated"} ${result.files} port-owned files (${result.changed} changed)`);
}
