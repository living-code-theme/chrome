import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, mkdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generate } from "../src/generate.mjs";
import { generatePort } from "../scripts/generate.mjs";
import { resolveAll, sha256, validatePalette } from "../scripts/palette.mjs";
import { updatePalette } from "../scripts/update-palette.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));

test("the pinned palette regenerates every managed file byte for byte", async () => {
  const result = await generatePort({ check: true });
  assert.ok(result.files > 0);
  assert.equal(result.changed, 0);
});

test("generation is deterministic, pure and depends on palette data rather than embedded hex values", () => {
  const flavors = resolveAll();
  const before = JSON.stringify(flavors);
  const output = generate(flavors);
  assert.deepEqual(generate(flavors), output);
  assert.equal(JSON.stringify(flavors), before, "do not mutate palette inputs");
  assert.equal(new Set(output.map((f) => f.path)).size, output.length);
  assert.ok(output.every((f) => !/^(README.md|port.json|package.json|LICENSE)$/.test(f.path)));
  for (const f of flavors) {
    for (const [name, color] of Object.entries(f.colors)) {
      color.hex = "#123456";
      color.css = "oklch(0.4 0.03 160)";
      f.raw[name] = [0.4, 0.03, 160];
    }
    f.ansi.normal.fill("#123456");
    f.ansi.bright.fill("#123456");
    f.roles.probe = "base";
  }
  assert.notDeepEqual(generate(flavors), output, "palette changes must reach generated output");
});

test("a changed palette cannot silently keep a stale source fingerprint", async () => {
  const snapshot = JSON.parse(await readFile(join(root, "palette/theme.json"), "utf8"));
  validatePalette(snapshot);
  snapshot.flavors[0].colors.base.hex = "#123456";
  assert.throws(() => validatePalette(snapshot), /fingerprint mismatch/);
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "living-code-generation-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "scripts"));
  await mkdir(join(dir, "palette"));
  await cp(join(root, "scripts/generated.json"), join(dir, "scripts/generated.json"));
  await cp(join(root, "scripts/color.mjs"), join(dir, "scripts/color.mjs"));
  await cp(join(root, "palette/theme.json"), join(dir, "palette/theme.json"));
  for (const { path, content } of generate(resolveAll())) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  await writeFile(join(dir, "README.md"), "Port-owned documentation\n");
  return dir;
}

test("check mode writes nothing; an explicit build updates only allowed theme files", async (t) => {
  const dir = await fixture(t);
  const [{ path }] = generate(resolveAll());
  await writeFile(join(dir, path), "stale theme\n");
  await assert.rejects(generatePort({ directory: dir, check: true }), /Stale generated files/);
  assert.equal(await readFile(join(dir, path), "utf8"), "stale theme\n");
  assert.equal((await generatePort({ directory: dir })).changed, 1);
  assert.equal((await generatePort({ directory: dir, check: true })).changed, 0);
  assert.equal(await readFile(join(dir, "README.md"), "utf8"), "Port-owned documentation\n");
});

test("generation rejects undeclared outputs and symlink targets before any writes", async (t) => {
  const dir = await fixture(t);
  const [{ path }] = generate(resolveAll());
  const allowlist = await readFile(join(dir, "scripts/generated.json"), "utf8");
  await writeFile(join(dir, "scripts/generated.json"), JSON.stringify(["../outside"]));
  await assert.rejects(generatePort({ directory: dir }), /port-owned allowlist/);
  await writeFile(join(dir, "scripts/generated.json"), allowlist);
  const outside = join(dir, "outside.txt");
  await writeFile(outside, "keep me\n");
  await unlink(join(dir, path));
  await symlink(outside, join(dir, path));
  await assert.rejects(generatePort({ directory: dir }), /not a symlink/);
  assert.equal(await readFile(outside, "utf8"), "keep me\n");
});

test("palette adoption is explicit, revision-pinned and rejects dirty or stale core exports", async (t) => {
  const dir = await fixture(t);
  const core = join(dir, "core-fixture");
  await mkdir(join(core, "exports/ports"), { recursive: true });
  const snapshot = JSON.parse(await readFile(join(dir, "palette/theme.json"), "utf8"));
  for (const path of Object.keys(snapshot.source.inputs)) {
    await mkdir(dirname(join(core, path)), { recursive: true });
    const content = path === "src/color.mjs" ? await readFile(join(root, "scripts/color.mjs"), "utf8") : `test core input: ${path}\n`;
    await writeFile(join(core, path), content);
    snapshot.source.inputs[path] = sha256(content);
  }
  await writeFile(join(core, "exports/ports/palette.json"), JSON.stringify(snapshot));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/.test(key)));
  const git = (...args) => execFileSync("git", ["-C", core, ...args], { env, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "test");
  const revision = git("rev-parse", "HEAD");
  assert.equal(await updatePalette(core, { directory: dir }), revision);
  const pinned = JSON.parse(await readFile(join(dir, "palette/theme.json"), "utf8"));
  assert.equal(pinned.source.revision, revision);
  await writeFile(join(core, "palette/flavors.mjs"), "uncommitted change\n");
  await assert.rejects(updatePalette(core, { directory: dir }), /uncommitted palette changes/);
  assert.deepEqual(JSON.parse(await readFile(join(dir, "palette/theme.json"), "utf8")), pinned);
  snapshot.source.inputs["palette/flavors.mjs"] = sha256("uncommitted change\n");
  await writeFile(join(core, "exports/ports/palette.json"), JSON.stringify(snapshot));
  await assert.rejects(updatePalette(core, { directory: dir }), /does not match committed/);
});
