#!/usr/bin/env node
// Package this repository's committed files. No other checkout or install step is needed.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { check, root } from "./check.mjs";
import { zip } from "./zip.mjs";

const { manifest, pkg } = await check();
const out = join(root, "dist");
await mkdir(out, { recursive: true });
const read = (path) => readFile(join(root, path));
const write = async (name, bytes) => { await writeFile(join(out, name), bytes); console.log(`dist/${name}`); };
const payload = async (paths) => Promise.all([...new Set(paths)].map(async (path) => ({ path, content: await read(path) })));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
const kind = pkg.livingCode.kind;

if (kind === "npm") {
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--pack-destination", out]);
} else if (kind === "vscode") {
  run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["dlx", "@vscode/vsce@4.0.0", "package", "--no-dependencies", "--out", join(out, `living-code-${pkg.version}.vsix`)]);
} else if (kind === "jetbrains") {
  const files = await payload(manifest.files.filter((path) => /^(META-INF|themes)\//.test(path)));
  const jar = zip([{ path: "META-INF/MANIFEST.MF", content: "Manifest-Version: 1.0\r\n\r\n" }, { path: "META-INF/LICENSE", content: await read("LICENSE") }, { path: "META-INF/OFL-JetBrainsMono.txt", content: await read("OFL-JetBrainsMono.txt") }, ...files]);
  await write(`living-code-jetbrains-${pkg.version}.zip`, zip([{ path: "living-code/lib/living-code.jar", content: jar }]));
} else if (["firefox", "chrome"].includes(kind)) {
  for (const flavor of manifest.flavors) {
    const prefix = `living-code-${flavor}/`;
    const files = await payload(manifest.files.filter((path) => path.startsWith(prefix)));
    await write(`living-code-${kind}-${flavor}.${kind === "firefox" ? "xpi" : "zip"}`, zip([...files.map((file) => ({ ...file, path: file.path.slice(prefix.length) })), { path: "LICENSE", content: await read("LICENSE") }, { path: "OFL-JetBrainsMono.txt", content: await read("OFL-JetBrainsMono.txt") }]));
  }
  if (kind === "firefox") console.log("XPI files are unsigned; release Firefox requires AMO signing.");
} else if (kind === "sublime") {
  await write("Living Code.sublime-package", zip(await payload([...manifest.files.filter((path) => path.endsWith(".sublime-color-scheme")), "LICENSE"])));
} else {
  await write(`living-code-${manifest.slug}-${pkg.version}.zip`, zip(await payload([...manifest.files, "README.md", "LICENSE"])));
  if (kind === "obsidian") {
    await write("manifest.json", await read("manifest.json"));
    await write("theme.css", await read("theme.css"));
  }
}
