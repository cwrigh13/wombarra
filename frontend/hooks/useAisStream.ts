'use client';

import { useEffect, useRef, useState } from 'react';
import { classifyShipType } from '@/lib/shipType';
import type { Vessel } from '@/lib/types';

type BufferedVessel = Omit<Vessel, 'kind'> & {
  kind: Vessel['kind'] | null;
};

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const BOUNDING_BOX: [[number, number], [number, number]] = [
  [-34.5, 150.9],
  [-34.0, 151.3],
];
const FLUSH_INTERVAL_MS = 2000;
const STALE_EVICTION_MS = 600_000; // 600 seconds
const GC_INTERVAL_MS = 30_000;

interface UseAisStreamOptions {
  apiKey: string | undefined;
}

export function useAisStream({ apiKey }: UseAisStreamOptions): {
  vessels: Vessel[];
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'disabled';
} {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [status, setStatus] = useState<
    'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'disabled'
  >('idle');

  // Mutable buffer: WebSocket frames mutate this, React never reads it directly.
  // Entries with kind === null are position-only reports awaiting static data
  // classification; they are skipped at flush time.
  const bufferRef = useRef<Map<string, BufferedVessel>>(new Map());

  useEffect(() => {
    if (!apiKey) {
      setStatus('disabled');
      return;
    }

    let socket: WebSocket | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let gcTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      setStatus('connecting');
      socket = new WebSocket(AISSTREAM_URL);

      socket.addEventListener('open', () => {
        setStatus('open');
        socket?.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [BOUNDING_BOX],
            FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
          }),
        );
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data));
          ingest(bufferRef.current, payload);
        } catch {
          // Ignore malformed frames - never let one kill the ingestion loop.
        }
      });

      socket.addEventListener('error', () => setStatus('error'));
      socket.addEventListener('close', () => {
        if (closed) return;
        setStatus('closed');
        reconnectTimer = setTimeout(connect, 5000);
      });
    };

    // 2000ms flush tick: copy buffer snapshot into React state.
    // Only classified vessels (kind set) reach the render path.
    flushTimer = setInterval(() => {
      const buffer = bufferRef.current;
      if (buffer.size === 0) {
        setVessels((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const snapshot: Vessel[] = [];
      for (const vessel of buffer.values()) {
        if (vessel.kind == null) continue;
        snapshot.push(vessel as Vessel);
      }
      setVessels(snapshot);
    }, FLUSH_INTERVAL_MS);

    // Garbage collection: evict vessels whose last update exceeds 600s.
    gcTimer = setInterval(() => {
      const cutoff = Date.now() - STALE_EVICTION_MS;
      const buffer = bufferRef.current;
      let evicted = 0;
      for (const [mmsi, vessel] of buffer) {
        if (vessel.lastSeen < cutoff) {
          buffer.delete(mmsi);
          evicted += 1;
        }
      }
      if (evicted > 0) {
        const snapshot: Vessel[] = [];
        for (const vessel of buffer.values()) {
          if (vessel.kind == null) continue;
          snapshot.push(vessel as Vessel);
        }
        setVessels(snapshot);
      }
    }, GC_INTERVAL_MS);

    connect();

    return () => {
      closed = true;
      if (flushTimer) clearInterval(flushTimer);
      if (gcTimer) clearInterval(gcTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
    };
  }, [apiKey]);

  return { vessels, status };
}

function ingest(buffer: Map<string, BufferedVessel>, payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const frame = payload as Record<string, unknown>;
  const messageType = frame.MessageType as string | undefined;
  const metaData = frame.MetaData as Record<string, unknown> | undefined;
  const message = frame.Message as Record<string, unknown> | undefined;
  if (!messageType || !metaData || !message) return;

  const mmsi = String(metaData.MMSI ?? '');
  if (!mmsi) return;

  const now = Date.now();
  const existing = buffer.get(mmsi);

  if (messageType === 'PositionReport') {
    const report = message.PositionReport as Record<string, unknown> | undefined;
    if (!report) return;
    const lat = numeric(report.Latitude);
    const lon = numeric(report.Longitude);
    if (lat == null || lon == null) return;

    const next: BufferedVessel = {
      kind: existing?.kind ?? null,
      mmsi,
      name: existing?.name ?? String(metaData.ShipName ?? 'Unknown'),
      shipType: existing?.shipType ?? null,
      cargoType: existing?.cargoType ?? 'Unknown',
      latitude: lat,
      longitude: lon,
      speedKnots: numeric(report.Sog),
      headingDeg: numeric(report.TrueHeading ?? report.Cog),
      destination: existing?.destination ?? 'Unknown',
      origin: existing?.origin ?? 'Unknown',
      etaIso: existing?.etaIso ?? null,
      lastSeen: now,
    };
    buffer.set(mmsi, next);
    return;
  }

  if (messageType === 'ShipStaticData') {
    const stat = message.ShipStaticData as Record<string, unknown> | undefined;
    if (!stat) return;
    const shipType = numeric(stat.Type);
    const classification = classifyShipType(shipType);
    if (classification.kind == null) {
      // Not a tanker or cargo vessel - drop it entirely.
      if (existing) buffer.delete(mmsi);
      return;
    }

    const dest = trimString(stat.Destination) ?? 'Unknown';
    const eta = formatEta(stat.Eta);

    const next: BufferedVessel = existing
      ? {
          ...existing,
          kind: classification.kind,
          shipType,
          cargoType: classification.label,
          destination: dest,
          etaIso: eta,
          name: trimString(stat.Name) ?? existing.name,
          lastSeen: now,
        }
      : {
          kind: classification.kind,
          mmsi,
          name:
            trimString(stat.Name) ?? String(metaData.ShipName ?? 'Unknown'),
          shipType,
          cargoType: classification.label,
          latitude: numeric(metaData.latitude) ?? 0,
          longitude: numeric(metaData.longitude) ?? 0,
          speedKnots: null,
          headingDeg: null,
          destination: dest,
          origin: 'Unknown',
          etaIso: eta,
          lastSeen: now,
        };
    buffer.set(mmsi, next);
  }
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function trimString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().replace(/@+$/g, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatEta(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const month = numeric(e.Month);
  const day = numeric(e.Day);
  const hour = numeric(e.Hour);
  const minute = numeric(e.Minute);
  if (month == null || day == null) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = hour != null ? String(hour).padStart(2, '0') : '--';
  const mi = minute != null ? String(minute).padStart(2, '0') : '--';
  return `${mm}-${dd} ${hh}:${mi}Z`;
}
