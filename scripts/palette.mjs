// Port-owned reader for a pinned, app-agnostic core palette. No network or sibling imports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hex, mix } from "./color.mjs";

export const ANSI_ORDER = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];
export const root = new URL("../", import.meta.url);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validatePalette(snapshot) {
  assert.equal(snapshot.schemaVersion, 1, "Unsupported pinned palette");
  assert.equal(snapshot.source?.repository, "https://github.com/living-code-theme/core");
  assert.match(snapshot.source.revision, /^[a-f0-9]{40}$/, "Pin a core Git revision");
  const { source, ...data } = snapshot;
  assert.equal(sha256(JSON.stringify(data)), source.sha256, "Pinned palette fingerprint mismatch; adopt a verified core export");
  assert.deepEqual(snapshot.ansiOrder, ANSI_ORDER);
  assert.deepEqual(snapshot.flavors.map((f) => f.id), ["night", "frost", "paper", "signal"]);
  for (const f of snapshot.flavors) {
    assert.equal(f.slug, `living-code-${f.id}`);
    for (const value of Object.values(f.colors)) assert.match(value.hex, /^#[a-f0-9]{6}$/);
    for (const name of Object.values(f.roles)) assert.ok(Object.hasOwn(f.colors, name), `Unknown role color ${name}`);
    for (const values of Object.values(f.raw)) assert.ok(values.length === 3 && values.every(Number.isFinite));
    for (const group of ["normal", "bright"]) {
      assert.equal(f.ansi[group].length, 8);
      for (const value of f.ansi[group]) assert.match(value, /^#[a-f0-9]{6}$/);
    }
  }
  return snapshot;
}

export function resolveAll(input = JSON.parse(readFileSync(new URL("palette/theme.json", root), "utf8"))) {
  const snapshot = validatePalette(structuredClone(input));
  assert.equal(sha256(readFileSync(new URL("./color.mjs", import.meta.url))), snapshot.source.inputs["src/color.mjs"], "Vendored color math does not match the pinned palette");
  return snapshot.flavors.map((f) => {
    f.c = (name) => f.colors[name].hex;
    f.r = (role) => f.c(f.roles[role]);
    f.rr = (role) => f.raw[f.roles[role]];
    f.resolve = (value) => Array.isArray(value) ? value : f.raw[value] ?? f.raw[f.roles[value]];
    f.mix = (a, b, amount) => hex(mix(f.resolve(a), f.resolve(b), amount));
    f.ansi16 = (name) => name.startsWith("bright") ? f.ansi.bright[ANSI_ORDER.indexOf(name.slice(6))] : f.ansi.normal[ANSI_ORDER.indexOf(name)];
    return f;
  });
}
export const resolveFlavor = (id) => {
  const flavor = resolveAll().find((f) => f.id === id);
  assert.ok(flavor, `Unknown flavor ${id}`);
  return flavor;
};
