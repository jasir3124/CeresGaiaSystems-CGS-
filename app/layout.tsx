import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { FieldsProvider } from "@/lib/field-store";

export const metadata: Metadata = {
  title: "CGS | CeresGaiaSystems",
  description: "CGS (CeresGaiaSystems) helps you explore fields, crops, weather, and NASA Earth observation data. No sign-in required."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><FieldsProvider>{children}</FieldsProvider></body></html>;
}
