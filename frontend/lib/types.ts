export type EntityKind = 'tanker' | 'cargo' | 'train';

export interface Vessel {
  kind: 'tanker' | 'cargo';
  mmsi: string;
  name: string;
  shipType: number | null;
  cargoType: string;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  headingDeg: number | null;
  destination: string;
  origin: string;
  etaIso: string | null;
  lastSeen: number;
}

export interface Train {
  kind: 'train';
  id: string;
  runId: string | null;
  line: string;
  destination: string;
  status: string;
  latitude: number;
  longitude: number;
  speedMetersPerSecond: number | null;
  lastSeen: number;
}

export interface TrainApiResponse {
  generated_at: number;
  anchor: { lat: number; lon: number };
  radius_km: number;
  count: number;
  trains: Array<{
    id: string;
    run_id: string | null;
    latitude: number;
    longitude: number;
    speed: number | null;
  }>;
}
