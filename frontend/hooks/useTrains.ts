'use client';

import { useEffect, useState } from 'react';
import type { Train, TrainApiResponse } from '@/lib/types';

const POLL_INTERVAL_MS = 10_000;

export function useTrains(backendUrl: string): {
  trains: Train[];
  error: string | null;
} {
  const [trains, setTrains] = useState<Train[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/trains/south-coast`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Backend responded ${res.status}`);
        }
        const data = (await res.json()) as TrainApiResponse;
        if (cancelled) return;
        const now = Date.now();
        setTrains(
          data.trains.map((t) => ({
            kind: 'train' as const,
            id: t.id,
            runId: t.run_id,
            line: 'South Coast Line',
            destination: t.run_id ? `Run ${t.run_id}` : 'Unknown',
            status: 'In Service',
            latitude: t.latitude,
            longitude: t.longitude,
            speedMetersPerSecond: t.speed,
            lastSeen: now,
          })),
        );
        setError(null);
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        setError((err as Error).message);
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [backendUrl]);

  return { trains, error };
}
