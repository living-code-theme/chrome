// Port-owned brand assets. Normal checks/package commands never render or rewrite icons.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Authentic JetBrains Mono Bold outlines for [, l, c, ] in reading order.
const glyphHash = "963e37377547c1d7cecd8812a77a80144a1f631a3596408fb3e3e1251880a70b";
const safe = (path) => {
  assert.ok(/^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith("/") && !path.split("/").some((part) => ["", ".", ".."].includes(part)), `Unsafe icon path: ${path}`);
  return path;
};
const read = (path) => readFile(join(root, safe(path)));

export async function checkIcons(readAsset = read) {
  const manifest = JSON.parse(await readAsset("scripts/icon-sources.json"));
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(manifest.icons.length);
  for (const icon of manifest.icons) {
    const svg = await readAsset(safe(icon.source));
    assert.equal(hash(svg), icon.sha256, `Unreviewed SVG change: ${icon.source}`);
    const text = svg.toString("utf8");
    assert.match(text, /<title[^>]*>Living Code(?: Night| Paper)?: \[lc\]<\/title>/);
    assert.doesNotMatch(text, /\[el\]|<(?:text|image|script|foreignObject)\b/i);
    const paths = [...text.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(hash(JSON.stringify(paths)), glyphHash, `Icon must draw [lc], not merely label it: ${icon.source}`);
    for (const output of icon.outputs) {
      const bytes = await readAsset(safe(output.path));
      assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Invalid PNG: ${output.path}`);
      assert.equal(bytes.readUInt32BE(16), output.size);
      assert.equal(bytes.readUInt32BE(20), output.size);
      assert.equal(hash(bytes), output.sha256, `Unreviewed raster change: ${output.path}; explicitly refresh icons`);
    }
  }
  return manifest;
}

async function refresh() {
  const manifest = JSON.parse(await read("scripts/icon-sources.json"));
  const jobs = [];
  for (const icon of manifest.icons) {
    const svg = await read(icon.source);
    icon.sha256 = hash(svg);
    for (const output of icon.outputs) jobs.push({ path: safe(output.path), size: output.size, svg: svg.toString("base64") });
  }
  if (jobs.length) {
    const temporary = await mkdtemp(join(tmpdir(), "living-code-icons-"));
    try {
      const page = join(temporary, "icons.html");
      await writeFile(page, `<!doctype html><meta charset="utf-8"><script>
Promise.all(${JSON.stringify(jobs)}.map(job => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = job.size;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, job.size, job.size);
    resolve({ path: job.path, png: canvas.toDataURL('image/png').split(',')[1] });
  };
  image.onerror = reject;
  image.src = 'data:image/svg+xml;base64,' + job.svg;
}))).then(images => document.body.textContent = 'ICONS:' + JSON.stringify(images));
</script><body></body>`);
      const result = spawnSync(process.env.CHROME_BIN || "google-chrome", [
        "--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--disable-background-networking",
        `--user-data-dir=${join(temporary, "profile")}`, "--force-color-profile=srgb",
        "--virtual-time-budget=2000", "--dump-dom", pathToFileURL(page).href,
      ], { encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stderr);
      const encoded = result.stdout.match(/<body>ICONS:(\[[\s\S]*?\])<\/body>/)?.[1];
      assert.ok(encoded, "Chromium did not render icons");
      for (const output of JSON.parse(encoded)) {
        const bytes = Buffer.from(output.png, "base64");
        await writeFile(join(root, output.path), bytes);
        const entry = manifest.icons.flatMap((icon) => icon.outputs).find((item) => item.path === output.path);
        entry.sha256 = hash(bytes);
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  await writeFile(join(root, "scripts/icon-sources.json"), JSON.stringify(manifest, null, 2) + "\n");
  await checkIcons();
  console.log("Refreshed [lc] icons; review SVGs, rasters and fingerprints before committing.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.argv.slice(2).length <= 1 && process.argv.slice(2).every((arg) => arg === "--write"), "Usage: node scripts/icons.mjs [--write]");
  if (process.argv.includes("--write")) await refresh();
  else { await checkIcons(); console.log("Reviewed [lc] SVG and raster icons verified."); }
}
