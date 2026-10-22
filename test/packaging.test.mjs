import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("the built native package actually contains reviewed icons and current marketplace metadata", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const port = JSON.parse(await read("port.json"));
  const icons = JSON.parse(await read("scripts/icon-sources.json"));
  execFileSync(process.execPath, ["scripts/package.mjs"], { cwd: root, timeout: 30000 });
  const targets = pkg.livingCode.kind === "jetbrains"
    ? [{ path: `dist/living-code-jetbrains-${pkg.version}.zip`, prefix: "" }]
    : port.flavors.map((flavor) => ({ path: `dist/living-code-${pkg.livingCode.kind}-${flavor}.${pkg.livingCode.kind === "firefox" ? "xpi" : "zip"}`, prefix: `living-code-${flavor}/` }));
  for (const target of targets) {
    const contents = JSON.parse(execFileSync("python3", ["-c", `
import base64,io,json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as outer:
    data=outer.read('living-code/lib/living-code.jar') if sys.argv[1].endswith('.zip') and 'living-code/lib/living-code.jar' in outer.namelist() else None
    archive=zipfile.ZipFile(io.BytesIO(data)) if data else outer
    print(json.dumps({n:base64.b64encode(archive.read(n)).decode() for n in archive.namelist() if not n.endswith('/')}))
`, target.path], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }));
    const entries = new Map(Object.entries(contents).map(([name, encoded]) => [name, Buffer.from(encoded, "base64")]));
    for (const icon of icons.icons) {
      const paths = pkg.livingCode.kind === "jetbrains" ? [icon.source] : icon.outputs.map((output) => output.path).filter((path) => path.startsWith(target.prefix));
      for (const path of paths) assert.deepEqual(entries.get(path.slice(target.prefix.length)), await read(path), `Wrong icon inside archive: ${path}`);
    }
    if (pkg.livingCode.kind === "jetbrains") {
      const xml = entries.get("META-INF/plugin.xml").toString("utf8");
      assert.ok(xml.includes(`<version>${pkg.version}</version>`));
      assert.ok(xml.includes('<vendor url="https://living-code.dev">Living Code</vendor>'));
      assert.doesNotMatch(xml, /<img\b|<picture\b|!\[[^\r\n]*\]\(/i, "Screenshots belong in the Marketplace gallery");
      assert.equal((xml.match(/<themeProvider /g) ?? []).length, 4);
    } else {
      const manifest = JSON.parse(entries.get("manifest.json"));
      assert.equal(manifest.version, pkg.version);
      assert.ok(manifest.name.startsWith("Living Code "));
      for (const path of Object.values(manifest.icons)) assert.ok(entries.has(path));
    }
  }
});
