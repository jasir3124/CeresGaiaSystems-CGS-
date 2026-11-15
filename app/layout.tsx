import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { FieldsProvider } from "@/lib/field-store";

export const viewport: Viewport = { themeColor: '#286649' };

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', type: 'image/x-icon', sizes: '16x16 32x32 48x48 64x64 128x128 256x256' },
      { url: '/favicon-32x32.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png?v=2', type: 'image/png', sizes: '16x16' }
    ],
    shortcut: '/favicon.ico?v=2',
    apple: { url: '/apple-touch-icon.png?v=2', sizes: '180x180' }
  },
  applicationName: "CeresGaiaSystems",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "CGS" },
  title: "CGS | CeresGaiaSystems",
  description: "CGS (CeresGaiaSystems) helps you explore fields, crops, weather, and NASA Earth observation data. No sign-in required."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('cgs-theme');document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}` }}/></head><body><FieldsProvider>{children}</FieldsProvider></body></html>;
}
