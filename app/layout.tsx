import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { FieldsProvider } from "@/lib/field-store";

export const metadata: Metadata = {
  title: "FieldShift | Explore with NASA",
  description: "Explore a location using NASA Earth observation data. No sign-in required."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><FieldsProvider>{children}</FieldsProvider></body></html>;
}
