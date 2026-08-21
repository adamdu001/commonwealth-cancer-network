import fs from "node:fs";
import path from "node:path";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import worldCountries from "world-countries";

const root = process.cwd();
const sourceDir = path.join(root, "source-data");
const outputDir = path.join(root, "public", "data");
const edgesDir = path.join(outputDir, "edges");
const profilesDir = path.join(outputDir, "profiles");

const layers = {
  publications: {
    label: "Publications",
    shortLabel: "Publications",
    file: "paper_mat_16_23.csv",
    colour: "#176b87",
    definition: "Weighted country-to-country connections observed in cancer research publications.",
    summaryMetric: "International Publications",
    partnerUnit: "joint publications",
    expectedEdges: 13301,
    keep: { core: 0.02, balanced: 0.05, full: 1 },
  },
  trials: {
    label: "Clinical Trials",
    shortLabel: "Trials",
    file: "clt_mat_16_23.csv",
    colour: "#d97a32",
    definition: "Weighted country-to-country connections observed in cancer clinical trials.",
    summaryMetric: "International Clinical Trials",
    partnerUnit: "joint clinical trials",
    expectedEdges: 3441,
    keep: { core: 0.1, balanced: 0.2, full: 1 },
  },
  inventions: {
    label: "Inventions",
    shortLabel: "Inventions",
    file: "patent_mat_16_23_family_inventorship.csv",
    colour: "#288f72",
    definition: "Weighted connections based on the countries of inventors named on cancer patent families.",
    summaryMetric: "International Patent Families — Inventorship",
    partnerUnit: "joint patent families by inventor country",
    expectedEdges: 1144,
    keep: { core: 0.15, balanced: 0.3, full: 1 },
  },
  patents: {
    label: "Patents",
    shortLabel: "Patents",
    file: "patent_mat_16_23_family_ownership.csv",
    colour: "#7359a5",
    definition: "Weighted connections based on the countries of owners of cancer patent families.",
    summaryMetric: "International Patent Families — Ownership",
    partnerUnit: "joint patent families by owner country",
    expectedEdges: 472,
    keep: { core: 0.2, balanced: 0.4, full: 1 },
  },
  grants: {
    label: "Grants",
    shortLabel: "Grants",
    file: "grant_mat_16_23.csv",
    colour: "#bb4c5d",
    definition: "Weighted country-to-country connections observed in cancer research grants.",
    summaryMetric: "International Grants",
    partnerUnit: "joint grants",
    expectedEdges: 176,
    keep: { core: 0.5, balanced: 0.75, full: 1 },
  },
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function readRows(filename) {
  return parseCsv(fs.readFileSync(path.join(sourceDir, filename), "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value)}\n`);
}

function ranksFor(edges) {
  if (!edges.length) return new Map();
  const weights = edges.map((edge) => edge.weight).sort((a, b) => a - b);
  const rank = new Map();
  weights.forEach((weight, index) => rank.set(weight, (index + 1) / weights.length));
  return new Map(edges.map((edge) => [`${edge.source}|${edge.target}`, rank.get(edge.weight)]));
}

function normalizedWeights(edges) {
  if (!edges.length) return new Map();
  const logs = edges.map((edge) => Math.log1p(edge.weight));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  return new Map(edges.map((edge) => {
    const value = Math.log1p(edge.weight);
    return [`${edge.source}|${edge.target}`, max === min ? 1 : (value - min) / (max - min)];
  }));
}

function buildProfiles(codes, edges, scopeSet) {
  const neighbours = new Map(codes.map((code) => [code, []]));
  for (const edge of edges) {
    if (scopeSet && (!scopeSet.has(edge.source) || !scopeSet.has(edge.target))) continue;
    neighbours.get(edge.source)?.push({ code: edge.target, weight: edge.weight });
    neighbours.get(edge.target)?.push({ code: edge.source, weight: edge.weight });
  }
  return Object.fromEntries(codes.map((code) => {
    const partners = (neighbours.get(code) || []).sort((a, b) => b.weight - a.weight);
    return [code, {
      partnerCount: partners.length,
      strength: partners.reduce((sum, partner) => sum + partner.weight, 0),
      strongestPartners: partners.slice(0, 5),
    }];
  }));
}

function normalizeLayout(graph, codes) {
  if (graph.size) {
    const settings = forceAtlas2.inferSettings(graph);
    forceAtlas2.assign(graph, {
      iterations: 700,
      settings: { ...settings, barnesHutOptimize: true, gravity: 0.08, scalingRatio: 28, slowDown: 6, edgeWeightInfluence: 0.6 },
    });
  }
  const placed = codes.filter((code) => graph.hasNode(code));
  const xs = placed.map((code) => graph.getNodeAttribute(code, "x"));
  const ys = placed.map((code) => graph.getNodeAttribute(code, "y"));
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  return Object.fromEntries(codes.map((code) => {
    if (!graph.hasNode(code)) return [code, null];
    return [code, {
      x: (graph.getNodeAttribute(code, "x") - minX) / (maxX - minX || 1),
      y: (graph.getNodeAttribute(code, "y") - minY) / (maxY - minY || 1),
    }];
  }));
}

function makeLayout(codes, allLayerEdges, scopeSet) {
  const graph = new Graph({ type: "undirected", multi: false });
  const active = new Set();
  for (const edges of Object.values(allLayerEdges)) {
    for (const edge of edges) {
      if (scopeSet && (!scopeSet.has(edge.source) || !scopeSet.has(edge.target))) continue;
      active.add(edge.source);
      active.add(edge.target);
    }
  }
  const activeCodes = codes.filter((code) => active.has(code));
  activeCodes.forEach((code, index) => {
    const angle = (index / Math.max(activeCodes.length, 1)) * Math.PI * 2;
    const radius = 1 + ((index * 37) % 17) / 40;
    graph.addNode(code, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });

  for (const edges of Object.values(allLayerEdges)) {
    const scoped = edges.filter((edge) => !scopeSet || (scopeSet.has(edge.source) && scopeSet.has(edge.target)));
    const total = scoped.reduce((sum, edge) => sum + edge.weight, 0) || 1;
    for (const edge of scoped) {
      const weight = edge.weight / total;
      if (graph.hasEdge(edge.source, edge.target)) graph.updateEdgeAttribute(edge.source, edge.target, "weight", (value) => value + weight);
      else graph.addEdge(edge.source, edge.target, { weight });
    }
  }
  return normalizeLayout(graph, codes);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(edgesDir, { recursive: true });
fs.mkdirSync(profilesDir, { recursive: true });

const codeRows = readRows("codes_mapping.csv");
const codeHeader = codeRows.shift();
const codeIndex = Object.fromEntries(codeHeader.map((name, index) => [name, index]));
const names = Object.fromEntries(codeRows.map((row) => [row[codeIndex.Code], row[codeIndex.Name] || row[codeIndex.Code]]));

const cwRows = readRows("country_cw.csv");
const cwHeader = cwRows.shift();
const cwCodeIndex = cwHeader.indexOf("commonwealth_countries_2_digit");
const commonwealth = new Set(cwRows.map((row) => row[cwCodeIndex]).filter(Boolean));
if (commonwealth.size !== 56) throw new Error(`Expected 56 Commonwealth entries, found ${commonwealth.size}.`);

const coordinates = new Map(worldCountries.map((country) => [country.cca2, country.latlng]));
const coordinateOverrides = {
  AQ: [-82.8628, 135],
  BV: [-54.42, 3.36],
  HM: [-53.1, 72.52],
};
for (const [code, value] of Object.entries(coordinateOverrides)) coordinates.set(code, value);

let codes = null;
const allLayerEdges = {};
for (const [layerId, layer] of Object.entries(layers)) {
  const rows = readRows(layer.file);
  const columns = rows[0].slice(1);
  const rowCodes = rows.slice(1).map((row) => row[0]);
  if (columns.length !== 233 || rowCodes.length !== 233) throw new Error(`${layer.file} must be 233×233.`);
  if (columns.some((code, index) => code !== rowCodes[index])) throw new Error(`${layer.file} row and column codes differ.`);
  if (codes && columns.some((code, index) => code !== codes[index])) throw new Error(`${layer.file} country ordering differs.`);
  codes ||= columns;

  const edges = [];
  for (let i = 0; i < rowCodes.length; i += 1) {
    const values = rows[i + 1].slice(1).map(Number);
    if (values.length !== 233 || values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`${layer.file} contains malformed values.`);
    for (let j = i + 1; j < columns.length; j += 1) {
      const mirror = Number(rows[j + 1][i + 1]);
      if (Math.abs(values[j] - mirror) > 1e-9) throw new Error(`${layer.file} is asymmetric at ${rowCodes[i]}–${columns[j]}.`);
      if (values[j] > 0) edges.push({ source: rowCodes[i], target: columns[j], weight: values[j] });
    }
  }
  if (edges.length !== layer.expectedEdges) throw new Error(`${layer.file}: expected ${layer.expectedEdges} edges, found ${edges.length}.`);
  allLayerEdges[layerId] = edges;
}

const activeAcrossLayers = new Set(Object.values(allLayerEdges).flatMap((edges) => edges.flatMap((edge) => [edge.source, edge.target])));
const missingCoordinates = [...activeAcrossLayers].filter((code) => !coordinates.get(code));
if (missingCoordinates.length) throw new Error(`Missing coordinates for active countries: ${missingCoordinates.join(", ")}`);
const missingNames = [...activeAcrossLayers].filter((code) => !names[code]);
if (missingNames.length) throw new Error(`Missing names for active countries: ${missingNames.join(", ")}`);

const globalLayout = makeLayout(codes, allLayerEdges, null);
const commonwealthLayout = makeLayout(codes, allLayerEdges, commonwealth);

const nodes = codes.map((code) => ({
  id: code,
  name: names[code] || code,
  commonwealth: commonwealth.has(code),
  latitude: coordinates.get(code)?.[0] ?? null,
  longitude: coordinates.get(code)?.[1] ?? null,
  layouts: { global: globalLayout[code], commonwealth: commonwealthLayout[code] },
}));
writeJson(path.join(outputDir, "nodes.json"), nodes);

const manifestLayers = {};
for (const [layerId, layer] of Object.entries(layers)) {
  const edges = allLayerEdges[layerId];
  const cwEdges = edges.filter((edge) => commonwealth.has(edge.source) && commonwealth.has(edge.target));
  const globalRanks = ranksFor(edges);
  const cwRanks = ranksFor(cwEdges);
  const globalDisplay = normalizedWeights(edges);
  const cwDisplay = normalizedWeights(cwEdges);
  const records = edges.map((edge) => {
    const key = `${edge.source}|${edge.target}`;
    return {
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      globalRank: globalRanks.get(key),
      commonwealthRank: cwRanks.get(key) ?? null,
      globalDisplayWeight: globalDisplay.get(key),
      commonwealthDisplayWeight: cwDisplay.get(key) ?? null,
    };
  });
  writeJson(path.join(edgesDir, `${layerId}.json`), records);
  writeJson(path.join(profilesDir, `${layerId}.json`), {
    global: buildProfiles(codes, edges, null),
    commonwealth: buildProfiles(codes, edges, commonwealth),
  });
  manifestLayers[layerId] = {
    label: layer.label,
    shortLabel: layer.shortLabel,
    colour: layer.colour,
    definition: layer.definition,
    summaryMetric: layer.summaryMetric,
    partnerUnit: layer.partnerUnit,
    sourceFile: layer.file,
    edgeCount: edges.length,
    commonwealthEdgeCount: cwEdges.length,
    keep: layer.keep,
  };
}

writeJson(path.join(outputDir, "manifest.json"), {
  title: "Commonwealth Cancer Research & Patent Network",
  subtitle: "Collaboration Networks in Cancer",
  period: "2016–2023",
  generatedAt: new Date().toISOString(),
  countryCount: codes.length,
  commonwealthCount: commonwealth.size,
  layers: manifestLayers,
});

fs.copyFileSync(path.join(root, "node_modules", "world-atlas", "countries-110m.json"), path.join(outputDir, "world-110m.json"));
console.log(`Generated ${codes.length} countries and ${Object.keys(layers).length} layers in public/data.`);
