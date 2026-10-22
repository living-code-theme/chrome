// This port owns its application mappings. Colors come only from the pinned local palette.
import { readFileSync } from "node:fs";
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// Short manifest/store summaries. Detailed listing copy is entered separately in the Web Store.
const CHROME_DESCRIPTIONS = {
  night: "A calm, dark slate theme with teal accents.",
  paper: "A clean, light theme with teal accents.",
};

const rgbArray = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function chromeTheme(f) {
  const r = (role) => rgbArray(f.r(role));
  // Chrome exposes a small, explicit theme API, not Firefox's field/focus colors.
  // Give supported, visible controls an accent rather than relying on legacy ntp_link alone.
  const frame = rgbArray(f.mix("bgDeep", "accent", 0.35));
  const inactiveFrame = rgbArray(f.mix("bgDeep", "accent", 0.18));
  const incognitoFrame = rgbArray(f.mix("bgDeep", "accent", 0.24));
  return {
    manifest_version: 3,
    name: f.name,
    version,
    description: CHROME_DESCRIPTIONS[f.id],
    icons: { "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
    theme: {
      colors: {
        frame,
        frame_inactive: inactiveFrame,
        frame_incognito: incognitoFrame,
        frame_incognito_inactive: inactiveFrame,
        toolbar: r("bg"),
        tab_text: r("accent"),
        background_tab: frame,
        background_tab_inactive: inactiveFrame,
        background_tab_incognito: incognitoFrame,
        background_tab_incognito_inactive: inactiveFrame,
        tab_background_text: r("fgAlt"),
        tab_background_text_inactive: r("fgMuted"),
        tab_background_text_incognito: r("fgAlt"),
        tab_background_text_incognito_inactive: r("fgMuted"),
        toolbar_text: r("fg"),
        bookmark_text: r("fgAlt"),
        toolbar_button_icon: r("accent"),
        button_background: rgbArray(f.mix("surface0", "accent", 0.18)),
        omnibox_background: rgbArray(f.mix("bg", "accent", 0.09)),
        omnibox_text: r("fg"),
        ntp_background: r("bg"),
        ntp_text: r("fg"),
        ntp_link: r("accent"),
        ntp_header: r("accent"),
      },
      properties: { ntp_background_alignment: "center" },
    },
  };
}

const supportsBrowserTheme = (f) => f.id === "night" || f.id === "paper";

const chrome = {
files: (f) => supportsBrowserTheme(f) ? [
    { path: `${f.slug}/manifest.json`, content: JSON.stringify(chromeTheme(f), null, 2) + "\n" },
  ] : []
};

export function generate(flavors) {
  return [...flavors.flatMap(f => chrome.files(f)), ...(chrome.all?.(flavors) ?? [])].filter(f => !["LICENSE", "README.md", "package.json", "extension.toml"].includes(f.path.split("/").at(-1)));
}
