import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkIcons } from "../scripts/icons.mjs";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("all installable icons use reviewed [lc] outlines and matching raster fingerprints", async () => {
  const icons = await checkIcons();
  const port = JSON.parse(await read("port.json"));
  const pkg = JSON.parse(await read("package.json"));
  const covered = new Set(icons.icons.flatMap((icon) => [icon.source, ...icon.outputs.map((output) => output.path)]));
  const required = port.files.filter((path) => /(?:pluginIcon(?:_dark)?\.svg|icon(?:-\d+)?\.(?:svg|png))$/.test(path));
  if (pkg.icon) required.push(pkg.icon);
  assert.ok(required.length);
  for (const path of required) assert.ok(covered.has(path), `Unreviewed installable icon: ${path}`);
});

test("relabelling an SVG as [lc] cannot conceal stale or substituted glyphs", async () => {
  const manifest = JSON.parse(await read("scripts/icon-sources.json"));
  const icon = manifest.icons[0];
  const original = await read(icon.source);
  const altered = Buffer.from(original.toString().replace('d="M389 0', 'd="M388 0'));
  assert.notDeepEqual(altered, original);
  icon.sha256 = hash(altered); // Even updating the snapshot must not authorize different letterforms.
  await assert.rejects(checkIcons((path) => path === "scripts/icon-sources.json"
    ? Promise.resolve(Buffer.from(JSON.stringify(manifest)))
    : path === icon.source ? Promise.resolve(altered) : read(path)), /Icon must draw \[lc\]/);
});

test("old or corrupted rasters cannot pass packaging with a current SVG", async (t) => {
  const manifest = JSON.parse(await read("scripts/icon-sources.json"));
  const output = manifest.icons.flatMap((icon) => icon.outputs)[0];
  if (!output) return t.skip("This native package uses SVG icons only");
  const stale = Buffer.from(await read(output.path));
  stale[stale.length - 1] ^= 1;
  await assert.rejects(checkIcons((path) => path === output.path ? Promise.resolve(stale) : read(path)), /Unreviewed raster change/);
});
