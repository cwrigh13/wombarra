# Wombarra Transit Monitor

Real-time geospatial overlay of maritime AIS vessels and Sydney Trains
GTFS-Realtime positions centred on Wombarra, NSW (-34.264, 150.957).

The frontend never subscribes to the WebSocket from inside the React render
cycle - incoming AIS frames mutate a `Map<string, Vessel>` off-cycle and a
2000ms flush tick copies a snapshot into React state. Stale entries are
evicted after 600 seconds. Sydney Trains GTFS-RT is decoded and pre-filtered
to a 15km radius on the backend so the client only ever sees JSON it intends
to render.

## Layout

- `backend/` - Node.js / Express proxy for the TfNSW GTFS-Realtime feed.
- `frontend/` - Next.js (App Router) + Leaflet client.

## Running locally

### Backend

```bash
cd backend
cp .env.example .env          # then paste your TfNSW apikey into .env
npm install
npm start
```

Endpoint: `GET http://localhost:4000/api/trains/south-coast`

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # paste NEXT_PUBLIC_AISSTREAM_KEY
npm install
npm run dev
```

Open http://localhost:3000.

## Keys

- TfNSW Open Data: https://opendata.transport.nsw.gov.au/
- AISStream.io: https://aisstream.io/

Both are free developer tiers. Neither key is hardcoded.

## Architecture notes

- **Buffer isolation.** `hooks/useAisStream.ts` accumulates position and
  static-data frames into a mutable `Map` keyed by MMSI. React only sees a
  flushed snapshot every 2000ms.
- **Eviction.** A 30s GC pass drops any vessel whose `lastSeen` is older
  than 600s so disconnected vessels do not persist as stale markers.
- **Server-side geospatial filter.** `backend/server.js` decodes the binary
  GTFS-RT protobuf and drops every entity outside a 15km Haversine radius of
  the Wombarra anchor before serialising JSON.
- **Leaflet without react-leaflet.** `lib/leafletLoader.ts` injects the CSS
  link and JS script tags on demand and caches the promise so repeated mounts
  do not re-fetch.
