import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveAll } from "../scripts/palette.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every supported flavor has a current native 2x screenshot that actually contains teal", async () => {
  execFileSync("python3", ["scripts/capture.py", "--check"], { cwd: root });
  const capture = JSON.parse(await read("images/capture.json"));
  assert.deepEqual(Object.keys(capture.images).sort(), ["night", "paper"]);
  for (const flavor of resolveAll().filter((f) => ["night", "paper"].includes(f.id))) {
    assert.ok(capture.images[flavor.id].application.startsWith("Chromium "));
    assert.ok(capture.images[flavor.id].paletteColors.includes(flavor.r("accent")), "Don't advertise teal without observing it in the actual native image");
  }
});

test("capture isolates English UI and blocks location-dependent remote New Tab promotions", async () => {
  const app = await read("capture/app.py"), inspect = await read("capture/inspect.mjs");
  assert.ok(app.includes("--lang=en-US") && app.includes("--accept-lang=en-US,en"));
  assert.ok(app.includes("--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost"));
  assert.ok(inspect.includes("navigator.language") && inspect.includes('evidence.title, "New Tab"'));
  for (const path of ["capture/fixtures/start.html", "capture/fixtures/docs.html"]) assert.ok((await read(path)).includes('lang="en"'));
});
