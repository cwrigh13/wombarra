import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wombarra Transit Monitor',
  description:
    'Real-time maritime (AIS) and Sydney Trains (GTFS-RT) tracking around Wombarra, NSW.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
