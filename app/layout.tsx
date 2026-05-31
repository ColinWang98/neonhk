import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HK Spatial Story",
  description: "Listen to place stories from selected Hong Kong street-view details.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
