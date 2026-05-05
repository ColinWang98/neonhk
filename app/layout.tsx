import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HK Spatial Story",
  description: "Hong Kong panorama fragment story prototype"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
