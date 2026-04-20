// Dynamic, idempotent client-side loader for Leaflet CSS + JS.
// Keeps us off react-leaflet while still getting Leaflet's window.L global.

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

let cached: Promise<typeof import('leaflet')> | null = null;

function injectCss(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-wtm-leaflet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  link.setAttribute('data-wtm-leaflet', 'true');
  document.head.appendChild(link);
}

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Leaflet requires window'));
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-wtm-leaflet]',
    );
    if (existing) {
      if ((window as unknown as { L?: unknown }).L) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () =>
          reject(new Error('Leaflet script failed to load')),
        );
      }
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.setAttribute('data-wtm-leaflet', 'true');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Leaflet script failed to load'));
    document.head.appendChild(script);
  });
}

export function loadLeaflet(): Promise<typeof import('leaflet')> {
  if (cached) return cached;
  cached = (async () => {
    injectCss();
    await injectScript();
    const L = (window as unknown as { L: typeof import('leaflet') }).L;
    if (!L) throw new Error('Leaflet global missing after script load');
    return L;
  })();
  return cached;
}
