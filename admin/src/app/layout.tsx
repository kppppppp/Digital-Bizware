import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIGITAL BIZWARE — Admin Portal",
  description: "Digital Bizware administration, publishing, and operations console",
  icons: { icon: "/assets/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#FFD600",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
