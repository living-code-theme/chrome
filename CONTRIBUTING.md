# Maintaining this port

This repository owns its application mappings, generator, tests and committed theme files. It does not depend on a
core checkout during normal builds or installation. Maintenance requires Node 22.22+, pnpm 12.9.0 and Python 3.
Recapture uses the locked Nix environment; installing a theme needs none of these tools.

## Build and verify

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm screenshots
pnpm check
pnpm test
```

- `src/generate.mjs`: this application's format and semantic-role mappings. The interface is `generate(flavors)`,
  returning `{ path, content }` records for the four resolved flavors in the pinned snapshot. It performs no writes.
- `palette/theme.json`: app-agnostic resolved palette data, pinned to a core Git revision and SHA-256 fingerprint.
- `scripts/color.mjs`: vendored core color math used for application-specific mixtures, verified against the pin.
- `scripts/generated.json`: this port's explicit managed-file allowlist. Build changes only these files; check
  reports stale bytes without writing them. Neither command contacts GitHub or reads another repository.
- `test/`: deterministic generation, palette adoption, containment and applicable native-format/grammar/semantic
  role regressions. These are maintained here, not in a central application generator.

README, metadata, marketplace identities, licenses, icons, screenshots, handwritten runtime files and publishing
workflows are not generated. Packaging uses committed files and refuses stale generated themes; it does not rebuild.

Marketplace icons draw the current `[lc]` lettermark. `node scripts/icons.mjs` checks both flavor SVGs, PNG sizes
and reviewed hashes. After an intentional SVG edit, run `node scripts/icons.mjs --write` with Chromium installed
(`CHROME_BIN` overrides `google-chrome`), then visually review every size and `scripts/icon-sources.json`.
Normal checks/packaging require no browser and never refresh artwork. Both generated browser manifest versions
come from this port's `package.json`.

## Capture and review the real browser

`pnpm screenshots` loads the native theme into real Chromium on Xvfb at 2560×1600, natively rendered at 2×.
It uses disposable profiles, English UI/Accept-Language settings and local English example tabs. Remote hosts are
blocked so geolocated Google promotions cannot introduce Spanish or other unexpected text. The active page is
Chromium's own New Tab page, not an HTML recreation. DevTools checks the native page's language and visible copy.

- `pnpm screenshots -- --force`: deliberately refresh both flavors.
- `pnpm screenshots -- --flavor paper`: preview one flavor in `dist/capture-preview/`, without changing published images.
- `pnpm screenshots:check`: offline input/image fingerprint and native-resolution checks.
- `pnpm screenshots:store`: create genuine downsampled **1280×800** upload copies in `dist/store/` from the verified
  2560×1600 captures. It never recolors, reconstructs or recaptures UI.

Review both flavors together. `images/capture.json` records the source/runtime pin, actual Chromium version,
observed palette colors and PNG hashes; tests require the teal accent to appear in each real image. Checks and
packaging reject stale captures without launching a browser. CI refreshes stale captures before validation and
commits only validated `images/` changes on main. Release jobs consume the committed images; they never recapture.

Do not invent unsupported Firefox-style theme keys to force Chrome's focus ring or New Tab controls to match.
The public theme API still leaves some surfaces under browser control. Test color/contrast mappings and actual
native output, not just JSON validity.

## Adopt a palette update explicitly

In a reviewed [core](https://github.com/living-code-theme/core) checkout, run `pnpm build`, `pnpm check` and
`pnpm test`, then commit the palette/math inputs. In this port:

```sh
pnpm palette:update /path/to/core
pnpm build
pnpm screenshots
pnpm check
pnpm test
```

The update command verifies core's export against its committed palette/resolver/math files, refuses dirty/stale
inputs, and changes only this port's palette pin. It is never run on install or as part of a normal build. If core's
color math changed, review and copy that revision's `src/color.mjs` into this port's `scripts/color.mjs` first.

Review the pin and generated diff in this repository's own pull request. Preserve intentional app-specific choices;
update expected role contracts only when the policy change is deliberate. Refresh real application screenshots
when visible colors change. Publishing and release workflows remain separate maintainer operations.
