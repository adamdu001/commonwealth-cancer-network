import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoInterpolate, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { CountryProfile, EdgeRecord, NodeRecord } from "./types";

interface Props {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  activeNodeIds: string[];
  profiles: Record<string, CountryProfile>;
  colour: string;
  selectedCountry: string | null;
  onSelect: (country: string) => void;
}

const WIDTH = 1100;
const HEIGHT = 620;

function mapSize(values: number[], value: number) {
  const transformed = values.map((item) => Math.sqrt(item));
  const min = Math.min(...transformed, 0);
  const max = Math.max(...transformed, 1);
  return 3.8 + ((Math.sqrt(value) - min) / (max - min || 1)) * 11;
}

export default function MapView({ nodes, edges, activeNodeIds, profiles, colour, selectedCountry, onSelect }: Props) {
  const [landPath, setLandPath] = useState("");
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const active = useMemo(() => new Set(activeNodeIds), [activeNodeIds]);
  const activeNodes = useMemo(() => nodes.filter((node) => active.has(node.id) && node.latitude !== null && node.longitude !== null), [nodes, active]);
  const strengths = useMemo(() => activeNodes.map((node) => profiles[node.id]?.strength || 0), [activeNodes, profiles]);
  const adjacency = useMemo(() => {
    const result = new Map<string, Set<string>>();
    edges.forEach((edge) => {
      if (!result.has(edge.source)) result.set(edge.source, new Set());
      if (!result.has(edge.target)) result.set(edge.target, new Set());
      result.get(edge.source)!.add(edge.target);
      result.get(edge.target)!.add(edge.source);
    });
    return result;
  }, [edges]);
  const focus = hoveredCountry || selectedCountry;
  const projection = useMemo(() => geoEqualEarth().fitExtent([[22, 22], [WIDTH - 22, HEIGHT - 22]], { type: "Sphere" }), []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/world-110m.json`)
      .then((response) => response.json())
      .then((topology: Topology<{ countries: GeometryCollection<GeoJsonProperties> }>) => {
        const countries = feature(topology, topology.objects.countries) as FeatureCollection<Geometry>;
        setLandPath(geoPath(projection)(countries) || "");
      })
      .catch(() => setLandPath(""));
  }, [projection]);

  const paths = useMemo(() => edges.map((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target || source.latitude === null || source.longitude === null || target.latitude === null || target.longitude === null) return null;
    const interpolate = geoInterpolate([source.longitude, source.latitude], [target.longitude, target.latitude]);
    const line = { type: "LineString" as const, coordinates: Array.from({ length: 17 }, (_, index) => interpolate(index / 16)) };
    return { id: `${edge.source}-${edge.target}`, source: edge.source, target: edge.target, path: geoPath(projection)(line) || "" };
  }).filter(Boolean) as Array<{ id: string; source: string; target: string; path: string }>, [edges, nodeMap, projection]);

  return (
    <div className="map-canvas" aria-label="Interactive geographic collaboration map">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onWheel={(event) => {
          event.preventDefault();
          const next = Math.min(5, Math.max(0.8, transform.k * (event.deltaY > 0 ? 0.9 : 1.1)));
          setTransform((current) => ({ ...current, k: next }));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, originX: transform.x, originY: transform.y };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const x = drag.originX + event.clientX - drag.x;
          const y = drag.originY + event.clientY - drag.y;
          setTransform((current) => ({ ...current, x, y }));
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onLostPointerCapture={() => { dragRef.current = null; }}
      >
        <rect width={WIDTH} height={HEIGHT} className="map-ocean" />
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <path d={landPath} className="map-land" />
          <g className="map-links">{paths.map((item) => {
            const incident = Boolean(focus && (item.source === focus || item.target === focus));
            return <path key={item.id} d={item.path} className={focus ? incident ? "focused" : "dimmed" : ""} style={incident ? { stroke: colour } : undefined} />;
          })}</g>
          <g>
            {activeNodes.map((node) => {
              const point = projection([node.longitude!, node.latitude!]);
              if (!point) return null;
              const radius = mapSize(strengths, profiles[node.id]?.strength || 0);
              const isFocused = focus === node.id;
              const isNeighbour = Boolean(focus && adjacency.get(focus)?.has(node.id));
              return (
                <g
                  key={node.id}
                  className={`map-node ${isFocused ? "focused" : ""} ${isNeighbour ? "neighbour" : ""} ${focus && !isFocused && !isNeighbour ? "dimmed" : ""}`}
                  transform={`translate(${point[0]} ${point[1]})`}
                  role="button"
                  tabIndex={0}
                  aria-label={node.name}
                  onClick={() => onSelect(node.id)}
                  onPointerEnter={() => setHoveredCountry(node.id)}
                  onPointerLeave={() => setHoveredCountry((current) => current === node.id ? null : current)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onFocus={() => setHoveredCountry(node.id)}
                  onBlur={() => setHoveredCountry((current) => current === node.id ? null : current)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}
                >
                  <circle r={Math.max(radius + 8, 12)} className="map-node-hit" />
                  {node.commonwealth && <circle r={radius + 3.5} className="map-cw-ring" />}
                  <circle r={radius} fill={isFocused ? "#10191d" : colour} className="map-node-disc" />
                  <title>{node.name}</title>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
