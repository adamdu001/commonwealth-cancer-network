import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static build emits GitHub Pages metadata and repository-prefixed assets", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Commonwealth Cancer Research &amp; Patent Network<\/title>/i);
  assert.match(html, /https:\/\/adamdu001\.github\.io\/commonwealth-cancer-network\//i);
  assert.match(html, /(?:src|href)="\/commonwealth-cancer-network\/assets\//i);
  assert.doesNotMatch(html, /_next|vinext|cloudflare/i);
});

test("browser data requests honour the configured GitHub Pages base path", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const map = await readFile(new URL("../app/MapView.tsx", import.meta.url), "utf8");
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /\/commonwealth-cancer-network\//);
  assert.match(page, /import\.meta\.env\.BASE_URL/);
  assert.match(map, /import\.meta\.env\.BASE_URL/);
  assert.doesNotMatch(page, /fetch\(["'`]\/data\//);
  assert.doesNotMatch(map, /fetch\(["'`]\/data\//);
});

test("generated data contains the approved five layers", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/data/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.layers), ["publications", "trials", "inventions", "patents", "grants"]);
  assert.equal(manifest.countryCount, 233);
  assert.equal(manifest.commonwealthCount, 56);
  assert.equal(manifest.layers.publications.edgeCount, 13301);
  assert.equal(manifest.layers.trials.edgeCount, 3441);
  assert.equal(manifest.layers.inventions.edgeCount, 1144);
  assert.equal(manifest.layers.patents.edgeCount, 472);
  assert.equal(manifest.layers.grants.edgeCount, 176);
  assert.deepEqual(manifest.layers.publications.keep, { core: 0.02, balanced: 0.05, full: 1 });
  assert.deepEqual(manifest.layers.trials.keep, { core: 0.1, balanced: 0.2, full: 1 });
  assert.deepEqual(manifest.layers.inventions.keep, { core: 0.15, balanced: 0.3, full: 1 });
  assert.deepEqual(manifest.layers.patents.keep, { core: 0.2, balanced: 0.4, full: 1 });
  assert.deepEqual(manifest.layers.grants.keep, { core: 0.5, balanced: 0.75, full: 1 });
  assert.equal(manifest.layers.inventions.summaryMetric, "International Patent Families — Inventorship");
  assert.equal(manifest.layers.patents.partnerUnit, "joint patent families by owner country");
});

test("edge-count ranks preserve ties and Full contains every scoped link", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/data/manifest.json", import.meta.url), "utf8"));
  const nodes = JSON.parse(await readFile(new URL("../public/data/nodes.json", import.meta.url), "utf8"));
  const commonwealth = new Set(nodes.filter((node) => node.commonwealth).map((node) => node.id));
  for (const [layer, meta] of Object.entries(manifest.layers)) {
    const edges = JSON.parse(await readFile(new URL(`../public/data/edges/${layer}.json`, import.meta.url), "utf8"));
    assert.equal(edges.length, meta.edgeCount);
    assert.equal(edges.filter((edge) => commonwealth.has(edge.source) && commonwealth.has(edge.target)).length, meta.commonwealthEdgeCount);
    for (const scope of ["global", "commonwealth"]) {
      const scoped = scope === "global" ? edges : edges.filter((edge) => commonwealth.has(edge.source) && commonwealth.has(edge.target));
      const rankKey = scope === "global" ? "globalRank" : "commonwealthRank";
      assert.equal(scoped.filter((edge) => edge[rankKey] > 0).length, scoped.length);
      for (const mode of ["core", "balanced"]) {
        const retained = scoped.filter((edge) => edge[rankKey] > 1 - meta.keep[mode]);
        assert.ok(retained.length >= Math.ceil(scoped.length * meta.keep[mode]), `${layer} ${scope} ${mode}`);
      }
      const ranksByWeight = new Map();
      scoped.forEach((edge) => {
        if (ranksByWeight.has(edge.weight)) assert.equal(ranksByWeight.get(edge.weight), edge[rankKey]);
        else ranksByWeight.set(edge.weight, edge[rankKey]);
      });
    }
  }
});

test("sidebar, number formatting and link-help copy remain simplified", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /value > 0 && value < 0\.01/);
  assert.match(page, /maximumFractionDigits: 2/);
  assert.match(page, /Strongest links are shown by pruning weak links using a percentage cutoff\. Isolated countries after cutoff are hidden\./);
  assert.doesNotMatch(page, /components/);
  assert.match(css, /grid-template-columns: 240px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.explorer-layout \{ display: block; \}/);
});

test("map dragging is race-safe and scope defaults are explicit", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const map = await readFile(new URL("../app/MapView.tsx", import.meta.url), "utf8");
  assert.match(page, /DEFAULT_DETAIL_BY_SCOPE[^=]*= \{ commonwealth: "full", global: "core" \}/);
  assert.match(page, /detail !== DEFAULT_DETAIL_BY_SCOPE\[scope\]/);
  assert.match(map, /const drag = dragRef\.current;[\s\S]*if \(!drag\) return;/);
  assert.doesNotMatch(map, /dragRef\.current!/);
  assert.match(map, /onPointerCancel/);
  assert.match(map, /onLostPointerCapture/);
});
