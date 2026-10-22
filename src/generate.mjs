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
  return {
    manifest_version: 3,
    name: f.name,
    version,
    description: CHROME_DESCRIPTIONS[f.id],
    icons: { "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
    theme: {
      colors: {
        frame: r("bgDeep"),
        frame_inactive: r("bgDeep"),
        frame_incognito: r("bgDeep"),
        frame_incognito_inactive: r("bgDeep"),
        toolbar: r("bg"),
        tab_text: r("fg"),
        background_tab: r("bgDeep"),
        tab_background_text: r("fgMuted"),
        toolbar_text: r("fg"),
        bookmark_text: r("fgAlt"),
        toolbar_button_icon: r("fgMuted"),
        button_background: rgbArray(f.c("surface0")),
        omnibox_background: r("bgDeep"),
        omnibox_text: r("fg"),
        ntp_background: r("bg"),
        ntp_text: r("fg"),
        ntp_link: r("accent"),
      },
      tints: { buttons: [-1, -1, -1] },
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
