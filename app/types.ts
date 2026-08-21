export type LayerId = "publications" | "trials" | "inventions" | "patents" | "grants";
export type ScopeId = "global" | "commonwealth";
export type ViewId = "network" | "map";
export type DetailLevel = "core" | "balanced" | "full";

export interface LayerMeta {
  label: string;
  shortLabel: string;
  colour: string;
  definition: string;
  summaryMetric: string;
  partnerUnit: string;
  sourceFile: string;
  edgeCount: number;
  commonwealthEdgeCount: number;
  keep: Record<DetailLevel, number>;
}

export interface Manifest {
  title: string;
  subtitle: string;
  period: string;
  countryCount: number;
  commonwealthCount: number;
  layers: Record<LayerId, LayerMeta>;
}

export interface NodeRecord {
  id: string;
  name: string;
  commonwealth: boolean;
  latitude: number | null;
  longitude: number | null;
  layouts: Record<ScopeId, { x: number; y: number } | null>;
}

export interface EdgeRecord {
  source: string;
  target: string;
  weight: number;
  globalRank: number;
  commonwealthRank: number | null;
  globalDisplayWeight: number;
  commonwealthDisplayWeight: number | null;
}

export interface PartnerRecord { code: string; weight: number }
export interface CountryProfile {
  partnerCount: number;
  strength: number;
  strongestPartners: PartnerRecord[];
}

export interface LayerProfiles {
  global: Record<string, CountryProfile>;
  commonwealth: Record<string, CountryProfile>;
}
