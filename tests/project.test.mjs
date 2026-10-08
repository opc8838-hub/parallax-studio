import assert from "node:assert/strict";
import test from "node:test";
import { createProject, parseProject } from "../app/gallery-project.ts";

test("default samples resolve under the GitHub Pages repository path", () => {
  const project = createProject("/xiaoguo-/");
  assert.equal(project.images.length, 7);
  assert.equal(project.images[0].src, "/xiaoguo-/gallery/01.png");
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
});

test("empty projects and embedded uploaded images survive backup round trips", () => {
  const project = createProject();
  project.images = [];
  assert.deepEqual(parseProject(project).images, []);
  project.images = [{ id: "upload", name: "我的照片", effect: 6,
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" }];
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
});

test("unsafe sources and malformed backups are rejected", () => {
  for (const source of ["javascript:alert(1)", "https://example.com/a.jpg", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA"]) {
    const project = createProject(); project.images[0].src = source;
    assert.throws(() => parseProject(project));
  }
  for (const value of [null, [], {}, { version: 2 }]) assert.throws(() => parseProject(value));
  const duplicate = createProject(); duplicate.images[1].id = duplicate.images[0].id;
  assert.throws(() => parseProject(duplicate));
});

test("invalid shader and layout values cannot enter through imports", () => {
  for (const [key, value] of [["uvScale", 0], ["effectRadius", 0], ["height", 1000], ["scrollEase", "fast"], ["aspect", NaN]]) {
    const project = createProject(); project.settings[key] = value;
    assert.throws(() => parseProject(project));
  }
  const project = createProject(); project.images[0].effect = 7;
  assert.throws(() => parseProject(project));
});
