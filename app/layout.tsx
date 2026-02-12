import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RAF Cadet Squadron Dashboard',
  description: 'Local-only RAF Cadet management dashboard',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
