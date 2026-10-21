#!/usr/bin/env node
// Port-owned, dependency-free checks. Landing discovery performs its own full schema/README/image validation.
import assert from "node:assert/strict";
import { generatePort } from "./generate.mjs";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export const root = fileURLToPath(new URL("../", import.meta.url));
const order = ["night", "frost", "paper", "signal"];
const headings = ["Previews", "Installation", "Flavors", "Configuration", "Compatibility", "Contributing", "License"];

export async function check(directory = root) {
  const base = await realpath(directory);
  const read = async (path, limit = 1024 * 1024) => {
    assert.ok(typeof path === "string" && path && !path.includes("\\") && !isAbsolute(path) && !path.split("/").some((part) => [".", "..", ".git", "node_modules"].includes(part)), `Unsafe repository path: ${path}`);
    const absolute = await realpath(join(base, path));
    const within = relative(base, absolute);
    assert.ok(!isAbsolute(within) && within !== ".." && !within.startsWith(`..${sep}`), `Path escapes repository: ${path}`);
    const info = await stat(absolute);
    assert.ok(info.isFile() && info.size <= limit, `Missing or oversized file: ${path}`);
    return readFile(absolute);
  };
  const manifest = JSON.parse(await read("port.json", 32 * 1024));
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.name && manifest.group && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug));
  assert.ok(manifest.flavors.length && new Set(manifest.flavors).size === manifest.flavors.length && manifest.flavors.every((id) => order.includes(id)));
  assert.ok(manifest.files.length && manifest.files.length <= 100 && new Set(manifest.files).size === manifest.files.length);
  for (const path of manifest.files) await read(path);
  const imageFlavors = new Set();
  for (const image of manifest.images) {
    assert.ok(manifest.flavors.includes(image.flavor) && !imageFlavors.has(image.flavor) && image.alt);
    imageFlavors.add(image.flavor);
    const bytes = await read(image.path, 10 * 1024 * 1024);
    assert.ok(bytes.length, `Empty image: ${image.path}`);
    if (image.path.endsWith(".png")) {
      assert.ok(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Invalid PNG: ${image.path}`);
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      assert.ok(width && height && width <= 16384 && height <= 16384 && width * height <= 20_000_000, `Oversized PNG: ${image.path}`);
    }
  }
  const readme = (await read("README.md", 512 * 1024)).toString("utf8");
  assert.ok(readme.trimStart().startsWith("<!-- living-code-readme:1 -->"));
  assert.ok(readme.includes(`# ${manifest.emoji} Living Code for ${manifest.name}`));
  assert.doesNotMatch(readme, /\{\{(?:INSTALLATION|CONFIGURATION|COMPATIBILITY|PORT_EMOJI|PORT_NAME|DESCRIPTION|PREVIEWS|FLAVORS|[A-Z]+_USAGE)\}\}/);
  let fence = null;
  const sections = [], titles = [];
  for (const line of readme.split("\n")) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    if (/^## /.test(line)) sections.push(line.slice(3));
    if (/^# /.test(line)) titles.push(line);
  }
  assert.equal(titles.length, 1);
  assert.deepEqual(sections, headings);
  assert.deepEqual([...readme.matchAll(/<details\s+data-lc-flavor="([a-z]+)"/g)].map((match) => match[1]), order.filter((id) => manifest.flavors.includes(id)));
  for (const image of manifest.images) assert.ok(readme.split(`src="${image.path}"`).length >= 3, `README must include comparison and flavor capture: ${image.path}`);
  if (pkg.contributes?.themes) {
    for (const theme of pkg.contributes.themes) await read(theme.path.replace(/^\.\//, ""));
    await read(pkg.icon);
  }
  if (pkg.livingCode.kind === "jetbrains") {
    const xml = (await read("META-INF/plugin.xml")).toString("utf8");
    assert.ok(xml.includes(`<version>${pkg.version}</version>`), "Keep package.json and plugin.xml versions in sync");
  }
  if (pkg.livingCode.kind === "obsidian") assert.equal(JSON.parse(await read("manifest.json")).version, pkg.version, "Keep package.json and manifest.json versions in sync");
  if (["firefox", "chrome"].includes(pkg.livingCode.kind)) {
    for (const flavor of manifest.flavors) {
      const browser = JSON.parse(await read(`living-code-${flavor}/manifest.json`));
      for (const icon of Object.values(browser.icons)) await read(`living-code-${flavor}/${icon}`);
    }
  }
  for (const path of Object.values(pkg.exports ?? {})) if (typeof path === "string") await read(path.replace(/^\.\//, ""));
  await generatePort({ directory: base, check: true });
  return { manifest, pkg };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { manifest } = await check();
  console.log(`${manifest.name}: metadata, README, implementation, captures and package references passed`);
}
