"use client";

import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import type { CountryProfile, EdgeRecord, NodeRecord, ScopeId } from "./types";

interface Props {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  activeNodeIds: string[];
  profiles: Record<string, CountryProfile>;
  scope: ScopeId;
  colour: string;
  selectedCountry: string | null;
  onSelect: (country: string) => void;
  resetToken: number;
}

function sizeScale(values: number[], value: number) {
  const transformed = values.map((item) => Math.sqrt(item));
  const min = Math.min(...transformed, 0);
  const max = Math.max(...transformed, 1);
  return 4.5 + ((Math.sqrt(value) - min) / (max - min || 1)) * 10.5;
}

function spreadPosition(position: { x: number; y: number }) {
  const dx = position.x - 0.5;
  const dy = position.y - 0.5;
  const radius = Math.sqrt(dx * dx + dy * dy);
  if (radius < 0.0001) return position;
  const expandedRadius = Math.pow(Math.min(radius / 0.72, 1), 0.48) * 0.72;
  return { x: 0.5 + (dx / radius) * expandedRadius, y: 0.5 + (dy / radius) * expandedRadius };
}

function countryFromRenderNode(node: string) {
  return node.replace(/^ring(?:-gap)?:/, "");
}

export default function NetworkView({ nodes, edges, activeNodeIds, profiles, scope, colour, selectedCountry, onSelect, resetToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const selectedRef = useRef<string | null>(selectedCountry);
  const hoveredRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    selectedRef.current = selectedCountry;
    rendererRef.current?.refresh();
  }, [selectedCountry]);

  useEffect(() => {
    if (!containerRef.current) return;
    const graph = new Graph({ type: "undirected", multi: false });
    const active = new Set(activeNodeIds);
    const activeNodes = nodes.filter((node) => active.has(node.id) && node.layouts[scope]);
    const strengths = activeNodes.map((node) => profiles[node.id]?.strength || 0);
    const adjacency = new Map<string, Set<string>>(activeNodes.map((node) => [node.id, new Set()]));

    activeNodes.forEach((node) => {
      const position = spreadPosition(node.layouts[scope]!);
      const size = sizeScale(strengths, profiles[node.id]?.strength || 0);
      if (node.commonwealth) {
        graph.addNode(`ring:${node.id}`, { x: position.x, y: position.y, label: null, size: size + 4.8, color: "#e3ad38", zIndex: 0, renderRole: "ring", country: node.id });
        graph.addNode(`ring-gap:${node.id}`, { x: position.x, y: position.y, label: null, size: size + 2.5, color: "#fcfbf7", zIndex: 1, renderRole: "gap", country: node.id });
      }
      graph.addNode(node.id, { x: position.x, y: position.y, label: node.id, size, color: colour, zIndex: 2, renderRole: "country", country: node.id });
    });

    edges.forEach((edge, index) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
      const displayWeight = scope === "global" ? edge.globalDisplayWeight : (edge.commonwealthDisplayWeight ?? 0);
      graph.addEdgeWithKey(`e${index}`, edge.source, edge.target, { size: 0.45 + displayWeight * 2.8, color: "#a8c1c7", baseSize: 0.45 + displayWeight * 2.8 });
    });

    const renderer = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      labelFont: getComputedStyle(containerRef.current).fontFamily || "Arial, sans-serif",
      labelSize: 15,
      labelWeight: "700",
      labelColor: { color: "#173743" },
      labelRenderedSizeThreshold: 4,
      labelDensity: 1.25,
      labelGridCellSize: 48,
      stagePadding: 72,
      minEdgeThickness: 0.5,
      hideEdgesOnMove: false,
      zIndex: true,
      nodeReducer: (node, data) => {
        const country = countryFromRenderNode(node);
        const focus = hoveredRef.current || selectedRef.current;
        if (!focus) return data;
        const activeNode = country === focus;
        const neighbour = adjacency.get(focus)?.has(country) || false;
        const role = data.renderRole as string;
        if (role === "ring") return { ...data, color: activeNode || neighbour ? "#e3ad38" : "#dfd8c6", zIndex: activeNode ? 7 : neighbour ? 5 : 0 };
        if (role === "gap") return { ...data, color: "#fcfbf7", zIndex: activeNode ? 8 : neighbour ? 6 : 1 };
        if (activeNode) return { ...data, color: "#10191d", size: data.size + 2.4, forceLabel: true, highlighted: true, zIndex: 10 };
        if (neighbour) return { ...data, color: colour, size: data.size + 1.5, forceLabel: true, zIndex: 6 };
        return { ...data, color: "#c8d0d0", label: null, zIndex: 2 };
      },
      edgeReducer: (edge, data) => {
        const focus = hoveredRef.current || selectedRef.current;
        if (!focus) return data;
        const [source, target] = graph.extremities(edge);
        if (source === focus || target === focus) return { ...data, color: colour, size: Math.max(2, Number(data.baseSize || data.size) * 2.25), zIndex: 5 };
        return { ...data, color: "rgba(151, 174, 179, 0.13)", size: Math.max(0.3, Number(data.baseSize || data.size) * 0.55), zIndex: 0 };
      },
    });
    rendererRef.current = renderer;

    renderer.on("clickNode", ({ node }) => onSelectRef.current(countryFromRenderNode(node)));
    renderer.on("enterNode", ({ node }) => {
      hoveredRef.current = countryFromRenderNode(node);
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
      renderer.refresh();
    });
    renderer.on("leaveNode", ({ node }) => {
      if (hoveredRef.current === countryFromRenderNode(node)) hoveredRef.current = null;
      if (containerRef.current) containerRef.current.style.cursor = "grab";
      renderer.refresh();
    });
    renderer.refresh();

    return () => {
      renderer.removeAllListeners();
      renderer.kill();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [nodes, edges, activeNodeIds, profiles, scope, colour]);

  useEffect(() => {
    if (resetToken > 0) void rendererRef.current?.getCamera().animatedReset({ duration: 350 });
  }, [resetToken]);

  return <div className="network-canvas" ref={containerRef} aria-label="Interactive country collaboration network" />;
}
