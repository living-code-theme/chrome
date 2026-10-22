// Read the real native New Tab page through DevTools. Never inject a UI or change page styling.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [profile] = process.argv.slice(2);
const [port] = (await readFile(`${profile}/DevToolsActivePort`, "utf8")).trim().split("\n");
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((target) => target.type === "page" && /^chrome:\/\/newtab\/?$/.test(target.url));
assert.ok(page, "The active preview must be Chromium's native New Tab page");
const socket = new WebSocket(page.webSocketDebuggerUrl);
const evidence = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.close(); reject(new Error("Native New Tab inspection timed out")); }, 10000);
  socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Cannot inspect Chromium")); });
  socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: {
    returnByValue: true,
    expression: `(() => {
      const words = [];
      const visit = node => {
        if (node.nodeType === Node.TEXT_NODE) { if (node.textContent.trim()) words.push(node.textContent.trim()); return; }
        if (node.nodeType === Node.ELEMENT_NODE && /^(STYLE|SCRIPT|TEMPLATE|SVG)$/.test(node.tagName)) return;
        if (node.shadowRoot) visit(node.shadowRoot);
        for (const child of node.childNodes) visit(child);
      };
      visit(document.body);
      return { title: document.title, url: location.href, language: navigator.language,
        documentLanguage: document.documentElement.lang, text: words.join(' ').slice(0, 8000) };
    })()`,
  } })));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout); socket.close();
    if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message)));
    else resolve(message.result.result.value);
  });
});
assert.match(evidence.language, /^en(?:-|$)/i, "Use an English browser profile");
assert.match(evidence.documentLanguage, /^en(?:-|$)/i, "New Tab must use English");
assert.equal(evidence.title, "New Tab");
assert.doesNotMatch(evidence.text, /Haz m[aá]s|Crear im[aá]genes|Modo IA|Personalizar|Buscar en Google|A[nñ]adir acceso/i, "Non-English New Tab content must not be captured");
assert.match(evidence.text, /Customize|Add shortcut|Search Google|Google Search/i, "Wait for the real New Tab UI to finish rendering");
console.log(JSON.stringify(evidence));
