import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Street Fragment Explorer",
  description: "Mapillary + AI schema narrative prototype"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
