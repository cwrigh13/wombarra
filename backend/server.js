require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const { haversineKm } = require('./geo');

const PORT = Number(process.env.PORT) || 4000;
const TFNSW_ENDPOINT =
  'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/sydneytrains';

const WOMBARRA = { lat: -34.264, lon: 150.957 };
const RADIUS_KM = 15;

const app = express();
app.use(cors());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, anchor: WOMBARRA, radiusKm: RADIUS_KM });
});

app.get('/api/trains/south-coast', async (_req, res) => {
  const apiKey = process.env.TFNSW_API_KEY;
  if (!apiKey || apiKey === 'replace-me') {
    return res
      .status(500)
      .json({ error: 'TFNSW_API_KEY missing. Set it in backend/.env' });
  }

  try {
    const upstream = await fetch(TFNSW_ENDPOINT, {
      headers: {
        Authorization: `apikey ${apiKey}`,
        Accept: 'application/x-google-protobuf',
      },
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({
        error: 'Upstream TfNSW request failed',
        status: upstream.status,
        body: body.slice(0, 500),
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const feed =
      GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

    const trains = [];
    for (const entity of feed.entity) {
      const vehicle = entity.vehicle;
      if (!vehicle || !vehicle.position) continue;

      const { latitude, longitude, speed } = vehicle.position;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        continue;
      }

      const distanceKm = haversineKm(
        WOMBARRA.lat,
        WOMBARRA.lon,
        latitude,
        longitude,
      );
      if (distanceKm > RADIUS_KM) continue;

      trains.push({
        id: entity.id,
        run_id: vehicle.trip ? vehicle.trip.tripId : null,
        latitude,
        longitude,
        speed: typeof speed === 'number' ? speed : null,
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      generated_at: Date.now(),
      anchor: WOMBARRA,
      radius_km: RADIUS_KM,
      count: trains.length,
      trains,
    });
  } catch (err) {
    console.error('[trains] proxy error:', err);
    res.status(502).json({ error: 'Proxy failure', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Wombarra backend listening on :${PORT}`);
});
