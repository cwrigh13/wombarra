'use client';

import { useEffect, useState } from 'react';
import type { Train, TrainApiResponse } from '@/lib/types';

const BASE_INTERVAL_MS = 10_000;
const MAX_BACKOFF_MS = 120_000;

export function useTrains(backendUrl: string): {
  trains: Train[];
  error: string | null;
} {
  const [trains, setTrains] = useState<Train[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const controller = new AbortController();

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(poll, ms);
    };

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
        failures = 0;
        schedule(BASE_INTERVAL_MS);
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        failures += 1;
        setError((err as Error).message);
        const backoff = Math.min(
          BASE_INTERVAL_MS * 2 ** Math.min(failures, 4),
          MAX_BACKOFF_MS,
        );
        schedule(backoff);
      }
    };

    poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [backendUrl]);

  return { trains, error };
}
