import assert from "node:assert/strict";
import test from "node:test";
import { generate } from "../src/generate.mjs";
import { resolveAll } from "../scripts/palette.mjs";

// Chromium browser_theme_pack.cc's kOverwritableColorTable, not Firefox-only field/focus keys.
const supported = new Set([
  "background_tab", "background_tab_inactive", "background_tab_incognito", "background_tab_incognito_inactive",
  "bookmark_text", "button_background", "frame", "frame_inactive", "frame_incognito", "frame_incognito_inactive",
  "ntp_background", "ntp_header", "ntp_link", "ntp_text", "omnibox_background", "omnibox_text",
  "tab_background_text", "tab_background_text_inactive", "tab_background_text_incognito", "tab_background_text_incognito_inactive",
  "tab_text", "toolbar", "toolbar_button_icon", "toolbar_text",
]);
const rgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const luminance = (color) => color.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const files = generate(resolveAll());

for (const flavor of resolveAll().filter((f) => ["night", "paper"].includes(f.id))) {
  const colors = JSON.parse(files.find((file) => file.path === `${flavor.slug}/manifest.json`).content).theme.colors;
  test(`${flavor.id}: Firefox-style neutral surfaces with teal confined to small accents`, () => {
    // Keep this port independent of a sibling checkout: assert the shared design roles, not its files.
    for (const name of ["frame", "frame_inactive", "frame_incognito", "frame_incognito_inactive",
      "background_tab", "background_tab_inactive", "background_tab_incognito", "background_tab_incognito_inactive",
      "omnibox_background"]) {
      assert.deepEqual(colors[name], rgb(flavor.r("bgDeep")), `${name} must stay neutral, without an accent mix`);
    }
    assert.deepEqual(colors.toolbar, rgb(flavor.r("bg")));
    assert.deepEqual(colors.ntp_background, rgb(flavor.r("bg")));
    assert.deepEqual(colors.button_background, rgb(flavor.c("surface0")));
    assert.deepEqual(colors.toolbar_button_icon, rgb(flavor.r("fgMuted")));
    assert.deepEqual(colors.tab_background_text, rgb(flavor.r("fgMuted")));
    const accentKeys = Object.entries(colors).filter(([, value]) => JSON.stringify(value) === JSON.stringify(rgb(flavor.r("accent"))))
      .map(([name]) => name).sort();
    assert.deepEqual(accentKeys, ["ntp_link", "tab_text"], "Only links and small active-tab details use teal");
    for (const [name, value] of Object.entries(colors)) {
      assert.ok(supported.has(name), `Unsupported Chrome theme color: ${name}`);
      assert.ok(value.length === 3 && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255));
    }
  });
  test(`${flavor.id}: active/inactive text, address field and toolbar controls retain contrast`, () => {
    const textPairs = [
      ["tab_text", "toolbar"], ["toolbar_text", "toolbar"], ["bookmark_text", "toolbar"],
      ["tab_background_text", "background_tab"], ["tab_background_text_inactive", "background_tab_inactive"],
      ["tab_background_text_incognito", "background_tab_incognito"],
      ["tab_background_text_incognito_inactive", "background_tab_incognito_inactive"],
      ["omnibox_text", "omnibox_background"], ["ntp_text", "ntp_background"], ["ntp_link", "ntp_background"],
    ];
    for (const [foreground, background] of textPairs) {
      assert.ok(contrast(colors[foreground], colors[background]) >= 4.5, `${foreground} on ${background} must meet 4.5:1`);
    }
    assert.ok(contrast(colors.toolbar_button_icon, colors.toolbar) >= 3);
  });
}
