import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'Pending Kiriman IEG',
  description: 'Monitoring order pending kiriman — Fulfillment & Inventory PT Inovasi Eka Gemilang',
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F6FA' },
    { media: '(prefers-color-scheme: dark)', color: '#12171C' },
  ],
};

// Pasang tema sebelum React hidrasi supaya tidak berkedip.
const themeScript = `(function(){try{var t=localStorage.getItem('ieg-theme');if(t!=='morning'&&t!=='evening'){t=matchMedia('(prefers-color-scheme:dark)').matches?'evening':'morning'}document.documentElement.dataset.theme=t}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
