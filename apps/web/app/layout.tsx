import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Braindump',
  description: 'A clean slate for thoughts.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
