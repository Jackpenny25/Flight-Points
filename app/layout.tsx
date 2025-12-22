import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RAF Cadet Squadron Dashboard',
  description: 'Local-only RAF Cadet management dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
