'use client';

import { useEffect, useRef, useState } from 'react';
import type * as LeafletNS from 'leaflet';

import { loadLeaflet } from '@/lib/leafletLoader';
import { useAisStream } from '@/hooks/useAisStream';
import { useTrains } from '@/hooks/useTrains';
import type { Train, Vessel } from '@/lib/types';

const WOMBARRA: [number, number] = [-34.264, 150.957];
const ZOOM = 11;

const COLORS = {
  tanker: '#ef4444',
  cargo: '#3b82f6',
  train: '#10b981',
} as const;

// Empty string => same-origin (use the bundled Next.js API route).
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
const AIS_KEY = process.env.NEXT_PUBLIC_AISSTREAM_KEY;

export default function TransitMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const iconsRef = useRef<Record<'tanker' | 'cargo' | 'train', LeafletNS.DivIcon> | null>(
    null,
  );
  const markersRef = useRef<Map<string, LeafletNS.Marker>>(new Map());

  const [mapReady, setMapReady] = useState(false);

  const { vessels, status: aisStatus } = useAisStream({ apiKey: AIS_KEY });
  const { trains, error: trainError } = useTrains(BACKEND_URL);

  // One-time map construction.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: WOMBARRA,
        zoom: ZOOM,
        zoomControl: true,
        preferCanvas: false,
      });

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: 'abcd',
        },
      ).addTo(map);

      L.marker(WOMBARRA, {
        icon: L.divIcon({
          className: 'wtm-anchor',
          html: `<div style="width:10px;height:10px;border-radius:9999px;background:#f8fafc;border:2px solid #0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,0.25)"></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        }),
      })
        .addTo(map)
        .bindPopup('<div class="wtm-popup"><h3>Wombarra, NSW</h3></div>');

      iconsRef.current = {
        tanker: makeIcon(L, COLORS.tanker),
        cargo: makeIcon(L, COLORS.cargo),
        train: makeIcon(L, COLORS.train),
      };

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
    };
  }, []);

  // Render/update/remove vessel + train markers whenever data changes.
  useEffect(() => {
    if (!mapReady) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const icons = iconsRef.current;
    if (!L || !map || !icons) return;

    const nextKeys = new Set<string>();

    for (const vessel of vessels) {
      const key = `vessel:${vessel.mmsi}`;
      nextKeys.add(key);
      upsertMarker(L, map, markersRef.current, key, vessel.latitude, vessel.longitude, {
        icon: icons[vessel.kind],
        popup: vesselPopup(vessel),
      });
    }

    for (const train of trains) {
      const key = `train:${train.id}`;
      nextKeys.add(key);
      upsertMarker(L, map, markersRef.current, key, train.latitude, train.longitude, {
        icon: icons.train,
        popup: trainPopup(train),
      });
    }

    // Remove markers whose entities are gone from the latest snapshot.
    for (const [key, marker] of markersRef.current) {
      if (!nextKeys.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
      }
    }
  }, [mapReady, vessels, trains]);

  return (
    <>
      <div ref={containerRef} className="wtm-map" />
      <Legend
        vesselCount={vessels.length}
        trainCount={trains.length}
        aisStatus={aisStatus}
        trainError={trainError}
      />
    </>
  );
}

interface LegendProps {
  vesselCount: number;
  trainCount: number;
  aisStatus: string;
  trainError: string | null;
}

function Legend({ vesselCount, trainCount, aisStatus, trainError }: LegendProps) {
  return (
    <aside className="wtm-legend">
      <h1>Wombarra Transit Monitor</h1>
      <div className="row">
        <span className="swatch" style={{ background: COLORS.tanker }} />
        <span>Tanker (AIS)</span>
      </div>
      <div className="row">
        <span className="swatch" style={{ background: COLORS.cargo }} />
        <span>Cargo (AIS)</span>
      </div>
      <div className="row">
        <span className="swatch" style={{ background: COLORS.train }} />
        <span>Train (GTFS-RT)</span>
      </div>
      <div className="stat">
        AIS: {aisStatus} &middot; {vesselCount} vessels
      </div>
      <div className="stat">
        Trains: {trainError ? `error (${trainError})` : `${trainCount} active`}
      </div>
    </aside>
  );
}

function makeIcon(L: typeof import('leaflet'), color: string): LeafletNS.DivIcon {
  return L.divIcon({
    className: 'wtm-divicon',
    html: `<div class="wtm-marker" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

function upsertMarker(
  L: typeof import('leaflet'),
  map: LeafletNS.Map,
  markers: Map<string, LeafletNS.Marker>,
  key: string,
  lat: number,
  lon: number,
  opts: { icon: LeafletNS.DivIcon; popup: string },
) {
  const existing = markers.get(key);
  if (existing) {
    existing.setLatLng([lat, lon]);
    existing.setIcon(opts.icon);
    existing.setPopupContent(opts.popup);
    return;
  }
  const marker = L.marker([lat, lon], { icon: opts.icon }).addTo(map);
  marker.bindPopup(opts.popup);
  markers.set(key, marker);
}

function vesselPopup(v: Vessel): string {
  const speed = v.speedKnots != null ? `${v.speedKnots.toFixed(1)} kn` : '—';
  const heading = v.headingDeg != null ? `${Math.round(v.headingDeg)}°` : '—';
  return `
    <div class="wtm-popup">
      <h3>${escapeHtml(v.name)} <small>(${escapeHtml(v.mmsi)})</small></h3>
      <div class="kv">
        <span class="k">Cargo</span><span class="v">${escapeHtml(v.cargoType)}</span>
        <span class="k">Origin</span><span class="v">${escapeHtml(v.origin)}</span>
        <span class="k">Dest</span><span class="v">${escapeHtml(v.destination)}</span>
        <span class="k">ETA</span><span class="v">${escapeHtml(v.etaIso ?? '—')}</span>
        <span class="k">Head</span><span class="v">${heading}</span>
        <span class="k">Speed</span><span class="v">${speed}</span>
      </div>
    </div>
  `;
}

function trainPopup(t: Train): string {
  const kmh =
    t.speedMetersPerSecond != null
      ? `${(t.speedMetersPerSecond * 3.6).toFixed(1)} km/h`
      : '—';
  return `
    <div class="wtm-popup">
      <h3>${escapeHtml(t.line)}</h3>
      <div class="kv">
        <span class="k">Dest</span><span class="v">${escapeHtml(t.destination)}</span>
        <span class="k">Status</span><span class="v">${escapeHtml(t.status)}</span>
        <span class="k">Speed</span><span class="v">${kmh}</span>
        <span class="k">Run</span><span class="v">${escapeHtml(t.runId ?? '—')}</span>
      </div>
    </div>
  `;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
