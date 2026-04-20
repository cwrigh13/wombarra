import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { NextResponse } from 'next/server';

import { haversineKm } from '@/lib/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TFNSW_ENDPOINT =
  'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/sydneytrains';

const WOMBARRA = { lat: -34.264, lon: 150.957 };
const RADIUS_KM = 15;

// Vercel does not get .env files at build time when deployed via the MCP
// integration, so we accept either a runtime env var or an inline fallback
// (the user opted into committing this for the demo deployment).
const FALLBACK_API_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJuUnU1dHlnYUhZa3VzckgzSlRyLXlRVlRobkRJYlFhNTBaM1VkNldCZXdzIiwiaWF0IjoxNzc2NjQ4ODAyfQ.aeuEv6eADvhChMCCcE44sUCeh1hXX2supsqOKEbRQMw';

export async function GET() {
  const apiKey = process.env.TFNSW_API_KEY ?? FALLBACK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'TFNSW_API_KEY missing' }, { status: 500 });
  }

  try {
    const upstream = await fetch(TFNSW_ENDPOINT, {
      headers: {
        Authorization: `apikey ${apiKey}`,
        Accept: 'application/x-google-protobuf',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return NextResponse.json(
        {
          error: 'Upstream TfNSW request failed',
          status: upstream.status,
          body: body.slice(0, 500),
        },
        { status: upstream.status },
      );
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer());
    const feed =
      GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

    const trains = [];
    for (const entity of feed.entity) {
      const vehicle = entity.vehicle;
      if (!vehicle || !vehicle.position) continue;
      const { latitude, longitude, speed } = vehicle.position;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
      if (haversineKm(WOMBARRA.lat, WOMBARRA.lon, latitude, longitude) > RADIUS_KM) {
        continue;
      }
      trains.push({
        id: entity.id,
        run_id: vehicle.trip ? vehicle.trip.tripId : null,
        latitude,
        longitude,
        speed: typeof speed === 'number' ? speed : null,
      });
    }

    return NextResponse.json(
      {
        generated_at: Date.now(),
        anchor: WOMBARRA,
        radius_km: RADIUS_KM,
        count: trains.length,
        trains,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Proxy failure', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
