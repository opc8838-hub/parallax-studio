import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

// A Pages build must link its executable assets under the repository path.
test("published editor has Chinese metadata and reachable bundled assets", async () => {
  const root = new URL("../dist-pages/", import.meta.url);
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /<title>.+<\/title>/);
  assert.doesNotMatch(html, /Your site is taking shape|_sites-preview/);
  const script = html.match(/src="(\/xiaoguo-\/assets\/[^"]+\.js)"/);
  const css = html.match(/href="(\/xiaoguo-\/assets\/[^"]+\.css)"/);
  assert.ok(script, "script must use the Pages subpath");
  assert.ok(css, "stylesheet must use the Pages subpath");
  await Promise.all([script[1], css[1]].map(path => access(new URL(path.replace("/xiaoguo-/", ""), root))));
  await access(new URL("gallery/01.png", root));
  await access(new URL("gallery/neon-1.webp", root));
});
