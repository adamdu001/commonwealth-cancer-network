import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CountryProfile, DetailLevel, EdgeRecord, LayerId, LayerProfiles, Manifest, NodeRecord, ScopeId, ViewId } from "./types";

const NetworkView = lazy(() => import("./NetworkView"));
const MapView = lazy(() => import("./MapView"));

const LAYER_ORDER: LayerId[] = ["publications", "trials", "inventions", "patents", "grants"];
const DETAILS: DetailLevel[] = ["core", "balanced", "full"];
const DEFAULT_DETAIL_BY_SCOPE: Record<ScopeId, DetailLevel> = { commonwealth: "full", global: "core" };
const EMPTY_EDGES: EdgeRecord[] = [];
const LAYER_FALLBACK_LABELS: Record<LayerId, string> = {
  publications: "Publications", trials: "Clinical Trials", inventions: "Inventions", patents: "Patents", grants: "Grants",
};

interface DetailStats { links: number; countries: number }

function dataUrl(path: string) {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

function LoadingVisual() {
  return <div className="visual-loading"><span />Preparing the network…</div>;
}

function formatValue(value: number) {
  if (value === 0) return "0";
  if (value > 0 && value < 0.01) return "<0.01";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
}

function parseDetail(value: string | null, scope: ScopeId): DetailLevel {
  if (value === "focused") return "core";
  if (value === "detailed") return "full";
  return DETAILS.includes(value as DetailLevel) ? value as DetailLevel : DEFAULT_DETAIL_BY_SCOPE[scope];
}

function parseState(): { view: ViewId; scope: ScopeId; layer: LayerId; detail: DetailLevel; country: string | null } {
  if (typeof window === "undefined") return { view: "network", scope: "commonwealth", layer: "publications", detail: "full", country: null };
  const params = new URLSearchParams(window.location.search);
  const scope: ScopeId = params.get("scope") === "global" ? "global" : "commonwealth";
  return {
    view: params.get("view") === "map" ? "map" : "network",
    scope,
    layer: LAYER_ORDER.includes(params.get("layer") as LayerId) ? params.get("layer") as LayerId : "publications",
    detail: parseDetail(params.get("detail"), scope),
    country: params.get("country")?.toUpperCase() || null,
  };
}

function retainEdges(edges: EdgeRecord[], scope: ScopeId, keep: number) {
  if (keep >= 1) return edges;
  const threshold = 1 - keep;
  return edges.filter((edge) => {
    const rank = scope === "global" ? edge.globalRank : edge.commonwealthRank;
    return rank !== null && rank > threshold;
  });
}

function graphStats(edges: EdgeRecord[]): DetailStats {
  return { links: edges.length, countries: new Set(edges.flatMap((edge) => [edge.source, edge.target])).size };
}

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [layerData, setLayerData] = useState<{ layer: LayerId; edges: EdgeRecord[]; profiles: LayerProfiles } | null>(null);
  const [view, setView] = useState<ViewId>("network");
  const [scope, setScope] = useState<ScopeId>("commonwealth");
  const [layer, setLayer] = useState<LayerId>("publications");
  const [detail, setDetail] = useState<DetailLevel>("full");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [helpHovered, setHelpHovered] = useState(false);
  const [helpPinned, setHelpPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryReady, setQueryReady] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initial = parseState();
      setView(initial.view); setScope(initial.scope); setLayer(initial.layer); setDetail(initial.detail); setSelectedCountry(initial.country); setQueryReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(dataUrl("manifest.json")).then((response) => response.json()),
      fetch(dataUrl("nodes.json")).then((response) => response.json()),
    ]).then(([manifestData, nodeData]: [Manifest, NodeRecord[]]) => {
      setManifest(manifestData); setNodes(nodeData);
    }).catch(() => setError("The visualisation data could not be loaded."));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(dataUrl(`edges/${layer}.json`), { signal: controller.signal }).then((response) => response.json()),
      fetch(dataUrl(`profiles/${layer}.json`), { signal: controller.signal }).then((response) => response.json()),
    ]).then(([edgeData, profileData]: [EdgeRecord[], LayerProfiles]) => {
      setLayerData({ layer, edges: edgeData, profiles: profileData });
    }).catch((reason) => { if (reason.name !== "AbortError") setError("The selected network could not be loaded."); });
    return () => controller.abort();
  }, [layer]);

  useEffect(() => {
    if (!queryReady) return;
    const params = new URLSearchParams();
    if (view !== "network") params.set("view", view);
    if (scope !== "commonwealth") params.set("scope", scope);
    if (layer !== "publications") params.set("layer", layer);
    if (detail !== DEFAULT_DETAIL_BY_SCOPE[scope]) params.set("detail", detail);
    if (selectedCountry) params.set("country", selectedCountry);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [view, scope, layer, detail, selectedCountry, queryReady]);

  useEffect(() => {
    if (!helpPinned) return;
    const close = (event: PointerEvent) => { if (!helpRef.current?.contains(event.target as Node)) setHelpPinned(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [helpPinned]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edges = layerData?.layer === layer ? layerData.edges : EMPTY_EDGES;
  const profiles = layerData?.layer === layer ? layerData.profiles : null;
  const layerMeta = manifest?.layers[layer];
  const scopedEdges = useMemo(() => scope === "global" ? edges : edges.filter((edge) => nodeMap.get(edge.source)?.commonwealth && nodeMap.get(edge.target)?.commonwealth), [edges, scope, nodeMap]);
  const edgesByDetail = useMemo(() => Object.fromEntries(DETAILS.map((mode) => [mode, layerMeta ? retainEdges(scopedEdges, scope, layerMeta.keep[mode]) : []])) as Record<DetailLevel, EdgeRecord[]>, [scopedEdges, scope, layerMeta]);
  const visibleEdges = edgesByDetail[detail];
  const visibleNodeIds = useMemo(() => [...new Set(visibleEdges.flatMap((edge) => [edge.source, edge.target]))], [visibleEdges]);
  const detailStats = useMemo(() => Object.fromEntries(DETAILS.map((mode) => [mode, graphStats(edgesByDetail[mode])])) as Record<DetailLevel, DetailStats>, [edgesByDetail]);
  const currentProfiles = useMemo(() => profiles?.[scope] || {}, [profiles, scope]);

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return nodes.filter((node) => node.name.toLowerCase().includes(query) || node.id.toLowerCase().startsWith(query))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 8);
  }, [nodes, search]);

  const selectedNode = selectedCountry ? nodeMap.get(selectedCountry) || null : null;
  const selectedProfile = selectedCountry ? currentProfiles[selectedCountry] || { partnerCount: 0, strength: 0, strongestPartners: [] } : null;

  const selectCountry = useCallback((country: string) => {
    const node = nodeMap.get(country);
    setSelectedCountry(country); setSearch(node?.name || country); setSearchOpen(false);
  }, [nodeMap]);

  const leadingCountries = useMemo(() => visibleNodeIds
    .map((code) => ({ node: nodeMap.get(code), profile: currentProfiles[code] as CountryProfile | undefined }))
    .filter((item): item is { node: NodeRecord; profile: CountryProfile } => Boolean(item.node && item.profile))
    .sort((a, b) => b.profile.strength - a.profile.strength).slice(0, 15), [visibleNodeIds, nodeMap, currentProfiles]);

  const helpOpen = helpHovered || helpPinned;
  const scopeWord = scope === "commonwealth" ? "Commonwealth" : "Global";
  const scopePhrase = scope === "commonwealth" ? "other Commonwealth countries" : "countries worldwide";

  if (error) return <main className="error-state"><h1>Commonwealth Cancer Research &amp; Patent Network</h1><p>{error}</p></main>;

  return (
    <main className="site-shell">
      <header className="masthead"><h1>Commonwealth Cancer Research &amp; Patent Network</h1></header>
      <section className="workspace" aria-label="Cancer collaboration visualiser">
        <div className="explorer-layout">
          <aside className="control-column" aria-label="Visualisation controls">
            <div className="control-stack">
              <div className="tab-group" aria-label="View">
                <button className={view === "network" ? "active" : ""} onClick={() => setView("network")} type="button">Network</button>
                <button className={view === "map" ? "active" : ""} onClick={() => setView("map")} type="button">Map</button>
              </div>
              <div className="tab-group" aria-label="Network scope">
                <button className={scope === "commonwealth" ? "active" : ""} onClick={() => { setScope("commonwealth"); setDetail(DEFAULT_DETAIL_BY_SCOPE.commonwealth); }} type="button">Intra-Commonwealth</button>
                <button className={scope === "global" ? "active" : ""} onClick={() => { setScope("global"); setDetail(DEFAULT_DETAIL_BY_SCOPE.global); }} type="button">Global</button>
              </div>
              <div className="search-wrap">
                <label className="search-box">
                  <input aria-label="Search by a country name or code" value={search} placeholder="Search by a country name or code"
                    onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)}
                    onKeyDown={(event) => { if (event.key === "Enter" && suggestions[0]) selectCountry(suggestions[0].id); if (event.key === "Escape") setSearchOpen(false); }} />
                </label>
                {searchOpen && suggestions.length > 0 && <div className="suggestions" role="listbox">
                  {suggestions.map((node) => <button key={node.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCountry(node.id)} type="button">
                    <span>{node.name}</span><small>{node.id}{node.commonwealth ? " · Commonwealth" : ""}</small>
                  </button>)}
                </div>}
              </div>
            </div>

            <div className="layer-rail" aria-label="Collaboration layer">
              {LAYER_ORDER.map((id) => <button className={`layer ${layer === id ? "active" : ""}`} key={id}
                style={layer === id && manifest ? { backgroundColor: manifest.layers[id].colour, borderColor: manifest.layers[id].colour } : undefined}
                onClick={() => setLayer(id)} type="button">{manifest?.layers[id].label || LAYER_FALLBACK_LABELS[id]}</button>)}
            </div>
          </aside>

          <div className="visual-card">
            <div className="visual-toolbar">
              <div className="selection-label"><span style={{ backgroundColor: layerMeta?.colour }} />{layerMeta?.label || "Loading"} · {scope === "global" ? "Global" : "Intra-Commonwealth"}</div>
              <div className="toolbar-actions">
                <div className="detail-tabs" aria-label="Network detail level">
                  {DETAILS.map((value) => <button key={value} className={detail === value ? "active" : ""} onClick={() => setDetail(value)} type="button">{value[0].toUpperCase() + value.slice(1)}</button>)}
                </div>
                <div className="detail-help" ref={helpRef} onMouseEnter={() => setHelpHovered(true)} onMouseLeave={() => setHelpHovered(false)}
                  onFocusCapture={() => setHelpHovered(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHelpHovered(false); }}>
                  <button className="help-button" type="button" aria-label="Explain display modes" aria-expanded={helpOpen} aria-controls="detail-help-popover" onClick={() => setHelpPinned((value) => !value)}>?</button>
                  {helpOpen && <div className="detail-popover" id="detail-help-popover" role="dialog" aria-label="Display mode details">
                    <h3>Links shown</h3>
                    {DETAILS.map((mode) => <div className="help-mode" key={mode}>
                      <strong>{mode[0].toUpperCase() + mode.slice(1)} · {Math.round((layerMeta?.keep[mode] || 0) * 100)}%</strong>
                      <span>{detailStats[mode].links.toLocaleString("en-GB")} links · {detailStats[mode].countries} countries</span>
                    </div>)}
                    <p>Strongest links are shown by pruning weak links using a percentage cutoff. Isolated countries after cutoff are hidden.</p>
                  </div>}
                </div>
                <button className="reset-button" onClick={() => setResetToken((value) => value + 1)} type="button" aria-label="Reset view">↺ <span>Reset</span></button>
              </div>
            </div>

            <div className={`visual-body ${selectedNode ? "with-panel" : ""}`}>
              <div className="visual-stage">
                <Suspense fallback={<LoadingVisual />}>
                  {!manifest || !profiles || edges.length === 0 ? <LoadingVisual /> : view === "network" ?
                    <NetworkView nodes={nodes} edges={visibleEdges} activeNodeIds={visibleNodeIds} profiles={currentProfiles} scope={scope} colour={layerMeta?.colour || "#176b87"} selectedCountry={selectedCountry} onSelect={selectCountry} resetToken={resetToken} /> :
                    <MapView key={`map-${resetToken}`} nodes={nodes} edges={visibleEdges} activeNodeIds={visibleNodeIds} profiles={currentProfiles} colour={layerMeta?.colour || "#176b87"} selectedCountry={selectedCountry} onSelect={selectCountry} />}
                </Suspense>
                <div className="visual-legend"><span className="legend-ring" />Commonwealth Country</div>
              </div>

              {selectedNode && selectedProfile && <aside className="country-panel" aria-label={`Details for ${selectedNode.name}`}>
                <button className="panel-close" onClick={() => { setSelectedCountry(null); setSearch(""); }} type="button" aria-label="Close country details">×</button>
                <p className="country-code">{selectedNode.id}</p><h2>{selectedNode.name}</h2>
                {selectedNode.commonwealth && <p className="cw-badge"><span />Commonwealth country</p>}
                {selectedProfile.partnerCount === 0 ? <div className="no-connections"><strong>No observed connection</strong><p>No observed {layerMeta?.label.toLowerCase()} connection for this country with {scopePhrase}.</p></div> : <>
                  <dl className="profile-stats">
                    <div><dt>Connected {scopeWord} Partners</dt><dd>{selectedProfile.partnerCount}</dd></div>
                    <div><dt>{layerMeta?.summaryMetric}</dt><dd>{formatValue(selectedProfile.strength)}</dd></div>
                  </dl>
                  <div className="partner-list"><h3>Strongest {scopeWord} Partners</h3>
                    {selectedProfile.strongestPartners.map((partner, index) => <button key={partner.code} onClick={() => selectCountry(partner.code)} type="button">
                      <span className="partner-rank">{index + 1}</span><span><strong>{nodeMap.get(partner.code)?.name || partner.code}</strong><small>{formatValue(partner.weight)} {layerMeta?.partnerUnit}</small></span>
                    </button>)}
                  </div>
                  <p className="fractional-note">Fractional counting was adopted when attributing records to affiliated country pairs; each pair receives an equal fraction of a record.</p>
                </>}
              </aside>}
            </div>
          </div>
        </div>

        <details className="accessible-list"><summary>Country list for the current selection</summary>
          <ol>{leadingCountries.map(({ node, profile }) => <li key={node.id}><button onClick={() => selectCountry(node.id)} type="button">{node.name}</button><span>{profile.partnerCount} connected {scopeWord.toLowerCase()} partners</span></li>)}</ol>
        </details>
      </section>
    </main>
  );
}
